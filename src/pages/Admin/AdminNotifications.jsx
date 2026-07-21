import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import toast from 'react-hot-toast';

const AdminNotifications = () => {
  const [activeTab, setActiveTab] = useState('payouts'); // 'payouts' | 'system_logs' | 'alerts'
  const [payouts, setPayouts] = useState([]);
  const [systemLogs, setSystemLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('pending'); // 'all' | 'pending' | 'approved' | 'processed' | 'rejected'
  const [searchTerm, setSearchTerm] = useState('');
  const [processingId, setProcessingId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [selectedRejectId, setSelectedRejectId] = useState(null);

  useEffect(() => {
    fetchAdminData();

    // Subscribe to realtime updates on payout_requests, cases, and users
    const channel = supabase
      .channel('admin_notifications_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payout_requests' }, (payload) => {
        toast(`Realtime update on Payout Request #${payload.new?.id?.slice(0, 6) || payload.old?.id?.slice(0, 6)}`, { icon: '💰' });
        fetchAdminData();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'users' }, (payload) => {
        setSystemLogs(prev => [{
          id: `log_user_${Date.now()}`,
          timestamp: new Date().toISOString(),
          type: 'REGISTRATION',
          severity: 'info',
          title: 'New User Registered',
          message: `User ${payload.new.name || payload.new.email} registered as ${payload.new.user_type}.`
        }, ...prev]);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cases' }, (payload) => {
        setSystemLogs(prev => [{
          id: `log_case_${Date.now()}`,
          timestamp: new Date().toISOString(),
          type: 'CASE_CREATED',
          severity: 'info',
          title: 'New Case Initiated',
          message: `Case '${payload.new.title}' created by client ${payload.new.client_id}.`
        }, ...prev]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchAdminData = async () => {
    try {
      setLoading(true);

      // 1. Fetch Payout Requests with lawyer info
      const { data: payData, error: payErr } = await supabase
        .from('payout_requests')
        .select('*, lawyer:users!payout_requests_lawyer_id_fkey(name, email, phone)')
        .order('requested_at', { ascending: false });

      if (payErr) {
        console.error('Error fetching payout requests:', payErr);
      } else {
        setPayouts(payData || []);
      }

      // 2. Build initial system audit logs from recent verification attempts and payouts
      const logs = [];
      if (payData) {
        payData.slice(0, 15).forEach(p => {
          logs.push({
            id: `paylog_${p.id}`,
            timestamp: p.requested_at,
            type: 'PAYOUT_REQUEST',
            severity: p.status === 'pending' ? 'warning' : p.status === 'rejected' ? 'error' : 'success',
            title: `Withdrawal Request (${p.status.toUpperCase()})`,
            message: `Lawyer ${p.lawyer?.name || p.lawyer?.email || p.lawyer_id} requested BDT ${Number(p.amount).toLocaleString()} via ${p.bank_details?.method || 'Bank'}.`
          });
        });
      }

      // Fetch recent users for registration logs
      const { data: recentUsers } = await supabase
        .from('users')
        .select('id, name, email, user_type, created_at')
        .order('created_at', { ascending: false })
        .limit(10);

      if (recentUsers) {
        recentUsers.forEach(u => {
          logs.push({
            id: `usrlog_${u.id}`,
            timestamp: u.created_at || new Date().toISOString(),
            type: 'REGISTRATION',
            severity: 'info',
            title: `New ${u.user_type?.toUpperCase() || 'USER'} Account`,
            message: `${u.name || 'User'} (${u.email}) joined LegalConnect.`
          });
        });
      }

      // Sort combined logs by timestamp
      logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      setSystemLogs(logs);

    } catch (err) {
      console.error('Error loading admin notifications console:', err);
      toast.error('Failed to sync administrative ledger data.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePayoutStatus = async (payoutId, newStatus, reason = null) => {
    setProcessingId(payoutId);
    try {
      const updatePayload = {
        status: newStatus,
        processed_at: newStatus === 'approved' || newStatus === 'processed' || newStatus === 'rejected' ? new Date().toISOString() : null
      };

      if (reason) {
        updatePayload.notes = `[REJECTED]: ${reason}`;
      }

      const { error } = await supabase
        .from('payout_requests')
        .update(updatePayload)
        .eq('id', payoutId);

      if (error) throw error;

      toast.success(`Payout request successfully updated to ${newStatus.toUpperCase()}!`);
      setSelectedRejectId(null);
      setRejectReason('');
      fetchAdminData();
    } catch (err) {
      console.error('Error updating payout status:', err);
      toast.error(err.message || 'Failed to update payout request status.');
    } finally {
      setProcessingId(null);
    }
  };

  const filteredPayouts = payouts.filter(p => {
    const matchesStatus = filterStatus === 'all' || p.status === filterStatus;
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = !searchTerm || 
      p.lawyer?.name?.toLowerCase().includes(searchLower) ||
      p.lawyer?.email?.toLowerCase().includes(searchLower) ||
      p.bank_details?.account_number?.toLowerCase().includes(searchLower) ||
      p.id?.toLowerCase().includes(searchLower);
    return matchesStatus && matchesSearch;
  });

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-500 animate-pulse">
        <span className="material-symbols-outlined text-4xl mb-2 text-gray-400">admin_panel_settings</span>
        <p>Loading Administrative Notifications & Ledger Console...</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-2xl text-[#1E6B4A]">notifications_active</span>
            <h1 className="font-serif text-2xl md:text-3xl font-bold text-[#041635]">Admin Notifications & Ledger Console</h1>
          </div>
          <p className="text-sm text-gray-600">
            Realtime monitoring of financial payout requests, verification alerts, and system-wide user events.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-gray-100 p-1.5 rounded-xl">
          <button
            onClick={() => setActiveTab('payouts')}
            className={`px-4 py-2 text-sm font-bold rounded-lg transition-all flex items-center gap-2 ${
              activeTab === 'payouts' ? 'bg-white text-[#041635] shadow-sm' : 'text-gray-600 hover:text-[#041635]'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">account_balance_wallet</span>
            Payout Requests ({payouts.filter(p => p.status === 'pending').length})
          </button>
          <button
            onClick={() => setActiveTab('system_logs')}
            className={`px-4 py-2 text-sm font-bold rounded-lg transition-all flex items-center gap-2 ${
              activeTab === 'system_logs' ? 'bg-white text-[#041635] shadow-sm' : 'text-gray-600 hover:text-[#041635]'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">history_toggle_off</span>
            System Audit Stream ({systemLogs.length})
          </button>
        </div>
      </div>

      {/* PAYOUT REQUESTS TAB */}
      {activeTab === 'payouts' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Filters & Search */}
          <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4 bg-gray-50/50">
            <div className="flex items-center gap-2 flex-wrap">
              {['pending', 'all', 'approved', 'processed', 'rejected'].map(status => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all ${
                    filterStatus === status
                      ? 'bg-[#041635] text-white shadow'
                      : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {status} {status !== 'all' && `(${payouts.filter(p => p.status === status).length})`}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-72">
              <span className="material-symbols-outlined absolute left-3 top-2.5 text-gray-400 text-[18px]">search</span>
              <input
                type="text"
                placeholder="Search lawyer name, email or AC#..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1E6B4A]"
              />
            </div>
          </div>

          {/* Table */}
          {filteredPayouts.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <span className="material-symbols-outlined text-4xl mb-3 text-gray-300">verified_user</span>
              <h3 className="text-lg font-bold text-gray-700">No Payout Requests Found</h3>
              <p className="text-sm">No withdrawal requests match the selected filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              {/* Mobile Card Stack (< 768px) */}
              <div className="md:hidden divide-y divide-gray-100">
                {filteredPayouts.map(p => (
                  <div key={`mobile-admin-pr-${p.id}`} className="p-4 space-y-3 bg-white">
                    <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                      <div>
                        <div className="font-bold text-sm text-[#041635]">{p.lawyer?.name || 'Unknown Advocate'}</div>
                        <div className="text-xs text-gray-400">{p.lawyer?.email}</div>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                        p.status === 'processed' ? 'bg-green-100 text-green-800' :
                        p.status === 'approved' ? 'bg-blue-100 text-blue-800' :
                        p.status === 'rejected' ? 'bg-red-100 text-red-800' :
                        'bg-amber-100 text-amber-800'
                      }`}>
                        {p.status}
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">Requested Date:</span>
                      <span className="font-medium text-gray-700">{new Date(p.requested_at).toLocaleDateString()}</span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">Amount:</span>
                      <span className="font-bold text-sm text-[#1E6B4A]">BDT {Number(p.amount || 0).toLocaleString()}</span>
                    </div>

                    <div className="bg-gray-50 p-2.5 rounded-xl text-xs space-y-1">
                      <div className="font-bold text-gray-700">{p.bank_details?.method || 'Bank Transfer'}</div>
                      <div className="font-mono text-gray-600">
                        {p.bank_details?.bank_name ? `${p.bank_details.bank_name} - ` : ''}
                        {p.bank_details?.account_number || p.bank_details?.account || 'N/A'}
                      </div>
                      {p.notes && <div className="text-gray-500 italic pt-1 border-t border-gray-200 mt-1">"{p.notes}"</div>}
                    </div>

                    <div className="pt-2 flex items-center justify-end gap-2 border-t border-gray-100">
                      {p.status === 'pending' ? (
                        <>
                          <button
                            onClick={() => handleUpdatePayoutStatus(p.id, 'approved')}
                            disabled={processingId === p.id}
                            className="flex-1 py-2 px-3 bg-[#1E6B4A] text-white font-bold text-xs rounded-xl hover:bg-[#155338] transition-colors shadow-xs disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => setSelectedRejectId(p.id)}
                            disabled={processingId === p.id}
                            className="flex-1 py-2 px-3 bg-red-100 text-red-700 font-bold text-xs rounded-xl hover:bg-red-200 transition-colors disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </>
                      ) : p.status === 'approved' ? (
                        <button
                          onClick={() => handleUpdatePayoutStatus(p.id, 'processed')}
                          disabled={processingId === p.id}
                          className="w-full py-2 px-3 bg-green-600 text-white font-bold text-xs rounded-xl hover:bg-green-700 transition-colors shadow-xs disabled:opacity-50"
                        >
                          Complete Payout
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400 italic">No further actions</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table (>= 768px) */}
              <table className="hidden md:table w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider">
                    <th className="p-4">Requested At</th>
                    <th className="p-4">Lawyer Details</th>
                    <th className="p-4">Withdrawal Amount</th>
                    <th className="p-4">Payment Method & Account</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Administrative Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {filteredPayouts.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="p-4 text-gray-600 whitespace-nowrap">
                        <div className="font-medium text-gray-900">{new Date(p.requested_at).toLocaleDateString()}</div>
                        <div className="text-xs text-gray-400">{new Date(p.requested_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      </td>
                      <td className="p-4">
                        <div className="font-bold text-[#041635]">{p.lawyer?.name || 'Unknown Advocate'}</div>
                        <div className="text-xs text-gray-500">{p.lawyer?.email}</div>
                      </td>
                      <td className="p-4 font-bold text-lg text-[#1E6B4A] whitespace-nowrap">
                        BDT {Number(p.amount || 0).toLocaleString()}
                      </td>
                      <td className="p-4">
                        <div className="font-bold text-gray-800 text-xs uppercase tracking-wide">{p.bank_details?.method || 'Bank Transfer'}</div>
                        <div className="text-xs font-mono text-gray-600 mt-0.5">
                          {p.bank_details?.bank_name ? `${p.bank_details.bank_name} - ` : ''}
                          {p.bank_details?.account_number || p.bank_details?.account || 'N/A'}
                        </div>
                        {p.notes && <div className="text-xs text-gray-400 italic mt-1 truncate max-w-xs" title={p.notes}>"{p.notes}"</div>}
                      </td>
                      <td className="p-4 whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider inline-block ${
                          p.status === 'processed' ? 'bg-green-100 text-green-800' :
                          p.status === 'approved' ? 'bg-blue-100 text-blue-800' :
                          p.status === 'rejected' ? 'bg-red-100 text-red-800' :
                          'bg-amber-100 text-amber-800'
                        }`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="p-4 text-right whitespace-nowrap">
                        {p.status === 'pending' ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleUpdatePayoutStatus(p.id, 'approved')}
                              disabled={processingId === p.id}
                              className="px-3 py-1.5 bg-[#1E6B4A] text-white font-bold text-xs rounded-lg hover:bg-[#155338] transition-colors shadow-sm disabled:opacity-50"
                            >
                              Approve
                            </button>
                            <button
                              className="px-3 py-1.5 bg-green-600 text-white font-bold text-xs rounded-lg hover:bg-green-700 transition-colors shadow-sm disabled:opacity-50"
                            >
                              Mark Processed
                            </button>
                            <button
                              onClick={() => setSelectedRejectId(p.id)}
                              disabled={processingId === p.id}
                              className="px-3 py-1.5 bg-red-100 text-red-700 font-bold text-xs rounded-lg hover:bg-red-200 transition-colors disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </div>
                        ) : p.status === 'approved' ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleUpdatePayoutStatus(p.id, 'processed')}
                              disabled={processingId === p.id}
                              className="px-3 py-1.5 bg-green-600 text-white font-bold text-xs rounded-lg hover:bg-green-700 transition-colors shadow-sm disabled:opacity-50"
                            >
                              Complete Payout
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400 italic">No further actions</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SYSTEM AUDIT STREAM TAB */}
      {activeTab === 'system_logs' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-4">
            <div>
              <h2 className="font-serif text-xl font-bold text-[#041635]">Live System Activity & Audit Logs</h2>
              <p className="text-xs text-gray-500">Realtime events synchronized directly via Supabase Replication channels.</p>
            </div>
            <button
              onClick={fetchAdminData}
              className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">refresh</span>
              Refresh Stream
            </button>
          </div>

          {systemLogs.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No system events logged in the active session.</div>
          ) : (
            <div className="space-y-3">
              {systemLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-4 p-4 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-white transition-all shadow-2xs"
                >
                  <div className={`p-2.5 rounded-xl flex items-center justify-center shrink-0 ${
                    log.severity === 'error' ? 'bg-red-100 text-red-600' :
                    log.severity === 'warning' ? 'bg-amber-100 text-amber-600' :
                    log.severity === 'success' ? 'bg-green-100 text-green-600' :
                    'bg-blue-100 text-blue-600'
                  }`}>
                    <span className="material-symbols-outlined text-xl">
                      {log.type === 'PAYOUT_REQUEST' ? 'payments' :
                       log.type === 'REGISTRATION' ? 'person_add' :
                       log.type === 'CASE_CREATED' ? 'gavel' : 'notifications'}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="font-bold text-gray-900 text-sm truncate">{log.title}</h4>
                      <span className="text-[11px] text-gray-400 font-mono shrink-0">
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1 leading-relaxed">{log.message}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-gray-200/70 text-gray-700 rounded">
                        {log.type}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Reject Modal */}
      {selectedRejectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-gray-100">
            <h3 className="font-serif text-lg font-bold text-[#041635] mb-2">Reject Payout Request</h3>
            <p className="text-xs text-gray-600 mb-4">
              Please state the reason for rejecting this withdrawal request. This reason will be recorded in the ledger notes.
            </p>
            <textarea
              rows="3"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Invalid bank routing number provided or pending fee reconciliation..."
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 text-sm text-gray-800 mb-4"
            />
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => { setSelectedRejectId(null); setRejectReason(''); }}
                className="px-4 py-2 rounded-xl bg-gray-100 text-gray-600 font-bold text-sm hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleUpdatePayoutStatus(selectedRejectId, 'rejected', rejectReason)}
                disabled={!rejectReason.trim() || processingId === selectedRejectId}
                className="px-5 py-2 rounded-xl bg-red-600 text-white font-bold text-sm hover:bg-red-700 transition-colors shadow-md disabled:opacity-50"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminNotifications;
