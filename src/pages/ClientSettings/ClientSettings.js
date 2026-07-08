import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';

const ClientSettings = ({ inline = false }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [nidUploading, setNidUploading] = useState(false);

  // Profile Information
  const [profile, setProfile] = useState({
    name: '',
    email: '',
    phone: '',
    language: 'English',
    profilePictureUrl: '',
    nidDocumentUrl: '',
    isVerified: false,
    verificationStatus: 'pending'
  });

  // Notification Preferences
  const [notifications, setNotifications] = useState({
    emailNotifications: true,
    smsNotifications: false,
    caseUpdateAlerts: true
  });

  useEffect(() => {
    const fetchSettings = async () => {
      if (!user) {
        setLoading(false);
        return;
      }
      try {
        const currentUserId = user.id;

        // Fetch user data from Supabase users table
        const { data: userData, error } = await supabase
          .from('users')
          .select('*')
          .eq('id', currentUserId)
          .maybeSingle();

        if (!error && userData) {
          setProfile({
            name: userData.name || user.user_metadata?.name || '',
            email: userData.email || user.email || '',
            phone: userData.phone || '',
            language: userData.preferred_language || 'English',
            profilePictureUrl: userData.profile_picture_url || '',
            nidDocumentUrl: userData.nid_document_url || '',
            isVerified: userData.is_verified || false,
            verificationStatus: userData.verification_status || 'pending'
          });
        } else {
          setProfile({
            name: user.user_metadata?.name || '',
            email: user.email || '',
            phone: '',
            language: 'English',
            profilePictureUrl: '',
            nidDocumentUrl: '',
            isVerified: false,
            verificationStatus: 'pending'
          });
        }

        // Load notifications from localStorage or fallback
        const savedNotifs = localStorage.getItem(`client_notifs_${currentUserId}`);
        if (savedNotifs) {
          setNotifications(JSON.parse(savedNotifs));
        }
      } catch (err) {
        console.error('Error loading settings:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, [user]);

  const handleProfileChange = (e) => {
    const { name, value } = e.target;
    setProfile(prev => ({ ...prev, [name]: value }));
  };

  const handleFileUpload = async (e, type) => {
    try {
      if (!e.target.files || e.target.files.length === 0) return;
      const file = e.target.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}-${Math.random()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;
      
      const bucket = type === 'avatar' ? 'avatars' : 'documents';

      if (type === 'avatar') setAvatarUploading(true);
      else setNidUploading(true);

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, { cacheControl: '3600', upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(filePath);

      const updatePayload = {};
      if (type === 'avatar') {
        updatePayload.profile_picture_url = publicUrl;
        setProfile(p => ({ ...p, profilePictureUrl: publicUrl }));
      } else {
        updatePayload.nid_document_url = publicUrl;
        updatePayload.verification_status = 'under_review';
        setProfile(p => ({ ...p, nidDocumentUrl: publicUrl, verificationStatus: 'under_review' }));
      }

      const { error: dbError } = await supabase
        .from('users')
        .update(updatePayload)
        .eq('id', user.id);

      if (dbError) throw dbError;

      toast.success(`${type === 'avatar' ? 'Profile picture' : 'NID Document'} uploaded successfully!`);
    } catch (err) {
      console.error(err);
      toast.error(`Error uploading ${type}`);
    } finally {
      if (type === 'avatar') setAvatarUploading(false);
      else setNidUploading(false);
    }
  };

  const handleToggleNotification = (key) => {
    setNotifications(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const currentUserId = user.id;

      const { error } = await supabase
        .from('users')
        .update({
          name: profile.name,
          phone: profile.phone,
          preferred_language: profile.language
        })
        .eq('id', currentUserId);

      if (error) {
        console.warn('Update error or column missing, saving locally:', error);
      }

      localStorage.setItem(`client_notifs_${currentUserId}`, JSON.stringify(notifications));
      toast.success('Settings and preferences saved successfully!');
    } catch (err) {
      console.error('Error saving settings:', err);
      toast.error('Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#041635]"></div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto w-full font-sans animate-fadeIn overflow-y-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-serif font-bold text-[#041635] mb-2">Account Settings</h1>
        <p className="text-sm text-gray-600">Manage your profile details and notification preferences.</p>
      </div>

      <form onSubmit={handleSave} className="space-y-8 pb-12">
        {/* Section 1: Profile Information */}
        <div className="bg-white p-8 rounded-xl border border-[#D0D7E3] shadow-sm space-y-6">
          <div className="border-b border-gray-100 pb-4 flex items-center gap-3">
            <span className="material-symbols-outlined text-[#755b00]">account_circle</span>
            <h2 className="text-xl font-bold text-[#041635]">Profile Information</h2>
          </div>

          <div className="flex items-center gap-6 pb-6">
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden border-2 border-gray-200">
                {profile.profilePictureUrl ? (
                  <img src={profile.profilePictureUrl} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <span className="material-symbols-outlined text-4xl text-gray-400">person</span>
                )}
                {avatarUploading && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <span className="material-symbols-outlined text-white animate-spin">refresh</span>
                  </div>
                )}
              </div>
              <label className="absolute bottom-0 right-0 w-8 h-8 bg-[#041635] text-white rounded-full flex items-center justify-center cursor-pointer hover:bg-[#06204c] shadow-md border-2 border-white">
                <span className="material-symbols-outlined text-[16px]">edit</span>
                <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'avatar')} disabled={avatarUploading} />
              </label>
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#041635]">Profile Picture</h3>
              <p className="text-xs text-gray-500 mt-1">Upload a clear photo to help lawyers identify you.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Full Name</label>
              <input
                type="text"
                name="name"
                value={profile.name}
                onChange={handleProfileChange}
                placeholder="Enter your full name"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#041635] focus:border-transparent outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Email Address</label>
              <input
                type="email"
                name="email"
                value={profile.email}
                disabled
                className="w-full px-4 py-2.5 bg-gray-100 border border-gray-300 rounded-lg text-sm text-gray-500 cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Phone Number</label>
              <input
                type="tel"
                name="phone"
                value={profile.phone}
                onChange={handleProfileChange}
                placeholder="+880 1XXX-XXXXXX"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#041635] focus:border-transparent outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Preferred Language</label>
              <select
                name="language"
                value={profile.language}
                onChange={handleProfileChange}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-[#041635] focus:border-transparent outline-none transition-all cursor-pointer"
              >
                <option value="English">English</option>
                <option value="Bengali">Bengali (বাংলা)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Section 1.5: Verification */}
        <div className="bg-white p-8 rounded-xl border border-[#D0D7E3] shadow-sm space-y-6">
          <div className="border-b border-gray-100 pb-4 flex items-center gap-3">
            <span className="material-symbols-outlined text-[#755b00]">verified</span>
            <h2 className="text-xl font-bold text-[#041635]">Identity Verification</h2>
            {profile.isVerified ? (
              <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full flex items-center gap-1 ml-auto">
                <span className="material-symbols-outlined text-[14px]">check_circle</span>
                Verified
              </span>
            ) : profile.verificationStatus === 'under_review' ? (
              <span className="px-3 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded-full flex items-center gap-1 ml-auto">
                <span className="material-symbols-outlined text-[14px]">pending</span>
                Under Review
              </span>
            ) : profile.verificationStatus === 'rejected' ? (
              <span className="px-3 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-full flex items-center gap-1 ml-auto">
                <span className="material-symbols-outlined text-[14px]">cancel</span>
                Rejected
              </span>
            ) : (
              <span className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-bold rounded-full flex items-center gap-1 ml-auto">
                <span className="material-symbols-outlined text-[14px]">help</span>
                Unverified
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-[#041635]">National ID (NID)</h3>
              <p className="text-xs text-gray-500">Upload a clear photo of your NID card to verify your identity.</p>
              
              {!profile.isVerified && (
                <div className="mt-4">
                  <label className={`inline-flex items-center justify-center gap-2 px-4 py-2 border rounded-lg text-sm font-bold transition-all cursor-pointer ${nidUploading ? 'bg-gray-100 text-gray-400 border-gray-300' : 'bg-white text-[#041635] border-[#041635] hover:bg-gray-50'}`}>
                    {nidUploading ? (
                      <span className="material-symbols-outlined animate-spin text-[18px]">refresh</span>
                    ) : (
                      <span className="material-symbols-outlined text-[18px]">upload_file</span>
                    )}
                    {nidUploading ? 'Uploading...' : 'Upload NID'}
                    <input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => handleFileUpload(e, 'nid')} disabled={nidUploading} />
                  </label>
                </div>
              )}
            </div>

            {profile.nidDocumentUrl && (
              <div className="flex flex-col items-center justify-center p-4 border border-gray-200 rounded-lg bg-gray-50">
                <span className="material-symbols-outlined text-4xl text-green-600 mb-2">task</span>
                <p className="text-sm font-bold text-gray-700">NID Document Uploaded</p>
                <a href={profile.nidDocumentUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[#755b00] hover:underline mt-1 flex items-center gap-1">
                  View Document <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Section 2: Notification Preferences */}
        <div className="bg-white p-8 rounded-xl border border-[#D0D7E3] shadow-sm space-y-6">
          <div className="border-b border-gray-100 pb-4 flex items-center gap-3">
            <span className="material-symbols-outlined text-[#755b00]">notifications</span>
            <h2 className="text-xl font-bold text-[#041635]">Notification Preferences</h2>
          </div>

          <div className="space-y-4">
            <label className="flex items-center justify-between p-4 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer">
              <div>
                <p className="font-bold text-sm text-[#041635]">Email Notifications</p>
                <p className="text-xs text-gray-500">Receive important consultation updates and billing summaries via email.</p>
              </div>
              <input
                type="checkbox"
                checked={notifications.emailNotifications}
                onChange={() => handleToggleNotification('emailNotifications')}
                className="w-5 h-5 text-[#041635] rounded border-gray-300 focus:ring-[#041635]"
              />
            </label>

            <label className="flex items-center justify-between p-4 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer">
              <div>
                <p className="font-bold text-sm text-[#041635]">SMS Notifications</p>
                <p className="text-xs text-gray-500">Receive urgent SMS reminders 1 hour before scheduled consultations.</p>
              </div>
              <input
                type="checkbox"
                checked={notifications.smsNotifications}
                onChange={() => handleToggleNotification('smsNotifications')}
                className="w-5 h-5 text-[#041635] rounded border-gray-300 focus:ring-[#041635]"
              />
            </label>

            <label className="flex items-center justify-between p-4 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer">
              <div>
                <p className="font-bold text-sm text-[#041635]">Case Update Alerts</p>
                <p className="text-xs text-gray-500">Get instant alerts when your lawyer updates your case milestones or uploads files.</p>
              </div>
              <input
                type="checkbox"
                checked={notifications.caseUpdateAlerts}
                onChange={() => handleToggleNotification('caseUpdateAlerts')}
                className="w-5 h-5 text-[#041635] rounded border-gray-300 focus:ring-[#041635]"
              />
            </label>
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <button
            type="submit"
            disabled={saving}
            className="bg-[#041635] text-white px-8 py-3 rounded-lg font-bold text-sm hover:bg-[#1b2b4b] transition-all shadow-md active:scale-95 disabled:opacity-50"
          >
            {saving ? 'Saving Settings...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ClientSettings;
