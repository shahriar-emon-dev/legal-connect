import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

const LawyerBillingView = () => {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [payoutRequests, setPayoutRequests] = useState([]);
  const [stats, setStats] = useState({ total_earnings: 0, pending: 0, platform_fee: 0, withdrawn: 0, available_balance: 0 });
  const [loading, setLoading] = useState(true);

  // Modal State
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Bank Transfer');
  const [accountNumber, setAccountNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [notes, setNotes] = useState('');
  const [submittingWithdraw, setSubmittingWithdraw] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    fetchBillingData();

    const channel = supabase
      .channel(`lawyer_billing_realtime_${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => fetchBillingData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lawyer_payouts' }, () => fetchBillingData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payout_requests' }, () => fetchBillingData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const fetchBillingData = async () => {
    try {
      setLoading(true);
      const currentUserId = user?.id;
      if (!currentUserId) {
        setTransactions([]);
        setPayoutRequests([]);
        setStats({ total_earnings: 0, pending: 0, platform_fee: 0, withdrawn: 0, available_balance: 0 });
        setLoading(false);
        return;
      }

      // Query payments table first
      let paymentsList = [];
      try {
        const { data: payData } = await supabase
          .from('payments')
          .select('*, client:users!payments_client_id_fkey(name, email)')
          .eq('lawyer_id', currentUserId)
          .order('created_at', { ascending: false });
        if (payData) paymentsList = payData;
      } catch (e) {}

      // Fallback or combine with billing_invoices
      let invoicesList = [];
      try {
        const { data: invData } = await supabase
          .from('billing_invoices')
          .select('*')
          .eq('lawyer_id', currentUserId)
          .order('created_at', { ascending: false });
        if (invData) invoicesList = invData;
      } catch (e2) {}

      // Query payout_requests
      let payoutsList = [];
      try {
        const { data: prData } = await supabase
          .from('payout_requests')
          .select('*')
          .eq('lawyer_id', currentUserId)
          .order('requested_at', { ascending: false });
        if (prData) payoutsList = prData;
      } catch (e3) {}

      setPayoutRequests(payoutsList);

      const combined = [
        ...paymentsList.map(p => ({
          id: p.id,
          created_at: p.created_at,
          client_name: p.client?.name || p.client?.email || 'Client Consultation',
          amount: p.amount,
          lawyer_payout: p.lawyer_payout || p.amount,
          commission_amount: p.commission_amount || 0,
          status: p.status || 'completed',
          reference_number: p.reference_number,
          type: 'payment'
        })),
        ...invoicesList.map(i => ({
          id: i.id,
          created_at: i.created_at,
          client_name: i.client?.name || i.client_name || 'Legal Service Invoice',
          amount: i.amount,
          lawyer_payout: i.amount,
          commission_amount: 0,
          status: i.status || 'pending',
          reference_number: `INV-${i.id?.toString().slice(0, 6)}`,
          type: 'invoice'
        }))
      ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      setTransactions(combined);

      const paidSum = combined
        .filter(t => t.status === 'completed' || t.status === 'released' || t.status === 'paid')
        .reduce((sum, t) => sum + Number(t.lawyer_payout || 0), 0);
      const pendingSum = combined
        .filter(t => t.status === 'pending')
        .reduce((sum, t) => sum + Number(t.lawyer_payout || 0), 0);
      const commSum = combined
        .reduce((sum, t) => sum + Number(t.commission_amount || 0), 0);

      const withdrawnSum = payoutsList
        .filter(pr => pr.status === 'approved' || pr.status === 'processed')
        .reduce((sum, pr) => sum + Number(pr.amount || 0), 0);

      const pendingWithdrawalsSum = payoutsList
        .filter(pr => pr.status === 'pending')
        .reduce((sum, pr) => sum + Number(pr.amount || 0), 0);

      const availableBalance = Math.max(0, paidSum - withdrawnSum - pendingWithdrawalsSum);

      setStats({
        total_earnings: paidSum,
        pending: pendingSum,
        platform_fee: commSum,
        withdrawn: withdrawnSum + pendingWithdrawalsSum,
        available_balance: availableBalance
      });
    } catch (err) {
      console.error('Error fetching billing data:', err);
      setTransactions([]);
      setPayoutRequests([]);
      setStats({ total_earnings: 0, pending: 0, platform_fee: 0, withdrawn: 0, available_balance: 0 });
    } finally {
      setLoading(false);
    }
  };

  const handleRequestWithdraw = async (e) => {
    e.preventDefault();
    if (!withdrawAmount || Number(withdrawAmount) <= 0) {
      toast.error('Please enter a valid withdrawal amount.');
      return;
    }
    if (Number(withdrawAmount) > stats.available_balance) {
      toast.error(`Requested amount exceeds available balance (BDT ${stats.available_balance.toLocaleString()}).`);
      return;
    }
    if (!accountNumber.trim()) {
      toast.error('Please provide your bank or account number.');
      return;
    }

    setSubmittingWithdraw(true);
    try {
      const payload = {
        lawyer_id: user.id,
        amount: Number(withdrawAmount),
        status: 'pending',
        bank_details: {
          method: paymentMethod,
          account_number: accountNumber,
          bank_name: paymentMethod === 'Bank Transfer' ? bankName : undefined
        },
        notes: notes.trim() || undefined,
        requested_at: new Date().toISOString()
      };

      const { error: insertErr } = await supabase.from('payout_requests').insert([payload]);
      if (insertErr) throw insertErr;

      toast.success('Payout request submitted successfully! Admin will process it within 24-48 hours.');
      setShowWithdrawModal(false);
      setWithdrawAmount('');
      setAccountNumber('');
      setBankName('');
      setNotes('');
      fetchBillingData();
    } catch (err) {
      console.error('Error requesting payout:', err);
      toast.error(err.message || 'Failed to submit withdrawal request.');
    } finally {
      setSubmittingWithdraw(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500 animate-pulse">Loading billing and payout data...</div>;

  return (
    <div className="flex-1 p-8 overflow-y-auto custom-scrollbar bg-surface-container-lowest">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 animate-fadeIn">
        <div>
          <h2 className="font-serif text-[32px] font-bold text-[#041635] mb-2">Billing & Invoices</h2>
          <p className="text-gray-600 text-[15px] max-w-xl">
            Track your earnings, manage invoices, and request payout withdrawals directly to your bank or mobile wallet.
          </p>
        </div>
        <div>
          <button
            onClick={() => setShowWithdrawModal(true)}
            disabled={stats.available_balance <= 0}
            className={`px-6 py-3 font-bold rounded-xl shadow-md transition-all flex items-center gap-2 ${
              stats.available_balance > 0
                ? 'bg-[#1E6B4A] text-white hover:bg-[#165138] active:scale-95'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            <span className="material-symbols-outlined">payments</span>
            Request Payout / Withdrawal
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8 animate-fadeIn">
        <div className="bg-white p-6 rounded-lg border border-[#D0D7E3] shadow-sm">
          <p className="text-sm font-bold text-gray-500 uppercase">Available for Payout</p>
          <h3 className="text-3xl font-serif font-bold text-[#1E6B4A] mt-2">BDT {stats.available_balance.toLocaleString()}</h3>
          <p className="text-xs text-gray-400 mt-1">Ready for withdrawal</p>
        </div>
        <div className="bg-white p-6 rounded-lg border border-[#D0D7E3] shadow-sm">
          <p className="text-sm font-bold text-gray-500 uppercase">Net Payout Earnings</p>
          <h3 className="text-3xl font-serif font-bold text-[#041635] mt-2">BDT {stats.total_earnings.toLocaleString()}</h3>
          <p className="text-xs text-gray-400 mt-1">Completed fees</p>
        </div>
        <div className="bg-white p-6 rounded-lg border border-[#D0D7E3] shadow-sm">
          <p className="text-sm font-bold text-gray-500 uppercase">Pending Payments</p>
          <h3 className="text-3xl font-serif font-bold text-orange-600 mt-2">BDT {stats.pending.toLocaleString()}</h3>
          <p className="text-xs text-gray-400 mt-1">In escrow / pending invoice</p>
        </div>
        <div className="bg-white p-6 rounded-lg border border-[#D0D7E3] shadow-sm">
          <p className="text-sm font-bold text-gray-500 uppercase">Platform Fee Deducted</p>
          <h3 className="text-3xl font-serif font-bold text-gray-600 mt-2">BDT {(stats.platform_fee || 0).toLocaleString()}</h3>
          <p className="text-xs text-gray-400 mt-1">10% platform service fee</p>
        </div>
      </div>

      {/* Payout Requests History */}
      {payoutRequests.length > 0 && (
        <div className="mb-8 animate-fadeIn">
          <h3 className="font-serif text-2xl font-bold text-[#041635] mb-4">Payout Requests History</h3>
          <div className="bg-white rounded-lg border border-[#D0D7E3] shadow-sm overflow-hidden">
            {/* Mobile Card Stack (< 768px) */}
            <div className="md:hidden divide-y divide-gray-100">
              {payoutRequests.map(pr => (
                <div key={`mobile-pr-${pr.id}`} className="p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-400 uppercase">
                      {new Date(pr.requested_at).toLocaleDateString()}
                    </span>
                    <span className={`px-2.5 py-0.5 text-[10px] font-bold uppercase rounded-full ${
                      pr.status === 'processed' || pr.status === 'approved'
                        ? 'bg-green-100 text-green-800'
                        : pr.status === 'rejected'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-orange-100 text-orange-800'
                    }`}>
                      {pr.status}
                    </span>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-[#041635]">{pr.bank_details?.method || 'Bank Transfer'}</div>
                    <div className="text-xs text-gray-500 font-mono mt-0.5">
                      {pr.bank_details?.bank_name ? `${pr.bank_details.bank_name} - ` : ''}
                      {pr.bank_details?.account_number || pr.bank_details?.account}
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-gray-50 text-xs">
                    <span className="text-gray-500">Amount:</span>
                    <span className="font-bold text-[#1E6B4A] text-sm">BDT {Number(pr.amount || 0).toLocaleString()}</span>
                  </div>
                  {pr.notes && (
                    <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded-lg">{pr.notes}</div>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop Table (>= 768px) */}
            <table className="hidden md:table w-full text-left">
              <thead className="bg-gray-50 border-b border-[#D0D7E3]">
                <tr>
                  <th className="p-4 text-sm font-bold text-gray-600">Requested Date</th>
                  <th className="p-4 text-sm font-bold text-gray-600">Method & Account</th>
                  <th className="p-4 text-sm font-bold text-gray-600">Amount</th>
                  <th className="p-4 text-sm font-bold text-gray-600">Status</th>
                  <th className="p-4 text-sm font-bold text-gray-600">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {payoutRequests.map(pr => (
                  <tr key={pr.id} className="hover:bg-gray-50">
                    <td className="p-4 text-sm text-gray-700">{new Date(pr.requested_at).toLocaleDateString()}</td>
                    <td className="p-4 text-sm">
                      <div className="font-bold text-[#041635]">{pr.bank_details?.method || 'Bank Transfer'}</div>
                      <div className="text-[12px] text-gray-500 font-mono">
                        {pr.bank_details?.bank_name ? `${pr.bank_details.bank_name} - ` : ''}
                        {pr.bank_details?.account_number || pr.bank_details?.account}
                      </div>
                    </td>
                    <td className="p-4 text-sm font-bold text-[#1E6B4A]">BDT {Number(pr.amount || 0).toLocaleString()}</td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 text-xs font-bold uppercase rounded-full ${
                        pr.status === 'processed' || pr.status === 'approved'
                          ? 'bg-green-100 text-green-800'
                          : pr.status === 'rejected'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-orange-100 text-orange-800'
                      }`}>
                        {pr.status}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-gray-500 max-w-xs truncate">{pr.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Transaction History */}
      <h3 className="font-serif text-2xl font-bold text-[#041635] mb-4 animate-fadeIn">Transaction History</h3>

      <div className="space-y-4 animate-fadeIn">
        {transactions.length === 0 ? (
          <div className="bg-white p-8 rounded-lg border border-[#D0D7E3] text-center text-gray-500 shadow-sm">
            <span className="material-symbols-outlined text-4xl mb-4 text-gray-300">receipt_long</span>
            <h3 className="text-xl font-bold text-gray-700 mb-2">No Transactions Yet</h3>
            <p>Your financial overview and invoices will appear here once you complete consultations or receive payments.</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-[#D0D7E3] shadow-sm overflow-hidden">
            {/* Mobile Card Stack (< 768px) */}
            <div className="md:hidden divide-y divide-gray-100">
              {transactions.map(tx => (
                <div key={`mobile-tx-${tx.id}`} className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-400">
                      {new Date(tx.created_at).toLocaleDateString()}
                    </span>
                    <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-full ${tx.status === 'completed' || tx.status === 'released' || tx.status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}`}>
                      {tx.status}
                    </span>
                  </div>
                  <div>
                    <div className="font-bold text-sm text-[#041635]">{tx.client_name}</div>
                    {tx.reference_number && <div className="text-[11px] text-gray-400 font-mono mt-0.5">{tx.reference_number}</div>}
                  </div>
                  <div className="flex items-center justify-between pt-1.5 border-t border-gray-50 text-xs">
                    <div className="text-gray-500">
                      Gross: <span className="font-semibold text-gray-700">BDT {Number(tx.amount || 0).toFixed(2)}</span>
                    </div>
                    <div className="font-bold text-green-700 text-sm">
                      Net: BDT {Number(tx.lawyer_payout || tx.amount || 0).toFixed(2)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table (>= 768px) */}
            <table className="hidden md:table w-full text-left">
              <thead className="bg-gray-50 border-b border-[#D0D7E3]">
                <tr>
                  <th className="p-4 text-sm font-bold text-gray-600">Date</th>
                  <th className="p-4 text-sm font-bold text-gray-600">Client / Ref</th>
                  <th className="p-4 text-sm font-bold text-gray-600">Gross Fee</th>
                  <th className="p-4 text-sm font-bold text-gray-600">Platform Fee</th>
                  <th className="p-4 text-sm font-bold text-gray-600">Net Payout</th>
                  <th className="p-4 text-sm font-bold text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {transactions.map(tx => (
                  <tr key={tx.id} className="hover:bg-gray-50">
                    <td className="p-4 text-sm text-gray-700">{new Date(tx.created_at).toLocaleDateString()}</td>
                    <td className="p-4 text-sm">
                      <div className="font-bold text-[#041635]">{tx.client_name}</div>
                      {tx.reference_number && <div className="text-[11px] text-gray-400 font-mono">{tx.reference_number}</div>}
                    </td>
                    <td className="p-4 text-sm font-bold text-gray-700">BDT {Number(tx.amount || 0).toFixed(2)}</td>
                    <td className="p-4 text-sm text-red-600">-BDT {Number(tx.commission_amount || 0).toFixed(2)}</td>
                    <td className="p-4 text-sm font-bold text-green-700">BDT {Number(tx.lawyer_payout || tx.amount || 0).toFixed(2)}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 text-xs font-bold uppercase rounded-full ${tx.status === 'completed' || tx.status === 'released' || tx.status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}`}>
                        {tx.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Request Payout Modal */}
      {showWithdrawModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl p-6 md:p-8 max-w-md w-full shadow-2xl border border-gray-100">
            <div className="flex items-center justify-between mb-4 border-b pb-3">
              <h3 className="font-serif text-xl font-bold text-[#041635]">Request Payout Withdrawal</h3>
              <button
                onClick={() => setShowWithdrawModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleRequestWithdraw} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Available Balance</label>
                <div className="text-xl font-bold text-[#1E6B4A]">BDT {stats.available_balance.toLocaleString()}</div>
              </div>

              <div>
                <label className="block text-sm font-bold text-[#041635] mb-1">Withdrawal Amount (BDT) *</label>
                <input
                  type="number"
                  required
                  min="500"
                  max={stats.available_balance}
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder="e.g. 10000"
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1E6B4A] text-gray-800 font-bold"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-[#041635] mb-1">Payment Method *</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1E6B4A] text-gray-800 font-bold"
                >
                  <option value="Bank Transfer">Bank Transfer (AC / IBAN)</option>
                  <option value="bKash">bKash Mobile Wallet</option>
                  <option value="Nagad">Nagad Mobile Wallet</option>
                  <option value="Rocket">Rocket Mobile Wallet</option>
                </select>
              </div>

              {paymentMethod === 'Bank Transfer' && (
                <div>
                  <label className="block text-sm font-bold text-[#041635] mb-1">Bank Name & Branch *</label>
                  <input
                    type="text"
                    required
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="e.g. Dutch-Bangla Bank, Dhanmondi Branch"
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1E6B4A] text-sm text-gray-800"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-bold text-[#041635] mb-1">
                  {paymentMethod === 'Bank Transfer' ? 'Account Number *' : 'Mobile Wallet Number *'}
                </label>
                <input
                  type="text"
                  required
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder={paymentMethod === 'Bank Transfer' ? 'e.g. 102.101.384729' : 'e.g. 01712345678'}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1E6B4A] text-sm text-gray-800 font-mono"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-[#041635] mb-1">Additional Notes (Optional)</label>
                <textarea
                  rows="2"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Special instructions or routing code..."
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1E6B4A] text-sm text-gray-800 resize-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowWithdrawModal(false)}
                  className="px-5 py-2.5 rounded-xl bg-gray-100 text-gray-600 font-bold text-sm hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingWithdraw}
                  className="px-6 py-2.5 rounded-xl bg-[#1E6B4A] text-white font-bold text-sm hover:bg-[#165138] transition-all shadow-md active:scale-95 disabled:opacity-50"
                >
                  {submittingWithdraw ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default LawyerBillingView;
