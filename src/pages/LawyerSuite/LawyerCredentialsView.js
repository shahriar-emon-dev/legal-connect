import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center animate-fadeIn">
      <div className="bg-surface p-6 rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-slideUp">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-primary">{title}</h2>
          <button onClick={onClose} className="text-on-surface-variant hover:text-error">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

const LawyerCredentialsView = () => {
  const { user } = useAuth();
  const [credentials, setCredentials] = useState({ education: [], certification: [] });
  const [verifications, setVerifications] = useState({ bar_registration: null, court_admissions: [] });
  const [loading, setLoading] = useState(true);

  // Modal states
  const [isCredModalOpen, setIsCredModalOpen] = useState(false);
  const [credType, setCredType] = useState('education'); // 'education' or 'certification'
  const [isVerifModalOpen, setIsVerifModalOpen] = useState(false);
  const [verifType, setVerifType] = useState('bar_registration'); // 'bar_registration' or 'court_admission'

  // Form states
  const [credForm, setCredForm] = useState({ title: '', institution: '', year_issued: '' });
  const [verifForm, setVerifForm] = useState({ license_number: '', authority_name: '', issue_date: '', expiry_date: '', is_primary: false });

  const fetchAll = useCallback(async () => {
    const lawyerId = user?.id || user?.auth_id;
    if (!lawyerId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [credRes, verRes] = await Promise.all([
        supabase.from('credentials').select('*').or(`lawyer_id.eq.${lawyerId},lawyer_id.eq.${user?.auth_id || lawyerId}`),
        supabase.from('verifications').select('*').or(`lawyer_id.eq.${lawyerId},lawyer_id.eq.${user?.auth_id || lawyerId}`)
      ]);

      if (credRes.data) {
        setCredentials({
          education: credRes.data.filter(c => c.credential_type === 'education'),
          certification: credRes.data.filter(c => c.credential_type === 'certification')
        });
      }
      
      if (verRes.data) {
        setVerifications({
          bar_registration: verRes.data.find(v => v.verification_type === 'bar_registration') || null,
          court_admissions: verRes.data.filter(v => v.verification_type === 'court_admission')
        });
      }
    } catch (err) {
      console.error('Error loading credentials/verifications:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user?.id || user?.auth_id) {
      fetchAll();
    } else {
      setLoading(false);
    }
  }, [user?.id, user?.auth_id, fetchAll]);

  const handleCredSubmit = async (e) => {
    e.preventDefault();
    try {
      const cleanCredForm = { ...credForm };
      if (!cleanCredForm.year_issued || cleanCredForm.year_issued.toString().trim() === '') {
        cleanCredForm.year_issued = null;
      } else {
        cleanCredForm.year_issued = parseInt(cleanCredForm.year_issued, 10);
      }
      const { error } = await supabase.from('credentials').insert([{
        lawyer_id: user.auth_id || user.id,
        credential_type: credType,
        ...cleanCredForm
      }]);
      if (error) throw error;
      toast.success(`${credType === 'education' ? 'Education' : 'Certification'} added successfully!`);
      setIsCredModalOpen(false);
      setCredForm({ title: '', institution: '', year_issued: '' });
      fetchAll();
    } catch (err) {
      toast.error(`Failed to add credential: ${err.message || ''}`);
      console.error(err);
    }
  };

  const handleVerifSubmit = async (e) => {
    e.preventDefault();
    try {
      const cleanVerifForm = { ...verifForm };
      if (!cleanVerifForm.expiry_date || cleanVerifForm.expiry_date.trim() === '') {
        cleanVerifForm.expiry_date = null;
      }
      if (!cleanVerifForm.issue_date || cleanVerifForm.issue_date.trim() === '') {
        cleanVerifForm.issue_date = null;
      }

      if (verifType === 'bar_registration' && verifications.bar_registration) {
        // Update existing primary bar
        const { error } = await supabase.from('verifications')
          .update({ ...cleanVerifForm, is_primary: true })
          .eq('id', verifications.bar_registration.id);
        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase.from('verifications').insert([{
          lawyer_id: user.auth_id || user.id,
          verification_type: verifType,
          ...cleanVerifForm,
          is_primary: verifType === 'bar_registration' // enforce primary for bar registration
        }]);
        if (error) throw error;
      }
      toast.success(`${verifType === 'bar_registration' ? 'Primary Bar' : 'Court Admission'} saved successfully!`);
      setIsVerifModalOpen(false);
      setVerifForm({ license_number: '', authority_name: '', issue_date: '', expiry_date: '', is_primary: false });
      fetchAll();
    } catch (err) {
      toast.error(`Failed to save verification: ${err.message || ''}`);
      console.error(err);
    }
  };

  const deleteCredential = async (id) => {
    if (!window.confirm('Are you sure you want to delete this?')) return;
    try {
      const { error } = await supabase.from('credentials').delete().eq('id', id);
      if (error) throw error;
      toast.success('Deleted successfully.');
      fetchAll();
    } catch (err) {
      toast.error('Failed to delete.');
    }
  };

  const deleteVerification = async (id) => {
    if (!window.confirm('Are you sure you want to delete this?')) return;
    try {
      const { error } = await supabase.from('verifications').delete().eq('id', id);
      if (error) throw error;
      toast.success('Deleted successfully.');
      fetchAll();
    } catch (err) {
      toast.error('Failed to delete.');
    }
  };

  const openCredModal = (type) => {
    setCredType(type);
    setCredForm({ title: '', institution: '', year_issued: '' });
    setIsCredModalOpen(true);
  };

  const openVerifModal = (type) => {
    setVerifType(type);
    if (type === 'bar_registration' && verifications.bar_registration) {
      setVerifForm({
        license_number: verifications.bar_registration.license_number,
        authority_name: verifications.bar_registration.authority_name,
        issue_date: verifications.bar_registration.issue_date,
        expiry_date: verifications.bar_registration.expiry_date || '',
        is_primary: true
      });
    } else {
      setVerifForm({ license_number: '', authority_name: '', issue_date: '', expiry_date: '', is_primary: false });
    }
    setIsVerifModalOpen(true);
  };

  if (loading) return <div className="p-8 text-center animate-pulse">Loading credentials...</div>;

  return (
    <div className="p-4 md:p-8 max-w-container-max mx-auto animate-fadeIn space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-display-lg text-display-lg text-primary font-bold">Credentials & Licenses</h3>
          <p className="text-on-surface-variant font-body-md mt-1">Manage your legal qualifications and court admissions.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column */}
        <div className="lg:col-span-7 space-y-8">
          {/* Bar Registration & License Info */}
          <div className="bg-surface-container-lowest p-6 md:p-8 rounded-xl border border-outline-variant shadow-sm">
            <h4 className="font-headline-sm text-headline-sm text-primary mb-6 border-b border-outline-variant pb-3 flex items-center justify-between">
              <span>Primary Bar Registration</span>
              <button 
                onClick={() => openVerifModal('bar_registration')}
                className="text-sm font-bold text-secondary hover:text-primary transition-colors flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[18px]">edit</span> {verifications.bar_registration ? 'Edit' : 'Add'}
              </button>
            </h4>
            
            {verifications.bar_registration ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1.5 opacity-80">
                    <label className="text-body-sm font-bold text-on-surface-variant block">License Number</label>
                    <input type="text" readOnly value={verifications.bar_registration.license_number || ''} className="w-full px-4 py-2.5 bg-surface-container border border-outline-variant rounded-lg text-on-surface pointer-events-none" />
                  </div>
                  <div className="space-y-1.5 opacity-80">
                    <label className="text-body-sm font-bold text-on-surface-variant block">Issuing Authority</label>
                    <input type="text" readOnly value={verifications.bar_registration.authority_name || ''} className="w-full px-4 py-2.5 bg-surface-container border border-outline-variant rounded-lg text-on-surface pointer-events-none" />
                  </div>
                  <div className="space-y-1.5 opacity-80">
                    <label className="text-body-sm font-bold text-on-surface-variant block">Issue Date</label>
                    <input type="date" readOnly value={verifications.bar_registration.issue_date || ''} className="w-full px-4 py-2.5 bg-surface-container border border-outline-variant rounded-lg text-on-surface pointer-events-none" />
                  </div>
                  <div className="space-y-1.5 opacity-80">
                    <label className="text-body-sm font-bold text-on-surface-variant block">Expiry Date</label>
                    <input type="date" readOnly value={verifications.bar_registration.expiry_date || ''} className="w-full px-4 py-2.5 bg-surface-container border border-outline-variant rounded-lg text-on-surface pointer-events-none" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center p-6 text-on-surface-variant border border-dashed border-outline-variant rounded-lg">
                No primary bar registration found. Please add one.
              </div>
            )}
          </div>

          {/* Court Admissions */}
          <div className="bg-primary p-6 md:p-8 rounded-xl shadow-lg relative overflow-hidden text-white">
            <div className="relative z-10">
              <h4 className="font-headline-sm text-headline-sm mb-6 border-b border-primary-container pb-3 text-secondary-fixed flex items-center justify-between">
                <span className="flex items-center gap-3"><span className="material-symbols-outlined">account_balance</span> Court Admissions</span>
              </h4>
              
              <div className="space-y-4">
                {verifications.court_admissions.length > 0 ? (
                  verifications.court_admissions.map(adm => (
                    <div key={adm.id} className="p-4 bg-primary-container/30 border border-outline-variant/30 rounded-lg relative group">
                      <p className="font-bold">{adm.authority_name}</p>
                      {adm.license_number && <p className="text-sm opacity-80">ID: {adm.license_number}</p>}
                      <button onClick={() => deleteVerification(adm.id)} className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity text-error hover:text-red-400">
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-sm opacity-80 italic">No court admissions recorded.</p>
                )}
              </div>
              <button onClick={() => openVerifModal('court_admission')} className="mt-6 text-[11px] font-bold uppercase tracking-widest text-secondary-fixed hover:text-white transition-colors flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px]">add</span> Add Another Court
              </button>
            </div>
            <div className="absolute right-0 top-1/2 -translate-y-1/2 opacity-5 pointer-events-none">
              <span className="material-symbols-outlined text-[200px]">balance</span>
            </div>
          </div>
        </div>

        {/* Right Column: Bento Grid for Education & Certifications */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Education Bento */}
          <div className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant shadow-sm h-auto flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h4 className="font-headline-sm text-headline-sm text-primary">Education</h4>
              <button onClick={() => openCredModal('education')} className="p-1.5 bg-primary-container/10 text-primary hover:bg-primary-container hover:text-white rounded transition-colors">
                <span className="material-symbols-outlined">add</span>
              </button>
            </div>
            
            <div className="space-y-4 flex-1">
              {credentials.education.length > 0 ? credentials.education.map(edu => (
                <div key={edu.id} className="p-4 bg-surface-container-low rounded-lg border border-outline-variant/50 group relative">
                  <h5 className="font-bold text-primary text-body-sm">{edu.title}</h5>
                  <p className="text-xs text-on-surface-variant mt-0.5">{edu.institution}</p>
                  <p className="text-[11px] font-bold text-secondary mt-2">Class of {edu.year_issued}</p>
                  <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                    <button onClick={() => deleteCredential(edu.id)} className="text-on-surface-variant hover:text-error"><span className="material-symbols-outlined text-[18px]">delete</span></button>
                  </div>
                </div>
              )) : (
                <p className="text-sm text-on-surface-variant italic text-center p-4">No education credentials added.</p>
              )}
            </div>
          </div>

          {/* Certifications Bento */}
          <div className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant shadow-sm h-auto flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h4 className="font-headline-sm text-headline-sm text-primary">Certifications</h4>
              <button onClick={() => openCredModal('certification')} className="p-1.5 bg-primary-container/10 text-primary hover:bg-primary-container hover:text-white rounded transition-colors">
                <span className="material-symbols-outlined">add</span>
              </button>
            </div>
            
            <div className="space-y-4 flex-1">
              {credentials.certification.length > 0 ? credentials.certification.map(cert => (
                <div key={cert.id} className="p-4 bg-surface-container-low rounded-lg border border-outline-variant/50 group relative flex gap-4 items-start">
                  <div className="p-2 bg-secondary-fixed text-on-secondary-fixed rounded-lg shrink-0">
                    <span className="material-symbols-outlined">workspace_premium</span>
                  </div>
                  <div>
                    <h5 className="font-bold text-primary text-body-sm">{cert.title}</h5>
                    <p className="text-xs text-on-surface-variant mt-0.5">{cert.institution}</p>
                    <p className="text-[11px] font-bold text-secondary mt-2">Issued: {cert.year_issued}</p>
                  </div>
                  <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                    <button onClick={() => deleteCredential(cert.id)} className="text-on-surface-variant hover:text-error"><span className="material-symbols-outlined text-[18px]">delete</span></button>
                  </div>
                </div>
              )) : (
                <p className="text-sm text-on-surface-variant italic text-center p-4">No certifications added.</p>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Modals */}
      <Modal 
        isOpen={isCredModalOpen} 
        onClose={() => setIsCredModalOpen(false)} 
        title={credType === 'education' ? 'Add Education' : 'Add Certification'}
      >
        <form onSubmit={handleCredSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-on-surface-variant mb-1">Degree / Title</label>
            <input required type="text" value={credForm.title} onChange={e => setCredForm({...credForm, title: e.target.value})} className="w-full px-4 py-2 border rounded-lg" placeholder="e.g. Juris Doctor (J.D.)" />
          </div>
          <div>
            <label className="block text-sm font-bold text-on-surface-variant mb-1">Institution</label>
            <input required type="text" value={credForm.institution} onChange={e => setCredForm({...credForm, institution: e.target.value})} className="w-full px-4 py-2 border rounded-lg" placeholder="e.g. Harvard Law School" />
          </div>
          <div>
            <label className="block text-sm font-bold text-on-surface-variant mb-1">Year Issued / Graduated</label>
            <input required type="number" min="1950" max="2030" value={credForm.year_issued} onChange={e => setCredForm({...credForm, year_issued: e.target.value})} className="w-full px-4 py-2 border rounded-lg" placeholder="YYYY" />
          </div>
          <button type="submit" className="w-full py-2.5 bg-primary text-white font-bold rounded-lg hover:bg-secondary transition-colors mt-4">Save Credential</button>
        </form>
      </Modal>

      <Modal 
        isOpen={isVerifModalOpen} 
        onClose={() => setIsVerifModalOpen(false)} 
        title={verifType === 'bar_registration' ? 'Primary Bar Registration' : 'Add Court Admission'}
      >
        <form onSubmit={handleVerifSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-on-surface-variant mb-1">License Number</label>
            <input required type="text" value={verifForm.license_number} onChange={e => setVerifForm({...verifForm, license_number: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-bold text-on-surface-variant mb-1">Issuing Authority</label>
            <input required type="text" value={verifForm.authority_name} onChange={e => setVerifForm({...verifForm, authority_name: e.target.value})} className="w-full px-4 py-2 border rounded-lg" placeholder="e.g. New York State Bar" />
          </div>
          <div>
            <label className="block text-sm font-bold text-on-surface-variant mb-1">Issue Date</label>
            <input required type="date" value={verifForm.issue_date} onChange={e => setVerifForm({...verifForm, issue_date: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-bold text-on-surface-variant mb-1">Expiry Date (Optional)</label>
            <input type="date" value={verifForm.expiry_date} onChange={e => setVerifForm({...verifForm, expiry_date: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
          </div>
          <button type="submit" className="w-full py-2.5 bg-primary text-white font-bold rounded-lg hover:bg-secondary transition-colors mt-4">Save Verification</button>
        </form>
      </Modal>

    </div>
  );
};

export default LawyerCredentialsView;
