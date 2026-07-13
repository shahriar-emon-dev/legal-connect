-- =============================================================================
-- Migration 52: Universal Owner & RLS Hardening Fix (job_posts & all tables)
-- Description: Resolves "new row violates row-level security policy for table job_posts"
--              by creating public.is_owner(target_id) helper. This ensures RLS
--              recognizes when user.id (public.users.id) and auth.uid() (auth_id)
--              belong to the same authenticated user account.
-- =============================================================================

-- 1. Create fast STABLE security-definer helper to match id or auth_id to auth.uid()
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

-- 2. Update RLS policies for public.job_posts to use public.is_owner()
ALTER TABLE public.job_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view open job posts" ON public.job_posts;
DROP POLICY IF EXISTS "Clients can manage their own job posts" ON public.job_posts;

CREATE POLICY "Anyone can view open job posts" ON public.job_posts
  FOR SELECT USING (status = 'open' OR public.is_owner(client_id) OR public.is_owner(selected_lawyer_id) OR public.is_admin());

CREATE POLICY "Clients can manage their own job posts" ON public.job_posts
  FOR ALL TO authenticated
  USING (public.is_owner(client_id) OR public.is_admin())
  WITH CHECK (public.is_owner(client_id) OR public.is_admin());

-- 3. Update RLS policies for public.job_proposals to use public.is_owner()
ALTER TABLE public.job_proposals ENABLE ROW LEVEL SECURITY;
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

-- 4. Update RLS policies for cases and contracts
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

-- 5. Update RLS policies for conversations and messages
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

-- 6. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
