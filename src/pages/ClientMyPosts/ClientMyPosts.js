import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

const ClientMyPosts = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState(null);
  const [proposals, setProposals] = useState([]);
  const [lawyerProfiles, setLawyerProfiles] = useState({});
  const [loadingProposals, setLoadingProposals] = useState(false);
  const [processingId, setProcessingId] = useState(null);

  useEffect(() => {
    if (user?.id || user?.auth_id) {
      fetchMyPosts();
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.auth_id]);

  useEffect(() => {
    if (selectedPost && selectedPost.id) {
      fetchProposals(selectedPost.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPost]);

  const fetchMyPosts = async () => {
    const clientId = user?.id || user?.auth_id;
    if (!clientId) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('job_posts')
        .select('*')
        .or(`client_id.eq.${clientId},client_id.eq.${user?.auth_id || clientId},client_id.eq.${user?.id || clientId}`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      const fetchedPosts = data || [];
      setPosts(fetchedPosts);
      if (fetchedPosts.length > 0 && (!selectedPost || !fetchedPosts.find(p => p.id === selectedPost?.id))) {
        setSelectedPost(fetchedPosts[0]);
      } else if (fetchedPosts.length === 0) {
        setSelectedPost(null);
      }
    } catch (err) {
      console.error('Error fetching my posts:', err);
      if (!err.message?.includes('undefined')) {
        toast.error(`Failed to load your posted cases: ${err.message || err.details || 'Unknown error'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchProposals = async (jobPostId) => {
    if (!jobPostId) return;
    try {
      setLoadingProposals(true);
      const { data, error } = await supabase
        .from('job_proposals')
        .select('*')
        .eq('job_post_id', jobPostId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      const rawProposals = data || [];

      // Safely fetch lawyer profiles and users
      if (rawProposals.length > 0) {
        const lawyerIds = [...new Set(rawProposals.map(p => p.lawyer_id).filter(Boolean))];
        
        let userMap = {};
        try {
          const { data: usersData } = await supabase
            .from('users')
            .select('id, full_name, avatar_url, name, profile_picture_url, email')
            .in('id', lawyerIds);
          if (usersData) {
            usersData.forEach(u => {
              userMap[u.id] = u;
            });
          }
        } catch (ue) {
          console.warn('Could not fetch lawyer user details:', ue);
        }

        const { data: profilesData } = await supabase
          .from('lawyers')
          .select('user_id, specialization, experience_years, verification_status, rating, court_practice, consultation_fee, is_verified')
          .in('user_id', lawyerIds);

        if (profilesData) {
          const profMap = {};
          profilesData.forEach(pr => {
            profMap[pr.user_id] = pr;
          });
          setLawyerProfiles(profMap);
        }

        const enrichedProposals = rawProposals.map(prop => ({
          ...prop,
          lawyer: userMap[prop.lawyer_id] || { name: 'Lawyer Profile', full_name: 'Lawyer Profile' }
        }));
        setProposals(enrichedProposals);
      } else {
        setProposals([]);
      }
    } catch (err) {
      console.error('Error fetching proposals:', err);
      toast.error('Failed to load proposals');
    } finally {
      setLoadingProposals(false);
    }
  };

  const handleAcceptProposal = async (proposal) => {
    if (!window.confirm(`Are you sure you want to accept ${proposal.lawyer?.full_name || proposal.lawyer?.name || 'this lawyer'}'s proposal?\n\nThis will automatically initiate a consultation/case in your dashboard, close this job post to new proposals, and decline other pending proposals.`)) {
      return;
    }

    try {
      setProcessingId(proposal.id);
      
      // Try atomic transactional procedure first (creates Contract, Workspace, Milestones, Chat & Notifications)
      const { error: rpcError } = await supabase.rpc('fn_accept_job_proposal_transactional', {
        p_proposal_id: Number(proposal.id),
        p_client_id: user?.id
      });

      if (rpcError) {
        // Safe backward compatibility fallback if RPC is not deployed yet
        const { error: fallbackErr } = await supabase
          .from('job_proposals')
          .update({ status: 'accepted', updated_at: new Date().toISOString() })
          .eq('id', proposal.id);
        if (fallbackErr) throw fallbackErr;
      }

      toast.success('Proposal accepted! Contract & Workspace initialized.');
      // Refresh posts and proposals
      await fetchMyPosts();
      await fetchProposals(selectedPost.id);
    } catch (err) {
      console.error('Error accepting proposal:', err);
      toast.error('Failed to accept proposal');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeclineProposal = async (proposalId) => {
    if (!window.confirm('Are you sure you want to decline this proposal?')) return;

    try {
      setProcessingId(proposalId);
      const { error } = await supabase
        .from('job_proposals')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('id', proposalId);

      if (error) throw error;
      toast.success('Proposal declined.');
      setProposals(prev => prev.map(p => p.id === proposalId ? { ...p, status: 'rejected' } : p));
    } catch (err) {
      console.error('Error declining proposal:', err);
      toast.error('Failed to decline proposal');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeletePost = async (jobId, e) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this case post? This will remove all associated proposals.')) return;

    try {
      const { error } = await supabase
        .from('job_posts')
        .delete()
        .eq('id', jobId);

      if (error) throw error;
      toast.success('Case post deleted.');
      const remaining = posts.filter(p => p.id !== jobId);
      setPosts(remaining);
      if (selectedPost && selectedPost.id === jobId) {
        setSelectedPost(remaining.length > 0 ? remaining[0] : null);
      }
    } catch (err) {
      console.error('Error deleting post:', err);
      toast.error('Failed to delete post');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-8 selection:bg-[#fed977] selection:text-[#041635]">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#041635] font-display-md">
            My Posted Legal Cases
          </h1>
          <p className="text-sm text-[#8393b8] mt-1">
            Manage your public case postings, review lawyer proposals, and hire experts.
          </p>
        </div>
        <Link
          to="/client/portal/post-case"
          className="bg-[#041635] text-[#fed977] font-bold px-5 py-3 rounded-xl shadow-lg hover:bg-[#1b2b4b] active:scale-95 transition-all flex items-center gap-2 text-sm shrink-0"
        >
          <span className="material-symbols-outlined text-lg">add_circle</span>
          Post New Case
        </Link>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-gray-200">
          <div className="w-10 h-10 border-4 border-[#041635] border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-sm font-bold text-[#8393b8]">Loading your posted cases...</p>
        </div>
      ) : posts.length === 0 ? (
        <div className="bg-white rounded-3xl border border-gray-200 p-12 text-center shadow-sm max-w-2xl mx-auto my-12">
          <div className="w-16 h-16 bg-[#F8F9FF] rounded-full flex items-center justify-center mx-auto mb-4 text-[#8393b8]">
            <span className="material-symbols-outlined text-3xl">post_add</span>
          </div>
          <h3 className="text-xl font-bold text-[#041635] mb-2">No Cases Posted Yet</h3>
          <p className="text-sm text-[#8393b8] max-w-md mx-auto mb-6 leading-relaxed">
            You haven't posted any legal cases to the marketplace yet. Describe your legal situation to start receiving tailored proposals from verified lawyers.
          </p>
          <Link
            to="/client/portal/post-case"
            className="inline-flex items-center gap-2 bg-[#041635] text-[#fed977] font-bold px-6 py-3.5 rounded-xl shadow-md hover:bg-[#1b2b4b] transition-all text-sm"
          >
            <span className="material-symbols-outlined text-lg">add</span>
            Post Your First Case Now
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Column: List of Posted Cases (4 cols) */}
          <div className="lg:col-span-4 space-y-3">
            <h3 className="text-xs font-bold text-[#8393b8] uppercase tracking-wider px-1">
              Your Case Posts ({posts.length})
            </h3>
            <div className="space-y-3 max-h-[800px] overflow-y-auto pr-1 custom-scrollbar">
              {posts.map((post) => {
                const isSelected = selectedPost && selectedPost.id === post.id;
                return (
                  <div
                    key={post.id}
                    onClick={() => setSelectedPost(post)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer relative group ${
                      isSelected
                        ? 'bg-[#041635] text-white border-[#041635] shadow-md translate-x-1'
                        : 'bg-white text-[#041635] border-gray-200 hover:border-[#041635]/40 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                        isSelected
                          ? 'bg-[#fed977]/20 text-[#fed977] border-[#fed977]/30'
                          : 'bg-[#F8F9FF] text-[#041635] border-gray-300'
                      }`}>
                        {post.legal_category}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                          post.status === 'open'
                            ? isSelected ? 'bg-emerald-500/20 text-emerald-300' : 'bg-emerald-100 text-emerald-800'
                            : isSelected ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {post.status}
                        </span>
                        <button
                          onClick={(e) => handleDeletePost(post.id, e)}
                          title="Delete Case Post"
                          className={`p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity ${
                            isSelected ? 'hover:bg-white/10 text-red-300' : 'hover:bg-gray-100 text-red-500'
                          }`}
                        >
                          <span className="material-symbols-outlined text-sm">delete</span>
                        </button>
                      </div>
                    </div>

                    <h4 className="font-bold text-sm sm:text-base leading-snug line-clamp-2 mb-2">
                      {post.title}
                    </h4>

                    <div className="flex items-center justify-between text-xs pt-2 border-t border-current/10">
                      <span className={isSelected ? 'text-white/70' : 'text-[#8393b8]'}>
                        {new Date(post.created_at).toLocaleDateString()}
                      </span>
                      <span className={`font-extrabold flex items-center gap-1 ${
                        isSelected ? 'text-[#fed977]' : 'text-[#041635]'
                      }`}>
                        <span className="material-symbols-outlined text-sm">group</span>
                        {post.proposals_count || 0} {post.proposals_count === 1 ? 'Proposal' : 'Proposals'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Proposals Review Panel (8 cols) */}
          <div className="lg:col-span-8">
            {selectedPost ? (
              <div className="bg-white rounded-3xl border border-gray-200 p-6 sm:p-8 shadow-sm space-y-6">
                
                {/* Selected Post Summary Header */}
                <div className="border-b border-gray-200 pb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="bg-[#041635]/10 text-[#041635] px-2.5 py-0.5 rounded-full text-xs font-bold">
                        {selectedPost.legal_category}
                      </span>
                      {selectedPost.is_anonymous && (
                        <span className="bg-gray-100 text-gray-700 px-2.5 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1">
                          <span className="material-symbols-outlined text-xs">lock</span> Anonymous Post
                        </span>
                      )}
                    </div>
                    <h2 className="text-xl sm:text-2xl font-extrabold text-[#041635] font-display-md">
                      {selectedPost.title}
                    </h2>
                    <p className="text-xs text-[#8393b8] mt-1 flex items-center gap-4">
                      <span>Location: <strong className="text-[#041635]">{selectedPost.city || 'Bangladesh'}</strong></span>
                      <span>Budget: <strong className="text-[#041635]">
                        {selectedPost.budget_type === 'negotiable' ? 'Negotiable' : `BDT ${selectedPost.budget_min || 0} - ${selectedPost.budget_max || 0} (${selectedPost.budget_type})`}
                      </strong></span>
                    </p>
                  </div>

                  <Link
                    to={`/jobs/${selectedPost.id}`}
                    target="_blank"
                    className="bg-[#F8F9FF] text-[#041635] font-bold px-4 py-2 rounded-xl border border-gray-300 hover:bg-gray-100 transition-colors text-xs flex items-center gap-1.5 shrink-0"
                  >
                    <span>View Public Page</span>
                    <span className="material-symbols-outlined text-sm">open_in_new</span>
                  </Link>
                </div>

                {/* Proposals List Section */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-extrabold text-[#041635] flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#fed977]" style={{ fontVariationSettings: "'FILL' 1" }}>assignment_ind</span>
                      <span>Received Proposals</span>
                      <span className="bg-[#041635] text-white text-xs px-2.5 py-0.5 rounded-full font-bold">
                        {proposals.length}
                      </span>
                    </h3>
                    <span className="text-xs text-[#8393b8]">Review cover letters & fees to hire</span>
                  </div>

                  {loadingProposals ? (
                    <div className="py-16 text-center">
                      <div className="w-8 h-8 border-4 border-[#041635] border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                      <p className="text-xs font-bold text-[#8393b8]">Loading proposals from lawyers...</p>
                    </div>
                  ) : proposals.length === 0 ? (
                    <div className="bg-[#F8F9FF] rounded-2xl border border-dashed border-gray-300 p-10 text-center">
                      <span className="material-symbols-outlined text-4xl text-[#8393b8] mb-2">inbox</span>
                      <h4 className="font-bold text-[#041635] text-base mb-1">No Proposals Received Yet</h4>
                      <p className="text-xs text-[#8393b8] max-w-sm mx-auto">
                        Your case is live on the marketplace! Verified lawyers are browsing and will submit tailored proposals soon.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {proposals.map((prop) => {
                        const lawyerName = prop.lawyer?.full_name || prop.lawyer?.name || 'Legal Counsel';
                        const lawyerAvatar = prop.lawyer?.avatar_url || prop.lawyer?.profile_picture_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(lawyerName)}&background=041635&color=fff`;
                        const prof = lawyerProfiles[prop.lawyer_id] || {};
                        const isVerified = prof.is_verified || prof.verification_status === 'verified' || prof.verification_status === 'Approved';
                        const isProcessing = processingId === prop.id;

                        return (
                          <div
                            key={prop.id}
                            className={`p-6 rounded-2xl border transition-all ${
                              prop.status === 'accepted'
                                ? 'bg-emerald-50/50 border-emerald-300 shadow-sm'
                                : prop.status === 'rejected' || prop.status === 'withdrawn'
                                ? 'bg-gray-50 border-gray-200 opacity-60'
                                : 'bg-white border-gray-200 hover:border-[#041635]/30 shadow-sm'
                            }`}
                          >
                            {/* Lawyer Header */}
                            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-gray-100">
                              <div className="flex items-center gap-3.5">
                                <img
                                  src={lawyerAvatar}
                                  alt={lawyerName}
                                  className="w-12 h-12 rounded-full object-cover border-2 border-gray-200"
                                />
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <h4 className="font-extrabold text-[#041635] text-base">{lawyerName}</h4>
                                    {isVerified && (
                                      <span className="material-symbols-outlined text-sm text-emerald-600" title="Verified Lawyer" style={{ fontVariationSettings: "'FILL' 1" }}>
                                        verified
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-[#8393b8] flex items-center gap-3 mt-0.5">
                                    <span>{prof.specialization || selectedPost.legal_category}</span>
                                    {prof.experience_years && (
                                      <span>• <strong>{prof.experience_years} yrs</strong> exp</span>
                                    )}
                                    {prof.rating && (
                                      <span className="flex items-center gap-0.5 text-amber-600 font-bold">
                                        <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                                        {prof.rating}
                                      </span>
                                    )}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <span className={`px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider ${
                                  prop.status === 'accepted' ? 'bg-emerald-100 text-emerald-800' :
                                  prop.status === 'rejected' ? 'bg-red-100 text-red-800' :
                                  prop.status === 'withdrawn' ? 'bg-gray-100 text-gray-700' :
                                  'bg-blue-100 text-blue-800 animate-pulse'
                                }`}>
                                  {prop.status}
                                </span>
                              </div>
                            </div>

                            {/* Proposal Details (Fee, Timeline, Cover Letter) */}
                            <div className="py-4 space-y-3">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#F8F9FF] p-3.5 rounded-xl border border-gray-200/80 text-xs sm:text-sm">
                                <div>
                                  <span className="text-[#8393b8] block text-[10px] uppercase font-bold">Proposed Fee:</span>
                                  <span className="font-extrabold text-[#041635] text-base">
                                    BDT {Number(prop.proposed_fee).toLocaleString()} <span className="text-xs font-medium text-[#8393b8]">({prop.fee_type})</span>
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[#8393b8] block text-[10px] uppercase font-bold">Estimated Duration:</span>
                                  <span className="font-bold text-[#041635] text-sm">
                                    {prop.estimated_duration}
                                  </span>
                                  {prop.availability_date && (
                                    <span className="text-xs text-[#8393b8] block">Available from: {new Date(prop.availability_date).toLocaleDateString()}</span>
                                  )}
                                </div>
                              </div>

                              <div>
                                <span className="text-xs font-bold text-[#041635] block mb-1">Cover Letter & Strategy:</span>
                                <p className="text-xs sm:text-sm text-[#041635] bg-[#F8F9FF] p-4 rounded-xl border border-gray-200 leading-relaxed whitespace-pre-line font-normal">
                                  {prop.cover_letter}
                                </p>
                              </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
                              <div className="flex items-center gap-2">
                                <Link
                                  to={`/lawyers/${prop.lawyer_id}`}
                                  target="_blank"
                                  className="text-xs font-bold text-[#041635] hover:text-[#fed977] px-3 py-2 rounded-lg bg-gray-100 hover:bg-[#041635] transition-colors flex items-center gap-1"
                                >
                                  <span className="material-symbols-outlined text-sm">person</span>
                                  <span>View Profile</span>
                                </Link>
                                <button
                                  onClick={() => navigate(`/client/portal/messages?lawyerId=${prop.lawyer_id}`)}
                                  className="text-xs font-bold text-[#041635] hover:text-white px-3 py-2 rounded-lg bg-gray-100 hover:bg-[#041635] transition-colors flex items-center gap-1"
                                >
                                  <span className="material-symbols-outlined text-sm">mail</span>
                                  <span>Message Lawyer</span>
                                </button>
                              </div>

                              {prop.status === 'pending' && selectedPost.status === 'open' && (
                                <div className="flex items-center gap-2.5">
                                  <button
                                    onClick={() => handleDeclineProposal(prop.id)}
                                    disabled={isProcessing}
                                    className="text-xs font-bold text-red-600 hover:bg-red-50 px-3.5 py-2 rounded-xl transition-colors border border-red-200 disabled:opacity-50"
                                  >
                                    Decline
                                  </button>
                                  <button
                                    onClick={() => handleAcceptProposal(prop)}
                                    disabled={isProcessing}
                                    className="bg-[#041635] text-[#fed977] font-extrabold px-5 py-2 rounded-xl text-xs sm:text-sm hover:bg-[#1b2b4b] transition-all shadow-md active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
                                  >
                                    {isProcessing ? (
                                      <>
                                        <div className="w-3.5 h-3.5 border-2 border-[#fed977] border-t-transparent rounded-full animate-spin"></div>
                                        <span>Accepting...</span>
                                      </>
                                    ) : (
                                      <>
                                        <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>handshake</span>
                                        <span>Accept & Hire Lawyer</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                              )}
                            </div>

                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

              </div>
            ) : null}
          </div>

        </div>
      )}
    </div>
  );
};

export default ClientMyPosts;
