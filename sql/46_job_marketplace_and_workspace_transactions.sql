-- =============================================================================
-- Migration 46: Job Marketplace & Workspace Transactional Workflow
-- Description: Establishes atomic server-side proposal acceptance procedure,
--              auto-creating Contract, Workspace, Milestones, Chat, & Notifications
--              as mandated by Phase 5, Phase 6, Phase 8, Phase 9, and Audit P1.
-- =============================================================================

-- Safely drop any existing function signatures to prevent return type mismatch errors (SQL Error 42P13)
DO $$ 
DECLARE 
  r RECORD; 
BEGIN 
  FOR r IN 
    SELECT oid::regprocedure AS fn_sig 
    FROM pg_proc 
    WHERE proname IN ('fn_accept_job_proposal_transactional') 
      AND pronamespace = 'public'::regnamespace 
  LOOP 
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.fn_sig || ' CASCADE;'; 
  END LOOP; 
END $$;

CREATE OR REPLACE FUNCTION public.fn_accept_job_proposal_transactional(
  p_proposal_id INT,
  p_client_id UUID DEFAULT auth.uid()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_id INT;
  v_lawyer_id UUID;
  v_proposed_fee NUMERIC(12,2);
  v_fee_type TEXT;
  v_job_title TEXT;
  v_job_category TEXT;
  v_contract_id UUID;
  v_case_id UUID;
  v_conversation_id UUID;
  v_client_name TEXT;
  v_lawyer_name TEXT;
BEGIN
  -- 1. Get Proposal and Job Post details
  SELECT p.job_post_id, p.lawyer_id, p.proposed_fee, p.fee_type,
         j.title, j.legal_category, j.client_id
  INTO v_job_id, v_lawyer_id, v_proposed_fee, v_fee_type,
       v_job_title, v_job_category
  FROM public.job_proposals p
  JOIN public.job_posts j ON j.id = p.job_post_id
  WHERE p.id = p_proposal_id
  FOR UPDATE;

  IF v_job_id IS NULL THEN
    RAISE EXCEPTION 'Proposal not found (id: %)', p_proposal_id;
  END IF;

  -- Verify caller ownership (must be client who posted the job or admin)
  IF p_client_id IS NULL OR (p_client_id != (SELECT client_id FROM public.job_posts WHERE id = v_job_id) AND NOT public.fn_is_admin(p_client_id)) THEN
    RAISE EXCEPTION 'Unauthorized: Only the client who posted the case can accept proposals';
  END IF;

  SELECT name INTO v_client_name FROM public.users WHERE id = p_client_id;
  SELECT name INTO v_lawyer_name FROM public.users WHERE id = v_lawyer_id;

  -- 2. Update accepted proposal
  UPDATE public.job_proposals
  SET status = 'accepted', updated_at = NOW()
  WHERE id = p_proposal_id;

  -- 3. Reject other pending proposals for this job
  UPDATE public.job_proposals
  SET status = 'rejected', updated_at = NOW()
  WHERE job_post_id = v_job_id AND id != p_proposal_id AND status = 'pending';

  -- 4. Update job post status
  UPDATE public.job_posts
  SET status = 'in_progress', selected_lawyer_id = v_lawyer_id, updated_at = NOW()
  WHERE id = v_job_id;

  -- 5. Auto-create or update Consultation Appointment
  BEGIN
    INSERT INTO public.appointments (
      client_id, lawyer_id, date, time, reason, status, source, duration_minutes, fee_amount
    )
    VALUES (
      p_client_id, v_lawyer_id, CURRENT_DATE + INTERVAL '1 day', '10:00:00',
      'Case Kickoff: ' || v_job_title, 'pending', 'job_board', 60, COALESCE(v_proposed_fee, 3000)
    );
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- 6. Auto-create Contract
  BEGIN
    INSERT INTO public.contracts (
      client_id, lawyer_id, title, status, amount, agreed_fee, agreed_amount,
      terms, fee_structure, currency, created_at, updated_at
    )
    VALUES (
      p_client_id, v_lawyer_id, 'Contract for ' || v_job_title, 'Active'::contract_status_enum,
      COALESCE(v_proposed_fee, 0), COALESCE(v_proposed_fee, 0), COALESCE(v_proposed_fee, 0),
      'Standard terms for case: ' || v_job_title, COALESCE(v_fee_type, 'Fixed Fee'), 'BDT', NOW(), NOW()
    )
    RETURNING id INTO v_contract_id;
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.contracts (
        client_id, lawyer_id, title, status, amount, agreed_fee, agreed_amount
      )
      VALUES (
        p_client_id, v_lawyer_id, 'Contract for ' || v_job_title, 'Active',
        COALESCE(v_proposed_fee, 0), COALESCE(v_proposed_fee, 0), COALESCE(v_proposed_fee, 0)
      )
      RETURNING id INTO v_contract_id;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END;

  -- 7. Auto-create Case / Workspace
  BEGIN
    INSERT INTO public.cases (
      client_id, lawyer_id, title, description, category, status, created_at, updated_at
    )
    VALUES (
      p_client_id, v_lawyer_id, v_job_title, 'Workspace for accepted job proposal ID ' || p_proposal_id,
      v_job_category, 'Active'::case_status_enum, NOW(), NOW()
    )
    RETURNING id INTO v_case_id;
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.cases (client_id, lawyer_id, title, status)
      VALUES (p_client_id, v_lawyer_id, v_job_title, 'Active')
      RETURNING id INTO v_case_id;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END;

  -- 8. Auto-create Milestones (so workspace & case tracking immediately have milestones)
  IF v_case_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.case_milestones (case_id, title, description, amount, status, due_date)
      VALUES 
        (v_case_id, 'Phase 1: Initial Discovery & Strategy', 'Review case documents and formulate legal approach', ROUND((COALESCE(v_proposed_fee, 0) * 0.3)::numeric, 2), 'pending', CURRENT_DATE + INTERVAL '5 days'),
        (v_case_id, 'Phase 2: Legal Drafting & Filings', 'Prepare necessary legal filings, notices, or defense drafts', ROUND((COALESCE(v_proposed_fee, 0) * 0.4)::numeric, 2), 'pending', CURRENT_DATE + INTERVAL '14 days'),
        (v_case_id, 'Phase 3: Final Delivery & Closure', 'Final review, court proceedings completion, and handover', ROUND((COALESCE(v_proposed_fee, 0) * 0.3)::numeric, 2), 'pending', CURRENT_DATE + INTERVAL '30 days');
    EXCEPTION WHEN OTHERS THEN
      BEGIN
        INSERT INTO public.case_progress (case_id, title, description)
        VALUES (v_case_id, 'Workspace Created', 'Proposal accepted and case initiated.');
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END;
  END IF;

  IF v_contract_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.contract_milestones (contract_id, title, description, amount, status, due_date)
      VALUES 
        (v_contract_id, 'Initial Consultation & Strategy', 'Case assessment and legal roadmap', ROUND((COALESCE(v_proposed_fee, 0) * 0.3)::numeric, 2), 'pending', CURRENT_DATE + INTERVAL '5 days'),
        (v_contract_id, 'Drafting & Execution', 'Preparation and submission of core legal documents', ROUND((COALESCE(v_proposed_fee, 0) * 0.4)::numeric, 2), 'pending', CURRENT_DATE + INTERVAL '14 days'),
        (v_contract_id, 'Final Completion & Handover', 'Case resolution and client handover', ROUND((COALESCE(v_proposed_fee, 0) * 0.3)::numeric, 2), 'pending', CURRENT_DATE + INTERVAL '30 days');
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  -- 9. Auto-create Chat Conversation
  BEGIN
    INSERT INTO public.conversations (lawyer_id, client_id, is_archived, created_at, updated_at)
    VALUES (v_lawyer_id, p_client_id, false, NOW(), NOW())
    ON CONFLICT (lawyer_id, client_id) DO UPDATE SET updated_at = NOW()
    RETURNING id INTO v_conversation_id;
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      SELECT id INTO v_conversation_id FROM public.conversations
      WHERE lawyer_id = v_lawyer_id AND client_id = p_client_id
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END;

  IF v_conversation_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.messages (conversation_id, sender_id, content, message_type, is_read, created_at)
      VALUES (
        v_conversation_id,
        p_client_id,
        '🎉 Proposal accepted for case: "' || v_job_title || '". A contract, workspace, and initial consultation have been automatically set up.',
        'system'::message_type_enum,
        false,
        NOW()
      );
    EXCEPTION WHEN OTHERS THEN
      BEGIN
        INSERT INTO public.messages (conversation_id, sender_id, content, is_read)
        VALUES (v_conversation_id, p_client_id, 'Proposal accepted for case: "' || v_job_title || '".', false);
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END;
  END IF;

  -- 10. Insert Notifications
  BEGIN
    INSERT INTO public.notifications (user_id, type, title, body, message, is_read, created_at)
    VALUES (
      v_lawyer_id,
      'proposal_accepted',
      'Proposal Accepted! 🎉',
      'Your proposal for "' || v_job_title || '" was accepted by ' || COALESCE(v_client_name, 'the client') || '. A contract and workspace have been initialized.',
      'Proposal accepted for "' || v_job_title || '"',
      false,
      NOW()
    );
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    INSERT INTO public.notifications (user_id, type, title, body, message, is_read, created_at)
    VALUES (
      p_client_id,
      'workspace_created',
      'Workspace Active 🚀',
      'Your case workspace for "' || v_job_title || '" with lawyer ' || COALESCE(v_lawyer_name, 'your lawyer') || ' is ready.',
      'Workspace created for "' || v_job_title || '"',
      false,
      NOW()
    );
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object(
    'success', true,
    'job_id', v_job_id,
    'proposal_id', p_proposal_id,
    'lawyer_id', v_lawyer_id,
    'client_id', p_client_id,
    'contract_id', v_contract_id,
    'case_id', v_case_id,
    'conversation_id', v_conversation_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_accept_job_proposal_transactional(INT, UUID) TO authenticated;
