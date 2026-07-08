import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import toast from 'react-hot-toast';

const ClientVerifications = () => {
  const [activeTab, setActiveTab] = useState('pending');
  const [clients, setClients] = useState({ pending: [], under_review: [], verified: [], rejected: [] });
  const [loading, setLoading] = useState(true);

  // Action states
  const [actionModal, setActionModal] = useState({ type: null, clientId: null }); // 'reject'
  const [actionNote, setActionNote] = useState('');

  // Document Preview Modal State
  const [previewDoc, setPreviewDoc] = useState(null);

  useEffect(() => {
    fetchVerifications();
  }, []);

  const fetchVerifications = async () => {
    try {
      setLoading(true);
      // Fetch clients who have uploaded an NID document
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('user_type', 'client')
        .not('nid_document_url', 'is', null)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      const grouped = { pending: [], under_review: [], verified: [], rejected: [] };

      (data || []).forEach(client => {
        const status = grouped[client.verification_status] ? client.verification_status : 'pending';
        grouped[status].push(client);
      });

      setClients(grouped);
    } catch (err) {
      console.error('Failed to fetch verifications:', err);
      toast.error('Failed to load verification requests');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (clientId) => {
    try {
      const { error } = await supabase
        .from('users')
        .update({ verification_status: 'verified', is_verified: true })
        .eq('id', clientId);

      if (error) throw error;

      toast.success('Client verified successfully');
      fetchVerifications();
    } catch (err) {
      console.error('Error approving client:', err);
      toast.error('Failed to approve client');
    }
  };

  const handleReject = async () => {
    if (!actionNote.trim()) {
      toast.error('Please specify a reason for rejection');
      return;
    }

    const { clientId } = actionModal;

    try {
      const { error } = await supabase
        .from('users')
        .update({ 
          verification_status: 'rejected', 
          is_verified: false 
        })
        .eq('id', clientId);

      if (error) throw error;

      toast.success('Client verification rejected');
      setActionModal({ type: null, clientId: null });
      setActionNote('');
      fetchVerifications();
    } catch (err) {
      console.error(err);
      toast.error('Failed to reject client');
    }
  };

  const activeList = clients[activeTab] || [];

  return (
    <div className="max-w-6xl mx-auto pb-16 px-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-serif font-bold text-navy-primary">Client Verifications</h1>
          <p className="text-sm text-text-muted mt-1">
            Review uploaded National ID (NID) documents to verify client identities.
          </p>
        </div>
        <button
          onClick={fetchVerifications}
          className="px-4 py-2 bg-surface-white border border-border-subtle rounded-lg text-sm font-semibold text-navy-primary hover:bg-bg-light transition-all shadow-sm flex items-center gap-2"
        >
          <span>↻</span> Refresh List
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap border-b border-border-subtle mb-8 gap-1">
        {[
          { key: 'under_review', label: 'Under Review', color: 'bg-amber-500' },
          { key: 'verified', label: 'Verified Clients', color: 'bg-green-600' },
          { key: 'rejected', label: 'Rejected', color: 'bg-red-600' }
        ].map(tab => {
          const count = (clients[tab.key] || []).length;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
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

      {/* Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-16 space-y-4">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-navy-primary"></div>
          <span className="text-sm font-medium text-navy-primary">Loading client verifications...</span>
        </div>
      ) : activeList.length === 0 ? (
        <div className="bg-surface-white p-16 rounded-xl border border-border-subtle flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 bg-bg-light rounded-full flex items-center justify-center mb-4">
            <span className="material-symbols-outlined text-3xl text-text-muted">task</span>
          </div>
          <h3 className="text-lg font-bold text-navy-primary mb-1">No requests found</h3>
          <p className="text-sm text-text-muted max-w-sm">
            There are currently no client profiles in the <span className="font-semibold">{activeTab.replace('_', ' ')}</span> status.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {activeList.map(client => (
            <div key={client.id} className="bg-surface-white rounded-xl border border-border-subtle overflow-hidden shadow-sm">
              <div className="p-6 flex flex-col md:flex-row items-start md:items-center gap-6">
                
                {/* Client Info */}
                <div className="flex items-center gap-4 flex-1">
                  <div className="w-12 h-12 rounded-full bg-bg-light flex items-center justify-center overflow-hidden border border-border-subtle shrink-0">
                    {client.profile_picture_url ? (
                      <img src={client.profile_picture_url} alt="Client" className="w-full h-full object-cover" />
                    ) : (
                      <span className="material-symbols-outlined text-text-muted">person</span>
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-navy-primary">{client.name}</h3>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-muted mt-1">
                      <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">mail</span> {client.email}</span>
                      {client.phone && <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">call</span> {client.phone}</span>}
                    </div>
                  </div>
                </div>

                {/* Document preview */}
                {client.nid_document_url && (
                  <div className="shrink-0 flex items-center border border-border-subtle rounded-lg p-2 bg-bg-light">
                    <button 
                      onClick={() => setPreviewDoc(client.nid_document_url)}
                      className="flex items-center gap-2 hover:bg-white p-2 rounded transition-colors"
                    >
                      <span className="material-symbols-outlined text-accent-gold">badge</span>
                      <div className="text-left">
                        <p className="text-xs font-bold text-navy-primary">NID Document</p>
                        <p className="text-[10px] text-text-muted">Click to view</p>
                      </div>
                    </button>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0 self-end md:self-center mt-4 md:mt-0 pt-4 md:pt-0 border-t md:border-t-0 border-border-subtle w-full md:w-auto justify-end">
                  {activeTab !== 'verified' && (
                    <button
                      onClick={() => handleApprove(client.id)}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-lg shadow-sm transition-colors flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[18px]">check</span> Approve
                    </button>
                  )}
                  {activeTab !== 'rejected' && (
                    <button
                      onClick={() => setActionModal({ type: 'reject', clientId: client.id })}
                      className="px-4 py-2 bg-white border border-red-200 text-red-600 hover:bg-red-50 text-sm font-bold rounded-lg shadow-sm transition-colors flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[18px]">close</span> Reject
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Action Modal */}
      {actionModal.type && (
        <div className="fixed inset-0 bg-navy-primary/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-white rounded-xl shadow-xl max-w-md w-full overflow-hidden animate-fadeInUp">
            <div className="p-6 border-b border-border-subtle">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-red-600">gavel</span>
              </div>
              <h2 className="text-xl font-bold text-navy-primary">Reject Verification</h2>
              <p className="text-sm text-text-muted mt-1">Please provide a reason. The client will need to re-upload their NID.</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-navy-primary uppercase tracking-wider mb-2">Rejection Reason</label>
                <textarea
                  value={actionNote}
                  onChange={(e) => setActionNote(e.target.value)}
                  placeholder="e.g., Image is too blurry, NID doesn't match profile name..."
                  className="w-full px-4 py-3 border border-border-subtle rounded-lg text-sm min-h-[100px] focus:ring-2 focus:ring-navy-primary focus:border-transparent outline-none"
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-bg-light border-t border-border-subtle flex justify-end gap-3">
              <button
                onClick={() => setActionModal({ type: null, clientId: null })}
                className="px-4 py-2 text-sm font-semibold text-text-muted hover:text-navy-primary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-lg shadow-sm transition-all"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-navy-primary/80 backdrop-blur-sm" onClick={() => setPreviewDoc(null)}>
          <div className="relative max-w-4xl w-full max-h-[90vh] flex flex-col items-center animate-zoomIn" onClick={e => e.stopPropagation()}>
            <button 
              onClick={() => setPreviewDoc(null)}
              className="absolute -top-12 right-0 w-10 h-10 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center backdrop-blur-md transition-all"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
            
            <div className="bg-surface-white p-2 rounded-xl w-full flex items-center justify-center overflow-hidden" style={{ maxHeight: 'calc(90vh - 60px)' }}>
              {previewDoc.toLowerCase().endsWith('.pdf') ? (
                <iframe src={previewDoc} className="w-full h-[80vh] rounded-lg" title="Document Preview" />
              ) : (
                <img src={previewDoc} alt="Document Preview" className="max-w-full max-h-[80vh] object-contain rounded-lg" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientVerifications;
