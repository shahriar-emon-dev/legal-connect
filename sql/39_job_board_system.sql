-- =============================================================================
-- Migration 39: End-to-End Job Board Marketplace System
-- =============================================================================

-- 1. Add generated/alias columns to public.users for seamless PostgREST joins
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='full_name') THEN
    ALTER TABLE public.users ADD COLUMN full_name VARCHAR(255) GENERATED ALWAYS AS (name) STORED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='avatar_url') THEN
    ALTER TABLE public.users ADD COLUMN avatar_url TEXT GENERATED ALWAYS AS (profile_picture_url) STORED;
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- 2. Add source column to public.appointments
-- 2. Add source column to public.appointments
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'direct';

-- 3. Clean up existing/old tables to avoid schema conflicts (like missing job_post_id column from old migrations)
DROP TABLE IF EXISTS public.job_proposals CASCADE;
DROP TABLE IF EXISTS public.job_posts CASCADE;

-- 4. Create job_posts table
CREATE TABLE public.job_posts (
  id SERIAL PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  legal_category VARCHAR(100) NOT NULL,
  location VARCHAR(255),
  city VARCHAR(100),
  budget_min NUMERIC(10,2),
  budget_max NUMERIC(10,2),
  budget_type VARCHAR(50) NOT NULL DEFAULT 'fixed' CHECK (budget_type IN ('fixed', 'negotiable', 'hourly')),
  urgency VARCHAR(50) NOT NULL DEFAULT 'normal' CHECK (urgency IN ('normal', 'urgent', 'emergency')),
  preferred_consultation_medium TEXT[] DEFAULT '{any}',
  attachments TEXT[] DEFAULT '{}',
  status VARCHAR(50) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'in_progress', 'cancelled', 'awarded')),
  proposals_count INTEGER NOT NULL DEFAULT 0,
  selected_lawyer_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  deadline DATE,
  is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_posts_client ON public.job_posts(client_id);
CREATE INDEX IF NOT EXISTS idx_job_posts_status ON public.job_posts(status);
CREATE INDEX IF NOT EXISTS idx_job_posts_category ON public.job_posts(legal_category);

-- 5. Create job_proposals table
CREATE TABLE public.job_proposals (
  id SERIAL PRIMARY KEY,
  job_post_id INTEGER NOT NULL REFERENCES public.job_posts(id) ON DELETE CASCADE,
  lawyer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  cover_letter TEXT NOT NULL,
  proposed_fee NUMERIC(10,2) NOT NULL,
  fee_type VARCHAR(50) NOT NULL DEFAULT 'fixed' CHECK (fee_type IN ('fixed', 'hourly')),
  estimated_duration VARCHAR(100) NOT NULL,
  availability_date DATE,
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'withdrawn')),
  client_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_job_lawyer_proposal UNIQUE (job_post_id, lawyer_id)
);

CREATE INDEX IF NOT EXISTS idx_job_proposals_job_post ON public.job_proposals(job_post_id);
CREATE INDEX IF NOT EXISTS idx_job_proposals_lawyer ON public.job_proposals(lawyer_id);
CREATE INDEX IF NOT EXISTS idx_job_proposals_status ON public.job_proposals(status);

-- 5. Row Level Security (RLS) Policies
ALTER TABLE public.job_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_proposals ENABLE ROW LEVEL SECURITY;

