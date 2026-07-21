import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';
import { realtimeSync } from '../../services/realtimeSync.service';
import toast from 'react-hot-toast';

const LawyerContractsView = () => {
  const { user } = useAuth();
  const [contracts, setContracts] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    client_id: '',
    title: 'Legal Representation Agreement',
    fee_structure: 'Fixed Fee',
    amount: '',
    payment_schedule: '50% Upfront, 50% Completion',
    retainer_amount: ''
  });

  useEffect(() => {
    if (!user) return;
    fetchContracts();
    fetchClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const fetchClients = async () => {
    try {
      const { data } = await supabase.from('users').select('id, name, email').neq('user_type', 'LAWYER');
      if (data) setClients(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchContracts = async () => {
    try {
      setLoading(true);
      let userIds = [...new Set([user?.id, user?.auth_id].filter(Boolean))];
      if (userIds.length === 0) {
        setContracts([]);
        setLoading(false);
        return;
      }

      let fetchedData = [];
      try {
        const { data } = await supabase
          .from('contracts')
          .select('*, client:users!contracts_client_id_fkey(id, name, profile_picture_url)')
          .in('lawyer_id', userIds)
          .order('created_at', { ascending: false });
        if (data) fetchedData = data;
      } catch (e) {}

      if (!fetchedData || fetchedData.length === 0) {
        try {
          const { data } = await supabase
            .from('contracts')
            .select('*')
            .in('lawyer_id', userIds)
            .order('created_at', { ascending: false });
          if (data && data.length > 0) {
            const cIds = [...new Set(data.map(c => c.client_id).filter(Boolean))];
            let uList = [];
            if (cIds.length > 0) {
              const { data: uRes } = await supabase.from('users').select('id, name, profile_picture_url').in('id', cIds);
              if (uRes) uList = uRes;
            }
            fetchedData = data.map(c => ({
              ...c,
              client: uList.find(u => u.id === c.client_id) || null
            }));
          }
        } catch (e2) {}
      }

      setContracts(fetchedData || []);
    } catch (err) {
      console.error('Error fetching contracts:', err.message, err.code, err);
      setContracts([]);
    } finally {
      setLoading(false);
    }
  };

  const updateContractStatus = async (id, action) => {
    try {
      if (action === 'accept') {
        // Use fn_lawyer_accept_contract RPC
        const { error } = await supabase.rpc('fn_lawyer_accept_contract', { p_contract_id: id });
        if (error) throw error;
        toast.success('Contract accepted. Work has begun.');
      } else if (action === 'terminate') {
        const { error: rpcErr } = await supabase.rpc('fn_terminate_contract', {
          p_contract_id: id,
          p_reason: 'Lawyer terminated representation contract.'
        });
        if (rpcErr) {
          const { error } = await supabase
            .from('contracts')
            .update({ status: 'Terminated', updated_at: new Date().toISOString() })
            .eq('id', id);
          if (error) throw error;
        }
        toast.success('Contract terminated.');
      }
      realtimeSync.broadcastCaseChange({ contractId: id, action: `CONTRACT_${action.toUpperCase()}` });
      fetchContracts();
    } catch (err) {
      console.error(err);
      toast.error('Failed to update contract');
    }
  };

  const handleCreateContract = async (e) => {
    e.preventDefault();
    if (!formData.client_id || !formData.amount) {
      toast.error('Please select a client and enter fee amount');
      return;
    }
    setSubmitting(true);
    try {
      const numAmt = Number(formData.amount);
      const numRet = Number(formData.retainer_amount || 0);
      const payload = {
        lawyer_id: user.id,
        client_id: formData.client_id,
        title: formData.title,
        fee_structure: formData.fee_structure,
        amount: numAmt,
        agreed_fee: numAmt,
        agreed_amount: numAmt,
        payment_schedule: formData.payment_schedule,
        retainer_amount: numRet,
        outstanding_balance: numAmt,
        status: 'Pending Review',
        fee_locked: false
      };

      const { data: insData, error } = await supabase.from('contracts').insert([payload]).select();
      if (error) throw error;

      toast.success('Contract created and sent to client for review!');
      realtimeSync.broadcastCaseChange({ contractId: insData?.[0]?.id || null, action: 'CONTRACT_CREATED' });
      setCreateModalOpen(false);
      setFormData({
        client_id: '',
        title: 'Legal Representation Agreement',
        fee_structure: 'Fixed Fee',
        amount: '',
        payment_schedule: '50% Upfront, 50% Completion',
        retainer_amount: ''
      });
      fetchContracts();
    } catch (err) {
      console.error('Error creating contract:', err);
      toast.error('Failed to create contract');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500 animate-pulse">Loading contracts...</div>;

  return (
    <div className="flex-1 p-8 overflow-y-auto custom-scrollbar bg-surface-container-lowest">
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-6 animate-fadeIn">
        <div>
          <h2 className="font-serif text-[32px] font-bold text-[#041635] mb-2">Contracts & Agreements</h2>
          <p className="text-gray-600 text-[15px] max-w-xl">
            Manage your legal representations, retainers, and agreements.
          </p>
        </div>
        <button
          onClick={() => setCreateModalOpen(true)}
          className="bg-[#041635] text-white px-5 py-2.5 rounded-lg text-sm font-bold hover:bg-[#1B2B4B] transition-colors flex items-center gap-2 shadow-sm"
        >
          <span className="material-symbols-outlined text-sm">add</span> Create New Contract
        </button>
      </div>

      <div className="space-y-4 animate-fadeIn max-w-5xl">
        {contracts.length === 0 ? (
          <div className="bg-white p-8 rounded-lg border border-[#D0D7E3] text-center text-gray-500 shadow-sm">
            No contracts found. Click "+ Create New Contract" to get started.
          </div>
        ) : (
          contracts.map(contract => (
            <div key={contract.id} className="bg-white rounded-lg border border-[#D0D7E3] shadow-sm p-6 hover:shadow-md transition-all">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h4 className="text-lg font-bold text-[#041635]">{contract.title || 'Direct Agreement'}</h4>
                  <p className="text-sm text-gray-600">Client: <span className="font-bold text-[#041635]">{contract.client?.name || 'Client'}</span></p>
                  <div className="flex gap-2 mt-2">
                    <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-semibold">{contract.fee_structure || 'Fixed Fee'}</span>
                    <span className="px-2.5 py-0.5 bg-amber-50 text-amber-800 rounded text-xs font-semibold">{contract.payment_schedule || 'Standard Schedule'}</span>
                  </div>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                  contract.status === 'Active' ? 'bg-[#e6f4ea] text-[#1e8e3e]' : contract.status === 'Pending Review' ? 'bg-[#fff8e1] text-[#f57f17]' : 'bg-gray-100 text-gray-600'
                }`}>
                  {contract.status}
                </span>
              </div>

              {/* Financial Summary Box */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-[#f8fafc] p-3 rounded-lg border border-[#e2e8f0] text-xs">
                <div>
                  <span className="text-gray-500 block">Total Agreed Fee</span>
                  <span className="font-bold text-sm text-[#041635]">BDT {Number(contract.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Retainer Required</span>
                  <span className="font-bold text-sm text-[#041635]">BDT {Number(contract.retainer_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Total Paid</span>
                  <span className="font-bold text-sm text-[#10b981]">BDT {Number(contract.total_paid || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Outstanding Balance</span>
                  <span className="font-bold text-sm text-[#c5221f]">BDT {Number(contract.outstanding_balance !== undefined ? contract.outstanding_balance : contract.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end items-center space-x-2">
                {contract.status === 'Active' && (
                  <button onClick={() => updateContractStatus(contract.id, 'terminate')} className="px-3 py-1.5 bg-red-100 text-red-700 text-xs font-bold rounded hover:bg-red-200 transition-colors">Terminate Contract</button>
                )}
                {['Pending Review', 'PENDING_CONTRACT', 'Draft', 'Pending_Signature'].includes(contract.status) && (
                  <button onClick={() => updateContractStatus(contract.id, 'accept')} className="px-3 py-1.5 bg-[#041635] text-white text-xs font-bold rounded hover:bg-[#1B2B4B] transition-colors">Accept Contract</button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4 animate-fadeIn max-h-[90vh] overflow-y-auto">
            <h3 className="font-serif text-xl font-bold text-[#041635] flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary">description</span>
              Create New Contract Agreement
            </h3>
            <form onSubmit={handleCreateContract} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Select Client *</label>
                <select
                  required
                  value={formData.client_id}
                  onChange={e => setFormData({ ...formData, client_id: e.target.value })}
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#041635]"
                >
                  <option value="">Choose a client...</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name || c.email}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Agreement Title *</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. Legal Representation Agreement"
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#041635]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Fee Structure *</label>
                  <select
                    value={formData.fee_structure}
                    onChange={e => setFormData({ ...formData, fee_structure: e.target.value })}
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#041635]"
                  >
                    <option value="Fixed Fee">Fixed Fee</option>
                    <option value="Milestone-based">Milestone-based</option>
                    <option value="Retainer + Hourly">Retainer + Hourly</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Payment Schedule *</label>
                  <select
                    value={formData.payment_schedule}
                    onChange={e => setFormData({ ...formData, payment_schedule: e.target.value })}
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#041635]"
                  >
                    <option value="100% Upfront">100% Upfront</option>
                    <option value="50% Upfront, 50% Completion">50% Upfront, 50% Completion</option>
                    <option value="Per Milestone">Per Milestone</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Total Fee Amount (BDT) *</label>
                  <input
                    type="number"
                    required
                    value={formData.amount}
                    onChange={e => setFormData({ ...formData, amount: e.target.value })}
                    placeholder="e.g. 50000"
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#041635]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Retainer Amount (BDT)</label>
                  <input
                    type="number"
                    value={formData.retainer_amount}
                    onChange={e => setFormData({ ...formData, retainer_amount: e.target.value })}
                    placeholder="e.g. 15000"
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#041635]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-[#041635] text-white rounded-lg text-xs font-bold hover:bg-[#1B2B4B] shadow-sm"
                >
                  {submitting ? 'Creating...' : 'Create Agreement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default LawyerContractsView;
