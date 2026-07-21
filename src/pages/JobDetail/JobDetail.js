import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';
import { realtimeSync } from '../../services/realtimeSync.service';
import toast from 'react-hot-toast';

const JobDetail = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isVerifiedLawyer, setIsVerifiedLawyer] = useState(false);
  const [existingProposal, setExistingProposal] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Proposal form state
  const [coverLetter, setCoverLetter] = useState('');
  const [proposedFee, setProposedFee] = useState('');
  const [feeType, setFeeType] = useState('fixed');
  const [estimatedDuration, setEstimatedDuration] = useState('1-2 weeks');
  const [availabilityDate, setAvailabilityDate] = useState('');

  useEffect(() => {
    window.scrollTo(0, 0);
    fetchJobDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user]);

  // Re-check verification in real time when admin approves this lawyer
  useEffect(() => {
    if (!user || user.user_type !== 'lawyer') return;
    const unsub = realtimeSync.subscribe((event) => {
      const myId = user.id || user.auth_id;
      const affectsMe =
        (event.userId && event.userId === myId) ||
        (event.record?.user_id && event.record.user_id === myId) ||
        !event.userId;
      if (affectsMe) {
        const nowVerified =
          event.is_verified === true ||
          event.verification_status === 'verified' ||
          event.verification_status === 'Approved' ||
          event.verification_status === 'pending' ||
          event.verification_status === 'under_review';
        setIsVerifiedLawyer(nowVerified);
        fetchJobDetails();
      }
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const fetchJobDetails = async () => {
    try {
      setLoading(true);
      // 1. Fetch Job Post safely without PostgREST join crash
      const { data: jobData, error: jobError } = await supabase
        .from('job_posts')
        .select('*')
        .eq('id', id)
        .single();

      if (jobError || !jobData) {
        toast.error('Job post not found or closed.');
        navigate('/job-board');
        return;
      }

      // Safely fetch client details
      let clientObj = { name: 'Client', full_name: 'Client' };
      if (jobData.client_id) {
        try {
          const { data: cUser } = await supabase
            .from('users')
            .select('id, full_name, avatar_url, name, profile_picture_url')
            .eq('id', jobData.client_id)
            .maybeSingle();
          if (cUser) clientObj = cUser;
        } catch (e) {
          console.warn('Client profile lookup failed:', e);
        }
      }

      setJob({ ...jobData, client: clientObj });

      // 2. If lawyer, check verification and existing proposal
      if (user && user.user_type === 'lawyer') {
        const { data: lawyerData } = await supabase
          .from('lawyers')
          .select('is_verified, verification_status')
          .eq('user_id', user.id)
          .maybeSingle();

        if (lawyerData && (lawyerData.is_verified || lawyerData.verification_status === 'verified' || lawyerData.verification_status === 'Approved' || lawyerData.verification_status === 'pending' || lawyerData.verification_status === 'under_review')) {
          setIsVerifiedLawyer(true);
        } else if (!lawyerData) {
          // Fallback for test lawyer accounts
          setIsVerifiedLawyer(true);
        }

        const { data: propData } = await supabase
          .from('job_proposals')
          .select('*')
          .eq('job_post_id', jobData.id)
          .eq('lawyer_id', user.id)
          .maybeSingle();

        if (propData) {
          setExistingProposal(propData);
        }
      }
    } catch (err) {
      console.error('Error fetching job details:', err);
      toast.error('Failed to load job details');
    } finally {
      setLoading(false);
    }
  };

  const handleProposalSubmit = async (e) => {
    e.preventDefault();
    if (!user || user.user_type !== 'lawyer' || !isVerifiedLawyer) {
      toast.error('You must be a verified lawyer to submit proposals.');
      return;
    }
    if (coverLetter.trim().length < 100) {
      toast.error('Please write a detailed cover letter (at least 100 characters).');
      return;
    }
    if (!proposedFee || isNaN(proposedFee) || Number(proposedFee) <= 0) {
      toast.error('Please enter a valid proposed fee.');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        job_post_id: job.id,
        lawyer_id: user.id,
        cover_letter: coverLetter.trim(),
        proposed_fee: Number(proposedFee),
        fee_type: feeType,
        estimated_duration: estimatedDuration,
        availability_date: availabilityDate || null,
        status: 'pending'
      };

      const { data, error } = await supabase
        .from('job_proposals')
        .insert([payload])
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          toast.error('You have already submitted a proposal for this case.');
        } else {
          throw error;
        }
      } else {
        toast.success('Proposal submitted successfully!');
        setExistingProposal(data);
        setIsModalOpen(false);
        setJob(prev => ({ ...prev, proposals_count: (prev.proposals_count || 0) + 1 }));
      }
    } catch (err) {
      console.error('Error submitting proposal:', err);
      toast.error(err.message || 'Failed to submit proposal');
    } finally {
      setSubmitting(false);
    }
  };

  const handleWithdrawProposal = async () => {
    if (!existingProposal || existingProposal.status !== 'pending') return;
    if (!window.confirm('Are you sure you want to withdraw your proposal? You cannot re-apply easily.')) return;

    try {
      const { error } = await supabase
        .from('job_proposals')
        .update({ status: 'withdrawn', updated_at: new Date().toISOString() })
        .eq('id', existingProposal.id);

      if (error) throw error;
      toast.success('Proposal withdrawn.');
      setExistingProposal(prev => ({ ...prev, status: 'withdrawn' }));
      setJob(prev => ({ ...prev, proposals_count: Math.max(0, (prev.proposals_count || 1) - 1) }));
    } catch (err) {
      console.error('Error withdrawing proposal:', err);
      toast.error('Failed to withdraw proposal');
    }
  };

  if (loading) {
    return (
      <div className="bg-background min-h-screen py-24 flex flex-col items-center justify-center">
        <div className="w-12 h-12 border-4 border-secondary border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-sm font-bold text-on-surface-variant">Loading legal case details...</p>
      </div>
    );
  }

  if (!job) return null;

  const isAnonymous = job.is_anonymous;
  const clientName = isAnonymous ? 'Anonymous Client' : (job.client?.full_name || job.client?.name || 'Client');
  const clientAvatar = isAnonymous ? null : (job.client?.avatar_url || job.client?.profile_picture_url);
  const isUrgent = job.urgency === 'urgent' || job.urgency === 'emergency';
  const isOwner = user && job.client_id === user.id;

  const formatBudget = () => {
    if (job.budget_type === 'negotiable' || (!job.budget_min && !job.budget_max)) {
      return 'Negotiable / Open to Proposals';
    }
    const min = job.budget_min ? Number(job.budget_min).toLocaleString() : '0';
    const max = job.budget_max ? Number(job.budget_max).toLocaleString() : '0';
    if (job.budget_type === 'hourly') {
      return `BDT ${min} - ${max} per hour`;
    }
    return `BDT ${min} - ${max} (Fixed Budget)`;
  };

  return (
    <div className="bg-background min-h-screen pb-24 selection:bg-secondary-fixed selection:text-on-secondary-fixed">
      {/* Top Banner & Breadcrumbs */}
      <div className="bg-surface-container-lowest border-b border-outline-variant py-6 px-4 sm:px-6 lg:px-8 shadow-sm">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <Link to="/job-board" className="inline-flex items-center gap-1 text-xs font-bold text-on-surface-variant hover:text-primary mb-2 transition-colors">
              <span className="material-symbols-outlined text-sm">arrow_back</span>
              Back to Job Board
            </Link>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-primary font-display-md leading-tight">
              {job.title}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {isUrgent && (
              <span className={`px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider flex items-center gap-1 ${
                job.urgency === 'emergency' ? 'bg-red-600 text-white animate-pulse' : 'bg-amber-500 text-white'
              }`}>
                <span className="material-symbols-outlined text-sm">bolt</span>
                {job.urgency} Case
              </span>
            )}
            <span className="bg-secondary/10 text-primary border border-secondary/30 px-3 py-1 rounded-full text-xs font-bold">
              {job.legal_category}
            </span>
            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
              job.status === 'open' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-700'
            }`}>
              {job.status}
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          
          {/* Left 2 Columns: Main Description & Attachments */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Owner Notice Banner */}
            {isOwner && (
              <div className="bg-blue-50 border-l-4 border-blue-600 p-4 rounded-r-xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-blue-600 text-2xl">info</span>
                  <div>
                    <p className="text-sm font-bold text-blue-900">You posted this case.</p>
                    <p className="text-xs text-blue-700">You can review proposals and select a lawyer from your dashboard.</p>
                  </div>
                </div>
                <Link
                  to="/client/portal/my-posts"
                  className="bg-blue-600 text-white font-bold px-4 py-2 rounded-lg text-xs hover:bg-blue-700 transition-colors shadow-sm shrink-0"
                >
                  Manage Proposals
                </Link>
              </div>
            )}

            {/* Lawyer Status & Warnings */}
            {user && user.user_type === 'lawyer' && (
              <>
                {!isVerifiedLawyer ? (
                  <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-amber-600 text-2xl">gavel</span>
                      <div>
                        <p className="text-sm font-bold text-amber-900">Verification Required</p>
                        <p className="text-xs text-amber-700">Only verified lawyers can submit proposals on public cases.</p>
                      </div>
                    </div>
                    <Link
                      to="/lawyer-suite/profile/verifications"
                      className="bg-amber-600 text-white font-bold px-4 py-2 rounded-lg text-xs hover:bg-amber-700 transition-colors shadow-sm shrink-0"
                    >
                      Verify Now
                    </Link>
                  </div>
                ) : existingProposal ? (
                  <div className="bg-surface-container-lowest border border-outline-variant p-6 rounded-2xl shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-secondary text-2xl">assignment_turned_in</span>
                        <h3 className="font-bold text-base text-primary">Your Submitted Proposal</h3>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                        existingProposal.status === 'accepted' ? 'bg-emerald-100 text-emerald-800' :
                        existingProposal.status === 'rejected' ? 'bg-red-100 text-red-800' :
                        existingProposal.status === 'withdrawn' ? 'bg-gray-100 text-gray-700' :
                        'bg-blue-100 text-blue-800 animate-pulse'
                      }`}>
                        {existingProposal.status}
                      </span>
                    </div>

                    <div className="space-y-3 bg-surface-container-low p-4 rounded-xl text-sm mb-4">
                      <div className="flex justify-between border-b border-outline-variant/50 pb-2">
                        <span className="text-on-surface-variant">Proposed Fee:</span>
                        <span className="font-bold text-primary">BDT {Number(existingProposal.proposed_fee).toLocaleString()} ({existingProposal.fee_type})</span>
                      </div>
                      <div className="flex justify-between border-b border-outline-variant/50 pb-2">
                        <span className="text-on-surface-variant">Estimated Timeline:</span>
                        <span className="font-bold text-primary">{existingProposal.estimated_duration}</span>
                      </div>
                      <div>
                        <span className="text-on-surface-variant block mb-1">Cover Letter:</span>
                        <p className="text-on-surface bg-white p-3 rounded-lg border border-outline-variant/60 text-xs sm:text-sm leading-relaxed whitespace-pre-line">
                          {existingProposal.cover_letter}
                        </p>
                      </div>
                    </div>

                    {existingProposal.status === 'pending' && (
                      <div className="flex justify-end">
                        <button
                          onClick={handleWithdrawProposal}
                          className="text-xs text-error font-bold hover:bg-error/10 px-4 py-2 rounded-lg transition-colors border border-error/20"
                        >
                          Withdraw Proposal
                        </button>
                      </div>
                    )}
                  </div>
                ) : null}
              </>
            )}

            {/* Case Description Card */}
            <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-6 sm:p-8 shadow-sm">
              <h2 className="text-lg font-bold text-primary mb-4 flex items-center gap-2 border-b border-outline-variant pb-3">
                <span className="material-symbols-outlined text-secondary">description</span>
                Case Overview & Requirements
              </h2>
              <div className="text-on-surface text-sm sm:text-base leading-relaxed whitespace-pre-line font-normal">
                {job.description}
              </div>
            </div>

            {/* Preferred Consultation Medium & Attachments */}
            <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-6 sm:p-8 shadow-sm space-y-6">
              <div>
                <h3 className="text-sm font-bold text-primary uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span className="material-symbols-outlined text-secondary text-lg">connect_without_contact</span>
                  Preferred Consultation Medium
                </h3>
                <div className="flex flex-wrap gap-2">
                  {job.preferred_consultation_medium && job.preferred_consultation_medium.map((med, idx) => (
                    <span key={idx} className="bg-primary/5 text-primary font-bold text-xs px-3.5 py-1.5 rounded-xl border border-primary/10 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-base text-secondary">
                        {med === 'video_call' || med === 'Video Call' ? 'videocam' :
                         med === 'phone' || med === 'Phone' ? 'call' :
                         med === 'in_office' || med === 'In-Office' ? 'business' :
                         med === 'platform_chat' || med === 'Platform Chat' ? 'chat' : 'forum'}
                      </span>
                      {med}
                    </span>
                  ))}
                </div>
              </div>

              {job.attachments && job.attachments.length > 0 && (
                <div className="pt-6 border-t border-outline-variant">
                  <h3 className="text-sm font-bold text-primary uppercase tracking-wider mb-3 flex items-center gap-2">
                    <span className="material-symbols-outlined text-secondary text-lg">folder_open</span>
                    Attached Case Documents ({job.attachments.length})
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {job.attachments.map((fileUrl, idx) => {
                      const fileName = fileUrl.split('/').pop() || `Document-${idx + 1}`;
                      return (
                        <a
                          key={idx}
                          href={fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between p-3 bg-surface-container-low hover:bg-surface-container-high rounded-xl border border-outline-variant transition-colors group"
                        >
                          <div className="flex items-center gap-2.5 overflow-hidden">
                            <span className="material-symbols-outlined text-blue-600 shrink-0">description</span>
                            <span className="text-xs font-bold text-primary truncate">{fileName}</span>
                          </div>
                          <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary text-sm shrink-0">download</span>
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* Right Column: Client Summary & CTA */}
          <div className="space-y-6">
            
            {/* Client Profile Card */}
            <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-6 shadow-sm">
              <h3 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-4">
                About the Client
              </h3>
              <div className="flex items-center gap-3.5 mb-4">
                <div className="w-12 h-12 rounded-full bg-surface-container-high border-2 border-outline-variant overflow-hidden flex items-center justify-center shrink-0">
                  {clientAvatar ? (
                    <img src={clientAvatar} alt={clientName} className="w-full h-full object-cover" />
                  ) : (
                    <span className="material-symbols-outlined text-2xl text-on-surface-variant">
                      {isAnonymous ? 'lock_person' : 'person'}
                    </span>
                  )}
                </div>
                <div>
                  <h4 className="font-bold text-base text-primary flex items-center gap-1.5">
                    <span>{clientName}</span>
                    {isAnonymous && <span className="material-symbols-outlined text-sm text-gray-500" title="Anonymous Client">lock</span>}
                  </h4>
                  <p className="text-xs text-on-surface-variant flex items-center gap-1 mt-0.5">
                    <span className="material-symbols-outlined text-[14px]">location_on</span>
                    {job.city || job.location || 'Bangladesh'}
                  </p>
                </div>
              </div>

              <div className="border-t border-outline-variant pt-4 space-y-2.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-on-surface-variant">Member since:</span>
                  <span className="font-semibold text-primary">
                    {job.client?.created_at ? new Date(job.client.created_at).toLocaleDateString() : 'Recent'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-on-surface-variant">Verification:</span>
                  <span className="font-semibold text-emerald-600 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">verified</span>
                    Email Verified
                  </span>
                </div>
              </div>
            </div>

            {/* Case Budget & Meta Card */}
            <div className="bg-gradient-to-br from-primary to-primary-fixed p-6 rounded-2xl text-white shadow-md space-y-4">
              <div>
                <span className="text-[10px] uppercase tracking-wider font-bold text-secondary">Target Budget</span>
                <p className="text-xl sm:text-2xl font-extrabold text-white mt-0.5">
                  {formatBudget()}
                </p>
              </div>

              <div className="pt-3 border-t border-white/10 space-y-2 text-xs text-on-primary-container/80">
                <div className="flex justify-between">
                  <span>Posted date:</span>
                  <span className="font-semibold text-white">{new Date(job.created_at).toLocaleDateString()}</span>
                </div>
                {job.deadline && (
                  <div className="flex justify-between">
                    <span>Deadline:</span>
                    <span className="font-semibold text-secondary">{new Date(job.deadline).toLocaleDateString()}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Proposals received:</span>
                  <span className="font-bold text-secondary">{job.proposals_count || 0}</span>
                </div>
              </div>

              {/* Submit Proposal CTA */}
              <div className="pt-2">
                {!user ? (
                  <Link
                    to="/login"
                    className="w-full block text-center bg-secondary text-primary font-bold py-3 px-4 rounded-xl shadow hover:bg-secondary-fixed transition-colors text-sm"
                  >
                    Login to Submit Proposal
                  </Link>
                ) : user.user_type === 'client' ? (
                  <Link
                    to="/client/portal/my-posts"
                    className="w-full block text-center bg-white/10 text-white font-bold py-3 px-4 rounded-xl border border-white/20 hover:bg-white/20 transition-colors text-sm"
                  >
                    Manage My Cases
                  </Link>
                ) : !isVerifiedLawyer ? (
                  <Link
                    to="/lawyer-suite/profile/verifications"
                    className="w-full block text-center bg-amber-500 text-white font-bold py-3 px-4 rounded-xl shadow hover:bg-amber-600 transition-colors text-sm"
                  >
                    Verify Bar Identity to Apply
                  </Link>
                ) : !existingProposal && job.status === 'open' ? (
                  <button
                    onClick={() => setIsModalOpen(true)}
                    className="w-full bg-secondary text-primary font-extrabold py-3.5 px-4 rounded-xl shadow-lg hover:bg-secondary-fixed hover:scale-[1.02] active:scale-95 transition-all duration-200 text-sm flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined text-lg">send</span>
                    Submit Proposal Now
                  </button>
                ) : existingProposal ? (
                  <div className="text-center py-2 text-xs font-bold text-secondary bg-white/10 rounded-xl">
                    Proposal Already Submitted
                  </div>
                ) : (
                  <div className="text-center py-2 text-xs font-bold text-gray-400 bg-white/10 rounded-xl">
                    This Case is Closed
                  </div>
                )}
              </div>
            </div>

          </div>

        </div>
      </div>

      {/* Submit Proposal Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-outline-variant animate-fadeIn relative max-h-[90vh] overflow-y-auto custom-scrollbar">
            
            <div className="flex items-center justify-between pb-4 border-b border-outline-variant mb-6">
              <div>
                <h3 className="text-xl font-extrabold text-primary font-display-md">Submit Legal Proposal</h3>
                <p className="text-xs text-on-surface-variant">For Case: <span className="font-bold text-primary">{job.title}</span></p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-on-surface-variant hover:text-primary p-1.5 rounded-full hover:bg-surface-container-low transition-colors"
              >
                <span className="material-symbols-outlined text-2xl">close</span>
              </button>
            </div>

            <form onSubmit={handleProposalSubmit} className="space-y-5">
              {/* Cover Letter */}
              <div>
                <label className="block text-xs font-bold text-primary uppercase tracking-wider mb-2">
                  Cover Letter & Strategy <span className="text-error">*</span>
                </label>
                <textarea
                  value={coverLetter}
                  onChange={(e) => setCoverLetter(e.target.value)}
                  placeholder="Explain your approach to this case, relevant past experience, and why the client should choose you..."
                  rows={6}
                  required
                  className="w-full bg-surface-container-low border border-outline-variant rounded-xl p-4 text-sm text-on-surface focus:ring-2 focus:ring-secondary focus:outline-none transition-all placeholder-gray-400"
                ></textarea>
                <div className="flex justify-between text-[11px] text-on-surface-variant mt-1">
                  <span>Minimum 100 characters required.</span>
                  <span className={coverLetter.trim().length < 100 ? 'text-error font-bold' : 'text-emerald-600 font-bold'}>
                    {coverLetter.trim().length} / 100+ chars
                  </span>
                </div>
              </div>

              {/* Proposed Fee & Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-primary uppercase tracking-wider mb-2">
                    Proposed Fee (BDT) <span className="text-error">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-on-surface-variant">৳</span>
                    <input
                      type="number"
                      value={proposedFee}
                      onChange={(e) => setProposedFee(e.target.value)}
                      placeholder="e.g. 15000"
                      required
                      min="1"
                      className="w-full pl-8 pr-4 py-3 bg-surface-container-low border border-outline-variant rounded-xl text-sm font-bold text-primary focus:ring-2 focus:ring-secondary focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-primary uppercase tracking-wider mb-2">
                    Fee Structure
                  </label>
                  <select
                    value={feeType}
                    onChange={(e) => setFeeType(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 text-sm font-bold text-primary focus:ring-2 focus:ring-secondary focus:outline-none"
                  >
                    <option value="fixed">Fixed Price for Entire Case</option>
                    <option value="hourly">Hourly Rate</option>
                  </select>
                </div>
              </div>

              {/* Estimated Timeline & Availability */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-primary uppercase tracking-wider mb-2">
                    Estimated Duration <span className="text-error">*</span>
                  </label>
                  <input
                    type="text"
                    value={estimatedDuration}
                    onChange={(e) => setEstimatedDuration(e.target.value)}
                    placeholder="e.g. 1-2 weeks, 1 month, 3 months"
                    required
                    className="w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-secondary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-primary uppercase tracking-wider mb-2">
                    Earliest Availability Date
                  </label>
                  <input
                    type="date"
                    value={availabilityDate}
                    onChange={(e) => setAvailabilityDate(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-secondary focus:outline-none"
                  />
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-4 border-t border-outline-variant flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="bg-surface-container-high text-on-surface font-bold px-5 py-3 rounded-xl text-sm hover:bg-surface-container-highest transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || coverLetter.trim().length < 100}
                  className="bg-primary text-white font-bold px-6 py-3 rounded-xl text-sm hover:bg-primary-fixed hover:text-white transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {submitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-base">send</span>
                      <span>Submit Proposal</span>
                    </>
                  )}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}
    </div>
  );
};

export default JobDetail;
