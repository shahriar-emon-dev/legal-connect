-- =============================================================================
-- Migration 48: Search System Optimization & Database Index Hardening
-- Description: Implements full-text search tsvector RPCs (search_lawyers, search_jobs)
--              with filtering, pagination, and GIN/B-tree high-performance indexes.
--              Mandated by Phase 12 & Audit Section P3.
-- =============================================================================

-- 1. Create B-Tree Indexes for rapid filtering and sorting
CREATE INDEX IF NOT EXISTS idx_lawyers_verified_rate ON public.lawyers(is_verified, hourly_rate);
CREATE INDEX IF NOT EXISTS idx_lawyers_rating_reviews ON public.lawyers(avg_rating DESC, total_reviews DESC);
CREATE INDEX IF NOT EXISTS idx_lawyers_location ON public.lawyers USING btree(location);

CREATE INDEX IF NOT EXISTS idx_job_posts_status_created ON public.job_posts(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_posts_category_budget ON public.job_posts(legal_category, budget_max);
CREATE INDEX IF NOT EXISTS idx_job_posts_location ON public.job_posts USING btree(location);

-- 2. Create Generated tsvector columns or GIN Full-Text Search Indexes
DO $$
BEGIN
  -- Add tsvector column or index for lawyers search
  ALTER TABLE public.lawyers ADD COLUMN IF NOT EXISTS fts_vector tsvector
    GENERATED ALWAYS AS (
      to_tsvector('english', COALESCE(specialization::text, '') || ' ' || COALESCE(bio, '') || ' ' || COALESCE(location, ''))
    ) STORED;
  CREATE INDEX IF NOT EXISTS idx_lawyers_fts ON public.lawyers USING GIN(fts_vector);
EXCEPTION WHEN OTHERS THEN
  -- Fallback if column addition conflicts or generated expression fails on array
  CREATE INDEX IF NOT EXISTS idx_lawyers_expr_fts ON public.lawyers USING GIN(
    to_tsvector('english', COALESCE(bio, '') || ' ' || COALESCE(location, ''))
  );
END $$;

DO $$
BEGIN
  ALTER TABLE public.job_posts ADD COLUMN IF NOT EXISTS fts_vector tsvector
    GENERATED ALWAYS AS (
      to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(description, '') || ' ' || COALESCE(legal_category, ''))
    ) STORED;
  CREATE INDEX IF NOT EXISTS idx_job_posts_fts ON public.job_posts USING GIN(fts_vector);
EXCEPTION WHEN OTHERS THEN
  CREATE INDEX IF NOT EXISTS idx_job_posts_expr_fts ON public.job_posts USING GIN(
    to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(description, ''))
  );
END $$;

-- Safely drop any existing function signatures to prevent return type mismatch errors (SQL Error 42P13)
DO $$ 
DECLARE 
  r RECORD; 
BEGIN 
  FOR r IN 
    SELECT oid::regprocedure AS fn_sig 
    FROM pg_proc 
    WHERE proname IN ('search_lawyers', 'search_jobs') 
      AND pronamespace = 'public'::regnamespace 
  LOOP 
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.fn_sig || ' CASCADE;'; 
  END LOOP; 
END $$;

-- 3. Server-side RPC: search_lawyers
CREATE OR REPLACE FUNCTION public.search_lawyers(
  p_query TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_location TEXT DEFAULT NULL,
  p_max_rate NUMERIC DEFAULT NULL,
  p_verified_only BOOLEAN DEFAULT true,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  name TEXT,
  profile_picture_url TEXT,
  specialization TEXT[],
  bio TEXT,
  location TEXT,
  hourly_rate NUMERIC,
  experience_years INT,
  avg_rating NUMERIC,
  total_reviews INT,
  is_verified BOOLEAN,
  verification_status TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    l.id,
    l.user_id,
    COALESCE(u.name, 'Verified Lawyer') AS name,
    u.profile_picture_url,
    l.specialization,
    l.bio,
    l.location,
    l.hourly_rate,
    l.experience_years,
    l.avg_rating,
    l.total_reviews,
    l.is_verified,
    l.verification_status::text
  FROM public.lawyers l
  JOIN public.users u ON (u.id = l.user_id OR u.auth_id = l.user_id)
  WHERE (NOT p_verified_only OR (l.is_verified = true OR l.verification_status::text = 'verified'))
    AND (p_category IS NULL OR p_category = '' OR p_category = 'All' OR l.specialization @> ARRAY[p_category]::text[] OR l.bio ILIKE '%' || p_category || '%')
    AND (p_location IS NULL OR p_location = '' OR l.location ILIKE '%' || p_location || '%')
    AND (p_max_rate IS NULL OR p_max_rate <= 0 OR l.hourly_rate <= p_max_rate)
    AND (
      p_query IS NULL OR p_query = '' 
      OR u.name ILIKE '%' || p_query || '%'
      OR l.bio ILIKE '%' || p_query || '%'
      OR l.location ILIKE '%' || p_query || '%'
      OR (l.fts_vector IS NOT NULL AND l.fts_vector @@ plainto_tsquery('english', p_query))
    )
  ORDER BY l.avg_rating DESC, l.total_reviews DESC, l.experience_years DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- 4. Server-side RPC: search_jobs
CREATE OR REPLACE FUNCTION public.search_jobs(
  p_query TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_location TEXT DEFAULT NULL,
  p_min_budget NUMERIC DEFAULT NULL,
  p_status TEXT DEFAULT 'open',
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id INT,
  client_id UUID,
  title TEXT,
  description TEXT,
  legal_category TEXT,
  location TEXT,
  city TEXT,
  budget_min NUMERIC,
  budget_max NUMERIC,
  budget_type TEXT,
  urgency TEXT,
  status TEXT,
  proposals_count INT,
  deadline DATE,
  created_at TIMESTAMPTZ,
  client_name TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    j.id,
    j.client_id,
    j.title::text,
    j.description::text,
    j.legal_category::text,
    j.location::text,
    j.city::text,
    j.budget_min,
    j.budget_max,
    j.budget_type::text,
    j.urgency::text,
    j.status::text,
    j.proposals_count,
    j.deadline,
    j.created_at,
    COALESCE(u.name, 'Client')::text AS client_name
  FROM public.job_posts j
  LEFT JOIN public.users u ON (u.id = j.client_id OR u.auth_id = j.client_id)
  WHERE (p_status IS NULL OR p_status = '' OR j.status = p_status)
    AND (p_category IS NULL OR p_category = '' OR p_category = 'All' OR j.legal_category ILIKE '%' || p_category || '%')
    AND (p_location IS NULL OR p_location = '' OR j.location ILIKE '%' || p_location || '%' OR j.city ILIKE '%' || p_location || '%')
    AND (p_min_budget IS NULL OR p_min_budget <= 0 OR j.budget_max >= p_min_budget)
    AND (
      p_query IS NULL OR p_query = '' 
      OR j.title ILIKE '%' || p_query || '%'
      OR j.description ILIKE '%' || p_query || '%'
      OR (j.fts_vector IS NOT NULL AND j.fts_vector @@ plainto_tsquery('english', p_query))
    )
  ORDER BY j.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_lawyers(TEXT, TEXT, TEXT, NUMERIC, BOOLEAN, INT, INT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.search_jobs(TEXT, TEXT, TEXT, NUMERIC, TEXT, INT, INT) TO authenticated, anon;
