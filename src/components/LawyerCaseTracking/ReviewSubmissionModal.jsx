import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';

const StarSelector = ({ label, value, onChange }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '10px 0' }}>
    <span style={{ fontSize: '14px', fontWeight: '600', color: '#334155' }}>{label}</span>
    <div style={{ display: 'flex', gap: '4px', cursor: 'pointer' }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          onClick={() => onChange(star)}
          style={{
            fontSize: '20px',
            color: star <= value ? '#F59E0B' : '#CBD5E1',
            transition: 'color 0.15s ease'
          }}
          title={`${star} Star${star > 1 ? 's' : ''}`}
        >
          ★
        </span>
      ))}
    </div>
  </div>
);

const ReviewSubmissionModal = ({ caseItem, contractId, lawyerId, onClose, onSuccess }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [existingReview, setExistingReview] = useState(null);

  // Form state
  const [rating, setRating] = useState(5);
  const [commRating, setCommRating] = useState(5);
  const [profRating, setProfRating] = useState(5);
  const [expRating, setExpRating] = useState(5);
  const [respRating, setRespRating] = useState(5);
  const [valRating, setValRating] = useState(5);
  const [comment, setComment] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);

  const targetLawyerId = lawyerId || caseItem?.lawyer_id || caseItem?.contract?.lawyer_id;
  const targetContractId = contractId || caseItem?.contract?.id || caseItem?.contract_id;
  const targetCaseId = caseItem?.id;

  useEffect(() => {
    const checkExistingReview = async () => {
      if (!targetContractId && !targetCaseId) {
        setLoading(false);
        return;
      }
      try {
        let query = supabase.from('reviews').select('*');
        if (targetContractId) {
          query = query.eq('contract_id', targetContractId);
        } else {
          query = query.eq('case_id', targetCaseId).eq('client_id', user?.id);
        }
        const { data, error } = await query.maybeSingle();

        if (data && !error) {
          setExistingReview(data);
          setRating(data.rating || 5);
          setCommRating(data.rating_communication || 5);
          setProfRating(data.rating_professionalism || 5);
          setExpRating(data.rating_expertise || 5);
          setRespRating(data.rating_responsiveness || 5);
          setValRating(data.rating_value || 5);
          setComment(data.comment || '');
          setIsAnonymous(Boolean(data.is_anonymous));
        }
      } catch (err) {
        console.error('Check review error:', err);
      } finally {
        setLoading(false);
      }
    };

    checkExistingReview();
  }, [targetContractId, targetCaseId, user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!rating || rating < 1 || rating > 5) {
      toast.error('Please select an overall rating of at least 1 star.');
      return;
    }
    if (!comment || comment.trim().length < 10) {
      toast.error('Please write a review comment of at least 10 characters.');
      return;
    }
    if (!targetLawyerId) {
      toast.error('Unable to identify the assigned advocate for this matter.');
      return;
    }

    setSubmitting(true);
    try {
      if (existingReview) {
        // Update existing review
        const { error: updateErr } = await supabase
          .from('reviews')
          .update({
            rating,
            rating_communication: commRating,
            rating_professionalism: profRating,
            rating_expertise: expRating,
            rating_responsiveness: respRating,
            rating_value: valRating,
            comment: comment.trim(),
            is_anonymous: isAnonymous,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingReview.id);

        if (updateErr) throw updateErr;

        // Also update legacy feedback table if present
        try {
          await supabase
            .from('feedback')
            .update({ rating, comment: comment.trim(), updated_at: new Date().toISOString() })
            .eq('contract_id', targetContractId);
        } catch (e) {}

        toast.success('Your review has been updated successfully!');
      } else {
        // Submit via secure RPC first, fallback to direct insert if RPC not applied yet
        const { error: rpcErr } = await supabase.rpc('fn_submit_review', {
          p_contract_id: targetContractId,
          p_rating: rating,
          p_comment: comment.trim(),
          p_rating_comm: commRating,
          p_rating_prof: profRating,
          p_rating_exp: expRating,
          p_rating_resp: respRating,
          p_rating_val: valRating,
          p_is_anonymous: isAnonymous,
          p_client_id: user?.id
        });

        if (rpcErr) {
          // Direct insert fallback
          const { error: insErr } = await supabase.from('reviews').insert([{
            lawyer_id: targetLawyerId,
            client_id: user?.id,
            contract_id: targetContractId || null,
            case_id: targetCaseId || null,
            rating,
            rating_communication: commRating,
            rating_professionalism: profRating,
            rating_expertise: expRating,
            rating_responsiveness: respRating,
            rating_value: valRating,
            comment: comment.trim(),
            client_name: user?.name || 'Verified Client',
            is_anonymous: isAnonymous,
            is_verified_client: true
          }]);
          if (insErr) throw insErr;
        }

        toast.success('Thank you! Your review has been submitted and published.');
      }

      if (onSuccess) onSuccess();
      if (onClose) onClose();
    } catch (err) {
      console.error('Submit review error:', err);
      toast.error(err.message || 'Failed to submit review. Please ensure the case is completed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!existingReview) return;
    if (!window.confirm('Are you sure you want to delete your review? This action cannot be undone.')) {
      return;
    }
    setSubmitting(true);
    try {
      const { error: delErr } = await supabase
        .from('reviews')
        .delete()
        .eq('id', existingReview.id);

      if (delErr) throw delErr;

      // Also clean up legacy table
      try {
        await supabase.from('feedback').delete().eq('contract_id', targetContractId);
      } catch (e) {}

      toast.success('Review deleted.');
      if (onSuccess) onSuccess();
      if (onClose) onClose();
    } catch (err) {
      console.error('Delete error:', err);
      toast.error('Failed to delete review.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
        <div style={{ background: '#fff', padding: '32px', borderRadius: '16px', textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '0 auto 12px' }} />
          <p style={{ color: '#64748B', fontWeight: 600 }}>Loading review details...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '16px' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '540px', maxHeight: '90vh', overflowY: 'auto', padding: '28px', boxShadow: '0 20px 40px rgba(0,0,0,0.25)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E2E8F0', paddingBottom: '16px', marginBottom: '20px' }}>
          <div>
            <h3 style={{ fontSize: '20px', fontWeight: '800', color: '#0F172A', margin: 0 }}>
              {existingReview ? '★ Edit Your Review & Rating' : '★ Review Your Legal Advocate'}
            </h3>
            <p style={{ fontSize: '13px', color: '#64748B', margin: '4px 0 0' }}>
              Your honest feedback helps maintain high professional standards on LegalConnect.
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#94A3B8' }}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Overall Rating Hero */}
          <div style={{ textAlign: 'center', padding: '20px', background: '#F8FAFC', borderRadius: '16px', border: '1px solid #E2E8F0', marginBottom: '20px' }}>
            <span style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Overall Rating</span>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', margin: '12px 0' }}>
              {[1, 2, 3, 4, 5].map((star) => (
                <span
                  key={star}
                  onClick={() => setRating(star)}
                  style={{
                    fontSize: '36px',
                    color: star <= rating ? '#F59E0B' : '#CBD5E1',
                    cursor: 'pointer',
                    transition: 'transform 0.15s ease'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.15)'}
                  onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
                >
                  ★
                </span>
              ))}
            </div>
            <span style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A' }}>
              {rating === 5 ? 'Excellent!' : rating === 4 ? 'Very Good' : rating === 3 ? 'Average' : rating === 2 ? 'Below Average' : 'Poor'}
            </span>
          </div>

          {/* Sub-Ratings Accordion / Box */}
          <div style={{ padding: '16px', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0', marginBottom: '20px' }}>
            <span style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#0F172A', marginBottom: '10px' }}>Detailed Breakdown</span>
            <StarSelector label="Communication & Clarity" value={commRating} onChange={setCommRating} />
            <StarSelector label="Professional Conduct" value={profRating} onChange={setProfRating} />
            <StarSelector label="Legal Expertise & Knowledge" value={expRating} onChange={setExpRating} />
            <StarSelector label="Responsiveness & Timeliness" value={respRating} onChange={setRespRating} />
            <StarSelector label="Value for Money" value={valRating} onChange={setValRating} />
          </div>

          {/* Written Comment */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '700', color: '#0F172A', marginBottom: '8px' }}>
              Written Review <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Share your detailed experience working on this matter. What went well? How did the advocate assist you?"
              rows={4}
              required
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: '10px',
                border: '1px solid #CBD5E1',
                fontSize: '14px',
                fontFamily: 'inherit',
                lineHeight: '1.5',
                color: '#334155'
              }}
            />
            <span style={{ display: 'block', fontSize: '12px', color: '#94A3B8', marginTop: '4px' }}>Minimum 10 characters</span>
          </div>

          {/* Anonymous Option */}
          <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', background: '#F1F5F9', borderRadius: '10px' }}>
            <input
              type="checkbox"
              id="is_anon"
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
            <label htmlFor="is_anon" style={{ fontSize: '13px', fontWeight: '600', color: '#334155', cursor: 'pointer', margin: 0 }}>
              Submit review anonymously (Your name will be displayed as "Verified Client (Anonymous)")
            </label>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            {existingReview && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={submitting}
                style={{
                  padding: '12px 18px',
                  background: '#FEE2E2',
                  color: '#DC2626',
                  border: 'none',
                  borderRadius: '10px',
                  fontWeight: '700',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                Delete Review
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={{
                padding: '12px 20px',
                background: '#F1F5F9',
                color: '#475569',
                border: '1px solid #E2E8F0',
                borderRadius: '10px',
                fontWeight: '700',
                fontSize: '14px',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: '12px 24px',
                background: '#0F172A',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '10px',
                fontWeight: '700',
                fontSize: '14px',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(15, 23, 42, 0.2)'
              }}
            >
              {submitting ? 'Submitting...' : (existingReview ? 'Update Review' : 'Submit Review')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ReviewSubmissionModal;
