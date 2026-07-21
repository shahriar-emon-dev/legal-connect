import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../services/supabase';
import toast from 'react-hot-toast';

const FlaggedReviews = () => {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('flagged'); // 'flagged' | 'published' | 'hidden'
  const [searchQuery, setSearchQuery] = useState('');

  const fetchReviews = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. Fetch from production `reviews` table including reports and replies
      const { data: prodData, error: prodErr } = await supabase
        .from('reviews')
        .select('*, reports:review_reports(*), replies:review_replies(*)')
        .order('created_at', { ascending: false });
      if (prodErr) console.warn('Failed to fetch reviews table:', prodErr.message);

      // 2. Fetch from legacy `feedback` table
      const { data: legacyData } = await supabase
        .from('feedback')
        .select('*')
        .order('created_at', { ascending: false });

      const allProd = prodData || [];
      const allLegacy = legacyData || [];

      // Collect user IDs to resolve names if not stored right on row
      const userIds = new Set();
      allProd.forEach(r => {
        if (r.client_id) userIds.add(r.client_id);
        if (r.lawyer_id) userIds.add(r.lawyer_id);
      });
      allLegacy.forEach(r => {
        if (r.client_id) userIds.add(r.client_id);
        if (r.lawyer_id) userIds.add(r.lawyer_id);
      });

      let userMap = {};
      if (userIds.size > 0) {
        try {
          const { data: usersData } = await supabase
            .from('users')
            .select('id, name, full_name, profile_picture_url')
            .in('id', Array.from(userIds));
          (usersData || []).forEach(u => {
            userMap[u.id] = u;
          });
        } catch (e) {
          console.warn('Could not fetch user metadata for reviews:', e);
        }
      }

      // Map production reviews
      const mappedProd = allProd.map(r => {
        const clientUser = userMap[r.client_id] || {};
        const lawyerUser = userMap[r.lawyer_id] || {};
        const isFlaggedOrReported = r.is_flagged || r.moderation_status === 'flagged' || (r.reports && r.reports.some(rep => rep.status === 'pending'));

        return {
          ...r,
          source: 'reviews',
          client_name: r.client_name || clientUser.full_name || clientUser.name || 'Client User',
          client_avatar: clientUser.profile_picture_url,
          lawyer_name: lawyerUser.full_name || lawyerUser.name || `Advocate #${r.lawyer_id ? r.lawyer_id.slice(0, 6) : 'Unknown'}`,
          computed_status: r.moderation_status || (isFlaggedOrReported ? 'flagged' : 'published'),
          is_flagged: isFlaggedOrReported
        };
      });

      // Map legacy reviews
      const mappedLegacy = allLegacy.map(r => {
        const clientUser = userMap[r.client_id] || {};
        const lawyerUser = userMap[r.lawyer_id] || {};
        return {
          ...r,
          source: 'feedback',
          client_name: r.client_name || clientUser.full_name || clientUser.name || 'Client User',
          client_avatar: clientUser.profile_picture_url,
          lawyer_name: lawyerUser.full_name || lawyerUser.name || `Advocate #${r.lawyer_id ? r.lawyer_id.slice(0, 6) : 'Unknown'}`,
          computed_status: r.is_flagged ? 'flagged' : 'published',
          reports: [],
          replies: r.lawyer_response ? [{ reply_text: r.lawyer_response, created_at: r.updated_at || r.created_at }] : []
        };
      });

      setReviews([...mappedProd, ...mappedLegacy]);
    } catch (err) {
      console.error('Error fetching admin reviews:', err);
      setError('Failed to load reviews. Check console for details.');
      toast.error('Failed to load reviews');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReviews();

    // Realtime subscriptions for admin console
    const channel = supabase.channel('admin_moderation_reviews')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews' }, () => fetchReviews())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'review_reports' }, () => fetchReviews())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'feedback' }, () => fetchReviews())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchReviews]);

  // Moderation Actions
  const handleModerateReview = async (review, newStatus) => {
    try {
      if (review.source === 'reviews') {
        const { error } = await supabase
          .from('reviews')
          .update({
            moderation_status: newStatus,
            is_flagged: newStatus === 'flagged',
            updated_at: new Date().toISOString()
          })
          .eq('id', review.id);

        if (error) throw error;

        // If approving/keeping or removing, dismiss or review pending reports
        if (review.reports && review.reports.length > 0) {
          const reportStatus = newStatus === 'published' ? 'dismissed' : 'reviewed';
          await supabase
            .from('review_reports')
            .update({ status: reportStatus })
            .eq('review_id', review.id);
        }
      } else {
        // Legacy feedback table
        const { error } = await supabase
          .from('feedback')
          .update({ is_flagged: newStatus === 'flagged' })
          .eq('id', review.id);
        if (error) throw error;
      }

      toast.success(`Review marked as ${newStatus}`);
      fetchReviews();
    } catch (err) {
      console.error('Moderation error:', err);
      toast.error(err.message || 'Failed to moderate review');
    }
  };

  const handleDeletePermanently = async (review) => {
    if (!window.confirm(`Are you sure you want to permanently delete this review from ${review.client_name}?`)) {
      return;
    }

    try {
      if (review.source === 'reviews') {
        // First delete reports & replies if not cascading
        await supabase.from('review_reports').delete().eq('review_id', review.id);
        await supabase.from('review_replies').delete().eq('review_id', review.id);
        const { error } = await supabase.from('reviews').delete().eq('id', review.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('feedback').delete().eq('id', review.id);
        if (error) throw error;
      }

      toast.success('Review permanently deleted');
      setReviews((prev) => prev.filter((r) => r.id !== review.id));
    } catch (err) {
      console.error('Delete error:', err);
      toast.error(err.message || 'Failed to delete review');
    }
  };

  // Filtering
  const filteredList = reviews.filter((r) => {
    // Tab filter
    let matchesTab = true;
    if (activeTab === 'flagged') {
      matchesTab = r.computed_status === 'flagged' || r.is_flagged;
    } else if (activeTab === 'published') {
      matchesTab = r.computed_status === 'published' && !r.is_flagged;
    } else if (activeTab === 'hidden') {
      matchesTab = r.computed_status === 'hidden' || r.computed_status === 'removed';
    }

    // Search query filter
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q ||
      (r.client_name && r.client_name.toLowerCase().includes(q)) ||
      (r.lawyer_name && r.lawyer_name.toLowerCase().includes(q)) ||
      (r.comment && r.comment.toLowerCase().includes(q));

    return matchesTab && matchesSearch;
  });

  const countByStatus = (status) => {
    if (status === 'flagged') return reviews.filter((r) => r.computed_status === 'flagged' || r.is_flagged).length;
    if (status === 'published') return reviews.filter((r) => r.computed_status === 'published' && !r.is_flagged).length;
    if (status === 'hidden') return reviews.filter((r) => r.computed_status === 'hidden' || r.computed_status === 'removed').length;
    return 0;
  };

  return (
    <div className="max-w-6xl mx-auto pb-16 px-4">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-serif font-bold text-navy-primary">Review Moderation Console</h1>
          <p className="text-gray-600 text-sm mt-1">
            Audit client reviews, resolve flagged reports, and maintain trust across the marketplace.
          </p>
        </div>

        {/* Search input */}
        <div className="w-full md:w-80">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-2.5 text-gray-400 text-sm">search</span>
            <input
              type="text"
              placeholder="Search by client, advocate, or text..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-navy-primary shadow-sm"
            />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6 gap-6">
        {[
          { id: 'flagged', label: 'Flagged & Reported', color: 'text-amber-600 border-amber-600', badge: countByStatus('flagged') },
          { id: 'published', label: 'All Published', color: 'text-emerald-600 border-emerald-600', badge: countByStatus('published') },
          { id: 'hidden', label: 'Hidden / Removed', color: 'text-slate-600 border-slate-600', badge: countByStatus('hidden') },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`pb-3 font-bold text-sm flex items-center gap-2 border-b-2 transition-all ${
              activeTab === tab.id ? `${tab.color}` : 'border-transparent text-gray-500 hover:text-navy-primary'
            }`}
          >
            <span>{tab.label}</span>
            <span className={`px-2 py-0.5 rounded-full text-xs ${activeTab === tab.id ? 'bg-navy-primary text-white' : 'bg-gray-100 text-gray-600'}`}>
              {tab.badge}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-6 relative min-h-[300px]">
        {loading && (
          <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex flex-col items-center justify-center z-10 min-h-[300px]">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-navy-primary mb-3"></div>
            <p className="text-sm font-semibold text-gray-600">Syncing reviews from Supabase Realtime...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center space-y-4 my-4">
            <span className="material-symbols-outlined text-5xl text-red-500">error_outline</span>
            <h3 className="text-xl font-bold text-navy-primary">Failed to Load Reviews</h3>
            <p className="text-gray-600 text-sm">{error}</p>
            <button
              onClick={() => fetchReviews()}
              className="px-6 py-2.5 bg-navy-primary hover:bg-navy-primary/90 text-white font-bold rounded-xl shadow transition active:scale-95"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && filteredList.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center space-y-3 shadow-sm">
            <span className="material-symbols-outlined text-5xl text-emerald-500">verified_user</span>
            <h3 className="text-lg font-bold text-navy-primary">No {activeTab} reviews</h3>
            <p className="text-sm text-gray-500 max-w-md mx-auto">
              There are no reviews currently matching the "{activeTab}" filter or search criteria.
            </p>
          </div>
        )}

        {!loading && !error && filteredList.map((review) => {
          const statusColors = {
            published: 'bg-emerald-100 text-emerald-800 border-emerald-200',
            flagged: 'bg-amber-100 text-amber-800 border-amber-200',
            hidden: 'bg-slate-100 text-slate-800 border-slate-200',
            removed: 'bg-red-100 text-red-800 border-red-200'
          };
          const badgeStyle = statusColors[review.computed_status] || statusColors.published;

          return (
            <div key={`${review.source}-${review.id}`} className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-all">
              <div className="flex flex-col md:flex-row justify-between gap-6">
                
                {/* Review Info */}
                <div className="flex gap-4 items-start flex-1">
                  <div className="w-12 h-12 rounded-full bg-navy-primary text-white flex items-center justify-center font-bold text-lg uppercase overflow-hidden flex-shrink-0">
                    {review.client_avatar ? (
                      <img src={review.client_avatar} alt={review.client_name} className="w-full h-full object-cover" />
                    ) : (
                      (review.client_name || 'C')[0]
                    )}
                  </div>

                  <div className="flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-navy-primary">{review.client_name}</h3>
                        {review.is_anonymous && (
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-semibold">Anonymous Display</span>
                        )}
                      </div>
                      <span className={`text-xs font-bold uppercase px-3 py-1 rounded-full border ${badgeStyle}`}>
                        {review.computed_status}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-sm mb-3">
                      <div className="flex text-amber-500 font-bold">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <span key={i}>{i < Number(review.rating) ? '★' : '☆'}</span>
                        ))}
                      </div>
                      <span className="text-gray-400">•</span>
                      <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                        Advocate: <strong className="text-navy-primary">{review.lawyer_name}</strong>
                      </span>
                      <span className="text-gray-400">•</span>
                      <span className="text-xs text-gray-400">{new Date(review.created_at).toLocaleDateString()}</span>
                    </div>

                    {/* Sub ratings if any */}
                    {(review.rating_communication || review.rating_professionalism || review.rating_expertise) && (
                      <div className="flex flex-wrap gap-3 bg-gray-50 px-3 py-2 rounded-lg text-xs text-gray-600 font-medium mb-3">
                        {review.rating_communication && <span>Comm: <strong>{review.rating_communication}★</strong></span>}
                        {review.rating_professionalism && <span>Prof: <strong>{review.rating_professionalism}★</strong></span>}
                        {review.rating_expertise && <span>Exp: <strong>{review.rating_expertise}★</strong></span>}
                      </div>
                    )}

                    <blockquote className="border-l-4 border-navy-primary pl-4 py-2 bg-slate-50 text-gray-700 italic text-sm rounded-r-lg mb-4">
                      "{review.comment || 'No written comment provided'}"
                    </blockquote>

                    {/* Pending Reports display */}
                    {review.reports && review.reports.length > 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs">
                        <div className="font-bold text-amber-900 mb-1 flex items-center gap-1">
                          <span>⚠️ Flagged / Reported Reasons ({review.reports.length}):</span>
                        </div>
                        <ul className="list-disc list-inside space-y-1 text-amber-800">
                          {review.reports.map((rep) => (
                            <li key={rep.id}>
                              <strong>{rep.reason || 'Reported'}:</strong> {rep.details || 'No details provided'}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Lawyer Reply if any */}
                    {review.replies && review.replies.length > 0 && (
                      <div className="bg-blue-50 border-l-4 border-blue-600 p-3 rounded-r-lg text-xs text-blue-900">
                        <strong className="block font-bold mb-1">Advocate's Response:</strong>
                        <p>{review.replies[0].reply_text}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions Panel */}
                <div className="flex flex-col justify-center gap-2 border-t md:border-t-0 md:border-l border-gray-200 pt-4 md:pt-0 md:pl-6 min-w-[180px]">
                  {review.computed_status !== 'published' && (
                    <button
                      onClick={() => handleModerateReview(review, 'published')}
                      className="w-full bg-emerald-600 text-white py-2 px-3 rounded-xl text-xs font-bold hover:bg-emerald-700 transition flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <span>✓</span> Restore / Publish
                    </button>
                  )}

                  {review.computed_status !== 'hidden' && (
                    <button
                      onClick={() => handleModerateReview(review, 'hidden')}
                      className="w-full bg-slate-600 text-white py-2 px-3 rounded-xl text-xs font-bold hover:bg-slate-700 transition flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <span>🙈</span> Hide from Profile
                    </button>
                  )}

                  {review.computed_status !== 'flagged' && (
                    <button
                      onClick={() => handleModerateReview(review, 'flagged')}
                      className="w-full bg-amber-500 text-white py-2 px-3 rounded-xl text-xs font-bold hover:bg-amber-600 transition flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <span>🚩</span> Flag Review
                    </button>
                  )}

                  <button
                    onClick={() => handleDeletePermanently(review)}
                    className="w-full bg-white border border-red-500 text-red-600 py-2 px-3 rounded-xl text-xs font-bold hover:bg-red-50 transition flex items-center justify-center gap-1.5 mt-1"
                  >
                    <span>🗑️</span> Delete Permanently
                  </button>
                </div>

              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default FlaggedReviews;
