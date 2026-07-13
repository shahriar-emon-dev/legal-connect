import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../services/supabase';
import toast from 'react-hot-toast';

const LawyersManagement = () => {
  const [lawyers, setLawyers] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [verifFilter, setVerifFilter] = useState('All');
  const [approvalFilter, setApprovalFilter] = useState('All');
  const [practiceFilter, setPracticeFilter] = useState('All');
  const [availFilter, setAvailFilter] = useState('All');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 15;

  // Modals state
  const [editingLawyer, setEditingLawyer] = useState(null);
  const [rejectingLawyer, setRejectingLawyer] = useState(null);
  const [viewingDocsLawyer, setViewingDocsLawyer] = useState(null);
  const [deletingLawyer, setDeletingLawyer] = useState(null);
  const [editForm, setEditForm] = useState({ specialization: '', experience_years: 1, bar_association_number: '', phone: '', availability_status: 'Available' });
  const [rejectionNote, setRejectionNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Statistics Cards state
  const [stats, setStats] = useState({
    totalLawyers: 0,
    pendingVerification: 0,
    verifiedLawyers: 0,
    approvedLawyers: 0,
    suspendedLawyers: 0,
  });

  const fetchOverallStats = useCallback(async () => {
    try {
      // Fetch ONLY lawyer users
      const { data: uData, error: uErr } = await supabase
        .from('users')
        .select('id, is_active')
        .eq('user_type', 'lawyer');
      if (uErr) throw uErr;
      const allLawyerUsers = uData || [];
      const lawyerIds = allLawyerUsers.map(u => u.id);

      let lDetails = [];
      if (lawyerIds.length > 0) {
        const { data: lData } = await supabase
          .from('lawyers')
          .select('user_id, is_verified, verification_status, approval_status')
          .in('user_id', lawyerIds);
        if (lData) lDetails = lData;
      }

      const lMap = {};
      lDetails.forEach(l => { lMap[l.user_id] = l; });

      let pendingVerif = 0;
      let verified = 0;
      let approved = 0;

      allLawyerUsers.forEach(u => {
        const lInfo = lMap[u.id] || {};
        const vStatus = (lInfo.verification_status || 'pending').toLowerCase();
        const aStatus = (lInfo.approval_status || (lInfo.is_verified || vStatus === 'verified' ? 'approved' : 'pending')).toLowerCase();

        if (vStatus === 'pending' || vStatus === 'action_required') pendingVerif++;
        if (lInfo.is_verified || vStatus === 'verified') verified++;
        if (aStatus === 'approved' || lInfo.is_verified || vStatus === 'verified') approved++;
      });

      setStats({
        totalLawyers: allLawyerUsers.length,
        pendingVerification: pendingVerif,
        verifiedLawyers: verified,
        approvedLawyers: approved,
        suspendedLawyers: allLawyerUsers.filter(u => u.is_active === false).length,
      });
    } catch (err) {
      console.warn('Could not compute lawyer statistics:', err);
    }
  }, []);

  const fetchLawyers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Query ONLY users where role = 'lawyer'
      let query = supabase
        .from('users')
        .select('*', { count: 'exact' })
        .eq('user_type', 'lawyer');

      if (searchTerm.trim()) {
        const term = searchTerm.trim();
        query = query.or(`name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
      }

      // Pagination calculation
      const from = (currentPage - 1) * rowsPerPage;
      const to = from + rowsPerPage - 1;

      const { data: usersData, count, error: uError } = await query
        .order('created_at', { ascending: false })
        .range(from, to);

      if (uError) throw uError;
      const rawUsers = usersData || [];
      setTotalCount(count || rawUsers.length);

      // Fetch their lawyer profile records from lawyers table
      const lawyerUserIds = rawUsers.map(u => u.id);
      let lawyerProfilesMap = {};
      let lawyerDocsMap = {};

      if (lawyerUserIds.length > 0) {
        try {
          const { data: lData } = await supabase
            .from('lawyers')
            .select('*')
            .in('user_id', lawyerUserIds);
          if (lData) {
            lData.forEach(l => { lawyerProfilesMap[l.user_id] = l; });
          }
        } catch (e) {}

        try {
          const { data: docsData } = await supabase
            .from('documents')
            .select('*');
          if (docsData) {
            docsData.forEach(doc => {
              const targetId = doc.lawyer_id || doc.uploaded_by || doc.client_id;
              if (targetId) {
                if (!lawyerDocsMap[targetId]) lawyerDocsMap[targetId] = [];
                lawyerDocsMap[targetId].push(doc);
              }
            });
          }
        } catch (e) {}
      }

      // Merge user data + lawyer profile data + verification logic
      let enriched = rawUsers.map(u => {
        const lInfo = lawyerProfilesMap[u.id] || {};
        const vStatusRaw = (lInfo.verification_status || (lInfo.is_verified ? 'verified' : 'pending')).toLowerCase();
        let verifStatusLabel = 'Pending';
        if (lInfo.is_verified || vStatusRaw === 'verified') verifStatusLabel = 'Verified';
        else if (vStatusRaw === 'rejected') verifStatusLabel = 'Rejected';
        else if (vStatusRaw === 'action_required') verifStatusLabel = 'Action Required';

        let approvalLabel = 'Pending';
        const aStatusRaw = (lInfo.approval_status || (lInfo.is_verified || vStatusRaw === 'verified' ? 'approved' : 'pending')).toLowerCase();
        if (aStatusRaw === 'approved' || lInfo.is_verified || vStatusRaw === 'verified') approvalLabel = 'Approved';
        else if (aStatusRaw === 'rejected') approvalLabel = 'Rejected';

        const availLabel = lInfo.availability_status || (u.is_active === false ? 'Not Available' : 'Available');

        return {
          ...u,
          lawyer_id: lInfo.id || u.id,
          specialization: lInfo.specialization || lInfo.practice_areas || 'General Practice',
          experience_years: lInfo.experience_years || 1,
          bar_association_number: lInfo.bar_association_number || lInfo.bar_number || 'Pending Bar No.',
          rating: lInfo.rating || lInfo.average_rating || null,
          cases_completed: lInfo.cases_completed || lInfo.completed_cases || 0,
          verification_status_label: verifStatusLabel,
          approval_status_label: approvalLabel,
          availability_label: availLabel,
          uploaded_documents: lawyerDocsMap[u.id] || lawyerDocsMap[lInfo.id] || [],
          raw_lawyer: lInfo
        };
      });

      // Apply Frontend Filters for specialized fields
      if (verifFilter !== 'All') {
        enriched = enriched.filter(l => l.verification_status_label === verifFilter);
      }
      if (approvalFilter !== 'All') {
        enriched = enriched.filter(l => l.approval_status_label === approvalFilter);
      }
      if (practiceFilter !== 'All') {
        enriched = enriched.filter(l => 
          (l.specialization || '').toLowerCase().includes(practiceFilter.toLowerCase())
        );
      }
      if (availFilter !== 'All') {
        if (availFilter === 'Available') enriched = enriched.filter(l => l.availability_label === 'Available' && l.is_active !== false);
        else enriched = enriched.filter(l => l.availability_label !== 'Available' || l.is_active === false);
      }

      setLawyers(enriched);
    } catch (err) {
      console.error('Error fetching lawyer registry:', err);
      setError('Failed to load lawyer accounts. Please check your network connection.');
      toast.error('Failed to load lawyer registry');
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchTerm, verifFilter, approvalFilter, practiceFilter, availFilter, rowsPerPage]);

  useEffect(() => {
    fetchOverallStats();
    fetchLawyers();
  }, [fetchOverallStats, fetchLawyers]);

  // Actions
  const handleApproveLawyer = async (lawyer) => {
    if (!window.confirm(`Approve advocate credentials and verify account for ${lawyer.name}?`)) return;
    try {
      setActionLoading(true);
      // Update lawyers table
      const { error: lErr } = await supabase
        .from('lawyers')
        .update({ is_verified: true, verification_status: 'verified', approval_status: 'approved' })
        .eq('user_id', lawyer.id);

      if (lErr && !lErr.message?.includes('0 rows')) {
        // If no row exists yet in lawyers table, insert one or call RPC
        await supabase.rpc('fn_verify_lawyer', {
          p_lawyer_id: isNaN(Number(lawyer.lawyer_id)) ? null : Number(lawyer.lawyer_id),
          p_user_id: lawyer.id,
          p_status: 'verified',
          p_rejection_reason: null
        }).catch(() => {});
      }

      // Ensure user is active
      await supabase.from('users').update({ is_active: true }).eq('id', lawyer.id);

      toast.success(`${lawyer.name} has been verified and approved successfully`);
      fetchLawyers();
      fetchOverallStats();
    } catch (err) {
      console.error('Approve error:', err);
      toast.error(`Could not approve lawyer: ${err.message || ''}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectingLawyer || !rejectionNote.trim()) {
      toast.error('Please specify a rejection reason or feedback notes');
      return;
    }
    try {
      setActionLoading(true);
      await supabase
        .from('lawyers')
        .update({ is_verified: false, verification_status: 'rejected', approval_status: 'rejected' })
        .eq('user_id', rejectingLawyer.id);

      await supabase.rpc('fn_verify_lawyer', {
        p_lawyer_id: isNaN(Number(rejectingLawyer.lawyer_id)) ? null : Number(rejectingLawyer.lawyer_id),
        p_user_id: rejectingLawyer.id,
        p_status: 'rejected',
        p_rejection_reason: rejectionNote
      }).catch(() => {});

      toast.success(`Lawyer application rejected. Reason logged.`);
      setRejectingLawyer(null);
      setRejectionNote('');
      fetchLawyers();
      fetchOverallStats();
    } catch (err) {
      console.error('Reject error:', err);
      toast.error(`Could not reject lawyer: ${err.message || ''}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleSuspend = async (lawyer) => {
    const newStatus = lawyer.is_active === false ? true : false;
    const actionText = newStatus ? 'activate' : 'suspend';
    if (!window.confirm(`Are you sure you want to ${actionText} advocate ${lawyer.name}?`)) return;
    try {
      const { error: updateError } = await supabase
        .from('users')
        .update({ is_active: newStatus })
        .eq('id', lawyer.id);
      if (updateError) throw updateError;
      toast.success(`Lawyer account ${actionText}d successfully`);
      fetchLawyers();
      fetchOverallStats();
    } catch (err) {
      toast.error(`Failed to ${actionText} lawyer: ${err.message || ''}`);
    }
  };

  const handleOpenEdit = (lawyer) => {
    setEditingLawyer(lawyer);
    setEditForm({
      specialization: lawyer.specialization || 'General Practice',
      experience_years: lawyer.experience_years || 1,
      bar_association_number: lawyer.bar_association_number || '',
      phone: lawyer.phone || '',
      availability_status: lawyer.availability_label || 'Available'
    });
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingLawyer) return;
    try {
      setActionLoading(true);
      await supabase.from('users').update({ phone: editForm.phone }).eq('id', editingLawyer.id);
      await supabase
        .from('lawyers')
        .update({
          specialization: editForm.specialization,
          experience_years: Number(editForm.experience_years || 1),
          bar_association_number: editForm.bar_association_number,
          availability_status: editForm.availability_status
        })
        .eq('user_id', editingLawyer.id);

      toast.success('Advocate profile updated successfully');
      setEditingLawyer(null);
      fetchLawyers();
    } catch (err) {
      console.error('Save edit error:', err);
      toast.error(`Failed to save changes: ${err.message || ''}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteLawyer = async () => {
    if (!deletingLawyer) return;
    try {
      setActionLoading(true);
      await supabase.from('lawyers').delete().eq('user_id', deletingLawyer.id);
      const { error: delErr } = await supabase.from('users').delete().eq('id', deletingLawyer.id);
      if (delErr) throw delErr;
      toast.success('Lawyer account removed permanently');
      setDeletingLawyer(null);
      fetchLawyers();
      fetchOverallStats();
    } catch (err) {
      toast.error(`Could not delete lawyer: ${err.message || ''}`);
    } finally {
      setActionLoading(false);
    }
  };

  const exportCSV = () => {
    const headers = ['ID', 'Advocate Name', 'Email', 'Phone', 'Bar Council No', 'Practice Areas', 'Experience (Yrs)', 'Verification Status', 'Approval Status', 'Availability', 'Rating', 'Cases Completed', 'Join Date'];
    const csvData = lawyers.map(l => [
      l.id,
      `"${(l.name || '').replace(/"/g, '""')}"`,
      `"${(l.email || '').replace(/"/g, '""')}"`,
      `"${(l.phone || '').replace(/"/g, '""')}"`,
      `"${(l.bar_association_number || '').replace(/"/g, '""')}"`,
      `"${(l.specialization || '').replace(/"/g, '""')}"`,
      l.experience_years || 1,
      l.verification_status_label,
      l.approval_status_label,
      l.availability_label,
      l.rating || 'New',
      l.cases_completed || 0,
      new Date(l.created_at).toLocaleDateString()
    ].join(','));
    
    const csvContent = [headers.join(','), ...csvData].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'legalconnect_lawyers_registry.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / rowsPerPage));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 font-sans">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border-subtle pb-6">
        <div>
          <h1 className="text-3xl font-serif font-bold text-navy-primary tracking-tight flex items-center gap-2.5">
            <span>⚖️</span> Lawyers & Advocates Registry
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Dedicated portal to verify, inspect, approve, and manage registered legal professionals across all practice jurisdictions.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { fetchOverallStats(); fetchLawyers(); }}
            className="px-4 py-2.5 rounded-xl border border-border-subtle bg-white text-navy-primary hover:bg-bg-light transition flex items-center gap-2 font-semibold text-sm shadow-sm"
          >
            <span>🔄</span> Refresh
          </button>
          <button 
            onClick={exportCSV}
            className="bg-navy-primary text-white px-5 py-2.5 rounded-xl hover:bg-navy-primary/90 transition flex items-center gap-2 font-semibold text-sm shadow-md"
          >
            <span>📥</span> Export CSV
          </button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-border-subtle shadow-sm flex flex-col justify-between border-l-4 border-l-amber-500">
          <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Total Lawyers</span>
          <div className="text-2xl font-black text-amber-600 mt-2">{stats.totalLawyers.toLocaleString()}</div>
          <span className="text-[11px] text-gray-500 mt-1">Every advocate account</span>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-border-subtle shadow-sm flex flex-col justify-between border-l-4 border-l-blue-500">
          <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Pending Verification</span>
          <div className="text-2xl font-black text-blue-600 mt-2">{stats.pendingVerification.toLocaleString()}</div>
          <span className="text-[11px] text-gray-500 mt-1">Requires bar review</span>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-border-subtle shadow-sm flex flex-col justify-between border-l-4 border-l-emerald-500">
          <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Verified Lawyers</span>
          <div className="text-2xl font-black text-emerald-600 mt-2">{stats.verifiedLawyers.toLocaleString()}</div>
          <span className="text-[11px] text-gray-500 mt-1">Credentials validated</span>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-border-subtle shadow-sm flex flex-col justify-between border-l-4 border-l-purple-500">
          <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Approved & Active</span>
          <div className="text-2xl font-black text-purple-600 mt-2">{stats.approvedLawyers.toLocaleString()}</div>
          <span className="text-[11px] text-gray-500 mt-1">Listed in search</span>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-border-subtle shadow-sm flex flex-col justify-between border-l-4 border-l-rose-500">
          <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Suspended</span>
          <div className="text-2xl font-black text-rose-600 mt-2">{stats.suspendedLawyers.toLocaleString()}</div>
          <span className="text-[11px] text-gray-500 mt-1">Deactivated profiles</span>
        </div>
      </div>

      {/* Toolbar & Filter Section */}
      <div className="bg-white rounded-2xl border border-border-subtle p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="flex flex-wrap gap-3 w-full lg:w-auto flex-1">
            <div className="relative flex-1 min-w-[240px]">
              <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-lg">search</span>
              <input 
                type="text" 
                placeholder="Search advocate name, email, or bar no..." 
                className="w-full pl-10 pr-4 py-2.5 border border-border-subtle rounded-xl focus:outline-none focus:border-accent-gold text-sm transition"
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              />
            </div>
            <select 
              className="px-3.5 py-2.5 border border-border-subtle rounded-xl bg-white focus:outline-none focus:border-accent-gold text-sm font-medium text-navy-primary transition"
              value={verifFilter}
              onChange={(e) => { setVerifFilter(e.target.value); setCurrentPage(1); }}
            >
              <option value="All">All Verification Status</option>
              <option value="Verified">Verified Only</option>
              <option value="Pending">Pending Verification</option>
              <option value="Rejected">Rejected</option>
              <option value="Action Required">Action Required</option>
            </select>
            <select 
              className="px-3.5 py-2.5 border border-border-subtle rounded-xl bg-white focus:outline-none focus:border-accent-gold text-sm font-medium text-navy-primary transition"
              value={approvalFilter}
              onChange={(e) => { setApprovalFilter(e.target.value); setCurrentPage(1); }}
            >
              <option value="All">All Approval Status</option>
              <option value="Approved">Approved Only</option>
              <option value="Pending">Pending Approval</option>
              <option value="Rejected">Rejected</option>
            </select>
            <select 
              className="px-3.5 py-2.5 border border-border-subtle rounded-xl bg-white focus:outline-none focus:border-accent-gold text-sm font-medium text-navy-primary transition"
              value={practiceFilter}
              onChange={(e) => { setPracticeFilter(e.target.value); setCurrentPage(1); }}
            >
              <option value="All">All Practice Areas</option>
              <option value="Criminal">Criminal Law</option>
              <option value="Corporate">Corporate & Business</option>
              <option value="Family">Family & Divorce</option>
              <option value="Property">Property & Real Estate</option>
              <option value="Labor">Labor & Employment</option>
              <option value="Litigation">Civil Litigation</option>
            </select>
            <select 
              className="px-3.5 py-2.5 border border-border-subtle rounded-xl bg-white focus:outline-none focus:border-accent-gold text-sm font-medium text-navy-primary transition"
              value={availFilter}
              onChange={(e) => { setAvailFilter(e.target.value); setCurrentPage(1); }}
            >
              <option value="All">All Availability</option>
              <option value="Available">Available</option>
              <option value="Busy">Busy / Unavailable</option>
            </select>
          </div>
          <div className="text-sm font-semibold text-text-muted">
            Showing <span className="text-navy-primary font-bold">{lawyers.length}</span> of <span className="text-navy-primary font-bold">{totalCount}</span> advocates
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-2xl border border-border-subtle shadow-sm overflow-hidden relative min-h-[460px]">
        {loading && (
          <div className="absolute inset-0 bg-white/70 backdrop-blur-sm flex flex-col items-center justify-center z-10 gap-3">
            <div className="animate-spin rounded-full h-11 w-11 border-4 border-navy-primary border-t-transparent"></div>
            <span className="text-sm font-semibold text-navy-primary">Synchronizing Lawyer Registry...</span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-bg-light/80 text-text-muted text-xs font-bold uppercase tracking-wider border-b border-border-subtle">
                <th className="px-6 py-4 whitespace-nowrap">Avatar & Lawyer Name</th>
                <th className="px-6 py-4">Contact & Bar No.</th>
                <th className="px-6 py-4">Practice Areas & Exp</th>
                <th className="px-6 py-4 whitespace-nowrap">Verification & Approval</th>
                <th className="px-6 py-4 whitespace-nowrap">Availability & Rating</th>
                <th className="px-6 py-4 whitespace-nowrap">Join Date</th>
                <th className="px-6 py-4 text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle/60 text-sm">
              {lawyers.map(l => {
                const isSuspended = l.is_active === false;
                const isVerified = l.verification_status_label === 'Verified';
                const isApproved = l.approval_status_label === 'Approved';

                return (
                  <tr key={l.id} className={`hover:bg-bg-light/40 transition-colors ${isSuspended ? 'bg-rose-50/30' : ''}`}>
                    {/* Avatar & Name */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-full bg-amber-600 text-white flex items-center justify-center font-bold text-sm uppercase overflow-hidden shadow-sm flex-shrink-0">
                          {l.profile_picture_url ? (
                            <img src={l.profile_picture_url} alt={l.name} className="w-full h-full object-cover" />
                          ) : (
                            (l.name || 'L')[0]
                          )}
                        </div>
                        <div>
                          <div className={`font-bold flex items-center gap-1.5 ${isSuspended ? 'text-gray-500 line-through' : 'text-navy-primary'}`}>
                            <span>{l.name || 'Unnamed Advocate'}</span>
                            {isVerified && <span title="Verified Advocate" className="text-blue-600 text-base">☑️</span>}
                          </div>
                          <div className="text-xs text-gray-500 font-mono mt-0.5">ID: {l.id.slice(0, 8)}...</div>
                        </div>
                      </div>
                    </td>

                    {/* Contact & Bar No */}
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-700">{l.email || '—'}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{l.phone || 'Phone not listed'}</div>
                      <div className="mt-1">
                        <span className="px-2 py-0.5 rounded bg-amber-50 border border-amber-200/60 text-amber-800 text-[11px] font-mono font-semibold">
                          Bar No: {l.bar_association_number}
                        </span>
                      </div>
                    </td>

                    {/* Practice Areas & Experience */}
                    <td className="px-6 py-4">
                      <div className="font-bold text-navy-primary max-w-[200px] truncate" title={l.specialization}>
                        {l.specialization}
                      </div>
                      <div className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                        <span className="font-semibold text-gray-700">{l.experience_years}+ Yrs Exp</span>
                        <span>•</span>
                        <span>{l.cases_completed} Cases Completed</span>
                      </div>
                    </td>

                    {/* Verification & Approval Status */}
                    <td className="px-6 py-4 whitespace-nowrap space-y-1.5">
                      <div>
                        <span className={`px-2.5 py-1 rounded-md text-xs font-bold inline-flex items-center gap-1 ${
                          isVerified ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                          l.verification_status_label === 'Rejected' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                          'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>
                          <span>{isVerified ? '✓' : '⏳'}</span>
                          <span>Verif: {l.verification_status_label}</span>
                        </span>
                      </div>
                      <div>
                        <span className={`px-2.5 py-1 rounded-md text-xs font-bold inline-flex items-center gap-1 ${
                          isApproved ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                          l.approval_status_label === 'Rejected' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                          'bg-gray-100 text-gray-600 border border-gray-200'
                        }`}>
                          <span>{isApproved ? '★' : '•'}</span>
                          <span>Appr: {l.approval_status_label}</span>
                        </span>
                      </div>
                    </td>

                    {/* Availability & Rating */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${l.availability_label === 'Available' && !isSuspended ? 'bg-emerald-500' : 'bg-gray-400'}`}></span>
                        <span className="font-semibold text-gray-700 text-xs">
                          {isSuspended ? 'Suspended' : l.availability_label}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-1 text-xs text-amber-600 font-bold">
                        <span>★</span>
                        <span>{l.rating ? Number(l.rating).toFixed(1) : 'New / Unrated'}</span>
                      </div>
                    </td>

                    {/* Join Date */}
                    <td className="px-6 py-4 text-gray-500 whitespace-nowrap text-xs">
                      {new Date(l.created_at || Date.now()).toLocaleDateString('en-GB')}
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <a
                          href={`/lawyers/${l.id}`}
                          target="_blank"
                          rel="noreferrer"
                          title="View Public Profile"
                          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                        >
                          <span className="material-symbols-outlined text-lg">public</span>
                        </a>
                        <button
                          onClick={() => setViewingDocsLawyer(l)}
                          title="View Verification Documents"
                          className="p-1.5 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition relative"
                        >
                          <span className="material-symbols-outlined text-lg">folder_shared</span>
                          {(l.uploaded_documents || []).length > 0 && (
                            <span className="absolute -top-1 -right-1 bg-amber-600 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center">
                              {l.uploaded_documents.length}
                            </span>
                          )}
                        </button>
                        {!isVerified && (
                          <button
                            onClick={() => handleApproveLawyer(l)}
                            title="Approve & Verify Lawyer"
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition font-bold"
                          >
                            <span className="material-symbols-outlined text-lg">check_circle</span>
                          </button>
                        )}
                        {!isVerified && (
                          <button
                            onClick={() => setRejectingLawyer(l)}
                            title="Reject Lawyer Application"
                            className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition"
                          >
                            <span className="material-symbols-outlined text-lg">cancel</span>
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenEdit(l)}
                          title="Edit Advocate Profile"
                          className="p-1.5 text-gray-500 hover:text-navy-primary hover:bg-bg-light rounded-lg transition"
                        >
                          <span className="material-symbols-outlined text-lg">edit</span>
                        </button>
                        <button
                          onClick={() => handleToggleSuspend(l)}
                          title={isSuspended ? "Activate Lawyer" : "Suspend Lawyer"}
                          className={`p-1.5 rounded-lg transition ${isSuspended ? 'text-emerald-600 hover:bg-emerald-50' : 'text-amber-600 hover:bg-amber-50'}`}
                        >
                          <span className="material-symbols-outlined text-lg">{isSuspended ? 'lock_open' : 'block'}</span>
                        </button>
                        <button
                          onClick={() => setDeletingLawyer(l)}
                          title="Remove Advocate Account"
                          className="p-1.5 text-gray-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                        >
                          <span className="material-symbols-outlined text-lg">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {error && (
                <tr>
                  <td colSpan="7" className="px-6 py-12">
                    <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center space-y-4 max-w-md mx-auto">
                      <span className="material-symbols-outlined text-5xl text-red-500">error_outline</span>
                      <h3 className="text-xl font-bold text-navy-primary">Failed to Load Lawyers</h3>
                      <p className="text-gray-600 text-sm">{error}</p>
                      <button 
                        onClick={fetchLawyers}
                        className="px-6 py-2.5 bg-navy-primary hover:bg-navy-primary/90 text-white font-bold rounded-xl shadow transition active:scale-95"
                      >
                        Retry Query
                      </button>
                    </div>
                  </td>
                </tr>
              )}

              {!loading && !error && lawyers.length === 0 && (
                <tr>
                  <td colSpan="7" className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center justify-center space-y-3 max-w-md mx-auto">
                      <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center text-amber-600">
                        <span className="material-symbols-outlined text-3xl">gavel</span>
                      </div>
                      <p className="font-bold text-navy-primary text-lg">No Lawyer Accounts Found</p>
                      <p className="text-sm text-gray-500">
                        No advocate accounts match your search or current filter criteria. Clients and admins never appear in this registry.
                      </p>
                      <button
                        onClick={() => { setSearchTerm(''); setVerifFilter('All'); setApprovalFilter('All'); setPracticeFilter('All'); setAvailFilter('All'); setCurrentPage(1); }}
                        className="px-4 py-2 bg-navy-primary text-white rounded-xl text-sm font-semibold hover:bg-navy-primary/90 transition"
                      >
                        Clear All Filters
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="bg-bg-light/40 border-t border-border-subtle p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-sm text-text-muted">
              Page <span className="font-bold text-navy-primary">{currentPage}</span> of <span className="font-bold text-navy-primary">{totalPages}</span> ({totalCount} total advocates)
            </div>
            <div className="flex items-center gap-2">
              <button 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="px-4 py-2 bg-white border border-border-subtle rounded-xl text-sm font-semibold text-navy-primary hover:bg-bg-light disabled:opacity-40 transition shadow-sm"
              >
                Previous
              </button>
              <button 
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className="px-4 py-2 bg-white border border-border-subtle rounded-xl text-sm font-semibold text-navy-primary hover:bg-bg-light disabled:opacity-40 transition shadow-sm"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL 1: View Verification Documents */}
      {viewingDocsLawyer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-border-subtle space-y-6 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border-subtle pb-4">
              <div>
                <h3 className="text-2xl font-serif font-bold text-navy-primary">Verification Documents</h3>
                <p className="text-sm text-gray-500 mt-0.5">Advocate: <span className="font-bold text-navy-primary">{viewingDocsLawyer.name}</span></p>
              </div>
              <button onClick={() => setViewingDocsLawyer(null)} className="text-gray-400 hover:text-gray-600 transition">
                <span className="material-symbols-outlined text-2xl">close</span>
              </button>
            </div>

            <div className="space-y-4">
              {(viewingDocsLawyer.uploaded_documents || []).length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {viewingDocsLawyer.uploaded_documents.map((doc, idx) => (
                    <div key={doc.id || idx} className="p-4 rounded-2xl border border-border-subtle bg-bg-light/40 flex flex-col justify-between space-y-3">
                      <div className="flex items-start gap-3">
                        <span className="material-symbols-outlined text-3xl text-amber-600">description</span>
                        <div>
                          <h4 className="font-bold text-navy-primary text-sm line-clamp-1">{doc.title || doc.file_name || `Document #${idx + 1}`}</h4>
                          <p className="text-xs text-gray-500 capitalize">{doc.doc_type || 'Bar Certificate / NID'}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-border-subtle/60 text-xs">
                        <span className="text-gray-400">{doc.created_at ? new Date(doc.created_at).toLocaleDateString() : 'Uploaded'}</span>
                        <a
                          href={doc.file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1 bg-navy-primary text-white font-bold rounded-lg hover:bg-navy-primary/90 transition flex items-center gap-1"
                        >
                          <span>Open PDF</span>
                          <span className="material-symbols-outlined text-sm">open_in_new</span>
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-12 text-center bg-bg-light/40 rounded-2xl border border-dashed border-border-subtle">
                  <span className="material-symbols-outlined text-4xl text-gray-300 mb-2">folder_off</span>
                  <p className="font-bold text-navy-primary">No Verification Documents Attached</p>
                  <p className="text-xs text-gray-500 mt-1">This advocate has not uploaded Bar Council certificates or NID files yet.</p>
                </div>
              )}
            </div>

            <div className="pt-4 flex items-center justify-between border-t border-border-subtle">
              <a
                href="/admin/verifications"
                className="text-sm font-bold text-blue-600 hover:underline flex items-center gap-1"
              >
                <span>Go to Full Verification Suite</span>
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </a>
              <button
                type="button"
                onClick={() => setViewingDocsLawyer(null)}
                className="px-6 py-2.5 rounded-xl bg-navy-primary text-white font-bold hover:bg-navy-primary/90 transition shadow-md"
              >
                Close Window
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Reject Lawyer Note */}
      {rejectingLawyer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-rose-200 space-y-5">
            <div className="flex items-center justify-between border-b border-rose-100 pb-4">
              <h3 className="text-2xl font-serif font-bold text-rose-700 flex items-center gap-2">
                <span className="material-symbols-outlined">cancel</span> Reject Advocate Application
              </h3>
              <button onClick={() => setRejectingLawyer(null)} className="text-gray-400 hover:text-gray-600 transition">
                <span className="material-symbols-outlined text-2xl">close</span>
              </button>
            </div>

            <p className="text-sm text-gray-600">
              Please provide the official feedback or missing credentials rationale for rejecting <span className="font-bold text-navy-primary">{rejectingLawyer.name}</span>. This reason will be logged for review.
            </p>

            <textarea
              rows="4"
              required
              value={rejectionNote}
              onChange={(e) => setRejectionNote(e.target.value)}
              placeholder="e.g., Bar Council Registration Number does not match submitted certificate ID, or document scan is blurry..."
              className="w-full p-4 border border-border-subtle rounded-xl focus:outline-none focus:border-rose-500 text-sm"
            />

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-border-subtle">
              <button
                type="button"
                onClick={() => setRejectingLawyer(null)}
                className="px-5 py-2.5 rounded-xl border border-border-subtle font-bold text-gray-600 hover:bg-bg-light transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
                disabled={actionLoading}
                className="px-6 py-2.5 rounded-xl bg-rose-600 text-white font-bold hover:bg-rose-700 transition shadow-md disabled:opacity-50 flex items-center gap-2"
              >
                {actionLoading && <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>}
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Edit Advocate Details */}
      {editingLawyer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-border-subtle space-y-6">
            <div className="flex items-center justify-between border-b border-border-subtle pb-4">
              <h3 className="text-2xl font-serif font-bold text-navy-primary">Edit Advocate Profile</h3>
              <button onClick={() => setEditingLawyer(null)} className="text-gray-400 hover:text-gray-600 transition">
                <span className="material-symbols-outlined text-2xl">close</span>
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4 text-sm">
              <div>
                <label className="block font-bold text-navy-primary mb-1.5">Practice Area / Specialization</label>
                <input
                  type="text"
                  required
                  value={editForm.specialization}
                  onChange={(e) => setEditForm({ ...editForm, specialization: e.target.value })}
                  className="w-full px-4 py-2.5 border border-border-subtle rounded-xl focus:outline-none focus:border-accent-gold"
                  placeholder="e.g. Criminal Law, Corporate & Business..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-navy-primary mb-1.5">Experience (Years)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={editForm.experience_years}
                    onChange={(e) => setEditForm({ ...editForm, experience_years: e.target.value })}
                    className="w-full px-4 py-2.5 border border-border-subtle rounded-xl focus:outline-none focus:border-accent-gold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-navy-primary mb-1.5">Bar Council Number</label>
                  <input
                    type="text"
                    value={editForm.bar_association_number}
                    onChange={(e) => setEditForm({ ...editForm, bar_association_number: e.target.value })}
                    className="w-full px-4 py-2.5 border border-border-subtle rounded-xl focus:outline-none focus:border-accent-gold"
                    placeholder="e.g. BAR-DHK-2018-9482"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-navy-primary mb-1.5">Phone Number</label>
                  <input
                    type="text"
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    className="w-full px-4 py-2.5 border border-border-subtle rounded-xl focus:outline-none focus:border-accent-gold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-navy-primary mb-1.5">Availability Status</label>
                  <select
                    value={editForm.availability_status}
                    onChange={(e) => setEditForm({ ...editForm, availability_status: e.target.value })}
                    className="w-full px-4 py-2.5 border border-border-subtle rounded-xl bg-white font-semibold text-navy-primary focus:outline-none focus:border-accent-gold"
                  >
                    <option value="Available">Available</option>
                    <option value="Busy">Busy / In Court</option>
                    <option value="Not Available">Not Available</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-border-subtle">
                <button
                  type="button"
                  onClick={() => setEditingLawyer(null)}
                  className="px-5 py-2.5 rounded-xl border border-border-subtle font-bold text-gray-600 hover:bg-bg-light transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-6 py-2.5 rounded-xl bg-navy-primary text-white font-bold hover:bg-navy-primary/90 transition shadow-md disabled:opacity-50 flex items-center gap-2"
                >
                  {actionLoading && <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>}
                  Save Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Delete Lawyer Confirmation */}
      {deletingLawyer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-rose-200 space-y-5 text-center">
            <div className="w-16 h-16 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-3xl">warning</span>
            </div>
            <h3 className="text-2xl font-serif font-bold text-rose-700">Delete Advocate Account</h3>
            <p className="text-gray-600 text-sm">
              Are you sure you want to permanently remove <span className="font-bold text-navy-primary">{deletingLawyer.name}</span>? All verified credentials, case history, and profile details will be permanently deleted.
            </p>
            <div className="flex items-center justify-center gap-3 pt-4">
              <button
                type="button"
                onClick={() => setDeletingLawyer(null)}
                className="px-5 py-2.5 rounded-xl border border-border-subtle font-bold text-gray-600 hover:bg-bg-light transition w-full"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteLawyer}
                disabled={actionLoading}
                className="px-5 py-2.5 rounded-xl bg-rose-600 text-white font-bold hover:bg-rose-700 transition shadow-md disabled:opacity-50 w-full"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LawyersManagement;
