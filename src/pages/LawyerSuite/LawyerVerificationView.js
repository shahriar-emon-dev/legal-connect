import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLawyerProfile } from '../../hooks/useLawyerProfile';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

const LawyerVerificationView = () => {
  const { profile, loading } = useLawyerProfile();
  const { user } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [docLoading, setDocLoading] = useState(true);
  const [uploadingDoc, setUploadingDoc] = useState(null);
  
  const fileInputRef = useRef(null);
  const [activeUploadContext, setActiveUploadContext] = useState(null);

  const fetchDocs = useCallback(async (isSilent = false) => {
    if (!user) return;
    try {
      if (!isSilent) setDocLoading(true);
      let { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('document_type', 'verification')
        .or(`uploaded_by.eq.${user.id},lawyer_id.eq.${user.id}`);

      if (error && (error.message?.includes('document_type') || error.code === '42703')) {
        const fallback = await supabase
          .from('documents')
          .select('*')
          .or(`uploaded_by.eq.${user.id},lawyer_id.eq.${user.id}`);
        data = fallback.data;
        error = fallback.error;
      }

      if (error) {
        console.error(`Supabase fetch error [Code: ${error.code}]:`, error.message, error.details || '');
        if (!isSilent) toast.error(`Error fetching documents: ${error.message}`);
      } else if (data) {
        setDocuments(data);
      }
    } catch (err) {
      console.error('Unexpected error fetching documents:', err);
    } finally {
      if (!isSilent) setDocLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  const handleDocumentUpload = async (e) => {
    if (!e.target.files || e.target.files.length === 0 || !activeUploadContext) return;
    
    const { category, docName } = activeUploadContext;
    const file = e.target.files[0];
    setUploadingDoc(docName);
    const toastId = toast.loading(`Uploading ${docName}...`);
    
    try {
      const fileExt = file.name.split('.').pop();
      const cleanDocName = docName.replace(/[^a-zA-Z0-9]/g, '-');
      const fileName = `${user.id}-${cleanDocName}-${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      // Upload to storage with upsert option enabled
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('documents')
        .getPublicUrl(filePath);

      // Optimistic instant UI update so lawyer immediately sees their uploaded file
      const optimisticDoc = {
        id: 'temp-' + Date.now(),
        client_id: user.auth_id || user.id,
        lawyer_id: user.auth_id || user.id,
        uploaded_by: user.auth_id || user.id,
        file_name: file.name,
        storage_url: publicUrl,
        file_size: file.size,
        file_type: file.type,
        category: category,
        description: docName,
        document_type: 'verification',
        created_at: new Date().toISOString()
      };

      setDocuments(prev => [optimisticDoc, ...prev.filter(d => d.description !== docName)]);

      const existingDoc = documents.find(d => d.description === docName);

      const docPayload = {
        client_id: user.auth_id || user.id,
        lawyer_id: user.auth_id || user.id,
        uploaded_by: user.auth_id || user.id,
        file_name: file.name,
        storage_url: publicUrl,
        file_size: file.size,
        file_type: file.type,
        category: category,
        description: docName,
        document_type: 'verification'
      };

      let dbResult;
      if (existingDoc && existingDoc.id && !existingDoc.id.toString().startsWith('temp-')) {
        dbResult = await supabase
          .from('documents')
          .update(docPayload)
          .eq('id', existingDoc.id);
      } else {
        dbResult = await supabase
          .from('documents')
          .insert(docPayload);
      }

      if (dbResult.error) {
        throw new Error(`Database save failed: ${dbResult.error.message}`);
      }

      // Sync legacy URL columns on lawyers table if applicable
      if (docName === 'Bar Council Certificate') {
        await supabase.from('lawyers').update({ bar_document_url: publicUrl }).eq('user_id', user.id);
        await supabase.from('lawyers').update({ bar_document_url: publicUrl }).eq('id', user.id);
      } else if (docName === 'National ID') {
        await supabase.from('lawyers').update({ nid_document_url: publicUrl }).eq('user_id', user.id);
        await supabase.from('lawyers').update({ nid_document_url: publicUrl }).eq('id', user.id);
      }

      toast.success(`${docName} uploaded successfully!`, { id: toastId });
      fetchDocs(true); // Silent background refresh
    } catch (error) {
      toast.error(`Upload error: ${error.message || 'Failed to upload document'}`, { id: toastId });
      console.error(error);
    } finally {
      setUploadingDoc(null);
      setActiveUploadContext(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmitForReview = async () => {
    try {
      const { error } = await supabase.from('lawyers')
        .update({ verification_status: 'pending' })
        .eq('user_id', user.id);
      if (error) throw error;
      toast.success('Submitted for review successfully!');
      // Assuming useLawyerProfile handles refreshing or we just update local state
      window.location.reload(); 
    } catch (err) {
      toast.error('Failed to submit for review.');
      console.error(err);
    }
  };

  const triggerUpload = (category, docName) => {
    setActiveUploadContext({ category, docName });
    fileInputRef.current?.click();
  };

  const getDocumentStatus = (docName) => {
    const doc = documents.find(d => d.description === docName);
    if (!doc) return 'Required';
    return profile?.is_verified ? 'Verified' : 'Uploaded';
  };

  const getDocumentUrl = (docName) => {
    const doc = documents.find(d => d.description === docName);
    return doc?.storage_url;
  };

  if (loading || docLoading) return <div className="p-8 text-center animate-pulse">Loading verification data...</div>;

  const identityDocs = [
    { name: 'National ID', icon: 'badge', required: true },
    { name: 'Passport', icon: 'book', required: false },
    { name: 'Driving License', icon: 'drive_eta', required: false }
  ];

  const professionalDocs = [
    { name: 'Bar Council Certificate', icon: 'gavel', desc: 'Official certificate from the State Bar verifying your active status to practice law.', required: true },
    { name: 'Chamber License', icon: 'account_balance', desc: 'Local jurisdiction approval to operate a private practice or chamber.', required: true }
  ];

  const requiredDocs = [...identityDocs, ...professionalDocs].filter(d => d.required);
  const uploadedRequiredCount = requiredDocs.filter(d => getDocumentStatus(d.name) !== 'Required').length;
  const percentComplete = requiredDocs.length === 0 ? 100 : Math.round((uploadedRequiredCount / requiredDocs.length) * 100);

  return (
    <div className="p-4 md:p-8 max-w-container-max mx-auto animate-fadeIn space-y-8">
      
      {/* Hidden file input used for all document uploads */}
      <input 
        type="file" 
        hidden 
        ref={fileInputRef} 
        accept=".pdf,image/*" 
        onChange={handleDocumentUpload} 
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-display-lg text-display-lg text-primary font-bold">Verification Center</h3>
          <p className="text-on-surface-variant font-body-md mt-1">Upload and manage documents to verify your identity and credentials.</p>
        </div>
        <button 
          onClick={handleSubmitForReview} 
          disabled={percentComplete < 100 || profile?.verification_status === 'pending' || profile?.is_verified}
          className={`px-6 py-2 rounded-lg font-label-md transition-colors shadow-sm active:scale-95 ${percentComplete === 100 && profile?.verification_status !== 'pending' && !profile?.is_verified ? 'bg-primary text-white hover:bg-secondary' : 'bg-surface-container-high text-on-surface-variant cursor-not-allowed opacity-70'}`}
        >
          {profile?.verification_status === 'pending' ? 'Pending Review' : 'Submit for Review'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Identity & Professional Verification */}
        <div className="lg:col-span-8 space-y-8">
          
          {/* Identity Verification Grid */}
          <div className="bg-surface-container-lowest p-6 md:p-8 rounded-xl border border-outline-variant shadow-sm">
            <h4 className="font-headline-sm text-headline-sm text-primary mb-6">Identity Documents</h4>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {identityDocs.map((doc, idx) => {
                const status = getDocumentStatus(doc.name);
                const isUploaded = status !== 'Required';
                const isUploading = uploadingDoc === doc.name;

                return (
                  <div key={idx} onClick={() => !isUploading && triggerUpload('Identity', doc.name)} className={`border-2 border-dashed ${isUploaded ? (status === 'Verified' ? 'border-success-green/50 bg-success-green/5' : 'border-secondary/50 bg-secondary/5') : 'border-outline-variant bg-surface-container-low hover:border-primary'} p-6 rounded-xl flex flex-col items-center justify-center text-center cursor-pointer transition-colors group relative`}>
                    <span className={`material-symbols-outlined text-[40px] mb-3 ${isUploaded ? (status === 'Verified' ? 'text-success-green' : 'text-secondary') : 'text-outline-variant group-hover:text-primary transition-colors'}`}>
                      {isUploading ? 'hourglass_empty' : doc.icon}
                    </span>
                    <h5 className="font-bold text-primary text-body-sm">{doc.name}</h5>
                    <p className={`text-[11px] font-bold uppercase tracking-widest mt-2 ${isUploading ? 'text-primary bg-primary/10 border-primary/20 animate-pulse' : isUploaded ? (status === 'Verified' ? 'text-success-green bg-white border-success-green/20' : 'text-secondary bg-white border-secondary/20') : 'text-on-surface-variant border-transparent'} px-2 py-1 rounded-full border`}>
                      {isUploading ? '⏳ Uploading...' : isUploaded ? (status === 'Verified' ? 'Verified ✓' : 'Uploaded ✓') : 'Required'}
                    </p>
                    
                    {isUploaded && !isUploading && (
                      <div className="absolute inset-0 bg-white/90 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl flex-col gap-2">
                        <button className="text-[11px] font-bold text-primary uppercase tracking-widest border-b border-primary" onClick={(e) => { e.stopPropagation(); triggerUpload('Identity', doc.name); }}>Replace</button>
                        <a href={getDocumentUrl(doc.name)} target="_blank" rel="noreferrer" className="text-[11px] font-bold text-secondary uppercase tracking-widest border-b border-secondary" onClick={(e) => e.stopPropagation()}>View</a>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Professional Verification List */}
          <div className="bg-surface-container-lowest p-6 md:p-8 rounded-xl border border-outline-variant shadow-sm">
            <h4 className="font-headline-sm text-headline-sm text-primary mb-6">Professional Verification</h4>
            
            <div className="space-y-4">
              {professionalDocs.map((doc, idx) => {
                const status = getDocumentStatus(doc.name);
                const isUploaded = status !== 'Required';
                const isUploading = uploadingDoc === doc.name;

                return (
                  <div key={idx} className="flex flex-col sm:flex-row gap-4 p-4 rounded-xl border border-outline-variant/50 relative overflow-hidden group hover:border-primary/30 transition-colors">
                    <div className={`relative z-10 p-3 text-white rounded-lg shrink-0 flex items-center justify-center h-16 w-16 ${idx === 0 ? 'bg-primary-container' : 'bg-secondary'}`}>
                      <span className="material-symbols-outlined text-[28px]">{isUploading ? 'hourglass_empty' : doc.icon}</span>
                    </div>
                    <div className="relative z-10 flex-1">
                      <div className="flex justify-between items-start mb-1">
                        <h5 className="font-bold text-primary text-body-md">{doc.name}</h5>
                        {isUploading ? (
                          <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border text-primary bg-primary/10 border-primary/20 animate-pulse">
                            ⏳ Uploading...
                          </span>
                        ) : isUploaded ? (
                          <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border ${status === 'Verified' ? 'text-success-green bg-success-green/10 border-success-green/20' : 'text-secondary bg-secondary/10 border-secondary/20'}`}>
                            {status === 'Verified' ? 'Verified ✓' : 'Uploaded (Under Review)'}
                          </span>
                        ) : (
                          <span className="text-[10px] text-error font-bold uppercase tracking-widest bg-error/10 px-2 py-0.5 rounded border border-error/20">Required</span>
                        )}
                      </div>
                      <p className="text-xs text-on-surface-variant max-w-lg mb-3">
                        {isUploading ? 'Uploading and saving your document...' : doc.desc}
                      </p>
                      <div className="flex gap-4 items-center">
                        {isUploading ? (
                          <span className="text-[11px] font-bold text-primary uppercase tracking-widest animate-pulse">Please wait...</span>
                        ) : isUploaded ? (
                          <>
                            <a href={getDocumentUrl(doc.name)} target="_blank" rel="noreferrer" className="text-[11px] font-bold text-secondary uppercase tracking-widest hover:underline flex items-center gap-1">
                              <span>View Document</span>
                              <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                            </a>
                            <button onClick={() => triggerUpload('Professional', doc.name)} className="text-[11px] font-bold text-primary uppercase tracking-widest hover:underline">Replace</button>
                          </>
                        ) : (
                          <button onClick={() => triggerUpload('Professional', doc.name)} className="text-[11px] font-bold text-primary uppercase tracking-widest hover:underline">Upload Document</button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Status & Guidelines */}
        <div className="lg:col-span-4 space-y-8 h-full">
          {/* Status Card */}
          <div className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant shadow-sm flex flex-col items-center text-center">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 ${profile?.is_verified ? 'bg-success-green/10 text-success-green' : 'bg-secondary/10 text-secondary'}`}>
              <span className="material-symbols-outlined text-[40px]">{profile?.is_verified ? 'verified' : 'pending_actions'}</span>
            </div>
            <h4 className="font-headline-sm text-body-lg text-primary font-bold mb-2">
              {profile?.is_verified ? 'Account Verified' : profile?.verification_status === 'pending' ? 'Verification In Progress' : 'Verification Pending'}
            </h4>
            <p className="text-body-sm text-on-surface-variant mb-6">
              {profile?.is_verified 
                ? 'Your identity and credentials have been verified. Your profile is visible to all clients.' 
                : profile?.verification_status === 'pending'
                ? 'Your documents are currently under review by our admin team.'
                : 'Please upload all required documents. Processing takes 1-2 business days.'}
            </p>
            {!profile?.is_verified && profile?.verification_status !== 'pending' && (
              <>
                <div className="w-full bg-surface-container rounded-full h-2">
                  <div className="bg-secondary h-2 rounded-full transition-all duration-500" style={{ width: `${percentComplete}%` }}></div>
                </div>
                <p className="text-xs font-bold text-on-surface-variant mt-2 uppercase tracking-widest">{percentComplete}% Complete</p>
              </>
            )}
          </div>

          {/* Guidelines */}
          <div className="bg-surface-container-low p-6 rounded-xl border border-outline-variant">
            <h4 className="font-headline-sm text-body-md text-primary font-bold mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary">info</span> Upload Guidelines
            </h4>
            <ul className="space-y-3 text-sm text-on-surface">
              <li className="flex items-start gap-2">
                <span className="material-symbols-outlined text-[16px] text-primary mt-0.5">check_circle</span>
                <span>Ensure all text is clearly visible and legible.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="material-symbols-outlined text-[16px] text-primary mt-0.5">check_circle</span>
                <span>Upload high-resolution scans or photos.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="material-symbols-outlined text-[16px] text-primary mt-0.5">check_circle</span>
                <span>Supported formats: PDF, JPG, PNG (Max 5MB).</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="material-symbols-outlined text-[16px] text-primary mt-0.5">check_circle</span>
                <span>Corners of the document must be visible.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LawyerVerificationView;
