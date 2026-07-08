-- =============================================================================
-- Migration 43: Consolidate User Profiles & Eliminate Redundancy
-- =============================================================================

-- 1. DROP REDUNDANT SYNC TRIGGERS
DROP TRIGGER IF EXISTS trg_sync_user_profile ON public.users;
DROP FUNCTION IF EXISTS public.sync_user_profile();

DROP TRIGGER IF EXISTS trg_sync_lawyer_profiles ON public.lawyer_profiles;
DROP FUNCTION IF EXISTS public.sync_lawyer_profiles_to_lawyers();

-- 2. ADD MISSING COLUMNS TO public.lawyers
ALTER TABLE public.lawyers 
ADD COLUMN IF NOT EXISTS consultation_formats JSONB DEFAULT '{"inPerson": false, "online": false, "phone": false, "video": false}'::jsonb,
ADD COLUMN IF NOT EXISTS contact_email TEXT,
ADD COLUMN IF NOT EXISTS contact_phone TEXT;

-- 3. MIGRATE DATA FROM lawyer_profiles TO lawyers
-- If the lawyer exists in lawyer_profiles, update their record in lawyers
UPDATE public.lawyers l
SET 
  bio = COALESCE(l.bio, lp.bio),
  experience_years = COALESCE(NULLIF(l.experience_years, 0), lp.years_experience, 0),
  location = COALESCE(l.location, lp.primary_location),
  contact_email = lp.contact_email,
  contact_phone = lp.contact_phone,
  consultation_formats = lp.consultation_formats,
  is_verified = lp.is_verified OR l.is_verified
FROM public.lawyer_profiles lp
WHERE l.user_id = lp.id;

-- 4. ENSURE PROPER RLS POLICIES FOR public.lawyers
ALTER TABLE public.lawyers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lawyers_select" ON public.lawyers;
CREATE POLICY "lawyers_select" 
  ON public.lawyers FOR SELECT 
  USING (true);

DROP POLICY IF EXISTS "lawyers_update_own" ON public.lawyers;
CREATE POLICY "lawyers_update_own" 
  ON public.lawyers FOR UPDATE 
  USING (user_id = auth.uid()) 
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "lawyers_insert_own" ON public.lawyers;
CREATE POLICY "lawyers_insert_own" 
  ON public.lawyers FOR INSERT 
  WITH CHECK (user_id = auth.uid());

-- 5. ENSURE PROPER RLS POLICIES FOR public.users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select" ON public.users;
CREATE POLICY "users_select" 
  ON public.users FOR SELECT 
  USING (true);

DROP POLICY IF EXISTS "users_update_own" ON public.users;
CREATE POLICY "users_update_own" 
  ON public.users FOR UPDATE 
  USING (id = auth.uid()) 
  WITH CHECK (id = auth.uid());

-- 6. DROP REDUNDANT TABLES (CASCADE drops depending views/triggers if any)
DROP TABLE IF EXISTS public.lawyer_profiles CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.lawyer_credentials CASCADE;

-- Note: We keep public.credentials and public.verifications (or public.lawyer_verifications) as they are the main tables.
