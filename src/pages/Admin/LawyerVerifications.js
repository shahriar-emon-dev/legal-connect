import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import toast from 'react-hot-toast';

const LawyerVerifications = () => {
  const [activeTab, setActiveTab] = useState('pending');
  const [lawyers, setLawyers] = useState({ pending: [], action_required: [], verified: [], rejected: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Action states
  const [actionModal, setActionModal] = useState({ type: null, lawyerId: null }); // 'reject' or 'improve'
  const [actionNote, setActionNote] = useState('');

  // Document Preview Modal State
  const [previewDoc, setPreviewDoc] = useState(null);
  const [hoveredDoc, setHoveredDoc] = useState(null);

  // Full Details Drawer State
  const [expandedLawyerId, setExpandedLawyerId] = useState(null);

  useEffect(() => {
    fetchVerifications();
  }, []);

  const fetchVerifications = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('lawyers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const rawLawyers = data || [];

      let userMap = {};
      if (rawLawyers.length > 0) {
        const userIds = [...new Set(rawLawyers.map(l => l.user_id).filter(Boolean))];
        if (userIds.length > 0) {
          let usersData = [];
          try {
            const r = await supabase
              .from('users')
              .select('id, name, full_name, email, phone, profile_picture_url')
              .in('id', userIds);
            usersData = r.data || [];
          } catch (e) {}
          usersData.forEach(u => { userMap[u.id] = u; });
        }
      }

      data.forEach(l => {
        l.user = userMap[l.user_id] || { name: 'Lawyer Applicant', email: '' };
      });

      // lawyer_profiles has been merged into lawyers, so data already has full details

      // Also fetch all uploaded verification documents from public.documents
      const { data: docsData } = await supabase
        .from('documents')
        .select('*');

      const grouped = { pending: [], action_required: [], verified: [], rejected: [] };

      (data || []).forEach(l => {
        // Attach full profile information if available
        const profile = l;
        l.fullProfile = profile;

        // Attach uploaded documents matching lawyer.id, lawyer.user_id, or client_id
        const lawyerDocs = (docsData || []).filter(doc => 
          doc.lawyer_id === l.id || doc.lawyer_id === l.user_id ||
          doc.uploaded_by === l.id || doc.uploaded_by === l.user_id ||
          doc.client_id === l.id || doc.client_id === l.user_id
        );
        l.uploadedDocuments = lawyerDocs;

        const status = grouped[l.verification_status] ? l.verification_status : 'pending';
        grouped[status].push(l);
      });

      setLawyers(grouped);
    } catch (err) {
      console.error('Failed to fetch verifications:', err);
      setError('Failed to load verification requests. Please check your network connection.');
      toast.error('Failed to load verification requests');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (lawyerId) => {
    try {
      const allLawyers = [
        ...(lawyers.pending || []), 
        ...(lawyers.action_required || []), 
        ...(lawyers.rejected || []), 
        ...(lawyers.verified || [])
      ];
      const targetLawyer = allLawyers.find(l => l.id === lawyerId);
      const profileId = targetLawyer?.user_id || lawyerId;

      // Execute atomic verification transaction via RPC
      const { error } = await supabase.rpc('fn_verify_lawyer', {
        p_lawyer_id: isNaN(Number(lawyerId)) ? null : Number(lawyerId),
        p_user_id: profileId,
        p_status: 'verified',
        p_rejection_reason: null
      });

      if (error) throw error;

      toast.success('Lawyer verified successfully');
      fetchVerifications();
    } catch (err) {
      console.error('Error approving lawyer:', err);
      toast.error(`Failed to approve lawyer: ${err.message || ''}`);
    }
  };

  const handleRejectOrImprove = async () => {
    if (!actionNote.trim()) {
      toast.error('Please specify notes or reason for this action');
      return;
    }

    const { type, lawyerId } = actionModal;
    const newStatus = type === 'improve' ? 'action_required' : 'rejected';

    try {
      const allLawyers = [
        ...(lawyers.pending || []), 
        ...(lawyers.action_required || []), 
        ...(lawyers.rejected || []), 
        ...(lawyers.verified || [])
      ];
      const targetLawyer = allLawyers.find(l => l.id === lawyerId);
      const profileId = targetLawyer?.user_id || lawyerId;

      const { error } = await supabase.rpc('fn_verify_lawyer', {
        p_lawyer_id: isNaN(Number(lawyerId)) ? null : Number(lawyerId),
        p_user_id: profileId,
        p_status: newStatus,
        p_rejection_reason: actionNote
      });

      if (error) throw error;

      toast.success(type === 'improve' ? 'Requested improvements from lawyer' : 'Lawyer verification rejected');
      setActionModal({ type: null, lawyerId: null });
      setActionNote('');
      fetchVerifications();
    } catch (err) {
      console.error(err);
      toast.error('Failed to update status');
    }
  };

  const activeList = lawyers[activeTab] || [];

  return (
    <div className="max-w-6xl mx-auto pb-16 px-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-serif font-bold text-navy-primary">Lawyer Verifications</h1>
          <p className="text-sm text-text-muted mt-1">
            Review uploaded bar certificates and national identities. Hover over documents for instant preview or click to inspect inside this tab.
          </p>
        </div>
        <button
          onClick={fetchVerifications}
          className="self-start md:self-auto px-4 py-2 bg-surface-white border border-border-subtle rounded-lg text-sm font-semibold text-navy-primary hover:bg-bg-light transition-all shadow-sm flex items-center gap-2"
        >
          <span>↻</span> Refresh List
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap border-b border-border-subtle mb-8 gap-1">
        {[
          { key: 'pending', label: 'Pending Review', color: 'bg-amber-500' },
          { key: 'action_required', label: 'Action Required', color: 'bg-blue-500' },
          { key: 'verified', label: 'Verified Counsel', color: 'bg-green-600' },
          { key: 'rejected', label: 'Rejected', color: 'bg-red-600' }
        ].map(tab => {
          const count = (lawyers[tab.key] || []).length;
          return (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setExpandedLawyerId(null); }}
              className={`px-5 py-3 font-semibold text-sm transition-all relative rounded-t-lg flex items-center gap-2.5 ${
                activeTab === tab.key 
                  ? 'text-navy-primary bg-white border-t-2 border-x border-border-subtle border-t-accent-gold shadow-sm' 
                  : 'text-text-muted hover:text-navy-primary hover:bg-bg-light/60'
              }`}
            >
              <span>{tab.label}</span>
              {count > 0 && (
                <span className={`text-white text-[11px] px-2 py-0.5 rounded-full font-bold ${tab.color}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* List */}
      <div className="flex flex-col gap-6 relative min-h-[300px]">
        {loading && (
          <div className="absolute inset-0 bg-bg-light/60 backdrop-blur-sm flex flex-col items-center justify-center z-10 rounded-xl border border-border-subtle">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-navy-primary mb-3"></div>
            <span className="text-sm font-medium text-navy-primary">Loading verifications & documents...</span>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center space-y-4 my-4">
            <span className="material-symbols-outlined text-5xl text-red-500">error_outline</span>
            <h3 className="text-xl font-bold text-navy-primary">Failed to Load Verifications</h3>
            <p className="text-gray-600 text-sm">{error}</p>
            <button 
              onClick={() => { setLoading(true); setError(null); fetchVerifications(); }}
              className="px-6 py-2.5 bg-navy-primary hover:bg-navy-primary/90 text-white font-bold rounded-xl shadow transition active:scale-95"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && activeList.length === 0 && (
          <div className="bg-surface-white rounded-xl border border-border-subtle p-16 text-center text-text-muted shadow-sm">
            <div className="text-5xl mb-4">🗃️</div>
            <h3 className="text-xl font-bold text-navy-primary mb-1 capitalize">No {activeTab.replace('_', ' ')} Requests</h3>
            <p className="text-sm max-w-md mx-auto">
              {activeTab === 'pending' && 'All lawyer documents have been processed. New submissions will appear here.'}
              {activeTab === 'action_required' && 'No lawyers currently have pending improvement requests.'}
              {activeTab === 'verified' && 'Verified lawyers will be displayed here once approved.'}
              {activeTab === 'rejected' && 'No verification requests have been rejected.'}
            </p>
          </div>
        )}

        {!loading && activeList.map(lawyer => {
          const isExpanded = expandedLawyerId === lawyer.id;
          const docs = lawyer.uploadedDocuments || [];
          const profile = lawyer.fullProfile || {};

          return (
            <div key={lawyer.id} className="bg-surface-white rounded-xl border border-border-subtle shadow-sm overflow-hidden transition-all duration-300">
              
              {/* Main Card Content */}
              <div className="p-6">
                <div className="flex flex-col lg:flex-row justify-between gap-6">
                  
                  {/* Lawyer Basic Info Header */}
                  <div className="flex gap-4 items-start flex-1">
                    <div className="w-16 h-16 rounded-full bg-navy-primary text-white flex items-center justify-center font-bold text-xl uppercase overflow-hidden flex-shrink-0 border-2 border-accent-gold/40 shadow-inner">
                      {lawyer.user?.profile_picture_url || profile.avatar_url ? (
                        <img src={lawyer.user?.profile_picture_url || profile.avatar_url} alt={lawyer.user?.name || 'Lawyer'} className="w-full h-full object-cover" />
                      ) : (
                        (lawyer.user?.name || lawyer.full_name || 'L')[0]
                      )}
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="text-xl font-bold text-navy-primary">{lawyer.user?.name || lawyer.full_name || 'Unknown Counsel'}</h3>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-bg-light text-navy-primary border border-border-subtle">
                          {lawyer.specialization || profile.specialization || 'General Practice'}
                        </span>
                      </div>

                      <div className="text-sm text-text-muted mt-1 flex items-center gap-4 flex-wrap">
                        <span>📍 {lawyer.location || profile.city || profile.office_address || 'Location Not Set'}</span>
                        <span>✉️ {lawyer.user?.email || profile.email || 'Email Private'}</span>
                        {(lawyer.user?.phone || profile.phone) && <span>📞 {lawyer.user?.phone || profile.phone}</span>}
                      </div>

                      <div className="text-xs text-text-muted mt-2 flex items-center gap-4">
                        <span>Submitted: <strong className="text-navy-primary">{new Date(lawyer.created_at).toLocaleDateString()}</strong></span>
                        {lawyer.verification_date && (
                          <span className="text-success-green font-semibold">✓ Verified on {new Date(lawyer.verification_date).toLocaleDateString()}</span>
                        )}
                      </div>

                      {lawyer.rejection_reason && activeTab !== 'verified' && (
                        <div className="mt-3 p-3 bg-amber-50/80 border border-amber-200/80 rounded-lg text-sm text-amber-900">
                          <strong className="font-semibold block mb-0.5">Admin Feedback / Action Required:</strong>
                          <span>{lawyer.rejection_reason}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Documents & Action Buttons Section */}
                  <div className="flex flex-col justify-between items-stretch lg:items-end gap-4 border-t lg:border-t-0 lg:border-l border-border-subtle pt-4 lg:pt-0 lg:pl-6 min-w-[280px]">
                    
                    {/* Interactive Document Chips */}
                    <div className="w-full">
                      <div className="text-xs font-bold uppercase tracking-wider text-text-muted mb-2 flex items-center justify-between">
                        <span>Submitted Documents ({docs.length + (lawyer.bar_document_url ? 1 : 0) + (lawyer.nid_document_url ? 1 : 0)})</span>
                        <span className="text-[10px] text-accent-gold font-normal">Hover or Click</span>
                      </div>

                      <div className="flex flex-wrap lg:flex-col gap-2">
                        {docs.map((doc, dIdx) => (
                          <div
                            key={dIdx}
                            onMouseEnter={() => setHoveredDoc({ ...doc, lawyerName: lawyer.user?.name || 'Lawyer' })}
                            onMouseLeave={() => setHoveredDoc(null)}
                            onClick={() => setPreviewDoc({ ...doc, lawyerName: lawyer.user?.name || 'Lawyer' })}
                            className="group relative cursor-pointer flex items-center justify-between gap-2 bg-bg-light hover:bg-navy-primary hover:text-white px-3 py-2 rounded-lg border border-border-subtle transition-all text-xs font-medium"
                          >
                            <div className="flex items-center gap-2 truncate">
                              <span>📄</span>
                              <span className="truncate max-w-[170px]" title={doc.file_name}>{doc.description || doc.file_name}</span>
                            </div>
                            <span className="text-[10px] bg-white text-navy-primary group-hover:bg-accent-gold group-hover:text-navy-primary px-1.5 py-0.5 rounded font-bold shadow-sm">
                              Open 👁️
                            </span>
                          </div>
                        ))}

                        {lawyer.bar_document_url && (
                          <div
                            onClick={() => setPreviewDoc({ storage_url: lawyer.bar_document_url, file_name: 'Bar Registration Certificate', lawyerName: lawyer.user?.name })}
                            className="cursor-pointer flex items-center justify-between gap-2 bg-bg-light hover:bg-navy-primary hover:text-white px-3 py-2 rounded-lg border border-border-subtle transition-all text-xs font-medium"
                          >
                            <span>📄 Bar Certificate</span>
                            <span className="text-[10px] bg-white text-navy-primary px-1.5 py-0.5 rounded font-bold">Open 👁️</span>
                          </div>
                        )}

                        {lawyer.nid_document_url && (
                          <div
                            onClick={() => setPreviewDoc({ storage_url: lawyer.nid_document_url, file_name: 'National Identity Document', lawyerName: lawyer.user?.name })}
                            className="cursor-pointer flex items-center justify-between gap-2 bg-bg-light hover:bg-navy-primary hover:text-white px-3 py-2 rounded-lg border border-border-subtle transition-all text-xs font-medium"
                          >
                            <span>🪪 NID Document</span>
                            <span className="text-[10px] bg-white text-navy-primary px-1.5 py-0.5 rounded font-bold">Open 👁️</span>
                          </div>
                        )}

                        {docs.length === 0 && !lawyer.bar_document_url && !lawyer.nid_document_url && (
                          <div className="text-text-muted text-xs italic bg-amber-50 text-amber-800 border border-amber-200 px-3 py-2 rounded">
                            ⚠️ No uploaded files found.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action Toolbar */}
                    <div className="flex flex-col gap-2 w-full mt-2">
                      <div className="flex gap-2 w-full">
                        {activeTab !== 'verified' && (
                          <button
                            onClick={() => handleApprove(lawyer.id)}
                            className="flex-1 bg-success-green hover:bg-success-green/90 text-white py-2 px-3 rounded-lg text-xs font-bold tracking-wide uppercase transition-all shadow-sm flex items-center justify-center gap-1.5"
                          >
                            <span>✓</span> Approve
                          </button>
                        )}
                        
                        {activeTab !== 'action_required' && (
                          <button
                            onClick={() => { setActionModal({ type: 'improve', lawyerId: lawyer.id }); setActionNote(lawyer.rejection_reason || ''); }}
                            className="flex-1 bg-amber-500 hover:bg-amber-600 text-white py-2 px-3 rounded-lg text-xs font-bold tracking-wide uppercase transition-all shadow-sm flex items-center justify-center gap-1"
                          >
                            <span>⚠️</span> Request Fix
                          </button>
                        )}

                        {activeTab !== 'rejected' && (
                          <button
                            onClick={() => { setActionModal({ type: 'reject', lawyerId: lawyer.id }); setActionNote(''); }}
                            className="flex-1 bg-danger-red hover:bg-danger-red/90 text-white py-2 px-3 rounded-lg text-xs font-bold tracking-wide uppercase transition-all shadow-sm flex items-center justify-center gap-1"
                          >
                            <span>✕</span> Reject
                          </button>
                        )}
                      </div>

                      {/* Expand / Collapse Details Toggle */}
                      <button
                        onClick={() => setExpandedLawyerId(isExpanded ? null : lawyer.id)}
                        className="w-full py-1.5 bg-surface-white hover:bg-bg-light border border-border-subtle rounded-lg text-xs font-semibold text-navy-primary transition-colors flex items-center justify-center gap-2"
                      >
                        <span>{isExpanded ? '▲ Hide Full Lawyer Information' : '▼ Inspect Full Profile & Credentials'}</span>
                      </button>
                    </div>

                  </div>
                </div>
              </div>

              {/* Expandable Full Lawyer Information Panel */}
              {isExpanded && (
                <div className="border-t border-border-subtle bg-bg-light/50 p-6 animate-fadeIn">
                  <h4 className="text-sm font-bold uppercase tracking-wider text-navy-primary mb-4 flex items-center gap-2">
                    <span>🏛️ Comprehensive Lawyer Profile & Credentials</span>
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
                    {/* Column 1: Bar Credentials */}
                    <div className="bg-white p-4 rounded-lg border border-border-subtle shadow-2xs">
                      <h5 className="font-bold text-navy-primary border-b border-border-subtle pb-2 mb-3">Professional Bar Info</h5>
                      <div className="space-y-2">
                        <div>
                          <span className="text-xs text-text-muted block">Bar Council Reg / ID:</span>
                          <strong className="text-navy-primary">{profile.bar_registration_number || lawyer.bar_association_id || 'Not Provided'}</strong>
                        </div>
                        <div>
                          <span className="text-xs text-text-muted block">Bar Association Name:</span>
                          <span className="font-medium">{profile.bar_association || 'Supreme Court Bar Association'}</span>
                        </div>
                        <div>
                          <span className="text-xs text-text-muted block">Years of Experience:</span>
                          <span className="font-medium">{profile.experience_years ? `${profile.experience_years} Years` : '5+ Years'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Column 2: Consultation & Billing */}
                    <div className="bg-white p-4 rounded-lg border border-border-subtle shadow-2xs">
                      <h5 className="font-bold text-navy-primary border-b border-border-subtle pb-2 mb-3">Consultation Rates</h5>
                      <div className="space-y-2">
                        <div>
                          <span className="text-xs text-text-muted block">Standard Hourly Rate:</span>
                          <strong className="text-accent-gold text-base">{profile.hourly_rate ? `৳${profile.hourly_rate} / hr` : '৳3,000 / hr'}</strong>
                        </div>
                        <div>
                          <span className="text-xs text-text-muted block">Consultation Types Allowed:</span>
                          <span className="font-medium">Video Call, In-Person Chamber, Written Advice</span>
                        </div>
                        <div>
                          <span className="text-xs text-text-muted block">Account Status:</span>
                          <span className="capitalize font-semibold text-navy-primary">{profile.status || lawyer.verification_status}</span>
                        </div>
                      </div>
                    </div>

                    {/* Column 3: Contact & Address */}
                    <div className="bg-white p-4 rounded-lg border border-border-subtle shadow-2xs">
                      <h5 className="font-bold text-navy-primary border-b border-border-subtle pb-2 mb-3">Chamber & Contact</h5>
                      <div className="space-y-2">
                        <div>
                          <span className="text-xs text-text-muted block">Chamber Address:</span>
                          <span className="font-medium">{profile.office_address || profile.chamber_address || 'Chamber 402, Annex Building, Court Road'}</span>
                        </div>
                        <div>
                          <span className="text-xs text-text-muted block">City / Jurisdiction:</span>
                          <span className="font-medium">{profile.city || lawyer.location || 'Dhaka, Bangladesh'}</span>
                        </div>
                        <div>
                          <span className="text-xs text-text-muted block">Direct Email:</span>
                          <span className="font-medium text-blue-600">{lawyer.user?.email || profile.email || 'N/A'}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bio Section */}
                  {(profile.bio || lawyer.bio) && (
                    <div className="mt-4 bg-white p-4 rounded-lg border border-border-subtle">
                      <h5 className="font-bold text-navy-primary text-xs uppercase tracking-wider mb-2">Professional Biography</h5>
                      <p className="text-sm text-text-muted leading-relaxed">{profile.bio || lawyer.bio}</p>
                    </div>
                  )}
                </div>
              )}

            </div>
          );
        })}
      </div>

      {/* Floating Hover Document Preview Tooltip */}
      {hoveredDoc && !previewDoc && (
        <div className="fixed bottom-6 right-6 z-40 bg-navy-primary text-white p-4 rounded-xl shadow-2xl border border-accent-gold/50 max-w-sm animate-fadeIn pointer-events-none">
          <div className="text-xs font-bold text-accent-gold uppercase tracking-wide mb-1">🔍 Instant Preview Ready</div>
          <div className="font-bold text-sm truncate">{hoveredDoc.description || hoveredDoc.file_name}</div>
          <div className="text-xs text-gray-300 mt-1">Lawyer: {hoveredDoc.lawyerName}</div>
          <div className="text-[11px] text-accent-gold/90 mt-2 flex items-center gap-1.5">
            <span>💡 Click document button to inspect document directly inside this tab.</span>
          </div>
        </div>
      )}

      {/* In-Tab Interactive Document Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 bg-navy-primary/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-surface-white rounded-2xl border border-border-subtle shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden">
            
            {/* Modal Header */}
            <div className="px-6 py-4 bg-navy-primary text-white flex items-center justify-between border-b border-accent-gold/30">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📄</span>
                <div>
                  <h3 className="font-bold text-base truncate max-w-md">{previewDoc.description || previewDoc.file_name}</h3>
                  <p className="text-xs text-gray-300">Submitted by: <strong className="text-accent-gold">{previewDoc.lawyerName || 'Counsel'}</strong></p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={previewDoc.storage_url}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-semibold text-white transition-colors flex items-center gap-1"
                >
                  <span>↗</span> Open New Tab
                </a>
                <button
                  onClick={() => setPreviewDoc(null)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-danger-red text-white flex items-center justify-center font-bold text-sm transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Document Frame / Viewer */}
            <div className="flex-1 bg-gray-100 flex items-center justify-center overflow-auto p-4 relative">
              {previewDoc.storage_url ? (
                <iframe
                  src={previewDoc.storage_url}
                  title={previewDoc.file_name}
                  className="w-full h-full rounded-lg shadow-md border bg-white"
                />
              ) : (
                <div className="text-center text-text-muted">
                  <div className="text-4xl mb-2">⚠️</div>
                  <p className="font-semibold">Document URL not accessible.</p>
                </div>
              )}
            </div>

            {/* Modal Footer Actions */}
            <div className="p-4 bg-white border-t border-border-subtle flex items-center justify-between">
              <span className="text-xs text-text-muted">Inspect the document carefully before verifying counsel.</span>
              <button
                onClick={() => setPreviewDoc(null)}
                className="px-6 py-2 bg-navy-primary hover:bg-navy-primary/90 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                Done Inspecting
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action / Improvement Input Modal */}
      {actionModal.type && (
        <div className="fixed inset-0 z-50 bg-navy-primary/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-surface-white rounded-2xl border border-border-subtle shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">{actionModal.type === 'improve' ? '⚠️' : '✕'}</span>
              <div>
                <h3 className="font-bold text-lg text-navy-primary">
                  {actionModal.type === 'improve' ? 'Request Document Fix / Action' : 'Reject Verification Request'}
                </h3>
                <p className="text-xs text-text-muted">Specify instructions for the lawyer regarding their verification submission.</p>
              </div>
            </div>

            <textarea
              rows="4"
              placeholder={
                actionModal.type === 'improve'
                  ? 'e.g., Please re-upload your Bar Council Certificate showing the embossed seal clearly.'
                  : 'e.g., Your submitted Bar Registration number could not be verified with the Bar Council.'
              }
              value={actionNote}
              onChange={e => setActionNote(e.target.value)}
              className="w-full p-3 border border-border-subtle rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-navy-primary mb-4"
              autoFocus
            />

            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setActionModal({ type: null, lawyerId: null }); setActionNote(''); }}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectOrImprove}
                className={`px-5 py-2 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm ${
                  actionModal.type === 'improve' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-danger-red hover:bg-danger-red/90'
                }`}
              >
                {actionModal.type === 'improve' ? 'Send Action Request' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default LawyerVerifications;
