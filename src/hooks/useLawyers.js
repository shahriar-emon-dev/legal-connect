import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { realtimeSync } from '../services/realtimeSync.service';

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Normalise specialization regardless of whether it arrives as a scalar or array */
const normalizeSpec = (v) => {
  if (!v) return 'General Practice';
  if (Array.isArray(v)) return v.join(', ') || 'General Practice';
  return String(v);
};

/** Map a raw lawyers row (from RPC or direct query) to a consistent shape */
const normalizeLawyer = (row) => ({
  ...row,
  specialization: normalizeSpec(row.specialization),
  // RPC returns name/profile_picture_url at top level; direct query needs user object
  user: row.user || {
    name: row.name || null,
    profile_picture_url: row.profile_picture_url || null,
  },
});

// ─── useLawyers hook ──────────────────────────────────────────────────────────

export const useLawyers = (filters = {}) => {
  const [lawyers, setLawyers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchLawyers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // ── Primary: RPC (correct INT id, scalar specialization, LEFT JOIN) ──
      const { data: rpcData, error: rpcErr } = await supabase.rpc('search_lawyers', {
        p_verified_only: true,
        p_limit: filters.limit || 50,
        p_offset: 0,
        ...(filters.specialization ? { p_category: filters.specialization } : {}),
      });

      if (!rpcErr && rpcData) {
        let results = rpcData.map(normalizeLawyer);
        if (filters.rating) {
          results = results.filter(l => (l.avg_rating || 0) >= filters.rating);
        }
        setLawyers(results);
        setTotal(results.length);
        return;
      }

      console.warn('[useLawyers] RPC failed, using direct query fallback:', rpcErr?.message);

      // ── Fallback: direct query + separate user enrichment ──
      let query = supabase
        .from('lawyers')
        .select('*', { count: 'exact' })
        .or('is_verified.eq.true,verification_status.eq.verified'); // Check both columns for definitive visibility

      if (filters.specialization) query = query.ilike('specialization', `%${filters.specialization}%`);
      if (filters.rating)         query = query.gte('avg_rating', filters.rating);
      if (filters.limit)          query = query.limit(filters.limit);

      query = filters.sort === 'rating'
        ? query.order('avg_rating', { ascending: false })
        : query.order('created_at', { ascending: false });

      const { data, error: fetchError, count } = await query;
      if (fetchError) throw fetchError;

      const rows = data || [];

      // Enrich with user data (separate query avoids FK alias dependency)
      const userIds = [...new Set(rows.map(l => l.user_id).filter(Boolean))];
      if (userIds.length > 0) {
        const { data: usersData } = await supabase
          .from('users')
          .select('id, name, profile_picture_url')
          .in('id', userIds);
        const userMap = {};
        (usersData || []).forEach(u => { userMap[u.id] = u; });
        rows.forEach(l => { l.user = userMap[l.user_id] || null; });
      }

      setLawyers(rows.map(normalizeLawyer));
      setTotal(count || rows.length);
    } catch (err) {
      console.error('[useLawyers] fetch error:', err);
      setError(err.message || 'Failed to fetch lawyers');
    } finally {
      setLoading(false);
    }
    // Audit #17: depend on the individual primitive filter values instead of
    // JSON.stringify(filters) — avoids re-serializing on every render and
    // sidesteps any key-ordering edge cases, while still being stable across
    // renders when the caller passes an inline object literal with the same values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.limit, filters.specialization, filters.rating, filters.sort]);

  useEffect(() => { fetchLawyers(); }, [fetchLawyers]);

  // Realtime: refetch whenever any lawyer verification status changes
  useEffect(() => {
    const unsub = realtimeSync.subscribe(() => { fetchLawyers(); });
    return () => unsub();
  }, [fetchLawyers]);

  return { lawyers, total, loading, error, refetch: fetchLawyers };
};

// ─── fetchSingleLawyer ────────────────────────────────────────────────────────

export const fetchSingleLawyer = async (idOrSlug) => {
  const isNumericId =
    !isNaN(parseInt(idOrSlug, 10)) &&
    String(parseInt(idOrSlug, 10)) === String(idOrSlug);

  // Audit #22: this used to build a single `.or()` filter string via template
  // literal interpolation (`slug.eq.${idOrSlug},user_id.eq.${idOrSlug}`),
  // which is a PostgREST filter-injection smell for a URL-controlled value.
  // Two separate `.eq()` calls let the client library parameterize the value
  // instead of splicing it into the filter DSL string.
  let lawyer = null;
  if (isNumericId) {
    const { data, error } = await supabase
      .from('lawyers').select('*').eq('id', parseInt(idOrSlug, 10)).maybeSingle();
    if (error) throw error;
    lawyer = data;
  } else {
    const { data: bySlug, error: slugErr } = await supabase
      .from('lawyers').select('*').eq('slug', idOrSlug).maybeSingle();
    if (slugErr) throw slugErr;
    if (bySlug) {
      lawyer = bySlug;
    } else {
      const { data: byUserId, error: userIdErr } = await supabase
        .from('lawyers').select('*').eq('user_id', idOrSlug).maybeSingle();
      if (userIdErr) throw userIdErr;
      lawyer = byUserId;
    }
  }

  if (!lawyer) return null;

  // Enrich with user data via separate query (no FK alias dependency)
  if (lawyer.user_id) {
    const { data: userData } = await supabase
      .from('users')
      .select('id, name, email, profile_picture_url, is_active')
      .eq('id', lawyer.user_id)
      .maybeSingle();
    lawyer.user = userData || null;
  }

  return normalizeLawyer(lawyer);
};
