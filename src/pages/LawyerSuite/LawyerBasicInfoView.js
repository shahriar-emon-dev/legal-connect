import React, { useState, useEffect, useRef } from 'react';
import { useLawyerProfile } from '../../hooks/useLawyerProfile';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

const LawyerBasicInfoView = () => {
  const { user, setUser } = useAuth();
  const { profile, loading, updateProfile } = useLawyerProfile();
  const [formData, setFormData] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef(null);

  // Dynamic Categories State
  const [practiceAreas, setPracticeAreas] = useState([]);
  const [allExpertise, setAllExpertise] = useState([]);
  const [selectedExpertiseIds, setSelectedExpertiseIds] = useState([]);

  useEffect(() => {
    const fetchExpertiseData = async () => {
      if (!user) return;
      try {
        const [areasRes, expRes, junctionRes] = await Promise.all([
          supabase.from('practice_areas').select('*').order('name'),
          supabase.from('legal_expertise').select('*').order('name'),
          supabase.from('lawyer_expertise_junction').select('expertise_id').eq('lawyer_id', user.id)
        ]);
        if (areasRes.data) setPracticeAreas(areasRes.data);
        if (expRes.data) setAllExpertise(expRes.data);
        if (junctionRes.data) {
          setSelectedExpertiseIds(junctionRes.data.map(j => j.expertise_id));
        }
      } catch (err) {
        console.error('Error fetching dynamic expertise:', err);
      }
    };
    fetchExpertiseData();
  }, [user]);

  // Initialize form when profile loads
  const buildFormDataFromProfile = () => profile ? {
    full_name: profile.full_name || '',
    years_experience: profile.years_experience || 0,
    bio: profile.bio || '',
    primary_location: profile.primary_location || '',
    contact_email: profile.contact_email || '',
    contact_phone: profile.contact_phone || '',
    consultation_formats: profile.consultation_formats || { inPerson: false, online: false, phone: false, video: false }
  } : {
    full_name: '',
    years_experience: 0,
    bio: '',
    primary_location: '',
    contact_email: '',
    contact_phone: '',
    consultation_formats: { inPerson: false, online: false, phone: false, video: false }
  };

  useEffect(() => {
    if (profile || !loading) {
      setFormData(buildFormDataFromProfile());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, loading]);

  // Audit #25: this used to be window.location.reload(), which threw away
  // the whole SPA state (auth context, realtime subscriptions) just to reset
  // one form. Re-derive from the already-loaded profile instead.
  const handleDiscard = () => setFormData(buildFormDataFromProfile());

  if (loading) return <div className="p-8 text-center animate-pulse">Loading profile...</div>;
  if (!formData) return null;

  const toggleExpertise = (id) => {
    setSelectedExpertiseIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSaveChanges = async () => {
    setIsSaving(true);
    const toastId = toast.loading('Saving profile & expertise...');
    try {
      // 1. Update basic profile info
      await updateProfile(formData);

      // 2. Sync dynamic expertise junction table
      const { error: delErr } = await supabase
        .from('lawyer_expertise_junction')
        .delete()
        .eq('lawyer_id', user.id);
      if (delErr) throw delErr;

      if (selectedExpertiseIds.length > 0) {
        const rows = selectedExpertiseIds.map(id => ({
          lawyer_id: user.id,
          expertise_id: id
        }));
        const { error: insErr } = await supabase
          .from('lawyer_expertise_junction')
          .insert(rows);
        if (insErr) throw insErr;
      }

      toast.success('Profile and expertise saved successfully!', { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error(`Error saving profile: ${err.message || 'Unknown error'}`, { id: toastId });
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const toggleConsultation = (type) => {
    setFormData(prev => ({
      ...prev,
      consultation_formats: {
        ...prev.consultation_formats,
        [type]: !prev.consultation_formats[type]
      }
    }));
  };

  const handleAvatarUpload = async (e) => {
    try {
      if (!e.target.files || e.target.files.length === 0) return;
      const file = e.target.files[0];
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image size exceeds 5MB limit.');
        return;
      }
      const allowed = ['jpg', 'jpeg', 'png', 'webp'];
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (!ext || !allowed.includes(ext)) {
        toast.error('Unsupported image format. Please use JPG, PNG, or WEBP.');
        return;
      }
      setUploadingAvatar(true);
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}-${Math.random()}.${fileExt}`;
      const filePath = `public/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      // Save the avatar to the users table
      const { error: dbError } = await supabase
        .from('users')
        .update({ profile_picture_url: publicUrl })
        .eq('id', user.id);

      if (dbError) throw dbError;

      toast.success('Profile picture updated successfully!');
      
      // Update local state without relying on useLawyerProfile upsert which might fail
      // if avatar_url column doesn't exist yet
      setFormData(prev => ({ ...prev, avatar_url: publicUrl }));
      // We mutate the profile object temporarily just to make the UI update immediately
      if (profile) profile.avatar_url = publicUrl; 
      // Update global auth context so the layout navbar updates immediately
      if (setUser) {
        setUser(prev => ({ ...prev, profile_picture_url: publicUrl }));
      }

    } catch (error) {
      toast.error(error.message || 'Error uploading avatar!');
      console.error(error);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateProfile(formData);
      
      // Update the name in the users table so it reflects globally
      const { error: dbError } = await supabase
        .from('users')
        .update({ name: formData.full_name })
        .eq('id', user.id);
        
      if (dbError) throw dbError;

      // Update global context so the layout updates immediately
      if (setUser) {
        setUser(prev => ({ ...prev, full_name: formData.full_name }));
      }

      toast.success('Profile saved successfully!');
    } catch (err) {
      toast.error(err.message || 'Error saving profile');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-container-max mx-auto animate-fadeIn">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
        <div>
          <h3 className="font-display-lg text-display-lg text-primary font-bold">Basic Information</h3>
          <p className="text-on-surface-variant font-body-md mt-1">Update your professional identity and contact details.</p>
        </div>
        <div className="flex gap-3">
          <button className="px-6 py-2 border border-primary text-primary rounded-lg font-label-md hover:bg-surface-container-low transition-colors active:scale-95" onClick={handleDiscard}>Discard</button>
          <button className="px-6 py-2 bg-primary text-white rounded-lg font-label-md hover:bg-secondary transition-colors shadow-sm active:scale-95" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
        {/* Left Column: Avatar & Support Card */}
        <div className="md:col-span-4 space-y-6">
          <div className="bg-surface-container-lowest p-8 rounded-xl border border-outline-variant shadow-sm flex flex-col items-center">
            <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
              <input 
                type="file" 
                hidden 
                ref={fileInputRef} 
                accept="image/*" 
                onChange={handleAvatarUpload} 
                disabled={uploadingAvatar}
              />
              <div className={`w-48 h-48 rounded-full border-4 border-surface-container overflow-hidden shadow-inner flex items-center justify-center bg-surface-container-high text-on-surface-variant ${uploadingAvatar ? 'opacity-50' : ''}`}>
                {(profile?.avatar_url || user?.profile_picture_url) ? (
                  <img alt="Profile Avatar" className="w-full h-full object-cover" src={profile?.avatar_url || user?.profile_picture_url}/>
                ) : (
                  <span className="material-symbols-outlined text-[64px]">person</span>
                )}
              </div>
              <button disabled={uploadingAvatar} className="absolute bottom-2 right-2 p-3 bg-secondary-container text-primary rounded-full shadow-lg hover:scale-110 transition-transform active:scale-95">
                <span className="material-symbols-outlined" data-icon="photo_camera">{uploadingAvatar ? 'hourglass_empty' : 'photo_camera'}</span>
              </button>
            </div>
            <div className="mt-6 flex flex-col items-center gap-2">
              {profile?.is_verified ? (
                <div className="flex items-center gap-1.5 px-4 py-1.5 bg-success-green/15 text-success-green rounded-full border border-success-green/20">
                  <span className="material-symbols-outlined text-[18px] filled-icon">verified</span>
                  <span className="font-label-md text-[11px] font-bold uppercase tracking-wider">Verified Professional</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-4 py-1.5 bg-surface-container text-on-surface-variant rounded-full border border-outline-variant">
                  <span className="font-label-md text-[11px] font-bold uppercase tracking-wider">Unverified</span>
                </div>
              )}
              {profile?.created_at && (
                <p className="text-body-sm text-on-surface-variant text-center px-4 mt-2">
                  Member since {new Date(profile.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                </p>
              )}
            </div>
          </div>

          <div className="bg-primary p-6 rounded-xl text-white shadow-lg overflow-hidden relative group">
            <div className="relative z-10">
              <h4 className="font-headline-sm text-headline-sm mb-2 font-bold text-secondary-fixed">Need assistance?</h4>
              <p className="text-body-sm opacity-90 mb-6 text-on-primary-container leading-relaxed">Our dedicated account managers are available for premium profile optimization.</p>
              <button className="w-full py-2.5 bg-secondary-container text-primary font-bold rounded-lg hover:bg-white transition-colors active:scale-95">Contact Support</button>
            </div>
            <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:scale-110 transition-transform duration-500">
              <span className="material-symbols-outlined text-[140px] filled-icon">support_agent</span>
            </div>
          </div>
        </div>

        {/* Right Column: Details Form & Consultation Types */}
        <div className="md:col-span-8 space-y-8">
          <div className="bg-surface-container-lowest p-6 md:p-8 rounded-xl border border-outline-variant shadow-sm">
            <h4 className="font-headline-md text-headline-sm text-primary mb-6 border-b border-outline-variant pb-3">Professional Details</h4>
            
            <form className="grid grid-cols-1 md:grid-cols-2 gap-6" onSubmit={(e) => e.preventDefault()}>
              <div className="space-y-1.5 gold-glow rounded-lg">
                <label className="text-body-sm font-bold text-on-surface-variant block">Full Name</label>
                <input type="text" name="full_name" value={formData.full_name} onChange={handleChange} placeholder="e.g. Alexander Sterling" className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary text-on-surface" />
              </div>
              
              <div className="space-y-1.5 gold-glow rounded-lg">
                <label className="text-body-sm font-bold text-on-surface-variant block">Years of Experience</label>
                <input type="number" name="years_experience" value={formData.years_experience} onChange={handleChange} min="0" className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary text-on-surface" />
              </div>
              
              <div className="md:col-span-2 space-y-1.5 gold-glow rounded-lg">
                <label className="text-body-sm font-bold text-on-surface-variant block">Professional Bio</label>
                <textarea rows="4" name="bio" value={formData.bio} onChange={handleChange} placeholder="Describe your expertise..." className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary text-on-surface resize-none"></textarea>
              </div>

              <div className="md:col-span-2 space-y-1.5 gold-glow rounded-lg">
                <label className="text-body-sm font-bold text-on-surface-variant block">Primary Location</label>
                <input type="text" name="primary_location" value={formData.primary_location} onChange={handleChange} placeholder="e.g. Manhattan, New York" className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary text-on-surface" />
              </div>

              <div className="space-y-1.5 gold-glow rounded-lg">
                <label className="text-body-sm font-bold text-on-surface-variant block">Email Address</label>
                <input type="email" name="contact_email" value={formData.contact_email} onChange={handleChange} placeholder="Contact email" className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary text-on-surface" />
              </div>

              <div className="space-y-1.5 gold-glow rounded-lg">
                <label className="text-body-sm font-bold text-on-surface-variant block">Phone Number</label>
                <input type="tel" name="contact_phone" value={formData.contact_phone} onChange={handleChange} placeholder="Phone number" className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary text-on-surface" />
              </div>
            </form>
          </div>

          <div className="bg-surface-container-lowest p-6 md:p-8 rounded-xl border border-outline-variant shadow-sm">
            <h4 className="font-headline-md text-headline-sm text-primary mb-2">Consultation Formats</h4>
            <p className="text-body-sm text-on-surface-variant mb-6">Select how you prefer to conduct initial client consultations.</p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Toggle Card 1 */}
              <div 
                onClick={() => toggleConsultation('inPerson')}
                className={`p-4 rounded-lg border-2 cursor-pointer transition-all flex items-center justify-between group ${formData.consultation_formats.inPerson ? 'border-secondary-fixed bg-secondary-fixed/5' : 'border-outline-variant bg-surface-container-low/30 hover:border-outline'}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${formData.consultation_formats.inPerson ? 'bg-secondary-fixed text-on-secondary-fixed' : 'bg-surface-container-high text-on-surface-variant'}`}>
                    <span className="material-symbols-outlined">meeting_room</span>
                  </div>
                  <div>
                    <h5 className="font-bold text-primary text-body-sm">In-Person</h5>
                    <p className="text-[11px] text-on-surface-variant">At your registered office</p>
                  </div>
                </div>
                <div className={`w-10 h-6 rounded-full p-1 transition-colors ${formData.consultation_formats.inPerson ? 'bg-primary' : 'bg-outline-variant'}`}>
                  <div className={`w-4 h-4 rounded-full bg-white transition-transform ${formData.consultation_formats.inPerson ? 'translate-x-4' : 'translate-x-0'}`}></div>
                </div>
              </div>

              {/* Toggle Card 2 */}
              <div 
                onClick={() => toggleConsultation('video')}
                className={`p-4 rounded-lg border-2 cursor-pointer transition-all flex items-center justify-between group ${formData.consultation_formats.video ? 'border-secondary-fixed bg-secondary-fixed/5' : 'border-outline-variant bg-surface-container-low/30 hover:border-outline'}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${formData.consultation_formats.video ? 'bg-secondary-fixed text-on-secondary-fixed' : 'bg-surface-container-high text-on-surface-variant'}`}>
                    <span className="material-symbols-outlined">videocam</span>
                  </div>
                  <div>
                    <h5 className="font-bold text-primary text-body-sm">Video Call</h5>
                    <p className="text-[11px] text-on-surface-variant">Zoom, Google Meet</p>
                  </div>
                </div>
                <div className={`w-10 h-6 rounded-full p-1 transition-colors ${formData.consultation_formats.video ? 'bg-primary' : 'bg-outline-variant'}`}>
                  <div className={`w-4 h-4 rounded-full bg-white transition-transform ${formData.consultation_formats.video ? 'translate-x-4' : 'translate-x-0'}`}></div>
                </div>
              </div>

              {/* Toggle Card 3 */}
              <div 
                onClick={() => toggleConsultation('phone')}
                className={`p-4 rounded-lg border-2 cursor-pointer transition-all flex items-center justify-between group ${formData.consultation_formats.phone ? 'border-secondary-fixed bg-secondary-fixed/5' : 'border-outline-variant bg-surface-container-low/30 hover:border-outline'}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${formData.consultation_formats.phone ? 'bg-secondary-fixed text-on-secondary-fixed' : 'bg-surface-container-high text-on-surface-variant'}`}>
                    <span className="material-symbols-outlined">call</span>
                  </div>
                  <div>
                    <h5 className="font-bold text-primary text-body-sm">Phone Call</h5>
                    <p className="text-[11px] text-on-surface-variant">Direct mobile or landline</p>
                  </div>
                </div>
                <div className={`w-10 h-6 rounded-full p-1 transition-colors ${formData.consultation_formats.phone ? 'bg-primary' : 'bg-outline-variant'}`}>
                  <div className={`w-4 h-4 rounded-full bg-white transition-transform ${formData.consultation_formats.phone ? 'translate-x-4' : 'translate-x-0'}`}></div>
                </div>
              </div>

              {/* Toggle Card 4 */}
              <div 
                onClick={() => toggleConsultation('online')}
                className={`p-4 rounded-lg border-2 cursor-pointer transition-all flex items-center justify-between group ${formData.consultation_formats.online ? 'border-secondary-fixed bg-secondary-fixed/5' : 'border-outline-variant bg-surface-container-low/30 hover:border-outline'}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${formData.consultation_formats.online ? 'bg-secondary-fixed text-on-secondary-fixed' : 'bg-surface-container-high text-on-surface-variant'}`}>
                    <span className="material-symbols-outlined">chat</span>
                  </div>
                  <div>
                    <h5 className="font-bold text-primary text-body-sm">Online Chat</h5>
                    <p className="text-[11px] text-on-surface-variant">LegalConnect secure messaging</p>
                  </div>
                </div>
                <div className={`w-10 h-6 rounded-full p-1 transition-colors ${formData.consultation_formats.online ? 'bg-primary' : 'bg-outline-variant'}`}>
                  <div className={`w-4 h-4 rounded-full bg-white transition-transform ${formData.consultation_formats.online ? 'translate-x-4' : 'translate-x-0'}`}></div>
                </div>
              </div>
            </div>
          </div>

          {/* Dynamic Practice Areas & Subcategory Expertise Selection */}
          <div className="bg-surface-container-lowest p-6 md:p-8 rounded-xl border border-outline-variant shadow-sm">
            <h4 className="font-headline-md text-headline-sm text-primary mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary-fixed">workspace_premium</span>
              Practice Areas & Specialized Expertise
            </h4>
            <p className="text-body-sm text-on-surface-variant mb-6">Select your primary practice areas and specific legal subcategories to appear in client search results.</p>

            {practiceAreas.length === 0 ? (
              <div className="p-6 bg-surface-container-low rounded-lg text-center text-on-surface-variant text-sm">
                No practice areas configured yet. Admins can create categories in the Admin Dashboard.
              </div>
            ) : (
              <div className="space-y-6">
                {practiceAreas.map(area => {
                  const subs = allExpertise.filter(exp => exp.practice_area_id === area.id);
                  return (
                    <div key={area.id} className="border border-outline-variant rounded-xl p-5 bg-surface-container-low/40">
                      <div className="flex items-center gap-2 font-serif font-bold text-primary text-md pb-3 border-b border-outline-variant/60 mb-3">
                        <span className="text-secondary-fixed">⚖️</span>
                        {area.name}
                      </div>
                      {subs.length === 0 ? (
                        <p className="text-xs text-on-surface-variant italic">No subcategories defined under this practice area.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2.5">
                          {subs.map(sub => {
                            const isSelected = selectedExpertiseIds.includes(sub.id);
                            return (
                              <button
                                key={sub.id}
                                type="button"
                                onClick={() => toggleExpertise(sub.id)}
                                className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 border ${
                                  isSelected
                                    ? 'bg-navy-primary text-white border-navy-primary shadow-sm scale-105'
                                    : 'bg-white text-on-surface border-outline-variant hover:border-secondary hover:bg-secondary/5'
                                }`}
                              >
                                {isSelected && <span>✓</span>}
                                <span>{sub.name}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Save Action Bar */}
          <div className="flex justify-end pt-4">
            <button
              type="button"
              onClick={handleSaveChanges}
              disabled={isSaving}
              className="px-8 py-3 bg-navy-primary text-white font-bold rounded-xl hover:bg-navy-secondary transition shadow-lg active:scale-95 disabled:opacity-50 flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
                  Saving Changes...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[20px]">save</span>
                  Save Profile & Expertise
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LawyerBasicInfoView;

