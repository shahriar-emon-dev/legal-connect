-- =============================================================================
-- Migration 53: Master Job Post RLS & Workflow Fix (New Standalone File)
-- Description: Directly fixes "new row violates row-level security policy for
--              table job_posts" and sequence permission errors without altering
--              any existing migration files or weakening database security.
-- =============================================================================

-- 1. Grant explicit sequence permissions for SERIAL/BIGSERIAL ID generation
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO authenticated, anon, service_role;

-- 2. Ensure table grants exist for authenticated users on job_posts and job_proposals
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.job_posts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.job_proposals TO authenticated;

-- 3. Create universal SECURITY DEFINER ownership helper function
-- Matches target_id against both public.users.id and public.users.auth_id
CREATE OR REPLACE FUNCTION public.is_owner(target_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF target_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  RETURN (target_id = auth.uid()) OR EXISTS (
    SELECT 1 FROM public.users 
    WHERE (id = target_id OR auth_id = target_id) 
      AND (id = auth.uid() OR auth_id = auth.uid())
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_owner(UUID) TO authenticated, anon, service_role;

-- 4. Create BEFORE INSERT reconciliation trigger for job_posts.client_id
-- Safely ensures that if the frontend sends auth.uid() instead of users.id, or vice-versa,
-- client_id is automatically mapped to the correct users.id primary key before foreign key/RLS check.
CREATE OR REPLACE FUNCTION public.ensure_job_post_client_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- If NEW.client_id is not already a valid primary key in public.users
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = NEW.client_id) THEN
    SELECT id INTO v_user_id FROM public.users WHERE auth_id = auth.uid() OR id = auth.uid() LIMIT 1;
    IF v_user_id IS NOT NULL THEN
      NEW.client_id := v_user_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_job_post_client_id ON public.job_posts;
CREATE TRIGGER trg_ensure_job_post_client_id
  BEFORE INSERT ON public.job_posts
  FOR EACH ROW EXECUTE FUNCTION public.ensure_job_post_client_id();

-- 5. Hardened, pristine RLS policies for public.job_posts
ALTER TABLE public.job_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view open job posts" ON public.job_posts;
DROP POLICY IF EXISTS "Clients can manage their own job posts" ON public.job_posts;
DROP POLICY IF EXISTS "Admins manage all jobs" ON public.job_posts;

CREATE POLICY "Anyone can view open job posts" ON public.job_posts
  FOR SELECT USING (status = 'open' OR public.is_owner(client_id) OR public.is_owner(selected_lawyer_id) OR public.is_admin());

CREATE POLICY "Clients can manage their own job posts" ON public.job_posts
  FOR ALL TO authenticated
  USING (public.is_owner(client_id) OR public.is_admin())
  WITH CHECK (public.is_owner(client_id) OR public.is_admin());

-- 6. Hardened, pristine RLS policies for public.job_proposals
ALTER TABLE public.job_proposals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lawyers view own proposals" ON public.job_proposals;
DROP POLICY IF EXISTS "Clients view proposals for their jobs" ON public.job_proposals;
DROP POLICY IF EXISTS "Lawyers manage own proposals" ON public.job_proposals;
DROP POLICY IF EXISTS "Lawyers and Clients access proposals" ON public.job_proposals;
DROP POLICY IF EXISTS "Lawyers insert and update own proposals" ON public.job_proposals;

CREATE POLICY "Lawyers and Clients access proposals" ON public.job_proposals
  FOR SELECT TO authenticated
  USING (
    public.is_owner(lawyer_id) 
    OR EXISTS (SELECT 1 FROM public.job_posts j WHERE j.id = job_proposals.job_post_id AND public.is_owner(j.client_id))
    OR public.is_admin()
  );

CREATE POLICY "Lawyers insert and update own proposals" ON public.job_proposals
  FOR ALL TO authenticated
  USING (public.is_owner(lawyer_id) OR public.is_admin())
  WITH CHECK (public.is_owner(lawyer_id) OR public.is_admin());

-- 7. Hardened policies for related core tables
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Participants access cases" ON public.cases;
CREATE POLICY "Participants access cases" ON public.cases
  FOR ALL TO authenticated
  USING (public.is_owner(lawyer_id) OR public.is_owner(client_id) OR public.is_admin())
  WITH CHECK (public.is_owner(lawyer_id) OR public.is_owner(client_id) OR public.is_admin());

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Participants access contracts" ON public.contracts;
CREATE POLICY "Participants access contracts" ON public.contracts
  FOR ALL TO authenticated
  USING (public.is_owner(lawyer_id) OR public.is_owner(client_id) OR public.is_admin())
  WITH CHECK (public.is_owner(lawyer_id) OR public.is_owner(client_id) OR public.is_admin());

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Participants access conversations" ON public.conversations;
CREATE POLICY "Participants access conversations" ON public.conversations
  FOR ALL TO authenticated
  USING (public.is_owner(lawyer_id) OR public.is_owner(client_id) OR public.is_admin())
  WITH CHECK (public.is_owner(lawyer_id) OR public.is_owner(client_id) OR public.is_admin());

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Participants access messages" ON public.messages;
CREATE POLICY "Participants access messages" ON public.messages
  FOR ALL TO authenticated
  USING (
    public.is_owner(sender_id)
    OR EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id AND (public.is_owner(c.lawyer_id) OR public.is_owner(c.client_id)))
    OR public.is_admin()
  )
  WITH CHECK (
    public.is_owner(sender_id)
    OR EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id AND (public.is_owner(c.lawyer_id) OR public.is_owner(c.client_id)))
    OR public.is_admin()
  );

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Participants access documents" ON public.documents;
CREATE POLICY "Participants access documents" ON public.documents
  FOR ALL TO authenticated
  USING (public.is_owner(lawyer_id) OR public.is_owner(client_id) OR public.is_owner(uploaded_by) OR public.is_admin())
  WITH CHECK (public.is_owner(lawyer_id) OR public.is_owner(client_id) OR public.is_owner(uploaded_by) OR public.is_admin());

-- 8. Reload PostgREST schema cache immediately
NOTIFY pgrst, 'reload schema';
