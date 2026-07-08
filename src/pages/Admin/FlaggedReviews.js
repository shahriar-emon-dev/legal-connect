import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import toast from 'react-hot-toast';

const FlaggedReviews = () => {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchFlaggedReviews();
  }, []);

  const fetchFlaggedReviews = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('feedback')
        .select('*')
        .eq('is_flagged', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      const rawReviews = data || [];

      let userMap = {};
      if (rawReviews.length > 0) {
        const userIds = [...new Set([
          ...rawReviews.map(r => r.client_id).filter(Boolean),
          ...rawReviews.map(r => r.lawyer_id).filter(Boolean)
        ])];
        if (userIds.length > 0) {
          let usersData = []; try { const r = await supabase.from('users').select('id, name, full_name, profile_picture_url').in('id', userIds); usersData = r.data || []; } catch (e) {}
          usersData.forEach(u => { userMap[u.id] = u; });
        }
      }

      const enrichedReviews = rawReviews.map(rev => ({
        ...rev,
        client: userMap[rev.client_id] || { name: 'Client User' },
        lawyer: userMap[rev.lawyer_id] || { name: 'Lawyer User' }
      }));
      setReviews(enrichedReviews);
    } catch (err) {
      console.error('Error fetching reviews:', err);
      setError('Failed to load flagged reviews. Please check your network connection.');
      toast.error('Failed to load flagged reviews');
    } finally {
      setLoading(false);
    }
  };

  const handleKeepReview = async (id) => {
    try {
      const { error } = await supabase
        .from('feedback')
        .update({ is_flagged: false })
        .eq('id', id);

      if (error) throw error;
      
      toast.success('Review flag removed');
      
      // Fade out effect by mapping and removing
      setReviews(reviews.filter(r => r.id !== id));
    } catch (err) {
      console.error(err);
      toast.error('Failed to unflag review');
    }
  };

  const handleDeleteReview = async (id) => {
    if (!window.confirm('Are you sure you want to permanently delete this review?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('feedback')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      toast.success('Review deleted permanently');
      
      setReviews(reviews.filter(r => r.id !== id));
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete review');
    }
  };

  return (
    <div className="max-w-4xl mx-auto pb-12">
      <h1 className="text-3xl font-serif font-bold text-navy-primary mb-8">Flagged Reviews</h1>

      <div className="flex flex-col gap-6 relative min-h-[300px]">
        {loading && (
          <div className="absolute inset-0 bg-bg-light/50 backdrop-blur-sm flex items-center justify-center z-10 min-h-[300px]">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-navy-primary"></div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center space-y-4 my-4">
            <span className="material-symbols-outlined text-5xl text-red-500">error_outline</span>
            <h3 className="text-xl font-bold text-navy-primary">Failed to Load Reviews</h3>
            <p className="text-gray-600 text-sm">{error}</p>
            <button 
              onClick={() => { setLoading(true); setError(null); fetchFlaggedReviews(); }}
              className="px-6 py-2.5 bg-navy-primary hover:bg-navy-primary/90 text-white font-bold rounded-xl shadow transition active:scale-95"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && reviews.length === 0 && (
          <div className="bg-surface-white rounded-xl border border-border-subtle p-12 text-center space-y-3 shadow-sm">
            <span className="material-symbols-outlined text-5xl text-success-green">verified_user</span>
            <h3 className="text-lg font-bold text-navy-primary">No Flagged Reviews</h3>
            <p className="text-sm text-gray-500 max-w-md mx-auto">All clear! There are no client or lawyer feedback reviews currently pending moderation or dispute resolution.</p>
          </div>
        )}

        {!loading && !error && reviews.map(review => (
          <div key={review.id} className="bg-surface-white rounded-lg border border-border-subtle p-6 shadow-sm transition-all duration-300">
            <div className="flex flex-col md:flex-row justify-between gap-6">
              
              {/* Review Info */}
              <div className="flex gap-4 items-start w-full md:w-2/3">
                <div className="w-12 h-12 rounded-full bg-navy-primary text-white flex items-center justify-center font-bold text-lg uppercase overflow-hidden flex-shrink-0">
                  {review.client?.profile_picture_url ? (
                    <img src={review.client.profile_picture_url} alt={review.client.name} className="w-full h-full object-cover" />
                  ) : (
                    (review.client?.name || 'C')[0]
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-base font-bold text-navy-primary">{review.client?.name || 'Unknown Client'}</h3>
                    <span className="text-text-muted text-sm">•</span>
                    <div className="flex text-accent-gold text-sm">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <span key={i}>{i < review.rating ? '★' : '☆'}</span>
                      ))}
                    </div>
                  </div>
                  
                  <div className="text-xs text-text-muted mb-4 uppercase tracking-wider font-semibold">
                    Reviewed Lawyer: <span className="text-navy-primary">{review.lawyer?.name || 'Unknown Lawyer'}</span>
                  </div>

                  <blockquote className="border-l-4 border-danger-red pl-4 py-1 bg-red-50 text-text-dark italic text-sm rounded-r-md">
                    "{review.comment || 'No comment provided'}"
                  </blockquote>
                  
                  <div className="text-xs text-text-muted mt-4">
                    Flagged on: {new Date(review.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col justify-center gap-3 border-t md:border-t-0 md:border-l border-border-subtle pt-4 md:pt-0 md:pl-6 min-w-[160px]">
                <button 
                  onClick={() => handleKeepReview(review.id)}
                  className="w-full bg-success-green text-white py-2 rounded-md text-sm font-semibold hover:bg-success-green/90 transition-colors flex items-center justify-center gap-2"
                >
                  <span>✓</span> Keep Review
                </button>
                <button 
                  onClick={() => handleDeleteReview(review.id)}
                  className="w-full bg-white border border-danger-red text-danger-red py-2 rounded-md text-sm font-semibold hover:bg-danger-red hover:text-white transition-colors flex items-center justify-center gap-2"
                >
                  <span>🗑️</span> Delete Review
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FlaggedReviews;
