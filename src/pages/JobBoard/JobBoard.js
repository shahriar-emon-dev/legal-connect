import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

const CATEGORIES = [
  'All Categories',
  'Criminal Law',
  'Family Law',
  'Property Law',
  'Corporate Law',
  'Civil Law',
  'Labor Law',
  'Constitutional Law',
  'Immigration Law',
  'Intellectual Property',
  'Tax Law'
];

const CATEGORY_COLORS = {
  'Criminal Law': 'bg-red-500/10 text-red-600 border-red-500/20',
  'Family Law': 'bg-pink-500/10 text-pink-600 border-pink-500/20',
  'Property Law': 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  'Corporate Law': 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  'Civil Law': 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  'Labor Law': 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  'Constitutional Law': 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20',
  'Immigration Law': 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20',
  'Intellectual Property': 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  'Tax Law': 'bg-teal-500/10 text-teal-600 border-teal-500/20',
  'default': 'bg-secondary/10 text-primary border-secondary/20'
};

const JobBoard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const [sortBy, setSortBy] = useState('newest');
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [isVerifiedLawyer, setIsVerifiedLawyer] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
    if (user && user.user_type === 'lawyer') {
      checkLawyerVerification();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    fetchJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory, sortBy, urgentOnly]);

  // Real-time subscription for live job board updates
  useEffect(() => {
    const channel = supabase
      .channel('public:job_posts_board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_posts' }, () => {
        fetchJobs();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory, sortBy, urgentOnly, searchTerm]);

  const checkLawyerVerification = async () => {
    try {
      const { data } = await supabase
        .from('lawyers')
        .select('is_verified, verification_status')
        .eq('user_id', user.id)
        .single();
      if (data && (data.is_verified || data.verification_status === 'verified' || data.verification_status === 'Approved')) {
        setIsVerifiedLawyer(true);
      }
    } catch (err) {
      console.error('Error checking verification:', err);
    }
  };

  const fetchJobs = async () => {
    try {
      setLoading(true);
      let jobsData = null;

      // 1. Try server-side full-text search procedure first (Phase 12 RPC)
      try {
        const { data: rpcData, error: rpcErr } = await supabase.rpc('search_jobs', {
          p_query: searchTerm || null,
          p_category: selectedCategory === 'All Categories' ? null : selectedCategory,
          p_status: 'open',
          p_limit: 100,
          p_offset: 0
        });

        if (!rpcErr && rpcData && rpcData.length > 0) {
          jobsData = rpcData.map(item => ({
            ...item,
            client: { name: item.client_name || 'Client', full_name: item.client_name || 'Client' }
          }));
        }
      } catch (e) {}

      // 2. Fallback to direct relational query if RPC returned no rows or errored
      if (!jobsData) {
        let query = supabase
          .from('job_posts')
          .select('*')
          .eq('status', 'open');

        if (selectedCategory && selectedCategory !== 'All Categories') {
          query = query.eq('legal_category', selectedCategory);
        }

        if (urgentOnly) {
          query = query.in('urgency', ['urgent', 'emergency']);
        }

        if (sortBy === 'newest') {
          query = query.order('created_at', { ascending: false });
        } else if (sortBy === 'proposals_high') {
          query = query.order('proposals_count', { ascending: false });
        } else if (sortBy === 'proposals_low') {
          query = query.order('proposals_count', { ascending: true });
        } else if (sortBy === 'budget_high') {
          query = query.order('budget_max', { ascending: false, nullsFirst: false });
        }

        const { data, error } = await query;
        if (error) throw error;
        jobsData = data || [];
      }

      // Safely enrich with client user info without breaking if join/RLS fails
      const clientIds = [...new Set(jobsData.map(j => j.client_id).filter(Boolean))];
      let userMap = {};
      if (clientIds.length > 0) {
        try {
          const { data: usersData } = await supabase
            .from('users')
            .select('id, full_name, avatar_url, name, profile_picture_url')
            .in('id', clientIds);
          if (usersData) {
            usersData.forEach(u => {
              userMap[u.id] = u;
            });
          }
        } catch (uErr) {
          console.warn('Could not fetch client profiles:', uErr);
        }
      }

      const enrichedJobs = jobsData.map(job => ({
        ...job,
        client: userMap[job.client_id] || { name: 'Client', full_name: 'Client' }
      }));

      setJobs(enrichedJobs);
    } catch (err) {
      console.error('Error fetching jobs:', err);
      toast.error(`Failed to load job posts: ${err.message || err.details || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchJobs();
  };

  const filteredJobs = jobs.filter(job => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const titleMatch = job.title?.toLowerCase().includes(term);
    const descMatch = job.description?.toLowerCase().includes(term);
    const locMatch = job.city?.toLowerCase().includes(term) || job.location?.toLowerCase().includes(term);
    return titleMatch || descMatch || locMatch;
  });

  const handlePostCaseClick = () => {
    if (!user) {
      toast.error('Please login to post a legal case.');
      navigate('/login');
      return;
    }
    if (user.user_type === 'lawyer') {
      toast.error('Lawyers cannot post cases. Switch to a client account.');
      return;
    }
    navigate('/client/portal/post-case');
  };

  const handleApplyClick = (jobId) => {
    if (!user) {
      toast.error('Please login to apply for this job.');
      navigate('/login');
      return;
    }
    if (user.user_type === 'client') {
      navigate(`/jobs/${jobId}`);
      return;
    }
    if (user.user_type === 'lawyer' && !isVerifiedLawyer) {
      toast.error('You must complete your lawyer verification before submitting proposals.');
      navigate('/lawyer-suite/profile/verifications');
      return;
    }
    navigate(`/jobs/${jobId}`);
  };

  const formatBudget = (job) => {
    if (job.budget_type === 'negotiable' || (!job.budget_min && !job.budget_max)) {
      return 'Negotiable / Open';
    }
    const min = job.budget_min ? Number(job.budget_min).toLocaleString() : '0';
    const max = job.budget_max ? Number(job.budget_max).toLocaleString() : '0';
    if (job.budget_type === 'hourly') {
      return `BDT ${min} - ${max} / hr`;
    }
    return `BDT ${min} - ${max} (Fixed)`;
  };

  const formatTimeAgo = (dateStr) => {
    if (!dateStr) return '';
    const diff = Math.floor((new Date() - new Date(dateStr)) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  return (
    <div className="bg-background min-h-screen pb-20 selection:bg-secondary-fixed selection:text-on-secondary-fixed">
      {/* Hero Section */}
      <section className="bg-primary text-white py-16 px-4 sm:px-6 lg:px-8 relative overflow-hidden shadow-md">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#fed977_1px,transparent_1px)] [background-size:16px_16px]"></div>
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div>
              <span className="bg-secondary/20 text-secondary border border-secondary/30 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider inline-block mb-3">
                Public Legal Marketplace
              </span>
              <h1 className="text-3xl sm:text-5xl font-extrabold font-display-md tracking-tight leading-tight">
                Find & Apply to Open <span className="text-secondary">Legal Cases</span>
              </h1>
              <p className="mt-3 text-sm sm:text-base text-on-primary-container/80 max-w-2xl font-normal">
                Clients post their legal needs publicly. Verified lawyers browse, submit tailored proposals, and connect directly to solve real legal problems.
              </p>
            </div>
            {(!user || user.user_type !== 'lawyer') && (
              <button
                onClick={handlePostCaseClick}
                className="bg-secondary text-primary font-bold px-6 py-3.5 rounded-xl shadow-lg hover:bg-secondary-fixed hover:scale-[1.02] active:scale-95 transition-all duration-200 flex items-center gap-2 text-sm sm:text-base shrink-0"
              >
                <span className="material-symbols-outlined text-xl">add_circle</span>
                Post a Case Now
              </button>
            )}
          </div>

          {/* Search Bar */}
          <form onSubmit={handleSearchSubmit} className="mt-8 max-w-3xl">
            <div className="relative flex items-center">
              <span className="material-symbols-outlined absolute left-4 text-gray-400 text-2xl">search</span>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by keyword, case title, city, or practice area..."
                className="w-full pl-12 pr-28 py-4 bg-white/10 backdrop-blur-md text-white placeholder-gray-300 border border-white/20 rounded-2xl focus:outline-none focus:ring-2 focus:ring-secondary focus:border-transparent transition-all shadow-inner text-sm sm:text-base"
              />
              <button
                type="submit"
                className="absolute right-2 bg-secondary text-primary font-bold px-5 py-2.5 rounded-xl hover:bg-secondary-fixed transition-colors text-sm shadow-md"
              >
                Search
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* Main Content & Filters */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        <div className="flex flex-col lg:flex-row gap-8 items-start">
          
          {/* Sidebar Controls (Categories & Filters) */}
          <div className="w-full lg:w-72 shrink-0 space-y-6">
            <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-base text-primary flex items-center gap-2">
                  <span className="material-symbols-outlined text-secondary">filter_list</span>
                  Filters & Sorting
                </h3>
                {(selectedCategory !== 'All Categories' || urgentOnly || searchTerm) && (
                  <button
                    onClick={() => {
                      setSelectedCategory('All Categories');
                      setUrgentOnly(false);
                      setSearchTerm('');
                      setSortBy('newest');
                    }}
                    className="text-xs text-error font-semibold hover:underline"
                  >
                    Reset
                  </button>
                )}
              </div>

              {/* Sort By Dropdown */}
              <div className="mb-6">
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">
                  Sort By
                </label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="w-full bg-surface-container-low border border-outline-variant rounded-xl px-3 py-2.5 text-sm font-medium text-on-surface focus:ring-2 focus:ring-secondary focus:outline-none"
                >
                  <option value="newest">Newest Posted</option>
                  <option value="proposals_high">Most Active (High Proposals)</option>
                  <option value="proposals_low">Fewest Proposals</option>
                  <option value="budget_high">Highest Budget</option>
                </select>
              </div>

              {/* Urgent Toggle */}
              <div className="mb-6 pt-4 border-t border-outline-variant">
                <label className="flex items-center justify-between cursor-pointer group">
                  <span className="text-sm font-bold text-on-surface flex items-center gap-2">
                    <span className="material-symbols-outlined text-error text-lg">emergency</span>
                    Show Urgent Only
                  </span>
                  <input
                    type="checkbox"
                    checked={urgentOnly}
                    onChange={(e) => setUrgentOnly(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-error relative"></div>
                </label>
              </div>

              {/* Categories List */}
              <div className="pt-4 border-t border-outline-variant">
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-3">
                  Practice Areas
                </label>
                <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1 custom-scrollbar">
                  {CATEGORIES.map((cat) => {
                    const isSelected = selectedCategory === cat;
                    return (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={`w-full text-left px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all duration-200 flex items-center justify-between ${
                          isSelected
                            ? 'bg-primary text-white font-bold shadow-sm translate-x-1'
                            : 'text-on-surface-variant hover:bg-surface-container-low hover:text-primary'
                        }`}
                      >
                        <span>{cat}</span>
                        {isSelected && <span className="material-symbols-outlined text-sm text-secondary">check</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Quick Helper Box */}
            <div className="bg-gradient-to-br from-primary to-primary-fixed p-6 rounded-2xl text-white shadow-md relative overflow-hidden">
              <span className="material-symbols-outlined text-5xl absolute -bottom-2 -right-2 text-white/10">gavel</span>
              <h4 className="font-bold text-base mb-1">Are you a Lawyer?</h4>
              <p className="text-xs text-on-primary-container/80 mb-4 leading-relaxed">
                Complete your identity and Bar Association verification to browse open jobs and submit proposals directly to prospective clients.
              </p>
              <Link
                to={user && user.user_type === 'lawyer' ? "/lawyer-suite/profile/verifications" : "/register"}
                className="inline-block bg-secondary text-primary font-bold px-4 py-2 rounded-lg text-xs hover:bg-secondary-fixed transition-colors shadow"
              >
                {user && user.user_type === 'lawyer' ? "Check Verification" : "Join as a Lawyer"}
              </Link>
            </div>
          </div>

          {/* Job Posts Feed */}
          <div className="flex-1 w-full">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-primary flex items-center gap-2">
                <span>Available Job Posts</span>
                <span className="bg-secondary/20 text-primary px-2.5 py-0.5 rounded-full text-xs font-extrabold border border-secondary/30">
                  {filteredJobs.length}
                </span>
              </h2>
              <span className="text-xs text-on-surface-variant font-medium hidden sm:inline">
                Live updating marketplace
              </span>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 bg-surface-container-lowest rounded-2xl border border-outline-variant">
                <div className="w-10 h-10 border-4 border-secondary border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-sm font-medium text-on-surface-variant">Loading legal case posts...</p>
              </div>
            ) : filteredJobs.length === 0 ? (
              <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-12 text-center shadow-sm">
                <div className="w-16 h-16 bg-surface-container-low rounded-full flex items-center justify-center mx-auto mb-4 text-on-surface-variant">
                  <span className="material-symbols-outlined text-3xl">work_off</span>
                </div>
                <h3 className="text-lg font-bold text-primary mb-2">No Open Jobs Found</h3>
                <p className="text-sm text-on-surface-variant max-w-md mx-auto mb-6">
                  {searchTerm || selectedCategory !== 'All Categories' || urgentOnly
                    ? "We couldn't find any job posts matching your current filters. Try resetting your search criteria."
                    : "There are currently no open legal cases posted on the marketplace. Be the first to post your case!"}
                </p>
                <div className="flex justify-center gap-4">
                  {(searchTerm || selectedCategory !== 'All Categories' || urgentOnly) && (
                    <button
                      onClick={() => {
                        setSelectedCategory('All Categories');
                        setUrgentOnly(false);
                        setSearchTerm('');
                      }}
                      className="bg-surface-container-high text-on-surface font-bold px-5 py-2.5 rounded-xl text-sm hover:bg-surface-container-highest transition-colors"
                    >
                      Clear Filters
                    </button>
                  )}
                  {(!user || user.user_type !== 'lawyer') && (
                    <button
                      onClick={handlePostCaseClick}
                      className="bg-secondary text-primary font-bold px-5 py-2.5 rounded-xl text-sm hover:bg-secondary-fixed transition-colors shadow-sm"
                    >
                      Post a Case
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredJobs.map((job) => {
                  const catColor = CATEGORY_COLORS[job.legal_category] || CATEGORY_COLORS['default'];
                  const isAnonymous = job.is_anonymous;
                  const clientName = isAnonymous ? 'Anonymous Client' : (job.client?.full_name || job.client?.name || 'Client');
                  const clientAvatar = isAnonymous ? null : (job.client?.avatar_url || job.client?.profile_picture_url);
                  const isUrgent = job.urgency === 'urgent' || job.urgency === 'emergency';

                  return (
                    <div
                      key={job.id}
                      className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-6 shadow-sm hover:shadow-md hover:border-secondary/50 transition-all duration-300 flex flex-col justify-between group"
                    >
                      <div>
                        {/* Top Meta: Client Info, Category Badge, Urgency */}
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-surface-container-high border border-outline-variant overflow-hidden flex items-center justify-center shrink-0">
                              {clientAvatar ? (
                                <img src={clientAvatar} alt={clientName} className="w-full h-full object-cover" />
                              ) : (
                                <span className="material-symbols-outlined text-sm text-on-surface-variant">
                                  {isAnonymous ? 'lock_person' : 'person'}
                                </span>
                              )}
                            </div>
                            <div>
                              <p className="text-xs font-bold text-primary flex items-center gap-1">
                                <span>{clientName}</span>
                                {isAnonymous && <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.2 rounded font-semibold">Private</span>}
                              </p>
                              <p className="text-[11px] text-on-surface-variant flex items-center gap-1">
                                <span className="material-symbols-outlined text-[13px]">location_on</span>
                                {job.city || job.location || 'Bangladesh'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {isUrgent && (
                              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wider flex items-center gap-1 ${
                                job.urgency === 'emergency' ? 'bg-red-600 text-white animate-pulse' : 'bg-amber-500 text-white'
                              }`}>
                                <span className="material-symbols-outlined text-[12px]">bolt</span>
                                {job.urgency}
                              </span>
                            )}
                            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${catColor}`}>
                              {job.legal_category}
                            </span>
                          </div>
                        </div>

                        {/* Title & Description */}
                        <Link to={`/jobs/${job.id}`} className="block group-hover:text-secondary transition-colors">
                          <h3 className="text-lg sm:text-xl font-bold text-primary leading-snug mb-2">
                            {job.title}
                          </h3>
                        </Link>
                        <p className="text-sm text-on-surface-variant line-clamp-2 leading-relaxed mb-4">
                          {job.description}
                        </p>

                        {/* Consultation Medium & Attachments Chips */}
                        <div className="flex flex-wrap gap-2 mb-4">
                          {job.preferred_consultation_medium && job.preferred_consultation_medium.map((med, idx) => (
                            <span key={idx} className="bg-surface-container-low text-on-surface text-[11px] font-medium px-2.5 py-1 rounded-lg border border-outline-variant/60 flex items-center gap-1">
                              <span className="material-symbols-outlined text-[13px] text-primary">
                                {med === 'video_call' || med === 'Video Call' ? 'videocam' :
                                 med === 'phone' || med === 'Phone' ? 'call' :
                                 med === 'in_office' || med === 'In-Office' ? 'business' :
                                 med === 'platform_chat' || med === 'Platform Chat' ? 'chat' : 'forum'}
                              </span>
                              {med}
                            </span>
                          ))}
                          {job.attachments && job.attachments.length > 0 && (
                            <span className="bg-blue-50 text-blue-700 text-[11px] font-medium px-2.5 py-1 rounded-lg border border-blue-200 flex items-center gap-1">
                              <span className="material-symbols-outlined text-[13px]">attach_file</span>
                              {job.attachments.length} {job.attachments.length === 1 ? 'file' : 'files'}
                            </span>
                          )}
                          {job.deadline && (
                            <span className="bg-amber-50 text-amber-700 text-[11px] font-medium px-2.5 py-1 rounded-lg border border-amber-200 flex items-center gap-1">
                              <span className="material-symbols-outlined text-[13px]">event</span>
                              Need by {new Date(job.deadline).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Bottom Footer: Budget, Proposals, CTA */}
                      <div className="pt-4 border-t border-outline-variant/60 flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-6">
                          <div>
                            <p className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant">Budget</p>
                            <p className="text-sm sm:text-base font-extrabold text-primary">
                              {formatBudget(job)}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant">Proposals</p>
                            <p className="text-sm font-extrabold text-secondary flex items-center gap-1">
                              <span className="material-symbols-outlined text-sm">group</span>
                              {job.proposals_count || 0}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="text-xs text-on-surface-variant font-medium">
                            {formatTimeAgo(job.created_at)}
                          </span>
                          <button
                            onClick={() => handleApplyClick(job.id)}
                            className="bg-primary text-white font-bold px-5 py-2.5 rounded-xl text-xs sm:text-sm hover:bg-primary-fixed hover:text-white transition-all duration-200 shadow-sm flex items-center gap-1.5 active:scale-95 group-hover:bg-secondary group-hover:text-primary"
                          >
                            <span>
                              {!user ? "Login to Apply" :
                               user.user_type === 'client' ? "View Details" :
                               !isVerifiedLawyer ? "Verify to Apply" : "View & Apply"}
                            </span>
                            <span className="material-symbols-outlined text-sm">arrow_forward</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </section>
    </div>
  );
};

export default JobBoard;
