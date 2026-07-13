-- =============================================================================
-- Migration 47: Review & Rating System Hardening
-- Description: Allows multiple reviews based on completed contracts (1 per contract),
--              removes overly restrictive unique constraints on feedback, and
--              re-calculates ratings reliably across lawyers and lawyer_profiles tables.
--              Mandated by Phase 11 & Audit Section P2.
-- =============================================================================

-- 1. Ensure feedback table has contract_id and case_id columns
ALTER TABLE public.feedback
  ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS case_id UUID REFERENCES public.cases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS flag_reason TEXT DEFAULT NULL;

-- 2. Drop incorrect unique constraints that prevent clients from reviewing a lawyer twice across separate jobs
DO $$
DECLARE
  r RECORD;
BEGIN
  -- Drop any unique constraint on (client_id, lawyer_id) or (user_id, lawyer_id)
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.feedback'::regclass
      AND contype = 'u'
  LOOP
    EXECUTE 'ALTER TABLE public.feedback DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
  END LOOP;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 3. Create partial unique index ensuring exactly ONE review per contract (when contract_id IS NOT NULL)
DROP INDEX IF EXISTS idx_unique_contract_review;
CREATE UNIQUE INDEX idx_unique_contract_review ON public.feedback(contract_id) WHERE contract_id IS NOT NULL;

-- Safely drop any existing function signatures to prevent return type mismatch errors (SQL Error 42P13)
DO $$ 
DECLARE 
  r RECORD; 
BEGIN 
  FOR r IN 
    SELECT oid::regprocedure AS fn_sig 
    FROM pg_proc 
    WHERE proname IN ('fn_update_lawyer_rating_on_feedback', 'fn_submit_contract_review') 
      AND pronamespace = 'public'::regnamespace 
  LOOP 
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.fn_sig || ' CASCADE;'; 
  END LOOP; 
END $$;

-- 4. Robust trigger procedure to calculate total_reviews and avg_rating across all profile tables
CREATE OR REPLACE FUNCTION public.fn_update_lawyer_rating_on_feedback()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lawyer_id UUID;
  v_count INT;
  v_avg NUMERIC(3,2);
BEGIN
  v_lawyer_id := COALESCE(NEW.lawyer_id, OLD.lawyer_id);
  IF v_lawyer_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*), COALESCE(ROUND(AVG(rating)::numeric, 2), 0.00)
  INTO v_count, v_avg
  FROM public.feedback
  WHERE lawyer_id = v_lawyer_id;

  -- Update public.lawyers
  BEGIN
    UPDATE public.lawyers
    SET total_reviews = v_count,
        avg_rating = v_avg,
        updated_at = NOW()
    WHERE user_id = v_lawyer_id OR id::text = v_lawyer_id::text;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Update public.lawyer_profiles
  BEGIN
    UPDATE public.lawyer_profiles
    SET reviews_count = v_count,
        rating = v_avg,
        updated_at = NOW()
    WHERE id = v_lawyer_id;
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      UPDATE public.lawyer_profiles
      SET rating = v_avg,
          updated_at = NOW()
      WHERE id = v_lawyer_id;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_feedback_rating_sync ON public.feedback;
CREATE TRIGGER trg_feedback_rating_sync
  AFTER INSERT OR UPDATE OF rating OR DELETE ON public.feedback
  FOR EACH ROW EXECUTE FUNCTION public.fn_update_lawyer_rating_on_feedback();

-- 5. Helper RPC to submit contract-tied review cleanly
CREATE OR REPLACE FUNCTION public.fn_submit_contract_review(
  p_contract_id UUID,
  p_rating INT,
  p_comment TEXT,
  p_client_id UUID DEFAULT auth.uid()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lawyer_id UUID;
  v_client_name TEXT;
  v_existing_id UUID;
  v_review_id UUID;
BEGIN
  IF p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Rating must be between 1 and 5';
  END IF;

  -- Verify contract and get lawyer_id
  SELECT lawyer_id INTO v_lawyer_id
  FROM public.contracts
  WHERE id = p_contract_id AND client_id = p_client_id;

  IF v_lawyer_id IS NULL THEN
    RAISE EXCEPTION 'Contract not found or unauthorized';
  END IF;

  -- Check if already reviewed
  SELECT id INTO v_existing_id
  FROM public.feedback
  WHERE contract_id = p_contract_id
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'A review has already been submitted for this contract.';
  END IF;

  SELECT name INTO v_client_name FROM public.users WHERE id = p_client_id;

  INSERT INTO public.feedback (
    lawyer_id, client_id, contract_id, rating, comment, client_name, created_at, updated_at
  )
  VALUES (
    v_lawyer_id, p_client_id, p_contract_id, p_rating, p_comment, COALESCE(v_client_name, 'Client'), NOW(), NOW()
  )
  RETURNING id INTO v_review_id;

  RETURN jsonb_build_object('success', true, 'review_id', v_review_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_submit_contract_review(UUID, INT, TEXT, UUID) TO authenticated;
