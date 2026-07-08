-- =================================================================================
-- Migration 41: Final Production Schema Fixes
-- Description: Resolves the missing 'role' column on public.users, missing 'description'
--              on public.departments, and robustly recreates appointments policies.
-- =================================================================================

-- 1. Fix missing 'role' column on public.users (which crashes AuthContext)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role VARCHAR(20);

-- Sync existing user_type data to role to prevent nulls
UPDATE public.users SET role = user_type WHERE role IS NULL;

-- 2. Fix missing 'description' column on public.departments
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS description TEXT;

-- 3. Robustly handle "policy already exists" errors for appointments
DO $$
BEGIN
    -- Select Policies
    BEGIN
        DROP POLICY IF EXISTS "Users can view own appointments" ON public.appointments;
        CREATE POLICY "Users can view own appointments" 
        ON public.appointments FOR SELECT 
        USING (auth.uid() = client_id OR auth.uid() = lawyer_id);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    -- Insert Policies
    BEGIN
        DROP POLICY IF EXISTS "Users can insert own appointments" ON public.appointments;
        CREATE POLICY "Users can insert own appointments" 
        ON public.appointments FOR INSERT 
        WITH CHECK (auth.uid() = client_id OR auth.uid() = lawyer_id);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    -- Update Policies
    BEGIN
        DROP POLICY IF EXISTS "Users can update own appointments" ON public.appointments;
        CREATE POLICY "Users can update own appointments" 
        ON public.appointments FOR UPDATE 
        USING (auth.uid() = client_id OR auth.uid() = lawyer_id);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
END $$;

-- 4. Terminate any hanging/stuck queries that might be causing "Saving..." to hang
-- This safely cancels your own queries running longer than 5 minutes to free up table locks
-- without triggering SUPERUSER permission errors.
SELECT pg_cancel_backend(pid)
FROM pg_stat_activity
WHERE state = 'active' 
  AND pid <> pg_backend_pid()
  AND usename = current_user
  AND (now() - query_start) > interval '5 minutes';
