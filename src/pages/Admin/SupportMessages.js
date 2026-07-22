import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase, isMissingFunctionError } from '../../services/supabase';
import { getSignedDocumentUrl } from '../../services/storage.service';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

// Canonical ticket workflow states. Legacy rows may carry 'unread' → shown as New.
const STATUSES = [
  { key: 'new', label: 'New', color: 'bg-blue-100 text-blue-700' },
  { key: 'open', label: 'Open', color: 'bg-indigo-100 text-indigo-700' },
  { key: 'in_progress', label: 'In Progress', color: 'bg-amber-100 text-amber-700' },
  { key: 'waiting_client', label: 'Waiting for Client', color: 'bg-purple-100 text-purple-700' },
  { key: 'resolved', label: 'Resolved', color: 'bg-green-100 text-green-700' },
  { key: 'closed', label: 'Closed', color: 'bg-gray-200 text-gray-600' },
];
const PRIORITIES = [
  { key: 'low', label: 'Low', color: 'text-gray-500' },
  { key: 'normal', label: 'Normal', color: 'text-blue-600' },
  { key: 'high', label: 'High', color: 'text-amber-600' },
  { key: 'urgent', label: 'Urgent', color: 'text-red-600' },
];

const normStatus = (s) => {
  const v = String(s || 'new').toLowerCase();
  return v === 'unread' ? 'new' : v;
};
const statusMeta = (s) => STATUSES.find((x) => x.key === normStatus(s)) || STATUSES[0];
const priorityMeta = (p) => PRIORITIES.find((x) => x.key === String(p || 'normal').toLowerCase()) || PRIORITIES[1];
const fmtDate = (d) => (d ? new Date(d).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

const SupportMessages = () => {
  const { user } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showArchived, setShowArchived] = useState(false);

  const [selected, setSelected] = useState(null);
  const [activity, setActivity] = useState([]);
  const [noteText, setNoteText] = useState('');
  const [replyText, setReplyText] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState(null);
  const [busy, setBusy] = useState(false);

  const fetchTickets = useCallback(async () => {
    try {
      setError(null);
      const { data, error: err } = await supabase
        .from('contact_inquiries')
        .select('*')
        .order('created_at', { ascending: false });
      if (err) throw err;
      setTickets(data || []);
    } catch (err) {
      console.error('[SupportMessages] fetch error:', err);
      setError(err.message || 'Failed to load support messages.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const { data, error: err } = await supabase.rpc('fn_support_ticket_stats');
      if (err) {
        if (isMissingFunctionError(err)) { setStats(null); return; } // pre-migration: derive client-side
        throw err;
      }
      setStats(data);
    } catch (err) {
      console.warn('[SupportMessages] stats unavailable:', err.message);
      setStats(null);
    }
  }, []);

  const fetchAdmins = useCallback(async () => {
    const { data } = await supabase.from('users').select('id, name, email').eq('user_type', 'admin');
    setAdmins(data || []);
  }, []);

  useEffect(() => { fetchTickets(); fetchStats(); fetchAdmins(); }, [fetchTickets, fetchStats, fetchAdmins]);

  // Realtime: any ticket or activity change refreshes the list + stats (debounced).
  useEffect(() => {
    let t = null;
    const refresh = () => { if (t) clearTimeout(t); t = setTimeout(() => { fetchTickets(); fetchStats(); }, 400); };
    const ch = supabase
      .channel('admin_support_messages')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contact_inquiries' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_ticket_activity' }, refresh)
      .subscribe();
    return () => { if (t) clearTimeout(t); supabase.removeChannel(ch); };
  }, [fetchTickets, fetchStats]);

  // Load a ticket's activity trail + signed attachment URL when opened.
  useEffect(() => {
    let cancelled = false;
    setActivity([]); setAttachmentUrl(null); setNoteText(''); setReplyText('');
    if (!selected) return;
    (async () => {
      try {
        const { data } = await supabase
          .from('support_ticket_activity')
          .select('*, admin:users!support_ticket_activity_admin_id_fkey(name)')
          .eq('ticket_id', selected.id)
          .order('created_at', { ascending: true });
        if (!cancelled) setActivity(data || []);
      } catch { if (!cancelled) setActivity([]); }
      if (selected.attachment_url) {
        const url = await getSignedDocumentUrl(selected.attachment_url, 'documents');
        if (!cancelled) setAttachmentUrl(url);
      }
    })();
    return () => { cancelled = true; };
  }, [selected]);

  // Derived stats fallback (pre-migration) computed from the loaded list.
  const derivedStats = useMemo(() => {
    if (stats) return stats;
    const live = tickets.filter((t) => !t.deleted_at);
    const c = (pred) => live.filter(pred).length;
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    return {
      total: live.length,
      new: c((t) => ['new', 'unread'].includes(normStatus(t.status))),
      open: c((t) => normStatus(t.status) === 'open'),
      in_progress: c((t) => normStatus(t.status) === 'in_progress'),
      resolved: c((t) => normStatus(t.status) === 'resolved'),
      closed: c((t) => normStatus(t.status) === 'closed'),
      unassigned: c((t) => !t.assigned_admin && !['resolved', 'closed'].includes(normStatus(t.status))),
      today: c((t) => new Date(t.created_at) >= startOfToday),
    };
  }, [stats, tickets]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets.filter((t) => {
      if (!showArchived && (t.is_archived || t.deleted_at)) return false;
      if (showArchived && !t.is_archived) return false;
      if (statusFilter !== 'all' && normStatus(t.status) !== statusFilter) return false;
      if (q) {
        const hay = `${t.name || ''} ${t.email || ''} ${t.subject || ''} ${t.message || ''} ${t.phone || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [tickets, search, statusFilter, showArchived]);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const logActivity = async (ticketId, activity_type, content, metadata = {}) => {
    try {
      await supabase.from('support_ticket_activity').insert([{ ticket_id: ticketId, admin_id: user?.id || null, activity_type, content, metadata }]);
    } catch { /* activity table may not exist pre-migration */ }
  };

  const patchTicket = async (patch, activityType, activityContent) => {
    if (!selected) return;
    setBusy(true);
    try {
      const { error: err } = await supabase.from('contact_inquiries').update(patch).eq('id', selected.id);
      if (err) throw err;
      if (activityType) await logActivity(selected.id, activityType, activityContent);
      setSelected((prev) => ({ ...prev, ...patch }));
      toast.success('Ticket updated.');
      fetchTickets(); fetchStats();
      if (activityType) {
        const { data } = await supabase.from('support_ticket_activity')
          .select('*, admin:users!support_ticket_activity_admin_id_fkey(name)')
          .eq('ticket_id', selected.id).order('created_at', { ascending: true });
        setActivity(data || []);
      }
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Update failed. Ensure migration 70 is applied.');
    } finally { setBusy(false); }
  };

  const changeStatus = (s) => patchTicket({ status: s }, 'status_change', `Status changed to ${statusMeta(s).label}`);
  const changePriority = (p) => patchTicket({ priority: p }, 'priority_change', `Priority set to ${priorityMeta(p).label}`);
  const assign = (adminId) => {
    const a = admins.find((x) => x.id === adminId);
    patchTicket({ assigned_admin: adminId || null }, 'assignment', adminId ? `Assigned to ${a?.name || a?.email || 'admin'}` : 'Unassigned');
  };
  const toggleStar = () => patchTicket({ is_starred: !selected.is_starred });
  const toggleArchive = () => patchTicket({ is_archived: !selected.is_archived }, selected.is_archived ? 'restore' : 'archive', selected.is_archived ? 'Restored from archive' : 'Archived');

  const addNote = async () => {
    if (!noteText.trim()) return;
    setBusy(true);
    await logActivity(selected.id, 'note', noteText.trim());
    setNoteText('');
    const { data } = await supabase.from('support_ticket_activity')
      .select('*, admin:users!support_ticket_activity_admin_id_fkey(name)')
      .eq('ticket_id', selected.id).order('created_at', { ascending: true });
    setActivity(data || []);
    toast.success('Internal note added.');
    setBusy(false);
  };

  const sendReply = async () => {
    if (!replyText.trim()) return;
    setBusy(true);
    try {
      await logActivity(selected.id, 'reply', replyText.trim());
      // Notify the registered user (if this ticket came from a signed-in account).
      if (selected.user_id) {
        try {
          await supabase.from('notifications').insert([{
            user_id: selected.user_id, type: 'support_reply', title: '💬 Support replied to your message',
            body: `Our team responded to "${selected.subject || 'your inquiry'}".`, is_read: false, created_at: new Date().toISOString(),
          }]);
        } catch { /* notifications optional */ }
      }
      // Advancing an untouched ticket to In Progress is a sensible default.
      if (['new', 'open'].includes(normStatus(selected.status))) {
        await supabase.from('contact_inquiries').update({ status: 'in_progress' }).eq('id', selected.id);
        setSelected((prev) => ({ ...prev, status: 'in_progress' }));
      }
      setReplyText('');
      const { data } = await supabase.from('support_ticket_activity')
        .select('*, admin:users!support_ticket_activity_admin_id_fkey(name)')
        .eq('ticket_id', selected.id).order('created_at', { ascending: true });
      setActivity(data || []);
      toast.success(selected.user_id ? 'Reply sent and client notified.' : 'Reply logged (guest — no in-app notification).');
      fetchTickets(); fetchStats();
    } catch (err) {
      toast.error(err.message || 'Failed to send reply.');
    } finally { setBusy(false); }
  };

  const softDelete = async () => {
    if (!window.confirm('Move this ticket to trash? It will be hidden but recoverable in the database.')) return;
    setBusy(true);
    try {
      const { error: err } = await supabase.from('contact_inquiries').update({ deleted_at: new Date().toISOString() }).eq('id', selected.id);
      if (err) throw err;
      await logActivity(selected.id, 'delete', 'Ticket moved to trash');
      toast.success('Ticket deleted.');
      setSelected(null); fetchTickets(); fetchStats();
    } catch (err) { toast.error(err.message || 'Delete failed.'); } finally { setBusy(false); }
  };

  const openAttachment = async () => {
    const url = attachmentUrl || (selected?.attachment_url ? await getSignedDocumentUrl(selected.attachment_url, 'documents') : null);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
    else toast.error('Attachment unavailable.');
  };

  // ── Render ───────────────────────────────────────────────────────────────
  const statCards = [
    { label: 'New', value: derivedStats.new, tone: 'text-blue-600' },
    { label: 'In Progress', value: derivedStats.in_progress, tone: 'text-amber-600' },
    { label: 'Unassigned', value: derivedStats.unassigned, tone: 'text-red-600' },
    { label: 'Resolved', value: derivedStats.resolved, tone: 'text-green-600' },
    { label: "Today", value: derivedStats.today, tone: 'text-indigo-600' },
    { label: 'Total', value: derivedStats.total, tone: 'text-navy-primary' },
  ];

  return (
    <div className="p-4 md:p-8 max-w-[1400px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-serif font-bold text-navy-primary">Support Messages</h1>
        <p className="text-sm text-gray-500 mt-1">Contact form submissions and support tickets — moderate, assign, and respond.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
        {statCards.map((s) => (
          <div key={s.label} className="p-4 rounded-2xl border border-border-subtle bg-white">
            <div className={`text-2xl font-bold ${s.tone}`}>{s.value ?? 0}</div>
            <div className="text-xs text-gray-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-col md:flex-row gap-3 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email, subject, message…"
          className="flex-1 px-4 py-2.5 rounded-xl border border-border-subtle text-sm focus:outline-none focus:ring-2 focus:ring-navy-primary/20"
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-4 py-2.5 rounded-xl border border-border-subtle text-sm bg-white">
          <option value="all">All statuses</option>
          {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <button
          onClick={() => setShowArchived((v) => !v)}
          className={`px-4 py-2.5 rounded-xl text-sm font-semibold border transition ${showArchived ? 'bg-navy-primary text-white border-navy-primary' : 'bg-white text-gray-600 border-border-subtle'}`}
        >
          {showArchived ? 'Viewing Archived' : 'Show Archived'}
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="p-12 text-center text-gray-400 animate-pulse">Loading support messages…</div>
      ) : error ? (
        <div className="p-8 text-center bg-red-50 border border-red-200 rounded-2xl text-red-600">
          <p className="font-bold">Couldn't load messages</p>
          <p className="text-sm mt-1">{error}</p>
          <button onClick={fetchTickets} className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-bold">Retry</button>
        </div>
      ) : visible.length === 0 ? (
        <div className="p-16 text-center bg-bg-light/40 rounded-2xl border border-dashed border-border-subtle">
          <span className="material-symbols-outlined text-4xl text-gray-300 mb-2">mark_email_read</span>
          <p className="font-bold text-navy-primary">{showArchived ? 'No archived messages' : 'No support messages'}</p>
          <p className="text-xs text-gray-500 mt-1">{search || statusFilter !== 'all' ? 'Try adjusting your search or filters.' : 'New contact-form submissions will appear here.'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((t) => {
            const sm = statusMeta(t.status); const pm = priorityMeta(t.priority);
            return (
              <button
                key={t.id}
                onClick={() => setSelected(t)}
                className="w-full text-left p-4 rounded-2xl border border-border-subtle bg-white hover:shadow-md hover:border-navy-primary/30 transition flex items-start gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {t.is_starred && <span className="text-amber-500">★</span>}
                    <span className="font-bold text-navy-primary truncate">{t.name || 'Anonymous'}</span>
                    <span className="text-xs text-gray-400">{t.email}</span>
                    {!t.user_id && <span className="text-[10px] uppercase tracking-wide bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">Guest</span>}
                  </div>
                  <div className="text-sm font-semibold text-gray-700 mt-1 truncate">{t.subject || '(No subject)'}</div>
                  <div className="text-xs text-gray-500 mt-0.5 line-clamp-1">{t.message}</div>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${sm.color}`}>{sm.label}</span>
                  <span className={`text-[11px] font-semibold ${pm.color}`}>{pm.label}</span>
                  <span className="text-[11px] text-gray-400">{fmtDate(t.created_at)}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Detail drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={() => setSelected(null)}>
          <div className="bg-white w-full max-w-xl h-full overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-border-subtle p-5 flex items-start justify-between z-10">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <button onClick={toggleStar} className="text-lg" title="Star">{selected.is_starred ? '★' : '☆'}</button>
                  <h3 className="text-lg font-bold text-navy-primary truncate">{selected.subject || '(No subject)'}</h3>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">Ticket #{selected.id} · {fmtDate(selected.created_at)}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>

            <div className="p-5 space-y-5">
              {/* Sender */}
              <section className="bg-bg-light/40 rounded-2xl p-4 border border-border-subtle">
                <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Sender</h4>
                <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
                  <div><span className="text-gray-400">Name</span><div className="font-semibold text-gray-700">{selected.name || '—'}</div></div>
                  <div><span className="text-gray-400">Email</span><div className="font-semibold text-gray-700 break-all">{selected.email || '—'}</div></div>
                  <div><span className="text-gray-400">Phone</span><div className="font-semibold text-gray-700">{selected.phone || '—'}</div></div>
                  <div><span className="text-gray-400">Account</span><div className="font-semibold text-gray-700">{selected.user_id ? 'Registered' : 'Guest'}</div></div>
                  {selected.user_agent && <div className="col-span-2"><span className="text-gray-400">Browser</span><div className="text-xs text-gray-500 break-all">{selected.user_agent}</div></div>}
                </div>
              </section>

              {/* Message */}
              <section>
                <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Message</h4>
                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{selected.message}</p>
                {selected.attachment_url && (
                  <button onClick={openAttachment} className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-navy-primary/5 text-navy-primary rounded-lg text-sm font-semibold hover:bg-navy-primary/10">
                    <span className="material-symbols-outlined text-base">attach_file</span> View attachment
                  </button>
                )}
              </section>

              {/* Controls */}
              <section className="grid grid-cols-2 gap-3">
                <label className="text-xs font-semibold text-gray-500">Status
                  <select value={normStatus(selected.status)} onChange={(e) => changeStatus(e.target.value)} disabled={busy} className="mt-1 w-full px-3 py-2 rounded-lg border border-border-subtle text-sm bg-white">
                    {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </label>
                <label className="text-xs font-semibold text-gray-500">Priority
                  <select value={String(selected.priority || 'normal').toLowerCase()} onChange={(e) => changePriority(e.target.value)} disabled={busy} className="mt-1 w-full px-3 py-2 rounded-lg border border-border-subtle text-sm bg-white">
                    {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                  </select>
                </label>
                <label className="text-xs font-semibold text-gray-500 col-span-2">Assigned admin
                  <select value={selected.assigned_admin || ''} onChange={(e) => assign(e.target.value)} disabled={busy} className="mt-1 w-full px-3 py-2 rounded-lg border border-border-subtle text-sm bg-white">
                    <option value="">Unassigned</option>
                    {admins.map((a) => <option key={a.id} value={a.id}>{a.name || a.email}</option>)}
                  </select>
                </label>
              </section>

              {/* Reply */}
              <section>
                <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Reply to sender</h4>
                <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={3} placeholder={selected.user_id ? 'Your reply notifies the client in-app…' : 'Guest sender — reply is logged for the record.'} className="w-full px-3 py-2 rounded-lg border border-border-subtle text-sm" />
                <button onClick={sendReply} disabled={busy || !replyText.trim()} className="mt-2 px-4 py-2 bg-navy-primary text-white rounded-lg text-sm font-bold disabled:opacity-50">Send Reply</button>
              </section>

              {/* Internal note */}
              <section>
                <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Internal note (admins only)</h4>
                <div className="flex gap-2">
                  <input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Add a private note…" className="flex-1 px-3 py-2 rounded-lg border border-border-subtle text-sm" />
                  <button onClick={addNote} disabled={busy || !noteText.trim()} className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-bold disabled:opacity-50">Add</button>
                </div>
              </section>

              {/* Timeline */}
              <section>
                <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Activity timeline</h4>
                {activity.length === 0 ? (
                  <p className="text-xs text-gray-400">No activity yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {activity.map((a) => (
                      <li key={a.id} className="text-sm border-l-2 border-border-subtle pl-3">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${a.activity_type === 'reply' ? 'bg-green-100 text-green-700' : a.activity_type === 'note' ? 'bg-gray-100 text-gray-600' : 'bg-blue-100 text-blue-700'}`}>{a.activity_type.replace('_', ' ')}</span>
                          <span className="text-xs text-gray-400">{a.admin?.name || 'System'} · {fmtDate(a.created_at)}</span>
                        </div>
                        {a.content && <p className="text-gray-700 mt-1 whitespace-pre-wrap">{a.content}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Danger / archive */}
              <section className="flex gap-2 pt-2 border-t border-border-subtle">
                <button onClick={toggleArchive} disabled={busy} className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-bold">{selected.is_archived ? 'Restore' : 'Archive'}</button>
                <button onClick={softDelete} disabled={busy} className="flex-1 px-3 py-2 bg-red-50 text-red-600 rounded-lg text-sm font-bold">Delete</button>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupportMessages;
