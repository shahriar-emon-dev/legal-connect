-- =============================================================================
-- Migration 49: Comprehensive Security & RLS Hardening
-- Description: Hardens and standardizes Row Level Security across all core tables,
--              eliminating recursive policies and enforcing strict role boundaries.
--              Mandated by Phase 15 & Audit Section P4.
-- =============================================================================

-- Safely drop any existing function signatures to prevent return type mismatch errors (SQL Error 42P13)
DO $$ 
DECLARE 
  r RECORD; 
BEGIN 
  FOR r IN 
    SELECT oid::regprocedure AS fn_sig 
    FROM pg_proc 
    WHERE proname IN ('is_admin', 'fn_is_admin') 
      AND pronamespace = 'public'::regnamespace 
  LOOP 
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.fn_sig || ' CASCADE;'; 
  END LOOP; 
END $$;

-- 1. Ensure non-recursive admin check functions
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users 
    WHERE (id = auth.uid() OR auth_id = auth.uid()) 
      AND (user_type::text = 'admin' OR role::text = 'admin')
  ) OR (auth.jwt() ->> 'role' = 'admin') 
    OR (auth.jwt() ->> 'user_role' = 'admin');
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;

-- 2. Hardened Policies for public.users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view basic user info" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Admins can manage all users" ON public.users;

CREATE POLICY "Public can view basic user info" ON public.users
  FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR auth_id = auth.uid() OR public.is_admin())
  WITH CHECK (id = auth.uid() OR auth_id = auth.uid() OR public.is_admin());

CREATE POLICY "Admins can manage all users" ON public.users
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 3. Hardened Policies for public.job_posts
ALTER TABLE public.job_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view open job posts" ON public.job_posts;
DROP POLICY IF EXISTS "Clients can manage their own job posts" ON public.job_posts;
DROP POLICY IF EXISTS "Admins manage all jobs" ON public.job_posts;

CREATE POLICY "Anyone can view open job posts" ON public.job_posts
  FOR SELECT USING (status = 'open' OR client_id = auth.uid() OR selected_lawyer_id = auth.uid() OR public.is_admin());

CREATE POLICY "Clients can manage their own job posts" ON public.job_posts
  FOR ALL TO authenticated
  USING (client_id = auth.uid() OR public.is_admin())
  WITH CHECK (client_id = auth.uid() OR public.is_admin());

-- 4. Hardened Policies for public.job_proposals
ALTER TABLE public.job_proposals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lawyers view own proposals" ON public.job_proposals;
DROP POLICY IF EXISTS "Clients view proposals for their jobs" ON public.job_proposals;
DROP POLICY IF EXISTS "Lawyers manage own proposals" ON public.job_proposals;

CREATE POLICY "Lawyers and Clients access proposals" ON public.job_proposals
  FOR SELECT TO authenticated
  USING (
    lawyer_id = auth.uid() 
    OR EXISTS (SELECT 1 FROM public.job_posts j WHERE j.id = job_proposals.job_post_id AND j.client_id = auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "Lawyers insert and update own proposals" ON public.job_proposals
  FOR ALL TO authenticated
  USING (lawyer_id = auth.uid() OR public.is_admin())
  WITH CHECK (lawyer_id = auth.uid() OR public.is_admin());

-- 5. Hardened Policies for public.cases & public.contracts
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lawyers can access and modify their cases" ON public.cases;
DROP POLICY IF EXISTS "Clients can access and modify their cases" ON public.cases;

CREATE POLICY "Participants access cases" ON public.cases
  FOR ALL TO authenticated
  USING (lawyer_id = auth.uid() OR client_id = auth.uid() OR public.is_admin())
  WITH CHECK (lawyer_id = auth.uid() OR client_id = auth.uid() OR public.is_admin());

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lawyers can access and modify their contracts" ON public.contracts;
DROP POLICY IF EXISTS "Clients can access and modify their contracts" ON public.contracts;

CREATE POLICY "Participants access contracts" ON public.contracts
  FOR ALL TO authenticated
  USING (lawyer_id = auth.uid() OR client_id = auth.uid() OR public.is_admin())
  WITH CHECK (lawyer_id = auth.uid() OR client_id = auth.uid() OR public.is_admin());

-- 6. Hardened Policies for public.conversations & public.messages
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lawyers can access and modify their conversations" ON public.conversations;
DROP POLICY IF EXISTS "Clients can access and modify their conversations" ON public.conversations;

CREATE POLICY "Participants access conversations" ON public.conversations
  FOR ALL TO authenticated
  USING (lawyer_id = auth.uid() OR client_id = auth.uid() OR public.is_admin())
  WITH CHECK (lawyer_id = auth.uid() OR client_id = auth.uid() OR public.is_admin());

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Participants access messages" ON public.messages;

CREATE POLICY "Participants access messages" ON public.messages
  FOR ALL TO authenticated
  USING (
    sender_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id AND (c.lawyer_id = auth.uid() OR c.client_id = auth.uid()))
    OR public.is_admin()
  )
  WITH CHECK (
    sender_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id AND (c.lawyer_id = auth.uid() OR c.client_id = auth.uid()))
    OR public.is_admin()
  );

-- 7. Hardened Policies for public.documents
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lawyers_select_own_documents" ON public.documents;
DROP POLICY IF EXISTS "admins_select_all_documents" ON public.documents;

CREATE POLICY "Participants access documents" ON public.documents
  FOR ALL TO authenticated
  USING (lawyer_id = auth.uid() OR client_id = auth.uid() OR uploaded_by = auth.uid() OR public.is_admin())
  WITH CHECK (lawyer_id = auth.uid() OR client_id = auth.uid() OR uploaded_by = auth.uid() OR public.is_admin());

-- 8. Hardened Policies for public.transactions
ALTER TABLE IF EXISTS public.transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "User transaction view" ON public.transactions;
CREATE POLICY "User transaction view" ON public.transactions
  FOR SELECT TO authenticated
  USING (client_id = auth.uid() OR lawyer_id = auth.uid() OR public.is_admin());

