import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';
import { realtimeSync } from '../../services/realtimeSync.service';
import toast from 'react-hot-toast';
import styles from './CaseTracking.module.css';
import ReviewSubmissionModal from '../../components/LawyerCaseTracking/ReviewSubmissionModal';

const STATUS_COLORS = {
  open: '#10B981',              // Emerald
  pending: '#D97706',           // Amber
  pending_acceptance: '#D97706',// Amber
  in_progress: '#2563EB',       // Blue
  active: '#2563EB',            // Blue
  confirmed: '#2563EB',         // Blue
  under_review: '#8B5CF6',      // Violet/Purple
  revision_requested: '#F59E0B',// Amber/Orange
  completed: '#7C3AED',         // Purple
  closed: '#6B7280',            // Gray
  cancelled: '#EF4444',         // Red
  terminated: '#EF4444',        // Red
  archived: '#4B5563',          // Gray
};

const STATUS_LABELS = {
  open: 'Open for Proposals',
  pending: 'Pending Selection',
  pending_acceptance: 'Pending Acceptance',
  in_progress: 'In Progress',
  active: 'In Progress',
  confirmed: 'Consultation Active',
  under_review: 'Under Client Review',
  revision_requested: 'Revision Requested',
  completed: 'Completed',
  closed: 'Closed',
  cancelled: 'Cancelled',
  terminated: 'Terminated',
  archived: 'Archived',
};

const URGENCY_STYLES = {
  high: { bg: '#FEF2F2', color: '#DC2626', border: '#FECACA', label: 'High Urgency' },
  medium: { bg: '#EFF6FF', color: '#2563EB', border: '#BFDBFE', label: 'Normal Urgency' },
  low: { bg: '#ECFDF5', color: '#059669', border: '#A7F3D0', label: 'Low Urgency' },
  default: { bg: '#F3F4F6', color: '#4B5563', border: '#E5E7EB', label: 'Standard' }
};

