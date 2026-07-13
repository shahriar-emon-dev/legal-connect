-- =============================================================================
-- Migration 45: Financial & Verification RPCs and Role Check Procedures
-- Description: Establishes transactional server-side verification updates and
--              standardized RBAC helpers as mandated by Phase 1, 2, 3, 12, 15.
-- =============================================================================

-- Safely drop any existing function signatures to prevent return type mismatch errors (SQL Error 42P13)
DO $$ 
DECLARE 
  r RECORD; 
BEGIN 
  FOR r IN 
    SELECT oid::regprocedure AS fn_sig 
    FROM pg_proc 
    WHERE proname IN ('fn_verify_lawyer', 'fn_is_admin', 'fn_is_verified_lawyer') 
      AND pronamespace = 'public'::regnamespace 
  LOOP 
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.fn_sig || ' CASCADE;'; 
  END LOOP; 
END $$;

-- 1. Helper Function: fn_is_admin
CREATE OR REPLACE FUNCTION public.fn_is_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
BEGIN
  IF p_user_id IS NULL THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.users 
    WHERE (id = p_user_id OR auth_id = p_user_id) 
      AND (user_type::text = 'admin' OR role::text = 'admin')
  ) OR (auth.jwt() ->> 'role' = 'admin') 
    OR (auth.jwt() ->> 'user_role' = 'admin');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- 2. Helper Function: fn_is_verified_lawyer
CREATE OR REPLACE FUNCTION public.fn_is_verified_lawyer(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
BEGIN
  IF p_user_id IS NULL THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.lawyers l ON (l.user_id = u.id OR l.id::text = u.id::text)
    WHERE (u.id = p_user_id OR u.auth_id = p_user_id)
      AND u.user_type::text = 'lawyer'
      AND (u.is_verified = true OR l.is_verified = true OR l.verification_status::text = 'verified')
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- 3A. Transactional Lawyer Verification RPC Procedure (Overload for LawyerVerifications.js: INT + UUID)
CREATE OR REPLACE FUNCTION public.fn_verify_lawyer(
  p_lawyer_id INT,
  p_user_id UUID,
  p_status TEXT,
  p_rejection_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_verified BOOLEAN := (p_status = 'verified' OR p_status = 'Approved');
  v_target_user_id UUID := p_user_id;
  v_admin_id UUID := auth.uid();
BEGIN
  IF NOT public.fn_is_admin(v_admin_id) AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only administrators can update lawyer verification status';
  END IF;

  IF v_target_user_id IS NULL AND p_lawyer_id IS NOT NULL THEN
    SELECT user_id INTO v_target_user_id FROM public.lawyers WHERE id = p_lawyer_id LIMIT 1;
  END IF;

  -- 1. Update public.users
  IF v_target_user_id IS NOT NULL THEN
    UPDATE public.users
    SET is_verified = v_is_verified,
        user_type = CASE WHEN v_is_verified THEN 'lawyer' ELSE user_type END,
        updated_at = NOW()
    WHERE id = v_target_user_id OR auth_id = v_target_user_id;
  END IF;

  -- 2. Update public.lawyers
  BEGIN
    UPDATE public.lawyers
    SET is_verified = v_is_verified,
        verification_status = CASE 
          WHEN p_status IN ('pending', 'under_review', 'action_required', 'verified', 'rejected') THEN p_status::verification_status_enum
          WHEN p_status = 'Approved' THEN 'verified'::verification_status_enum
          WHEN p_status = 'Rejected' THEN 'rejected'::verification_status_enum
          ELSE 'pending'::verification_status_enum
        END,
        updated_at = NOW()
    WHERE (p_lawyer_id IS NOT NULL AND id = p_lawyer_id) OR user_id = v_target_user_id OR id::text = v_target_user_id::text;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.lawyers
    SET is_verified = v_is_verified,
        updated_at = NOW()
    WHERE (p_lawyer_id IS NOT NULL AND id = p_lawyer_id) OR user_id = v_target_user_id OR id::text = v_target_user_id::text;
  END;

  -- 3. Update public.lawyer_profiles
  IF v_target_user_id IS NOT NULL THEN
    BEGIN
      UPDATE public.lawyer_profiles
      SET is_verified = v_is_verified,
          verification_status = p_status,
          status = p_status,
          updated_at = NOW()
      WHERE id = v_target_user_id;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  -- 4. Update verifications / lawyer_verifications
  BEGIN
    UPDATE public.verifications
    SET status = p_status,
        notes = COALESCE(p_rejection_reason, notes),
        reviewed_at = NOW(),
        reviewed_by = v_admin_id
    WHERE user_id = v_target_user_id OR lawyer_id = v_target_user_id OR (p_lawyer_id IS NOT NULL AND lawyer_id::text = p_lawyer_id::text);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    UPDATE public.lawyer_verifications
    SET status = p_status,
        rejection_reason = p_rejection_reason,
        reviewed_at = NOW(),
        reviewed_by = v_admin_id
    WHERE user_id = v_target_user_id OR lawyer_id = v_target_user_id OR (p_lawyer_id IS NOT NULL AND lawyer_id::text = p_lawyer_id::text);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- 5. Insert Notification
  IF v_target_user_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.notifications (user_id, type, title, message, is_read, created_at)
      VALUES (
        v_target_user_id,
        CASE WHEN v_is_verified THEN 'verification_approved' ELSE 'verification_rejected' END,
        CASE WHEN v_is_verified THEN 'Verification Approved!' ELSE 'Verification Update' END,
        CASE WHEN v_is_verified 
          THEN 'Congratulations! Your profile has been verified. You can now submit proposals and accept clients.'
          ELSE COALESCE(p_rejection_reason, 'Your verification request was updated to: ' || p_status)
        END,
        false,
        NOW()
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  RETURN true;
END;
$$;

-- 3B. Transactional Lawyer Verification RPC Procedure (Overload: UUID + TEXT + UUID + TEXT)
CREATE OR REPLACE FUNCTION public.fn_verify_lawyer(
  p_lawyer_id UUID,
  p_status TEXT,
  p_admin_id UUID DEFAULT auth.uid(),
  p_rejection_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_verified BOOLEAN := (p_status = 'verified' OR p_status = 'Approved');
  v_target_user_id UUID;
BEGIN
  IF NOT public.fn_is_admin(p_admin_id) AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only administrators can update lawyer verification status';
  END IF;

  SELECT id INTO v_target_user_id
  FROM public.users
  WHERE id = p_lawyer_id OR auth_id = p_lawyer_id
  LIMIT 1;

  IF v_target_user_id IS NULL THEN
    SELECT user_id INTO v_target_user_id
    FROM public.lawyers
    WHERE id::text = p_lawyer_id::text OR user_id = p_lawyer_id
    LIMIT 1;
  END IF;

  IF v_target_user_id IS NULL THEN
    v_target_user_id := p_lawyer_id;
  END IF;

  -- Delegate to the INT + UUID version passing null for INT
  RETURN public.fn_verify_lawyer(NULL::INT, v_target_user_id, p_status, p_rejection_reason);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_is_admin(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.fn_is_verified_lawyer(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.fn_verify_lawyer(INT, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_verify_lawyer(UUID, TEXT, UUID, TEXT) TO authenticated;
