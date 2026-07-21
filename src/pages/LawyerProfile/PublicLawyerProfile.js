import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import toast from 'react-hot-toast';
import { realtimeSync } from '../../services/realtimeSync.service';
import FeedbackRatings from '../FeedbackRatings/FeedbackRatings';

const PublicLawyerProfile = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [lawyer, setLawyer] = useState(null);
  const [reviewsData, setReviewsData] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('about');

  useEffect(() => {
    const fetchLawyerAndReviews = async () => {
      try {
        let lawyerData = null;

        // Try querying by ID or slug first (safest for generic strings/numbers)
        const { data: data1 } = await supabase
           .from('lawyers')
           .select('*, user:users(id, name, profile_picture_url)')
           .or(`id.eq.${slug},slug.eq.${slug}`)
           .maybeSingle();
        
        if (data1) {
           lawyerData = data1;
        } else {
           // If not found, try user_id (only if slug looks like a UUID to prevent cast errors, or just try and catch)
           try {
             const { data: data2 } = await supabase
               .from('lawyers')
               .select('*, user:users(id, name, profile_picture_url)')
               .eq('user_id', slug)
               .maybeSingle();
             if (data2) lawyerData = data2;
           } catch (e) {
             console.log("Could not query user_id", e);
           }
        }

        if (!lawyerData) {
           // navigate('/lawyers');
           setLoading(false);
           return;
        }

        setLawyer(lawyerData);

        // Fetch feedback/reviews
        if (lawyerData?.user_id) {
          const { data: revData } = await supabase
            .from('feedback')
            .select('*')
            .eq('lawyer_id', lawyerData.user_id)
            .order('created_at', { ascending: false });
          
          if (revData) {
            setReviewsData(revData);
          }

          // Fetch consultation settings
          const { data: settingsData } = await supabase
            .from('consultation_settings')
            .select('*')
            .eq('lawyer_id', lawyerData.user_id)
            .maybeSingle();
            
          if (settingsData) {
            setSettings(settingsData);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchLawyerAndReviews();
    const unsub = realtimeSync.subscribe(() => {
      fetchLawyerAndReviews();
    });
    return () => unsub();
  }, [slug, navigate]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center font-bold text-primary">Loading profile...</div>;
  }

  if (!lawyer) {
    return <div className="min-h-screen flex items-center justify-center font-bold text-error">Profile not found.</div>;
  }

  const name = lawyer.user?.name || 'Verified Lawyer';
  const profilePic = lawyer.user?.profile_picture_url;
  const spec = lawyer.specialization || 'General Practice';
  const bio = lawyer.bio || 'No professional biography provided yet.';
  const rate = settings?.hourly_rate || lawyer.hourly_rate || 'Contact for pricing';
  const exp = lawyer.experience_years || 0;
  const languages = settings?.consultation_languages?.join(', ') || 'English';
  const location = lawyer.location || 'Not Specified';

  const handlePhoneClick = () => {
    const phone = lawyer?.contact_phone || lawyer?.phone || lawyer?.user?.phone || settings?.phone_number;
    if (phone) {
      window.location.href = `tel:${phone}`;
    } else {
      toast.error('Lawyer phone number is private or not listed publicly.');
    }
  };

  const handleVideoClick = () => {
    if (lawyer?.google_meet_url || lawyer?.meeting_url) {
      window.open(lawyer.google_meet_url || lawyer.meeting_url, '_blank', 'noopener,noreferrer');
    } else {
      toast('To start a video session, schedule a consultation below.', { icon: '📹' });
    }
  };
  
  // Calculate review stats
  const totalReviews = reviewsData.length;
  const avgRating = totalReviews > 0 
    ? (reviewsData.reduce((s, r) => s + r.rating, 0) / totalReviews).toFixed(1)
    : Number(lawyer.avg_rating || 0).toFixed(1);

  return (
    <div className="bg-surface font-body-md text-on-surface">
      <style>{`
        .material-symbols-outlined { font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24; }
        .drop-zone-gradient { background-image: linear-gradient(135deg, rgba(27, 43, 75, 0.02) 0%, rgba(254, 217, 119, 0.05) 100%); }
        .timeline-line::before { content: ''; position: absolute; left: 1.5rem; top: 0; bottom: 0; width: 2px; background-color: #dce3ef; }
      `}</style>

      <main className="pt-12 pb-20 px-8 max-w-container-max mx-auto grid grid-cols-12 gap-8">
        <div className="col-span-12 lg:col-span-8 space-y-8">
          
          <section className="bg-surface-container-lowest rounded-xl border border-outline-variant p-8 shadow-sm">
            <div className="flex flex-col md:flex-row gap-8">
              <div className="relative flex-shrink-0">
                {profilePic ? (
                  <img alt="Lawyer Profile Avatar" className="w-40 h-40 rounded-lg object-cover border-2 border-surface shadow-md" src={profilePic} />
                ) : (
                  <div className="w-40 h-40 rounded-lg border-2 border-surface shadow-md bg-primary-container text-on-primary-container flex items-center justify-center text-5xl font-bold">
                    {name.substring(0, 2).toUpperCase()}
                  </div>
                )}
                {lawyer.is_verified && (
                  <div className="absolute -bottom-3 -right-3 bg-secondary-container text-on-secondary-container px-3 py-1 rounded-full flex items-center gap-1.5 shadow-sm border border-secondary text-[11px] font-bold uppercase tracking-wider">
                    <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>verified_user</span>
                    Verified
                  </div>
                )}
              </div>
              <div className="flex-grow space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="font-headline-md text-3xl font-bold text-primary">{name}</h1>
                  <span className="bg-primary-container text-on-primary-container px-3 py-1 rounded-full text-label-md font-label-md">{spec}</span>
                </div>
                <p className="text-on-surface-variant font-body-md max-w-xl line-clamp-3">{bio}</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-outline-variant">
                  <div className="text-center md:text-left">
                    <span className="block text-primary font-bold text-headline-sm">{lawyer.cases_won || 0}</span>
                    <span className="text-on-surface-variant text-label-md uppercase tracking-tighter">Cases Handled</span>
                  </div>
                  <div className="text-center md:text-left">
                    <span className="block text-primary font-bold text-headline-sm">--</span>
                    <span className="text-on-surface-variant text-label-md uppercase tracking-tighter">Success Rate</span>
                  </div>
                  <div className="text-center md:text-left">
                    <span className="block text-primary font-bold text-headline-sm">{avgRating}/5</span>
                    <span className="text-on-surface-variant text-label-md uppercase tracking-tighter">Client Reviews</span>
                  </div>
                  <div className="text-center md:text-left">
                    <span className="block text-primary font-bold text-headline-sm">{exp} Yrs</span>
                    <span className="text-on-surface-variant text-label-md uppercase tracking-tighter">Active Practice</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="border-b border-outline-variant flex gap-8 relative">
            <button 
              className={`pb-3 text-body-md relative transition-colors ${activeTab === 'about' ? 'text-secondary font-bold border-b-2 border-secondary' : 'text-on-surface-variant hover:text-primary'}`}
              onClick={() => setActiveTab('about')}
            >
              About & Practice
            </button>
            <button 
              className={`pb-3 text-body-md relative transition-colors ${activeTab === 'reviews' ? 'text-secondary font-bold border-b-2 border-secondary' : 'text-on-surface-variant hover:text-primary'}`}
              onClick={() => setActiveTab('reviews')}
            >
              Client Reviews ({totalReviews})
            </button>
          </div>

          {activeTab === 'about' && (
            <div className="space-y-8 block animate-fadeIn">
              <div className="bg-surface-container-lowest rounded-xl border border-outline-variant p-8 space-y-6">
                <h3 className="font-headline-md text-headline-md text-primary">Professional Biography</h3>
                <p className="text-on-surface-variant leading-relaxed whitespace-pre-line">
                  {bio}
                </p>
                <div className="grid md:grid-cols-2 gap-8 pt-6">
                  <div className="space-y-4">
                    <h4 className="font-headline-sm text-headline-sm text-primary flex items-center gap-2">
                      <span className="material-symbols-outlined text-secondary">gavel</span>
                      Practice Areas
                    </h4>
                    <ul className="space-y-2">
                      <li className="flex items-center gap-2 text-on-surface-variant font-body-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span> {spec}
                      </li>
                      {lawyer.departments && lawyer.departments.map(d => (
                         <li key={d.id} className="flex items-center gap-2 text-on-surface-variant font-body-sm">
                           <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span> {d.name}
                         </li>
                      ))}
                    </ul>
                  </div>
                  <div className="space-y-4">
                    <h4 className="font-headline-sm text-headline-sm text-primary flex items-center gap-2">
                      <span className="material-symbols-outlined text-secondary">school</span>
                      Education & Bar
                    </h4>
                    <div className="space-y-3">
                      <div>
                        <p className="font-bold text-primary font-body-sm">Degrees & Certification</p>
                        <p className="text-on-surface-variant text-label-md">{lawyer.education || 'No details listed'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'reviews' && (
            <div className="space-y-8 block animate-fadeIn">
              <FeedbackRatings
                lawyerUserId={lawyer?.user_id || lawyer?.id}
                lawyerName={lawyer?.full_name || lawyer?.name}
                standalone={false}
              />
            </div>
          )}
        </div>

        <aside className="col-span-12 lg:col-span-4 h-fit sticky top-24">
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-lg overflow-hidden">
            <div className="p-6 border-b border-outline-variant bg-primary-container">
              <span className="text-on-primary-container text-label-md font-label-md uppercase tracking-widest">Starting Hourly Rate</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-secondary-container font-display-lg text-4xl font-bold">
                  {typeof rate === 'number' ? `BDT ${rate}` : rate}
                </span>
                {typeof rate === 'number' && <span className="text-on-primary-container text-body-sm">/ hour</span>}
              </div>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-3 gap-2">
                <div onClick={handleVideoClick} className={`text-center p-2 rounded-lg transition-colors border cursor-pointer ${settings?.consultation_mode !== 'In-Person' ? 'border-outline-variant bg-surface-container' : 'border-transparent hover:border-outline-variant'}`}>
                  <span className={`material-symbols-outlined ${settings?.consultation_mode !== 'In-Person' ? 'text-secondary' : 'text-primary'}`}>videocam</span>
                  <span className="block text-[10px] text-on-surface-variant font-bold uppercase mt-1">Video</span>
                </div>
                <div onClick={handlePhoneClick} className={`text-center p-2 rounded-lg transition-colors border cursor-pointer ${settings?.preferred_channel === 'Phone' ? 'border-outline-variant bg-surface-container' : 'border-transparent hover:border-outline-variant'}`}>
                  <span className={`material-symbols-outlined ${settings?.preferred_channel === 'Phone' ? 'text-secondary' : 'text-primary'}`}>call</span>
                  <span className="block text-[10px] text-on-surface-variant font-bold uppercase mt-1">Phone</span>
                </div>
                <div className={`text-center p-2 rounded-lg transition-colors border cursor-pointer ${settings?.consultation_mode === 'In-Person' || settings?.consultation_mode === 'Both' ? 'border-outline-variant bg-surface-container' : 'border-transparent hover:border-outline-variant'}`}>
                  <span className={`material-symbols-outlined ${settings?.consultation_mode === 'In-Person' || settings?.consultation_mode === 'Both' ? 'text-secondary' : 'text-primary'}`}>meeting_room</span>
                  <span className="block text-[10px] text-on-surface-variant font-bold uppercase mt-1">In-Person</span>
                </div>
              </div>
              <div className="space-y-3">
                <Link 
                  to={`/client/portal/book-consultation/${lawyer?.user_id || slug}`}
                  className="w-full bg-primary text-on-primary py-3.5 rounded-lg font-bold text-body-md hover:bg-secondary transition-colors shadow-sm flex items-center justify-center gap-2 group"
                >
                  Book Consultation
                  <span className="material-symbols-outlined text-sm group-hover:translate-x-1 transition-transform">arrow_forward</span>
                </Link>
                <button onClick={() => navigate(`/client/portal/messages?initiateChat=${encodeURIComponent(lawyer?.user_id || lawyer?.id || '')}&newChat=${encodeURIComponent(lawyer?.user_id || lawyer?.id || '')}`)} className="w-full bg-surface border border-primary text-primary py-3 rounded-lg font-bold text-body-md hover:bg-surface-container-low transition-all flex items-center justify-center gap-2">
                  <span className="material-symbols-outlined text-sm">chat</span>
                  Send Quick Message
                </button>
              </div>
              
              <div className="drop-zone-gradient border-2 border-dashed border-outline-variant rounded-xl p-6 text-center group cursor-pointer hover:border-secondary transition-all">
                <span className="material-symbols-outlined text-3xl text-primary opacity-40 group-hover:opacity-100 transition-opacity">upload_file</span>
                <p className="font-headline-sm text-lg font-bold text-primary mt-2">Send Case Files</p>
                <p className="text-on-surface-variant text-label-md mt-1">Drag and drop or click to securely upload confidential documents</p>
                <div className="mt-4 flex items-center justify-center gap-1.5 text-[10px] text-on-surface-variant font-bold uppercase">
                  <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: "'FILL' 1" }}>lock</span>
                  256-Bit AES Encrypted
                </div>
              </div>
              
              <div className="space-y-4 pt-4 border-t border-outline-variant">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-secondary">schedule</span>
                  <div>
                    <p className="text-body-sm font-bold text-primary">Response Time</p>
                    <p className="text-label-md text-on-surface-variant">Usually within 4 business hours</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-secondary">language</span>
                  <div>
                    <p className="text-body-sm font-bold text-primary">Location / Languages</p>
                    <p className="text-label-md text-on-surface-variant">{location} • {languages}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
};

export default PublicLawyerProfile;