const CaseTracking = () => {
  const { user } = useAuth();
  const { caseId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Data states
  const [items, setItems] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorState, setErrorState] = useState(false);

  // Filter & Search & Modal states
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'ALL');
  const [sortOrder, setSortOrder] = useState(searchParams.get('sort') || 'UPDATED_DESC');
  const [selectedCaseModal, setSelectedCaseModal] = useState(null);
  const [submittingAction, setSubmittingAction] = useState(false);
  const [revisionNoteInput, setRevisionNoteInput] = useState('');
  const [showRevisionForm, setShowRevisionForm] = useState(false);
  const [reviewingCase, setReviewingCase] = useState(null);

  // Sync filter states with URL parameters
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (searchQuery.trim()) params.set('q', searchQuery.trim());
    else params.delete('q');
    if (statusFilter && statusFilter !== 'ALL') params.set('status', statusFilter);
    else params.delete('status');
    if (sortOrder && sortOrder !== 'UPDATED_DESC') params.set('sort', sortOrder);
    else params.delete('sort');
    if (params.toString() !== searchParams.toString()) {
      setSearchParams(params, { replace: true });
    }
  }, [searchQuery, statusFilter, sortOrder, setSearchParams, searchParams]);

  const fetchDashboardData = useCallback(async (isManualRefresh = false) => {
    const clientId = user?.id || user?.auth_id;
    if (!clientId) {
      setLoading(false);
      return;
    }

    try {
      if (isManualRefresh) setRefreshing(true);
      else setLoading(true);
      setErrorState(false);

      const userIds = [...new Set([clientId, user?.auth_id, user?.id].filter(Boolean))];

      // 1. Fetch Job Posts created by this client
      let rawJobPosts = [];
      try {
        const { data: jobPostsData } = await supabase
          .from('job_posts')
          .select('*')
          .or(userIds.map(id => `client_id.eq.${id}`).join(','))
          .order('updated_at', { ascending: false });
        if (jobPostsData) rawJobPosts = jobPostsData;
      } catch (e) {
        console.error('Job posts fetch error:', e);
      }

      // 2. Fetch Proposals for these job posts to get counts and lawyer info
      const postIds = rawJobPosts.map(p => p.id);
      let pMap = {};
      let allLawyerIds = new Set();

      rawJobPosts.forEach(p => {
        if (p.selected_lawyer_id) allLawyerIds.add(p.selected_lawyer_id);
      });

      if (postIds.length > 0) {
        try {
          const { data: propsData } = await supabase
            .from('job_proposals')
            .select('*')
            .in('job_post_id', postIds);

          if (propsData) {
            propsData.forEach(prop => {
              if (!pMap[prop.job_post_id]) pMap[prop.job_post_id] = [];
              pMap[prop.job_post_id].push(prop);
              if (prop.lawyer_id) allLawyerIds.add(prop.lawyer_id);
            });
          }
        } catch (e) {
          console.error('Proposals fetch error:', e);
        }
      }

      // 3. Fetch formal cases where client is participant
      let casesList = [];
      try {
        const { data: casesData } = await supabase
          .from('cases')
          .select('*, case_progress(*)')
          .or(userIds.map(id => `client_id.eq.${id}`).join(','))
          .order('updated_at', { ascending: false });
        if (casesData) {
          casesList = casesData;
          casesList.forEach(c => { if (c.lawyer_id) allLawyerIds.add(c.lawyer_id); });
        }
      } catch (e) {
        console.error('Cases fetch error:', e);
      }

      // Fetch milestones if cases exist
      if (casesList.length > 0) {
        try {
          const cIds = casesList.map(c => c.id);
          const { data: msData } = await supabase.from('case_milestones').select('*').in('case_id', cIds);
          if (msData) {
            casesList = casesList.map(c => ({
              ...c,
              milestones: msData.filter(m => m.case_id === c.id)
            }));
          }
        } catch (e) {
          console.error('Milestones fetch error:', e);
        }
      }

      // 4. Fetch Contracts
      let contractsList = [];
      let contractTimelineMap = {};
      let deliverablesMap = {};
      try {
        const { data: cData } = await supabase
          .from('contracts')
          .select('*')
          .or(userIds.map(id => `client_id.eq.${id}`).join(','))
          .order('created_at', { ascending: false });
        if (cData) {
          contractsList = cData;
          setContracts(cData);
          cData.forEach(cnt => { if (cnt.lawyer_id) allLawyerIds.add(cnt.lawyer_id); });
          
          const cntIds = cData.map(c => c.id);
          if (cntIds.length > 0) {
            const { data: ctData } = await supabase.from('contract_timeline').select('*').in('contract_id', cntIds).order('created_at', { ascending: true });
            if (ctData) {
              ctData.forEach(entry => {
                if (!contractTimelineMap[entry.contract_id]) contractTimelineMap[entry.contract_id] = [];
                contractTimelineMap[entry.contract_id].push(entry);
              });
            }
            const { data: delivData } = await supabase.from('deliverables').select('*').in('contract_id', cntIds).order('submitted_at', { ascending: false });
            if (delivData) {
              delivData.forEach(entry => {
                if (!deliverablesMap[entry.contract_id]) deliverablesMap[entry.contract_id] = [];
                deliverablesMap[entry.contract_id].push(entry);
              });
            }
          }
        }
      } catch (e) {
        console.error('Contracts fetch error:', e);
      }

      // 5. Fetch Appointments / Consultations
      let aptData = [];
      try {
        const { data } = await supabase
          .from('appointments')
          .select('*')
          .or(userIds.map(id => `client_id.eq.${id}`).join(','))
          .in('status', ['confirmed', 'active', 'Upcoming', 'In Progress', 'pending_negotiation', 'completed']);
        if (data) {
          aptData = data;
          aptData.forEach(apt => { if (apt.lawyer_id) allLawyerIds.add(apt.lawyer_id); });
        }
      } catch (e) {
        console.error('Appointments fetch error:', e);
      }

      // 6. Safely fetch all lawyer/user profiles right now
      let lawyerInfoMap = {};
      const lawyerIdsList = Array.from(allLawyerIds).filter(Boolean);
      if (lawyerIdsList.length > 0) {
        try {
          const { data: uData } = await supabase
            .from('users')
            .select('id, name, profile_picture_url')
            .in('id', lawyerIdsList);
          if (uData) {
            uData.forEach(u => { lawyerInfoMap[u.id] = u; });
          }
        } catch (e) {
          console.warn('Could not fetch lawyer user profiles:', e);
        }
      }

      // 7. Merge all matters into a unified dashboard map
      const mergedMap = new Map();

      // Add Job Posts first as the root items
      rawJobPosts.forEach(post => {
        const postProposals = pMap[post.id] || [];
        const acceptedProp = postProposals.find(p => p.status === 'accepted');
        const assignedLawyer = post.selected_lawyer_id 
          ? (lawyerInfoMap[post.selected_lawyer_id] || { id: post.selected_lawyer_id, name: 'Assigned Advocate' })
          : (acceptedProp?.lawyer || null);

        let normalizedStatus = post.status?.toLowerCase() || 'open';
        if (normalizedStatus === 'open' && postProposals.length > 0) normalizedStatus = 'pending_acceptance';
        if (acceptedProp || post.selected_lawyer_id) normalizedStatus = 'in_progress';

        mergedMap.set(String(post.id), {
          id: post.id,
          raw_type: 'job_post',
          title: post.title || 'Legal Representation Matter',
          practice_area: post.legal_category || post.category || 'General Legal Matter',
          description: post.description || 'No description provided.',
          status: normalizedStatus,
          urgency: post.urgency || 'medium',
          budget: post.budget_type === 'negotiable' ? 'Negotiable' : (post.budget_max ? `BDT ${Number(post.budget_max).toLocaleString('en-IN')}` : `BDT ${Number(post.budget_min || 0).toLocaleString('en-IN')}`),
          created_at: post.created_at || new Date().toISOString(),
          updated_at: post.updated_at || post.created_at || new Date().toISOString(),
          proposal_count: postProposals.length,
          lawyer: assignedLawyer,
          lawyer_id: post.selected_lawyer_id || acceptedProp?.lawyer_id,
          milestones: [],
          case_progress: []
        });
      });

      // Overlay/Add Formal Cases
      casesList.forEach(c => {
        const existingId = c.job_post_id ? String(c.job_post_id) : (mergedMap.has(String(c.id)) ? String(c.id) : null);
        if (existingId && mergedMap.has(existingId)) {
          const existing = mergedMap.get(existingId);
          existing.case_id = c.id;
          existing.status = c.status?.toLowerCase() === 'active' ? 'in_progress' : (c.status || existing.status);
          existing.lawyer = c.lawyer || existing.lawyer;
          existing.lawyer_id = c.lawyer_id || existing.lawyer_id;
          existing.milestones = c.milestones || [];
          existing.case_progress = c.case_progress || [];
          if (c.updated_at && new Date(c.updated_at) > new Date(existing.updated_at)) {
            existing.updated_at = c.updated_at;
          }
        } else {
          mergedMap.set(String(c.id), {
            id: c.id,
            case_id: c.id,
            raw_type: 'case',
            title: c.title || 'Legal Case Representation',
            practice_area: c.case_type || 'Full Representation',
            description: c.description || 'Active legal case matter.',
            status: c.status?.toLowerCase() === 'active' ? 'in_progress' : (c.status || 'in_progress'),
            urgency: 'medium',
            budget: c.agreed_fee ? `BDT ${Number(c.agreed_fee).toLocaleString('en-IN')}` : 'Contract Fee',
            created_at: c.created_at || new Date().toISOString(),
            updated_at: c.updated_at || c.created_at || new Date().toISOString(),
            proposal_count: 0,
            lawyer: c.lawyer,
            lawyer_id: c.lawyer_id,
            milestones: c.milestones || [],
            case_progress: c.case_progress || []
          });
        }
      });

      // Overlay/Add Contracts
      if (contractsList.length > 0) {
        contractsList.forEach(cnt => {
          const targetKey = cnt.case_id ? String(cnt.case_id) : (cnt.job_post_id ? String(cnt.job_post_id) : null);
          const cTimeline = contractTimelineMap[cnt.id] || [];
          const cDeliverables = deliverablesMap[cnt.id] || [];
          let mappedStatus = cnt.status?.toLowerCase() === 'active' ? 'in_progress' : (cnt.status === 'Pending Review' ? 'pending_acceptance' : 'open');
          if (cnt.status === 'UNDER_CLIENT_REVIEW' || cnt.status === 'Under Client Review') mappedStatus = 'under_review';
          else if (cnt.status === 'REVISION_REQUESTED' || cnt.status === 'Revision Requested') mappedStatus = 'revision_requested';
          else if (cnt.status === 'COMPLETED' || cnt.status === 'Completed') mappedStatus = 'completed';

          if (targetKey && mergedMap.has(targetKey)) {
            const existing = mergedMap.get(targetKey);
            existing.contract = cnt;
            existing.agreed_fee = cnt.amount || cnt.agreed_amount || cnt.retainer_amount;
            existing.contract_timeline = cTimeline;
            existing.deliverables = cDeliverables;
            if (cnt.status === 'Active' || cnt.status === 'Signed') existing.status = 'in_progress';
            else if (cnt.status === 'Pending Review' && existing.status === 'open') existing.status = 'pending_acceptance';
            else if (['under_review', 'revision_requested', 'completed'].includes(mappedStatus)) existing.status = mappedStatus;
          } else if (!targetKey) {
            const synthId = `contract_${cnt.id}`;
            mergedMap.set(synthId, {
              id: synthId,
              raw_type: 'contract',
              title: cnt.title || 'Legal Contract Matter',
              practice_area: cnt.fee_structure || 'Contract Representation',
              description: cnt.terms || 'Legal agreement under review.',
              status: mappedStatus,
              urgency: 'medium',
              budget: `BDT ${Number(cnt.amount || cnt.agreed_amount || 0).toLocaleString('en-IN')}`,
              created_at: cnt.created_at || new Date().toISOString(),
              updated_at: cnt.updated_at || cnt.created_at || new Date().toISOString(),
              proposal_count: 0,
              lawyer: cnt.lawyer,
              lawyer_id: cnt.lawyer_id,
              contract: cnt,
              contract_timeline: cTimeline,
              deliverables: cDeliverables,
              milestones: []
            });
          }
        });
      }

      // Overlay/Add Appointments
      if (aptData) {
        aptData.forEach(apt => {
          const existsByLinked = Array.from(mergedMap.values()).some(c => String(c.linked_appointment_id) === String(apt.id) || String(c.id) === String(apt.case_id));
          if (!existsByLinked) {
            const synthId = `consultation_${apt.id}`;
            mergedMap.set(synthId, {
              id: synthId,
              raw_type: 'appointment',
              linked_appointment_id: apt.id,
              title: apt.session_type ? `${apt.session_type} (${apt.reason})` : (apt.reason || 'Legal Consultation'),
              practice_area: 'Legal Consultation',
              description: apt.notes || apt.reason || 'Verified consultation booking.',
              status: apt.status === 'completed' ? 'completed' : 'in_progress',
              urgency: 'medium',
              budget: apt.agreed_fee ? `BDT ${Number(apt.agreed_fee).toLocaleString('en-IN')}` : 'Standard Fee',
              created_at: apt.created_at || new Date().toISOString(),
              updated_at: apt.updated_at || apt.created_at || new Date().toISOString(),
              proposal_count: 0,
              lawyer: apt.lawyer,
              lawyer_id: apt.lawyer_id,
              milestones: []
            });
          }
        });
      }

      const allItems = Array.from(mergedMap.values());
      setItems(allItems);

      // If highlighted caseId passed in URL, auto open modal
      if (caseId && allItems.length > 0) {
        const found = allItems.find(c => String(c.id) === String(caseId) || String(c.case_id) === String(caseId));
        if (found) setSelectedCaseModal(found);
      }

    } catch (err) {
      console.error('Case tracking sync failure:', err);
      setErrorState(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, user?.auth_id, caseId]);

  useEffect(() => {
    fetchDashboardData();

    const clientId = user?.id || user?.auth_id;
    if (!clientId) return;

    const unsubWorkflow = realtimeSync.subscribeCaseWorkflow(() => {
      fetchDashboardData();
    });

    const channel = supabase
      .channel(`client_cases_live_${clientId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cases' }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contracts' }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contract_timeline' }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliverables' }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'case_milestones' }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_proposals' }, () => fetchDashboardData())
      .subscribe();

    return () => {
      unsubWorkflow();
      supabase.removeChannel(channel);
    };
  }, [fetchDashboardData, user?.id, user?.auth_id]);

  // Live Statistics Calculation
  const stats = useMemo(() => {
    const total = items.length;
    let openCount = 0;
    let inProgressCount = 0;
    let completedCount = 0;
    let pendingAcceptanceCount = 0;
    let closedCount = 0;

    items.forEach(item => {
      const st = item.status;
      if (st === 'open') openCount++;
      else if (st === 'in_progress' || st === 'active' || st === 'confirmed') inProgressCount++;
      else if (st === 'completed') completedCount++;
      else if (st === 'pending_acceptance' || st === 'pending') pendingAcceptanceCount++;
      else if (st === 'closed' || st === 'cancelled' || st === 'terminated' || st === 'archived') closedCount++;
      else openCount++;
    });

    return { total, openCount, inProgressCount, completedCount, pendingAcceptanceCount, closedCount };
  }, [items]);

  // Filtered and Sorted Items
  const filteredAndSortedItems = useMemo(() => {
    let result = [...items];

    // Status Filter
    if (statusFilter !== 'ALL') {
      if (statusFilter === 'OPEN') result = result.filter(i => i.status === 'open');
      else if (statusFilter === 'IN_PROGRESS') result = result.filter(i => ['in_progress', 'active', 'confirmed'].includes(i.status));
      else if (statusFilter === 'PENDING_ACCEPTANCE') result = result.filter(i => ['pending_acceptance', 'pending'].includes(i.status));
      else if (statusFilter === 'COMPLETED') result = result.filter(i => i.status === 'completed');
      else if (statusFilter === 'CLOSED') result = result.filter(i => ['closed', 'cancelled', 'terminated', 'archived'].includes(i.status));
    }

    // Search Query
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(i => 
        (i.title && i.title.toLowerCase().includes(q)) ||
        (i.practice_area && i.practice_area.toLowerCase().includes(q)) ||
        (i.id && String(i.id).toLowerCase().includes(q)) ||
        (i.description && i.description.toLowerCase().includes(q)) ||
        (i.lawyer && (i.lawyer.name || i.lawyer.full_name || '').toLowerCase().includes(q))
      );
    }

    // Sort Order
    result.sort((a, b) => {
      if (sortOrder === 'UPDATED_DESC') return new Date(b.updated_at) - new Date(a.updated_at);
      if (sortOrder === 'NEWEST') return new Date(b.created_at) - new Date(a.created_at);
      if (sortOrder === 'OLDEST') return new Date(a.created_at) - new Date(b.created_at);
      return 0;
    });

    return result;
  }, [items, statusFilter, searchQuery, sortOrder]);

  const handleCancelCase = async (caseItem) => {
    if (!window.confirm(`Are you sure you want to cancel "${caseItem.title}"?\n\nThis will withdraw your job posting from the public job board and decline any pending proposals.`)) {
      return;
    }
    const toastId = toast.loading('Cancelling case...');
    try {
      const { error } = await supabase
        .from('job_posts')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', caseItem.id);
      if (error) throw error;
      toast.success('Case cancelled successfully.', { id: toastId });
      setItems(prev => prev.map(i => i.id === caseItem.id ? { ...i, status: 'cancelled' } : i));
    } catch (err) {
      console.error('Error cancelling case:', err);
      toast.error('Could not cancel case right now.', { id: toastId });
    }
  };

  const handleContractAction = async (contractId, action) => {
    try {
      if (action === 'accept') {
        const { error: rpcErr } = await supabase.rpc('fn_approve_contract', { p_contract_id: contractId });
        if (rpcErr) {
          console.warn('[CaseTracking] fn_approve_contract failed, falling back to direct update:', rpcErr.message);
          const { error } = await supabase
            .from('contracts')
            .update({ status: 'Active', fee_locked: true })
            .eq('id', contractId);
          if (error) throw error;
        }
        toast.success('Contract Accepted! Retainer representation initialized.');
      } else if (action === 'negotiate') {
        const { error: rpcErr } = await supabase.rpc('fn_request_contract_changes', {
          p_contract_id: contractId,
          p_note: 'Client requested terms/fee negotiation.'
        });
        if (rpcErr) {
          const { error } = await supabase
            .from('contracts')
            .update({ status: 'Negotiation Requested' })
            .eq('id', contractId);
          if (error) throw error;
        }
        toast.success('Negotiation requested! Lawyer notified.');
      } else if (action === 'decline') {
        const { error: rpcErr } = await supabase.rpc('fn_terminate_contract', {
          p_contract_id: contractId,
          p_reason: 'Client declined representation contract.'
        });
        if (rpcErr) {
          const { error } = await supabase
            .from('contracts')
            .update({ status: 'Terminated' })
            .eq('id', contractId);
          if (error) throw error;
        }
        toast.success('Contract declined / terminated.');
      }

      const newStatus = action === 'accept' ? 'Active' : action === 'decline' ? 'Terminated' : 'Negotiation Requested';
      setContracts(prev => prev.map(c => c.id === contractId ? { ...c, status: newStatus } : c));
      realtimeSync.broadcastCaseChange({ contractId, action: `CONTRACT_${action.toUpperCase()}` });
      fetchDashboardData(true);
    } catch (err) {
      console.error('[CaseTracking] handleContractAction error:', err);
      toast.error('Failed to update contract status');
    }
  };

  const handleClientAcceptDelivery = async (contractId, caseItem) => {
    const targetId = contractId || caseItem?.contract?.id;
    if (!targetId) {
      toast.error('No active contract found for this case.');
      return;
    }
    setSubmittingAction(true);
    try {
      const { error } = await supabase.rpc('fn_client_approve_delivery', { p_contract_id: targetId });
      if (error) throw error;
      toast.success('Work approved! Case completed and payment released.');
      if (selectedCaseModal && (selectedCaseModal.contract?.id === targetId || selectedCaseModal.id === caseItem?.id)) {
        setSelectedCaseModal(prev => prev ? ({ ...prev, status: 'completed', contract: { ...prev.contract, status: 'COMPLETED' } }) : null);
      }
      fetchDashboardData();
      realtimeSync.broadcastCaseChange({ action: 'DELIVERY_ACCEPTED', contractId: targetId, caseId: caseItem?.id });
    } catch (err) {
      toast.error(`Approval failed: ${err.message}`);
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleClientRequestRevision = async (contractId, caseItem) => {
    const targetId = contractId || caseItem?.contract?.id;
    if (!targetId) {
      toast.error('No active contract found for this case.');
      return;
    }
    if (!revisionNoteInput.trim()) {
      toast.error('Please enter the revision instructions for your lawyer.');
      return;
    }
    setSubmittingAction(true);
    try {
      const { error } = await supabase.rpc('fn_client_request_revision', {
        p_contract_id: targetId,
        p_note: revisionNoteInput.trim()
      });
      if (error) throw error;
      toast.success('Revision requested! Lawyer has been notified.');
      setRevisionNoteInput('');
      setShowRevisionForm(false);
      if (selectedCaseModal && (selectedCaseModal.contract?.id === targetId || selectedCaseModal.id === caseItem?.id)) {
        setSelectedCaseModal(prev => prev ? ({ ...prev, status: 'revision_requested', contract: { ...prev.contract, status: 'REVISION_REQUESTED' } }) : null);
      }
      fetchDashboardData();
      realtimeSync.broadcastCaseChange({ action: 'REVISION_REQUESTED', contractId: targetId, caseId: caseItem?.id });
    } catch (err) {
      toast.error(`Request failed: ${err.message}`);
    } finally {
      setSubmittingAction(false);
    }
  };

  // --- Render Loading Skeleton State ---
  if (loading) {
    return (
      <div className={styles.caseTracking}>
        <div className={styles.headerContainer}>
          <div className={styles.headerText}>
            <h1>Case & Contract Tracking</h1>
            <p>Monitor the progress of your legal representations, track milestones, and manage contracts</p>
          </div>
        </div>
        {/* Statistics Cards Skeleton */}
        <div className={styles.statsGrid}>
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className={`${styles.statCard} ${styles.skeletonBox}`} style={{ height: '96px', border: 'none' }} />
          ))}
        </div>
        {/* Filter Toolbar Skeleton */}
        <div className={`${styles.filterToolbar} ${styles.skeletonBox}`} style={{ height: '60px', border: 'none' }} />
        {/* Case List Skeleton */}
        <div className={styles.casesGrid}>
          {[1, 2, 3].map(i => (
            <div key={i} className={`${styles.caseCard} ${styles.skeletonBox}`} style={{ height: '220px', border: 'none' }} />
          ))}
        </div>
      </div>
    );
  }

  // --- Render Error State ---
  if (errorState) {
    return (
      <div className={styles.caseTracking}>
        <div className={styles.headerContainer}>
          <div className={styles.headerText}>
            <h1>Case & Contract Tracking</h1>
            <p>Monitor the progress of your legal representations and review pending contracts</p>
          </div>
        </div>
        <div className={styles.errorStateBanner}>
          <h3>Unable to load your cases</h3>
          <p>We encountered a temporary network or data issue while fetching your legal matters from the secure server. Please try refreshing.</p>
          <button onClick={() => fetchDashboardData(true)} className={styles.btnPrimary} style={{ marginTop: '8px' }}>
            🔄 Retry Sync
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.caseTracking}>
      {/* --- Section 1: Dashboard Header --- */}
      <div className={styles.headerContainer}>
        <div className={styles.headerText}>
          <h1>Case & Contract Tracking</h1>
          <p>Monitor the progress of your legal representations and review pending contracts</p>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.activeBadge}>
            <span className={styles.activeBadgeDot} />
            <span>{stats.inProgressCount + stats.openCount} Active Matters</span>
          </div>
          <button 
            onClick={() => fetchDashboardData(true)} 
            disabled={refreshing} 
            className={styles.refreshButton}
            title="Sync latest case updates from database"
          >
            {refreshing ? '🔄 Syncing...' : '🔄 Refresh Data'}
          </button>
          <Link to="/client/portal/post-case" className={styles.postNewButton}>
            + Post Legal Case
          </Link>
        </div>
      </div>

      {/* --- Section 2: Live Statistics Cards (Real Data) --- */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <span className={styles.statTitle}>Total Cases</span>
            <span className={styles.statIcon} style={{ background: '#EFF6FF', color: '#2563EB' }}>📁</span>
          </div>
          <span className={styles.statValue}>{stats.total}</span>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <span className={styles.statTitle}>Open Cases</span>
            <span className={styles.statIcon} style={{ background: '#ECFDF5', color: '#10B981' }}>🟢</span>
          </div>
          <span className={styles.statValue}>{stats.openCount}</span>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <span className={styles.statTitle}>In Progress</span>
            <span className={styles.statIcon} style={{ background: '#EFF6FF', color: '#2563EB' }}>⚡</span>
          </div>
          <span className={styles.statValue}>{stats.inProgressCount}</span>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <span className={styles.statTitle}>Pending Acceptance</span>
            <span className={styles.statIcon} style={{ background: '#FFFBEB', color: '#D97706' }}>💬</span>
          </div>
          <span className={styles.statValue}>{stats.pendingAcceptanceCount}</span>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <span className={styles.statTitle}>Completed</span>
            <span className={styles.statIcon} style={{ background: '#F5F3FF', color: '#7C3AED' }}>🏆</span>
          </div>
          <span className={styles.statValue}>{stats.completedCount}</span>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <span className={styles.statTitle}>Closed</span>
            <span className={styles.statIcon} style={{ background: '#F3F4F6', color: '#6B7280' }}>🔒</span>
          </div>
          <span className={styles.statValue}>{stats.closedCount}</span>
        </div>
      </div>

      {/* --- Action Required: Pending Legal Contracts Banner --- */}
      {contracts.filter(c => c.status === 'Pending Review').length > 0 && (
        <div className={styles.actionBanner}>
          <div className={styles.actionBannerHeader}>
            <h2>⚡ Action Required: Legal Contracts Pending Review</h2>
            <span className={styles.pendingReviewBadge}>Signature / Retainer Due</span>
          </div>
          <div style={{ display: 'grid', gap: '14px' }}>
            {contracts.filter(c => c.status === 'Pending Review').map(cnt => (
              <div key={cnt.id} style={{ background: '#FFFFFF', border: '1px solid #FDE68A', borderRadius: '10px', padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#0F2A5E', margin: 0 }}>{cnt.title}</h3>
                    <p style={{ fontSize: '13px', color: '#4B5563', margin: '4px 0' }}>Assigned Advocate: Adv. {cnt.lawyer?.name || cnt.lawyer?.full_name || 'Legal Council'}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button onClick={() => handleContractAction(cnt.id, 'negotiate')} className={styles.btnSecondary} style={{ fontSize: '12px' }}>Request Revision</button>
                    <button onClick={() => handleContractAction(cnt.id, 'decline')} className={styles.btnSecondary} style={{ fontSize: '12px', borderColor: '#EF4444', color: '#EF4444' }}>Decline</button>
                    <button onClick={() => handleContractAction(cnt.id, 'accept')} className={styles.btnPrimary} style={{ fontSize: '12px', background: '#0F2A5E' }}>Accept & Pay Retainer</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* --- Section 3: Filter & Search Toolbar --- */}
      <div className={styles.filterToolbar}>
        <div className={styles.searchBox}>
          <span className={styles.searchIcon}>🔍</span>
          <input
            type="text"
            placeholder="Search by case title, practice area, or case ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.searchInput}
          />
        </div>
        <div className={styles.filterControls}>
          <div className={styles.selectGroup}>
            <span className={styles.selectLabel}>Status:</span>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={styles.filterSelect}>
              <option value="ALL">All Statuses</option>
              <option value="OPEN">Open Cases</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="PENDING_ACCEPTANCE">Pending Acceptance</option>
              <option value="COMPLETED">Completed Cases</option>
              <option value="CLOSED">Closed / Cancelled</option>
            </select>
          </div>
          <div className={styles.selectGroup}>
            <span className={styles.selectLabel}>Sort:</span>
            <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className={styles.filterSelect}>
              <option value="UPDATED_DESC">Recently Updated</option>
              <option value="NEWEST">Newest First</option>
              <option value="OLDEST">Oldest First</option>
            </select>
          </div>
        </div>
      </div>

      {/* --- Section 4: Case List or Empty State --- */}
      {filteredAndSortedItems.length === 0 ? (
        <div className={styles.emptyStateContainer}>
          <div className={styles.emptyIconCircle}>📁</div>
          <h3>{searchQuery || statusFilter !== 'ALL' ? 'No cases match your filters' : "You don't have any active cases yet"}</h3>
          <p>
            {searchQuery || statusFilter !== 'ALL' 
              ? 'Try clearing your search terms or adjusting the status filter to see all your legal representations.' 
              : 'Post your first legal case today to receive competitive proposals from verified legal experts across Bangladesh.'}
          </p>
          {(searchQuery || statusFilter !== 'ALL') ? (
            <button onClick={() => { setSearchQuery(''); setStatusFilter('ALL'); }} className={styles.btnSecondary}>
              Clear All Filters
            </button>
          ) : (
            <Link to="/client/portal/post-case" className={styles.postNewButton} style={{ marginTop: '8px' }}>
              + Post Your First Legal Case
            </Link>
          )}
        </div>
      ) : (
        <div className={styles.casesGrid}>
          {filteredAndSortedItems.map(item => {
            const urgencyObj = URGENCY_STYLES[item.urgency?.toLowerCase()] || URGENCY_STYLES.default;
            const statusColor = STATUS_COLORS[item.status] || '#6B7280';
            const statusLabel = STATUS_LABELS[item.status] || item.status?.toUpperCase();

            // Progress bar calculation
            const msList = item.milestones || [];
            const approvedCount = msList.filter(m => m.status === 'approved').length;
            const totalCount = msList.length > 0 ? msList.length : (item.status === 'completed' ? 4 : item.status === 'in_progress' ? 4 : 2);
            const completedCount = msList.length > 0 ? approvedCount : (item.status === 'completed' ? 4 : item.status === 'in_progress' ? 2 : item.proposal_count > 0 ? 1 : 0);
            const progressPercent = Math.round((completedCount / totalCount) * 100);

            const latestMilestone = msList.length > 0
              ? msList.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]
              : null;

            return (
              <div key={item.id} className={styles.caseCard}>
                {/* Top Row: Practice Area, Case ID, Urgency, Status */}
                <div className={styles.cardTopRow}>
                  <div className={styles.cardBadgesLeft}>
                    <span className={styles.practiceAreaBadge}>{item.practice_area}</span>
                    <span className={styles.caseIdBadge}>#{String(item.id).slice(0, 8).toUpperCase()}</span>
                    <span 
                      className={styles.urgencyBadge} 
                      style={{ backgroundColor: urgencyObj.bg, color: urgencyObj.color, border: `1px solid ${urgencyObj.border}` }}
                    >
                      {urgencyObj.label}
                    </span>
                  </div>
                  <span className={styles.statusBadge} style={{ backgroundColor: statusColor, color: '#FFFFFF' }}>
                    {statusLabel}
                  </span>
                </div>

                {/* Case Title & Description */}
                <div className={styles.cardTitleArea}>
                  <h3>{item.title}</h3>
                  <p className={styles.cardDescription}>{item.description}</p>
                </div>

                {/* Key Metadata Grid */}
                <div className={styles.metaGrid}>
                  <div className={styles.metaItem}>
                    <span className={styles.metaLabel}>Assigned Advocate</span>
                    <span className={styles.metaValue}>
                      {item.lawyer ? (
                        <>
                          <img 
                            src={item.lawyer.profile_picture_url || item.lawyer.avatar_url || 'https://via.placeholder.com/32'} 
                            alt="" 
                            className={styles.lawyerAvatarMini} 
                          />
                          <span>Adv. {item.lawyer.name || item.lawyer.full_name || 'Legal Council'}</span>
                        </>
                      ) : (
                        <span style={{ color: '#D97706' }}>
                          {item.proposal_count > 0 ? `💬 ${item.proposal_count} Proposal${item.proposal_count > 1 ? 's' : ''} Received` : 'Awaiting Selection'}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className={styles.metaItem}>
                    <span className={styles.metaLabel}>Budget / Fee</span>
                    <span className={styles.metaValue}>{item.budget}</span>
                  </div>
                  <div className={styles.metaItem}>
                    <span className={styles.metaLabel}>Created Date</span>
                    <span className={styles.metaValue}>
                      {new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                  <div className={styles.metaItem}>
                    <span className={styles.metaLabel}>Proposals</span>
                    <span className={styles.metaValue}>{item.proposal_count || 0} Submitted</span>
                  </div>
                </div>

                {/* Progress Indicator & Bar */}
                <div className={styles.progressSection}>
                  <div className={styles.progressHeader}>
                    <span>Representation Progress ({completedCount} of {totalCount} stages completed)</span>
                    <span>{progressPercent}%</span>
                  </div>
                  <div className={styles.progressBarContainer}>
                    <div className={styles.progressBarFill} style={{ width: `${progressPercent}%` }} />
                  </div>
                  {latestMilestone ? (
                    <p className={styles.latestMilestoneText}>
                      ✓ Latest Milestone: {latestMilestone.title} ({latestMilestone.status})
                    </p>
                  ) : (
                    <p className={styles.latestMilestoneText}>
                      ⚡ Stage: {item.status === 'open' ? 'Case posted publicly; reviewing advocate bids' : item.status === 'in_progress' ? 'Advocate assigned & case preparation underway' : 'Case stages updating'}
                    </p>
                  )}
                </div>

                {/* Card Action Bar */}
                <div className={styles.cardFooter}>
                  <span className={styles.updatedTimestamp}>
                    Last updated: {new Date(item.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <div className={styles.actionButtonsGroup}>
                    <button onClick={() => setSelectedCaseModal(item)} className={styles.btnSecondary}>
                      Track Progress & Timeline
                    </button>
                    {item.proposal_count > 0 && item.raw_type === 'job_post' && (
                      <button onClick={() => navigate('/client/portal/my-posts')} className={styles.btnSecondary}>
                        View Proposals ({item.proposal_count})
                      </button>
                    )}
                    {item.lawyer && (
                      <button onClick={() => navigate('/client/portal/messages')} className={styles.btnPrimary}>
                        Open Chat
                      </button>
                    )}
                    {item.contract && (
                      <button onClick={() => setSelectedCaseModal(item)} className={styles.btnSecondary}>
                        View Contract
                      </button>
                    )}
                    {(item.contract || item.status === 'under_review' || item.status === 'revision_requested') && ['UNDER_CLIENT_REVIEW', 'Active', 'in_progress', 'REVISION_REQUESTED', 'under_review', 'revision_requested'].includes(item.contract?.status || item.status) && (
                      <>
                        <button
                          onClick={() => handleClientAcceptDelivery(item.contract?.id, item)}
                          disabled={submittingAction}
                          style={{ padding: '8px 12px', background: '#10B981', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                        >
                          ✓ Accept Delivery
                        </button>
                        <button
                          onClick={() => {
                            setSelectedCaseModal(item);
                            setShowRevisionForm(true);
                          }}
                          disabled={submittingAction}
                          style={{ padding: '8px 12px', background: '#EF4444', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                        >
                          ✎ Request Revision
                        </button>
                      </>
                    )}
                    {(item.status === 'open' || item.status === 'pending') && (
                      <button onClick={() => handleCancelCase(item)} className={styles.btnDanger}>
                        Cancel Case
                      </button>
                    )}
                    {(item.status?.toLowerCase() === 'completed' || item.contract?.status?.toLowerCase() === 'completed') && (
                      <button
                        onClick={() => setReviewingCase(item)}
                        style={{ padding: '8px 14px', background: '#F59E0B', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', boxShadow: '0 2px 6px rgba(245, 158, 11, 0.3)' }}
                      >
                        ★ Review Advocate
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* --- Section 5: Case Details & Interactive Timeline Modal --- */}
      {selectedCaseModal && (
        <div className={styles.modalOverlay} onClick={() => setSelectedCaseModal(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <span className={styles.practiceAreaBadge}>{selectedCaseModal.practice_area}</span>
                <h2 style={{ marginTop: '6px' }}>{selectedCaseModal.title}</h2>
              </div>
              <button onClick={() => setSelectedCaseModal(null)} className={styles.closeModalBtn}>✕</button>
            </div>

            <div className={styles.modalBody}>
              {/* Case Summary Overview */}
              <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#0F2A5E' }}>Case Overview & Specifications</h4>
                <p style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#334155', lineHeight: '1.6' }}>{selectedCaseModal.description}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '13px', borderTop: '1px solid #E2E8F0', paddingTop: '12px' }}>
                  <span><strong>Case ID:</strong> #{String(selectedCaseModal.id).slice(0, 8).toUpperCase()}</span>
                  <span><strong>Budget:</strong> {selectedCaseModal.budget}</span>
                  <span><strong>Urgency:</strong> {selectedCaseModal.urgency?.toUpperCase()}</span>
                  <span><strong>Status:</strong> {selectedCaseModal.status?.toUpperCase()}</span>
                </div>
              </div>

              {/* Vertical Case Timeline (Actual DB Timestamps) */}
              <div>
                <h3 style={{ fontSize: '17px', fontWeight: '700', color: '#0F2A5E', margin: '0 0 16px 0' }}>
                  End-to-End Case Timeline & Milestones
                </h3>
                <div className={styles.timelineContainer}>
                  {/* Stage 1: Case Posted */}
                  <div className={styles.timelineItem}>
                    <div className={`${styles.timelineDot} ${styles.dotCompleted}`}>✓</div>
                    <span className={styles.timelineTitle}>1. Case Posted & Publicized</span>
                    <span className={styles.timelineDesc}>Legal matter submitted and made accessible to verified Bangladesh lawyers.</span>
                    <span className={styles.timelineDate}>{new Date(selectedCaseModal.created_at).toLocaleString()}</span>
                  </div>

                  {/* Stage 2: Lawyer Applications */}
                  <div className={styles.timelineItem}>
                    <div className={`${styles.timelineDot} ${selectedCaseModal.proposal_count > 0 ? styles.dotCompleted : styles.dotActive}`}>
                      {selectedCaseModal.proposal_count > 0 ? '✓' : '2'}
                    </div>
                    <span className={styles.timelineTitle}>2. Lawyer Proposals & Competitive Bidding</span>
                    <span className={styles.timelineDesc}>
                      {selectedCaseModal.proposal_count > 0 
                        ? `${selectedCaseModal.proposal_count} advocate proposal(s) received for review.` 
                        : 'Awaiting proposals from qualified advocates.'}
                    </span>
                    {selectedCaseModal.proposal_count > 0 && (
                      <span className={styles.timelineDate}>Active bidding stage</span>
                    )}
                  </div>

                  {/* Stage 3: Proposal Accepted */}
                  <div className={styles.timelineItem}>
                    <div className={`${styles.timelineDot} ${selectedCaseModal.lawyer ? styles.dotCompleted : selectedCaseModal.proposal_count > 0 ? styles.dotActive : styles.dotPending}`}>
                      {selectedCaseModal.lawyer ? '✓' : '3'}
                    </div>
                    <span className={styles.timelineTitle}>3. Advocate Selected & Proposal Accepted</span>
                    <span className={styles.timelineDesc}>
                      {selectedCaseModal.lawyer 
                        ? `Assigned to Adv. ${selectedCaseModal.lawyer.name || selectedCaseModal.lawyer.full_name || 'Legal Council'}.` 
                        : 'Review pending proposals to select your legal representative.'}
                    </span>
                    {selectedCaseModal.lawyer && (
                      <span className={styles.timelineDate}>Advocate assigned</span>
                    )}
                  </div>

                  {/* Stage 4: Contract & Retainer */}
                  <div className={styles.timelineItem}>
                    <div className={`${styles.timelineDot} ${selectedCaseModal.contract ? (selectedCaseModal.contract.status === 'Active' ? styles.dotCompleted : styles.dotActive) : styles.dotPending}`}>
                      {selectedCaseModal.contract && selectedCaseModal.contract.status === 'Active' ? '✓' : '4'}
                    </div>
                    <span className={styles.timelineTitle}>4. Legal Contract Signed & Retainer Paid</span>
                    <span className={styles.timelineDesc}>
                      {selectedCaseModal.contract 
                        ? `Contract status: ${selectedCaseModal.contract.status}. Retainer fee: BDT ${Number(selectedCaseModal.contract.retainer_amount || selectedCaseModal.contract.amount || 0).toLocaleString('en-IN')}.`
                        : 'Formal representation agreement and retainer initialization.'}
                    </span>
                  </div>

                  {/* Stage 5: Work In Progress & Milestones */}
                  <div className={styles.timelineItem}>
                    <div className={`${styles.timelineDot} ${selectedCaseModal.status === 'completed' ? styles.dotCompleted : selectedCaseModal.status === 'in_progress' ? styles.dotActive : styles.dotPending}`}>
                      {selectedCaseModal.status === 'completed' ? '✓' : '5'}
                    </div>
                    <span className={styles.timelineTitle}>5. Legal Representation In Progress</span>
                    <span className={styles.timelineDesc}>
                      {selectedCaseModal.milestones && selectedCaseModal.milestones.length > 0
                        ? `${selectedCaseModal.milestones.filter(m => m.status === 'approved').length} of ${selectedCaseModal.milestones.length} milestones completed.`
                        : 'Ongoing legal drafting, court practice, and consultation sessions.'}
                    </span>
                  </div>

                  {/* Dynamic Database Timeline Updates */}
                  {selectedCaseModal.contract_timeline && selectedCaseModal.contract_timeline.map((entry, idx) => (
                    <div key={`tl_${entry.id || idx}`} className={styles.timelineItem}>
                      <div className={`${styles.timelineDot} ${styles.dotCompleted}`} style={{ background: '#3B82F6', color: '#fff' }}>📝</div>
                      <span className={styles.timelineTitle}>Update: {entry.title || entry.event_type || 'Advocate Progress Report'}</span>
                      <span className={styles.timelineDesc}>{entry.description || entry.notes}</span>
                      <span className={styles.timelineDate}>{new Date(entry.created_at).toLocaleString()}</span>
                    </div>
                  ))}

                  {/* Dynamic Submitted Deliverables */}
                  {selectedCaseModal.deliverables && selectedCaseModal.deliverables.map((deliv, idx) => (
                    <div key={`dl_${deliv.id || idx}`} className={styles.timelineItem}>
                      <div className={`${styles.timelineDot} ${deliv.status === 'APPROVED' ? styles.dotCompleted : styles.dotActive}`} style={{ background: deliv.status === 'APPROVED' ? '#10B981' : '#8B5CF6', color: '#fff' }}>📦</div>
                      <span className={styles.timelineTitle}>Deliverable: {deliv.title || 'Legal Work Package'} ({deliv.status})</span>
                      <span className={styles.timelineDesc}>{deliv.description || deliv.client_note || deliv.rejection_reason || 'No additional notes provided.'}</span>
                      {deliv.file_url && (
                        <div style={{ marginTop: '8px' }}>
                          <a href={deliv.file_url} target="_blank" rel="noopener noreferrer" style={{ color: '#2563EB', fontWeight: 'bold', fontSize: '13px' }}>
                            📄 Download Deliverable Document
                          </a>
                        </div>
                      )}
                      <span className={styles.timelineDate}>Submitted: {new Date(deliv.submitted_at || deliv.created_at).toLocaleString()}</span>
                    </div>
                  ))}

                  {/* Stage 6: Case Completed */}
                  <div className={styles.timelineItem}>
                    <div className={`${styles.timelineDot} ${selectedCaseModal.status === 'completed' ? styles.dotCompleted : styles.dotPending}`}>
                      {selectedCaseModal.status === 'completed' ? '✓' : '6'}
                    </div>
                    <span className={styles.timelineTitle}>6. Case Resolved & Completed</span>
                    <span className={styles.timelineDesc}>Final case closure, document archive, and client review submission.</span>
                    {selectedCaseModal.status === 'completed' && (
                      <span className={styles.timelineDate}>Case closed on {new Date(selectedCaseModal.updated_at).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Client Review & Actions Box inside Modal */}
              {(selectedCaseModal.contract || selectedCaseModal.status === 'under_review' || selectedCaseModal.status === 'revision_requested' || showRevisionForm) && ['UNDER_CLIENT_REVIEW', 'Active', 'in_progress', 'REVISION_REQUESTED', 'under_review', 'revision_requested'].includes(selectedCaseModal.contract?.status || selectedCaseModal.status) && (
                <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '12px', padding: '16px', marginTop: '20px' }}>
                  <h4 style={{ margin: '0 0 8px 0', color: '#1E40AF', fontSize: '15px' }}>⚡ Client Review & Delivery Acceptance</h4>
                  <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#334155' }}>
                    Review the progress updates and deliverables submitted by your advocate. Once you accept the delivery, the contract is marked completed and payment is released.
                  </p>

                  {showRevisionForm && (
                    <div style={{ marginBottom: '16px', background: '#fff', padding: '12px', borderRadius: '8px', border: '1px solid #CBD5E1' }}>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#0F2A5E', marginBottom: '6px' }}>
                        Specify Revision Instructions for Advocate:
                      </label>
                      <textarea
                        value={revisionNoteInput}
                        onChange={(e) => setRevisionNoteInput(e.target.value)}
                        placeholder="Please detail what changes or further legal work you need before accepting..."
                        style={{ width: '100%', height: '80px', padding: '8px', borderRadius: '6px', border: '1px solid #94A3B8', fontSize: '13px', fontFamily: 'inherit' }}
                      />
                      <div style={{ display: 'flex', gap: '8px', marginTop: '8px', justifyContent: 'flex-end' }}>
                        <button onClick={() => setShowRevisionForm(false)} className={styles.btnSecondary} style={{ fontSize: '12px' }}>Cancel</button>
                        <button
                          onClick={() => handleClientRequestRevision(selectedCaseModal.contract?.id, selectedCaseModal)}
                          disabled={submittingAction}
                          style={{ padding: '8px 14px', background: '#EF4444', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                        >
                          {submittingAction ? 'Submitting...' : 'Send Revision Request'}
                        </button>
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => handleClientAcceptDelivery(selectedCaseModal.contract?.id, selectedCaseModal)}
                      disabled={submittingAction}
                      style={{ padding: '10px 18px', background: '#10B981', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      ✓ Accept Delivery & Release Payment
                    </button>
                    {!showRevisionForm && (
                      <button
                        onClick={() => setShowRevisionForm(true)}
                        disabled={submittingAction}
                        style={{ padding: '10px 18px', background: '#EF4444', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}
                      >
                        ✎ Request Revision
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Review Box when case is completed */}
              {(selectedCaseModal.status?.toLowerCase() === 'completed' || selectedCaseModal.contract?.status?.toLowerCase() === 'completed') && (
                <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '12px', padding: '18px', marginTop: '20px' }}>
                  <h4 style={{ margin: '0 0 6px 0', color: '#B45309', fontSize: '15px' }}>★ Advocate Performance Review</h4>
                  <p style={{ margin: '0 0 14px 0', fontSize: '13px', color: '#78350F' }}>
                    This legal matter is marked completed. You can submit or update your verified rating and written feedback for your advocate.
                  </p>
                  <button
                    onClick={() => { setSelectedCaseModal(null); setReviewingCase(selectedCaseModal); }}
                    style={{ padding: '10px 20px', background: '#F59E0B', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', boxShadow: '0 4px 12px rgba(245, 158, 11, 0.25)' }}
                  >
                    ★ Write / Edit Review
                  </button>
                </div>
              )}

              {/* Modal Footer Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid #E5E7EB', paddingTop: '16px' }}>
                <button onClick={() => setSelectedCaseModal(null)} className={styles.btnSecondary}>
                  Close Timeline
                </button>
                {selectedCaseModal.lawyer && (
                  <button onClick={() => { setSelectedCaseModal(null); navigate('/client/portal/messages'); }} className={styles.btnPrimary}>
                    Open Chat with Advocate
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {reviewingCase && (
        <ReviewSubmissionModal
          caseItem={reviewingCase}
          contractId={reviewingCase.contract?.id || reviewingCase.contract_id}
          lawyerId={reviewingCase.lawyer_id || reviewingCase.contract?.lawyer_id}
          onClose={() => setReviewingCase(null)}
          onSuccess={() => {
            fetchDashboardData();
          }}
        />
      )}
    </div>
  );
};

export default CaseTracking;