-- Helper functions to prevent infinite recursion in policies
CREATE OR REPLACE FUNCTION public.is_job_client_check(job_id INTEGER, uid UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN EXISTS(SELECT 1 FROM public.job_posts WHERE id = job_id AND client_id = uid);
END;
$$;

CREATE OR REPLACE FUNCTION public.has_lawyer_proposal_check(job_id INTEGER, uid UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN EXISTS(SELECT 1 FROM public.job_proposals WHERE job_post_id = job_id AND lawyer_id = uid);
END;
$$;

DROP POLICY IF EXISTS "Anyone can view open job posts" ON public.job_posts;
CREATE POLICY "Anyone can view open job posts" ON public.job_posts
  FOR SELECT USING (
    status = 'open' 
    OR client_id = auth.uid() 
    OR selected_lawyer_id = auth.uid()
    OR public.has_lawyer_proposal_check(id, auth.uid())
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "Clients can create job posts" ON public.job_posts;
CREATE POLICY "Clients can create job posts" ON public.job_posts
  FOR INSERT WITH CHECK (
    auth.uid() = client_id OR public.is_admin()
  );

DROP POLICY IF EXISTS "Clients can update own job posts" ON public.job_posts;
CREATE POLICY "Clients can update own job posts" ON public.job_posts
  FOR UPDATE USING (
    auth.uid() = client_id OR public.is_admin()
  );

DROP POLICY IF EXISTS "Clients can delete own job posts" ON public.job_posts;
CREATE POLICY "Clients can delete own job posts" ON public.job_posts
  FOR DELETE USING (
    auth.uid() = client_id OR public.is_admin()
  );

DROP POLICY IF EXISTS "Lawyers and clients can view relevant proposals" ON public.job_proposals;
CREATE POLICY "Lawyers and clients can view relevant proposals" ON public.job_proposals
  FOR SELECT USING (
    lawyer_id = auth.uid() 
    OR public.is_job_client_check(job_post_id, auth.uid())
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "Verified lawyers can submit proposals" ON public.job_proposals;
CREATE POLICY "Verified lawyers can submit proposals" ON public.job_proposals
  FOR INSERT WITH CHECK (
    auth.uid() = lawyer_id
    AND EXISTS (
      SELECT 1 FROM public.lawyers 
      WHERE user_id = auth.uid() AND (is_verified = true OR verification_status::text IN ('verified', 'Approved', 'approved'))
    )
  );

DROP POLICY IF EXISTS "Lawyers and clients can update relevant proposals" ON public.job_proposals;
CREATE POLICY "Lawyers and clients can update relevant proposals" ON public.job_proposals
  FOR UPDATE USING (
    lawyer_id = auth.uid() 
    OR public.is_job_client_check(job_post_id, auth.uid())
    OR public.is_admin()
  );

-- 6. Trigger: Handle Proposals Count
CREATE OR REPLACE FUNCTION public.handle_job_proposal_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.job_posts SET proposals_count = proposals_count + 1 WHERE id = NEW.job_post_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status != 'withdrawn' AND NEW.status = 'withdrawn' THEN
      UPDATE public.job_posts SET proposals_count = GREATEST(0, proposals_count - 1) WHERE id = NEW.job_post_id;
    ELSIF OLD.status = 'withdrawn' AND NEW.status != 'withdrawn' THEN
      UPDATE public.job_posts SET proposals_count = proposals_count + 1 WHERE id = NEW.job_post_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status != 'withdrawn' THEN
      UPDATE public.job_posts SET proposals_count = GREATEST(0, proposals_count - 1) WHERE id = OLD.job_post_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_job_proposal_count ON public.job_proposals;
CREATE TRIGGER trigger_job_proposal_count
  AFTER INSERT OR UPDATE OR DELETE ON public.job_proposals
  FOR EACH ROW EXECUTE FUNCTION public.handle_job_proposal_count();

-- 7. Trigger: Handle Notifications & Auto-Matching
CREATE OR REPLACE FUNCTION public.handle_job_proposal_notifications()
RETURNS TRIGGER AS $$
DECLARE
  v_job public.job_posts%ROWTYPE;
  v_lawyer_name VARCHAR(255);
  v_client_name VARCHAR(255);
BEGIN
  SELECT * INTO v_job FROM public.job_posts WHERE id = NEW.job_post_id;
  SELECT name INTO v_lawyer_name FROM public.users WHERE id = NEW.lawyer_id;
  SELECT name INTO v_client_name FROM public.users WHERE id = v_job.client_id;

  IF TG_OP = 'INSERT' THEN
    -- Notify Client
    INSERT INTO public.notifications (user_id, type, title, body, meta)
    VALUES (
      v_job.client_id,
      'proposal',
      'New Proposal Received',
      COALESCE(v_lawyer_name, 'A verified lawyer') || ' submitted a proposal for your case: "' || v_job.title || '"',
      jsonb_build_object('job_id', v_job.id, 'proposal_id', NEW.id, 'lawyer_id', NEW.lawyer_id)
    );
  ELSIF TG_OP = 'UPDATE' THEN
    -- If proposal accepted
    IF OLD.status != 'accepted' AND NEW.status = 'accepted' THEN
      -- 1. Update job post status to in_progress and set selected_lawyer_id
      UPDATE public.job_posts 
      SET status = 'in_progress', selected_lawyer_id = NEW.lawyer_id, updated_at = NOW() 
      WHERE id = NEW.job_post_id;

      -- 2. Reject other pending proposals for this job post
      UPDATE public.job_proposals 
      SET status = 'rejected', updated_at = NOW() 
      WHERE job_post_id = NEW.job_post_id AND id != NEW.id AND status = 'pending';

      -- 3. Auto-create consultation appointment record linking client and lawyer
      INSERT INTO public.appointments (client_id, lawyer_id, date, time, reason, status, source, duration_minutes)
      VALUES (
        v_job.client_id,
        NEW.lawyer_id,
        CURRENT_DATE + INTERVAL '1 day',
        '10:00:00',
        'Job Board Consultation: ' || v_job.title,
        'pending',
        'job_board',
        60
      );

      -- 4. Notify Lawyer
      INSERT INTO public.notifications (user_id, type, title, body, meta)
      VALUES (
        NEW.lawyer_id,
        'proposal',
        'Proposal Accepted! 🎉',
        'Your proposal for "' || v_job.title || '" was accepted by ' || COALESCE(v_client_name, 'the client') || '. A consultation has been scheduled.',
        jsonb_build_object('job_id', v_job.id, 'proposal_id', NEW.id, 'client_id', v_job.client_id)
      );

    -- If proposal rejected explicitly
    ELSIF OLD.status != 'rejected' AND NEW.status = 'rejected' THEN
      INSERT INTO public.notifications (user_id, type, title, body, meta)
      VALUES (
        NEW.lawyer_id,
        'proposal',
        'Proposal Update',
        'Your proposal for "' || v_job.title || '" was declined.',
        jsonb_build_object('job_id', v_job.id, 'proposal_id', NEW.id)
      );

    -- If proposal withdrawn
    ELSIF OLD.status != 'withdrawn' AND NEW.status = 'withdrawn' THEN
      INSERT INTO public.notifications (user_id, type, title, body, meta)
      VALUES (
        v_job.client_id,
        'proposal',
        'Proposal Withdrawn',
        COALESCE(v_lawyer_name, 'A lawyer') || ' withdrew their proposal for "' || v_job.title || '".',
        jsonb_build_object('job_id', v_job.id, 'proposal_id', NEW.id)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_job_proposal_notifications ON public.job_proposals;
CREATE TRIGGER trigger_job_proposal_notifications
  AFTER INSERT OR UPDATE ON public.job_proposals
  FOR EACH ROW EXECUTE FUNCTION public.handle_job_proposal_notifications();

-- 8. Enable Realtime Publications
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.job_posts;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.job_proposals;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 9. Storage Bucket Setup
INSERT INTO storage.buckets (id, name, public) 
VALUES ('job-attachments', 'job-attachments', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public Access Job Attachments" ON storage.objects;
CREATE POLICY "Public Access Job Attachments" ON storage.objects
  FOR SELECT USING (bucket_id = 'job-attachments');

DROP POLICY IF EXISTS "Auth Users Upload Job Attachments" ON storage.objects;
CREATE POLICY "Auth Users Upload Job Attachments" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'job-attachments' AND auth.role() = 'authenticated');
