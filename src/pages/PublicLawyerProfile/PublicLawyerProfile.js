import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import toast from 'react-hot-toast';
import StarRating from '../../components/StarRating/StarRating';
import Timeline from '../../components/Timeline/Timeline';
import styles from './PublicLawyerProfile.module.css';
import { useAuth } from '../../context/AuthContext';
import { fetchSingleLawyer } from '../../hooks/useLawyers';

// ── Helpers ───────────────────────────────────────────────────────────────────
const DEPT_COLORS = [
  { bg: '#EFF6FF', color: '#1D4ED8' }, { bg: '#F0FDF4', color: '#15803D' },
  { bg: '#FEF3C7', color: '#92400E' }, { bg: '#FDF4FF', color: '#7E22CE' },
  { bg: '#FFF1F2', color: '#BE123C' }, { bg: '#ECFDF5', color: '#065F46' },
  { bg: '#FFF7ED', color: '#C2410C' }, { bg: '#F0F9FF', color: '#0369A1' },
];
const deptColor = (name = '') => DEPT_COLORS[name.charCodeAt(0) % DEPT_COLORS.length];
const AVATAR_COLORS = ['#0F2A5E','#1E6B4A','#7E22CE','#C2410C','#0369A1','#065F46'];
const avatarBg = (name = '') => AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];

const fmtDate = (d) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

const Stars = ({ value }) => (
  <span className={styles.stars}>
    {[1,2,3,4,5].map(n => (
      <span key={n} className={value >= n ? styles.starFilled : styles.starEmpty}>★</span>
    ))}
  </span>
);

// ── Skeleton ──────────────────────────────────────────────────────────────────
const Sk = ({ w = '100%', h = 14, r = 4, mb = 0 }) => (
  <div className={styles.skShimmer}
    style={{ width: w, height: h, borderRadius: r, marginBottom: mb, display: 'block' }} />
);

const PageSkeleton = () => (
  <div className={styles.layout}>
    <div className={styles.main}>
      <div className={styles.profileHeader}>
        <div className={styles.skAvatar} />
        <div style={{ flex: 1 }}>
          <Sk w="55%" h={28} mb={10} />
          <Sk w="35%" h={14} mb={8} />
          <Sk w="45%" h={14} mb={8} />
          <Sk w="30%" h={14} />
        </div>
      </div>
      <div className={styles.card}><Sk h={14} mb={8} /><Sk h={14} mb={8} /><Sk w="70%" h={14} /></div>
      <div className={styles.card}><Sk h={14} mb={8} /><Sk h={14} mb={8} /><Sk w="80%" h={14} /></div>
    </div>
    <aside className={styles.panel}>
      <div className={styles.card}>
        <Sk h={42} mb={10} r={6} />
        <Sk h={42} r={6} />
      </div>
    </aside>
  </div>
);

// ── Review card ───────────────────────────────────────────────────────────────
const ReviewCard = ({ review }) => {
  const initials = review.client_name?.charAt(0).toUpperCase() || '?';
  return (
    <div className={styles.reviewCard}>
      <div className={styles.reviewTop}>
        <div className={styles.reviewAvatar} style={{ background: avatarBg(review.client_name) }}>
          {initials}
        </div>
        <div className={styles.reviewMeta}>
          <span className={styles.reviewerName}>{review.client_name}</span>
          <Stars value={review.rating} />
        </div>
        <span className={styles.reviewDate}>{fmtDate(review.created_at)}</span>
      </div>
      <p className={styles.reviewText}>{review.comment}</p>
      {review.lawyer_response && (
        <div className={styles.lawyerReply}>
          <span className={styles.replyLabel}>Lawyer's Response</span>
          <p>{review.lawyer_response}</p>
        </div>
      )}
    </div>
  );
};

