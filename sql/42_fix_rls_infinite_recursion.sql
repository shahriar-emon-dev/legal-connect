-- =============================================================================
-- Migration 42: Fix RLS Infinite Recursion on Job Board
-- =============================================================================

-- Problem:
-- The job_posts policy checked job_proposals, and the job_proposals policy checked job_posts.
-- This caused an infinite recursion when Postgres evaluated RLS policies.
-- 
-- Solution:
-- Create SECURITY DEFINER functions to perform the cross-table lookups. 
-- SECURITY DEFINER functions run with the privileges of the function creator,
-- effectively bypassing RLS for the internal query and breaking the infinite loop.

-- 1. Helper function to check if user is the client of a job post
CREATE OR REPLACE FUNCTION public.is_job_client_check(job_id INTEGER, uid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN EXISTS(SELECT 1 FROM public.job_posts WHERE id = job_id AND client_id = uid);
END;
$$;

-- 2. Helper function to check if a lawyer submitted a proposal for a job post
CREATE OR REPLACE FUNCTION public.has_lawyer_proposal_check(job_id INTEGER, uid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN EXISTS(SELECT 1 FROM public.job_proposals WHERE job_post_id = job_id AND lawyer_id = uid);
END;
$$;

-- 3. Replace job_posts SELECT policy
DROP POLICY IF EXISTS "Anyone can view open job posts" ON public.job_posts;
CREATE POLICY "Anyone can view open job posts" ON public.job_posts
  FOR SELECT USING (
    status = 'open' 
    OR client_id = auth.uid() 
    OR selected_lawyer_id = auth.uid()
    OR public.has_lawyer_proposal_check(id, auth.uid())
    OR public.is_admin()
  );

-- 4. Replace job_proposals SELECT policy
DROP POLICY IF EXISTS "Lawyers and clients can view relevant proposals" ON public.job_proposals;
CREATE POLICY "Lawyers and clients can view relevant proposals" ON public.job_proposals
  FOR SELECT USING (
    lawyer_id = auth.uid() 
    OR public.is_job_client_check(job_post_id, auth.uid())
    OR public.is_admin()
  );

-- 5. Replace job_proposals UPDATE policy (same logic as SELECT)
DROP POLICY IF EXISTS "Lawyers and clients can update relevant proposals" ON public.job_proposals;
CREATE POLICY "Lawyers and clients can update relevant proposals" ON public.job_proposals
  FOR UPDATE USING (
    lawyer_id = auth.uid() 
    OR public.is_job_client_check(job_post_id, auth.uid())
    OR public.is_admin()
  );