// ── Document staging area ─────────────────────────────────────────────────────
const DocUpload = ({ lawyerUserId, contractId, isLoggedIn }) => {
  const [staged, setStaged] = useState(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef();
  const navigate = useNavigate();

  const ALLOWED = new Set(['application/pdf','application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg','image/png']);

  const handleFile = (file) => {
    if (!file) return;
    if (!ALLOWED.has(file.type)) { toast.error('Allowed: PDF, DOC, DOCX, JPG, PNG'); return; }
    if (file.size > 50 * 1024 * 1024) { toast.error('Max file size is 50 MB'); return; }
    setStaged(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    handleFile(e.dataTransfer.files[0]);
  };

  const send = async () => {
    if (!isLoggedIn) { navigate(`/login?redirect=${window.location.pathname}`); return; }
    if (!staged) return;
    setUploading(true);
    try {
      const fileExt = staged.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;
      const filePath = `case_documents/${lawyerUserId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, staged);
      if (uploadError) throw uploadError;

      // Insert a document record
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('documents').insert([{
        client_id: user.id,
        lawyer_id: lawyerUserId,
        case_id: contractId || null,
        title: staged.name,
        file_url: filePath,
      }]);

      toast.success('File sent to lawyer successfully!');
      setStaged(null);
    } catch (err) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={styles.docUpload}>
      <p className={styles.docLabel}>Upload Case Documents</p>
      <div
        className={styles.dropZone}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" hidden
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
          onChange={(e) => handleFile(e.target.files[0])} />
        {staged
          ? <span className={styles.stagedName}>📄 {staged.name} ({(staged.size/1024/1024).toFixed(1)} MB)</span>
          : <span>Drop a file here or <u>browse</u></span>
        }
      </div>
      {staged && (
        <button className={styles.sendBtn} onClick={send} disabled={uploading}>
          {uploading ? 'Sending…' : 'Send to Lawyer'}
        </button>
      )}
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────
const PublicLawyerProfile = () => {
  const { slug } = useParams();
  const navigate = useNavigate();

  const [lawyer, setLawyer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [reviews, setReviews] = useState([]);
  const [reviewsVisible, setReviewsVisible] = useState(5);
  const [updates, setUpdates] = useState([]);
  const [contract, setContract] = useState(null);

  const { user, isAuthenticated } = useAuth();
  const isLoggedIn = isAuthenticated;
  const userType = user?.user_type;
  const isClient = userType === 'client';

  // Load main profile
  useEffect(() => {
    fetchSingleLawyer(slug)
      .then((data) => {
        const mappedLawyer = {
          ...data,
          name: data.user?.name || data.users?.name || data.name || 'Lawyer',
          profile_picture_url: data.user?.profile_picture_url || data.users?.profile_picture_url || data.profile_picture_url,
          rating: data.avg_rating || 0,
          experience: `${data.experience_years || 0} years`,
          price: `BDT ${data.hourly_rate || 0}/hr`,
          departments: data.specialization ? [{ id: 1, name: data.specialization }] : [],
        };
        setLawyer(mappedLawyer);
      })
      .catch((err) => {
        console.error('Failed to load profile:', err);
        setNotFound(true);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  // Load reviews + updates in parallel after lawyer loads
  useEffect(() => {
    if (!lawyer) return;

    const fetchRelatedData = async () => {
      // Fetch reviews
      try {
        const { data } = await supabase
          .from('feedback')
          .select('*, client:users!feedback_client_id_fkey(name)')
          .eq('lawyer_id', lawyer.user_id)
          .order('created_at', { ascending: false });
        const mapped = (data || []).map(r => ({ ...r, client_name: r.client?.name || 'Client' }));
        setReviews(mapped);
      } catch (e) {
        setReviews([]);
      }

      // Fetch legal updates by this lawyer
      try {
        const { data } = await supabase
          .from('legal_updates')
          .select('*')
          .eq('author_id', lawyer.user_id)
          .order('created_at', { ascending: false })
          .limit(3);
        setUpdates(data || []);
      } catch (e) {
        setUpdates([]);
      }

      // Check for existing contract if logged in as client
      if (isLoggedIn && isClient) {
        try {
          const { data } = await supabase
            .from('contracts')
            .select('id, lawyer_id, status')
            .eq('lawyer_id', lawyer.user_id)
            .eq('status', 'active')
            .limit(1)
            .maybeSingle();
          setContract(data || null);
        } catch (e) {}
      }
    };

    fetchRelatedData();
  }, [lawyer, isLoggedIn, isClient]);

  // SEO meta tags
  useEffect(() => {
    if (!lawyer) return;
    const dept = lawyer.departments?.[0]?.name || 'Legal Services';
    document.title = `${lawyer.name} — ${dept} | LegalConnect`;
    const setMeta = (name, content, prop = false) => {
      const sel = prop ? `meta[property="${name}"]` : `meta[name="${name}"]`;
      let el = document.querySelector(sel);
      if (!el) {
        el = document.createElement('meta');
        prop ? el.setAttribute('property', name) : el.setAttribute('name', name);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };
    const desc = (lawyer.bio || '').slice(0, 155);
    setMeta('description', desc);
    setMeta('og:title', `${lawyer.name} — ${dept} | LegalConnect`, true);
    setMeta('og:description', desc, true);
    if (lawyer.profile_picture_url) setMeta('og:image', lawyer.profile_picture_url, true);
    return () => { document.title = 'LegalConnect'; };
  }, [lawyer]);

  const handleChat = () => {
    if (!isLoggedIn) { navigate(`/login?redirect=${window.location.pathname}`); return; }
    if (contract) {
      navigate(`/workspace/${contract.id}`);
    } else {
      navigate(`/client/portal/messages?lawyerId=${lawyer.user_id}`);
    }
  };

  const handleBook = () => {
    if (!isLoggedIn) { navigate(`/login?redirect=/book-appointment/${lawyer.user_id}`); return; }
    navigate(`/book-appointment/${lawyer.user_id}`);
  };

  const shareProfile = () => {
    navigator.clipboard.writeText(window.location.href)
      .then(() => toast.success('Profile link copied!'))
      .catch(() => toast.error('Could not copy link'));
  };

  if (loading) return <div className={styles.page}><PageSkeleton /></div>;

  if (notFound) return (
    <div className={styles.notFound}>
      <h2>Lawyer not found</h2>
      <p>This profile doesn't exist or has been removed.</p>
      <Link to="/lawyers" className={styles.backLink}>← Browse all lawyers</Link>
    </div>
  );

  if (!lawyer) return null;

  const primaryDept = lawyer.departments?.[0];
  const initials = lawyer.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const timelineEvents = [
    { title: `${lawyer.experience_years} years of practice`, date: '', description: lawyer.specialization },
  ].filter(e => e.title);

  return (
    <div className={styles.page}>
      <div className={styles.layout}>
        {/* ── Main content ── */}
        <div className={styles.main}>

          {/* Profile header */}
          <div className={`${styles.card} ${styles.profileHeader}`}>
            <div className={styles.picWrap}>
              {lawyer.profile_picture_url
                ? <img src={lawyer.profile_picture_url} alt={lawyer.name} className={styles.pic} />
                : <div className={styles.initials} style={{ background: avatarBg(lawyer.name) }}>{initials}</div>
              }
            </div>
            <div className={styles.headerInfo}>
              <div className={styles.nameRow}>
                <h1 className={styles.name}>{lawyer.name}</h1>
                {lawyer.is_verified
                  ? <span className={styles.verifiedBadge}>✓ Verified</span>
                  : <span className={styles.unverifiedNote}>Not yet verified</span>
                }
              </div>
              {primaryDept && (() => {
                const dc = deptColor(primaryDept.name);
                return (
                  <span className={styles.deptBadge} style={{ background: dc.bg, color: dc.color }}>
                    {primaryDept.name}
                  </span>
                );
              })()}
              <div className={styles.headerMeta}>
                {lawyer.location && <span>📍 {lawyer.location}</span>}
                {lawyer.experience && <span>🏛 {lawyer.experience}</span>}
                {lawyer.price && <span>💰 {lawyer.price}</span>}
              </div>
              <div className={styles.ratingRow}>
                <StarRating rating={lawyer.rating} />
                <span className={styles.ratingNum}>{Number(lawyer.rating).toFixed(1)}</span>
                <span className={styles.ratingCount}>({lawyer.total_reviews} reviews)</span>
              </div>
            </div>
          </div>

          {/* Stats bar */}
          <div className={`${styles.card} ${styles.statsBar}`}>
            <div className={styles.stat}>
              <strong>{lawyer.completed_cases}</strong>
              <span>Cases Completed</span>
            </div>
            <div className={styles.statDivider} />
            <div className={styles.stat}>
              <strong>{Number(lawyer.rating).toFixed(1)}</strong>
              <span>Average Rating</span>
            </div>
            <div className={styles.statDivider} />
            <div className={styles.stat}>
              <strong>{lawyer.total_reviews}</strong>
              <span>Total Reviews</span>
            </div>
          </div>

          {/* Bio */}
          {lawyer.bio && (
            <div className={styles.card}>
              <h2 className={styles.sectionHeading}>About</h2>
              <p className={styles.bioText}>{lawyer.bio}</p>
            </div>
          )}

          {/* Departments */}
          {lawyer.departments?.length > 0 && (
            <div className={styles.card}>
              <h2 className={styles.sectionHeading}>Practice Areas</h2>
              <div className={styles.deptTags}>
                {lawyer.departments.map((d, i) => {
                  const dc = deptColor(d.name);
                  return (
                    <span key={d.id} className={styles.deptTag}
                      style={{
                        background: dc.bg, color: dc.color,
                        fontWeight: i === 0 ? 700 : 500,
                        border: i === 0 ? `1.5px solid ${dc.color}` : 'none',
                      }}>
                      {d.name}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Experience timeline */}
          {timelineEvents.length > 0 && (
            <div className={styles.card}>
              <h2 className={styles.sectionHeading}>Experience</h2>
              <Timeline events={timelineEvents} />
            </div>
          )}

          {/* Reviews */}
          <div className={styles.card}>
            <h2 className={styles.sectionHeading}>Client Reviews</h2>
            {reviews.length === 0 ? (
              <p className={styles.emptyState}>
                No reviews yet — be the first to work with this lawyer.
              </p>
            ) : (
              <>
                {reviews.slice(0, reviewsVisible).map(r => <ReviewCard key={r.id} review={r} />)}
                {reviewsVisible < reviews.length && (
                  <button className={styles.loadMore}
                    onClick={() => setReviewsVisible(v => v + 5)}>
                    Load more reviews ({reviews.length - reviewsVisible} remaining)
                  </button>
                )}
              </>
            )}
          </div>

          {/* Legal updates */}
          {updates.length > 0 && (
            <div className={styles.card}>
              <h2 className={styles.sectionHeading}>Legal Updates</h2>
              <div className={styles.updatesList}>
                {updates.map(u => (
                  <div key={u.id} className={styles.updateItem}>
                    <div className={styles.updateTop}>
                      {u.category && <span className={styles.updateCat}>{u.category}</span>}
                      <span className={styles.updateDate}>{fmtDate(u.created_at)}</span>
                    </div>
                    <h4 className={styles.updateTitle}>{u.title}</h4>
                    <p className={styles.updatePreview}>
                      {u.content.length > 120 ? u.content.slice(0, 120) + '…' : u.content}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Sticky action panel ── */}
        <aside className={styles.panel}>
          <div className={styles.panelInner}>

            {/* Chat button — hidden for lawyers */}
            {userType !== 'lawyer' && (
              <button className={styles.chatBtn} onClick={handleChat}>
                <span>💬</span> Chat with Lawyer
              </button>
            )}

            {/* Book consultation */}
            <button className={styles.bookBtn} onClick={handleBook}>
              📅 Book Consultation
            </button>

            {/* Document upload */}
            <DocUpload lawyerUserId={lawyer.user_id} contractId={contract?.id} isLoggedIn={isLoggedIn} />

            {/* Contact info */}
            <div className={styles.contactCard}>
              {lawyer.location && <p>📍 {lawyer.location}</p>}
              <p className={styles.responseNote}>Typically responds within 24 hours</p>
            </div>

            {/* Share */}
            <button className={styles.shareBtn} onClick={shareProfile}>
              🔗 Share Profile
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default PublicLawyerProfile;
