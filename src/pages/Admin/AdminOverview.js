import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import toast from 'react-hot-toast';

const AdminOverview = () => {
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalLawyers: 0,
    verifiedLawyers: 0,
    openJobs: 0,
    activeContracts: 0,
    platformRevenue: 0,
  });
  const [recentSignups, setRecentSignups] = useState([]);
  const [recentJobs, setRecentJobs] = useState([]);
  const [recentProposals, setRecentProposals] = useState([]);
  const [pendingActions, setPendingActions] = useState({
    verifications: 0,
    flaggedReviews: 0,
    unreadInquiries: 0,
  });
  const [commissionRate, setCommissionRate] = useState(10);
  const [savingRate, setSavingRate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lawyerBreakdown, setLawyerBreakdown] = useState([]);

  // Mock data for charts
  const registrationData = [
    { month: 'Jan', count: 45 },
    { month: 'Feb', count: 52 },
    { month: 'Mar', count: 38 },
    { month: 'Apr', count: 65 },
    { month: 'May', count: 80 },
    { month: 'Jun', count: 110 },
  ];
  const maxReg = Math.max(...registrationData.map(d => d.count));

  const jobsByDept = [
    { dept: 'Corporate', count: 34 },
    { dept: 'Family', count: 28 },
    { dept: 'Criminal', count: 15 },
    { dept: 'Real Estate', count: 42 },
    { dept: 'Intellectual', count: 19 },
  ];
  const maxJobs = Math.max(...jobsByDept.map(d => d.count));

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // Real-time subscription for live admin dashboard updates
  useEffect(() => {
    const channel = supabase.channel('admin_dashboard_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lawyers' }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_posts' }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_proposals' }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'feedback' }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contact_inquiries' }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lawyer_payouts' }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cases' }, () => fetchDashboardData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      let cfgRate = 10;
      try {
        const { data: cfg } = await supabase.from('platform_commission_config').select('*').eq('id', 1).single();
        if (cfg?.commission_percentage !== undefined) {
          cfgRate = Number(cfg.commission_percentage);
          setCommissionRate(cfgRate);
        }
      } catch (e) {}

      const [
        { count: usersCount },
        { count: lawyersCount },
        { count: verifiedCount },
        { count: openJobsCount },
        { count: activeContractsCount },
        { data: signups },
        { count: pendingVerifications },
        { count: flaggedReviews },
        { count: unreadInquiries },
        { data: finSummary },
        { count: aptsCount },
      ] = await Promise.all([
        supabase.from('users').select('*', { count: 'exact', head: true }),
        supabase.from('lawyers').select('*', { count: 'exact', head: true }),
        supabase.from('lawyers').select('*', { count: 'exact', head: true }).eq('verification_status', 'verified'),
        supabase.from('job_posts').select('*', { count: 'exact', head: true }).eq('status', 'open'),
        supabase.from('contracts').select('*', { count: 'exact', head: true }).in('status', ['active', 'Active', 'Pending Review', 'pending_review', 'Draft', 'draft']),
        supabase.from('users').select('*').order('created_at', { ascending: false }).limit(5),
        supabase.from('lawyers').select('*', { count: 'exact', head: true }).eq('verification_status', 'pending'),
        supabase.from('feedback').select('*', { count: 'exact', head: true }).eq('is_flagged', true),
        supabase.from('contact_inquiries').select('*', { count: 'exact', head: true }).eq('status', 'unread'),
        supabase.rpc('fn_get_admin_financial_summary').maybeSingle(),
        supabase.from('appointments').select('*', { count: 'exact', head: true }),
      ]);

      const calculatedRevenue = finSummary ? Number(finSummary.total_platform_revenue || 0) : 0;

      setStats({
        totalUsers: usersCount || 0,
        totalLawyers: lawyersCount || 0,
        verifiedLawyers: verifiedCount || 0,
        openJobs: openJobsCount || 0,
        activeContracts: (activeContractsCount || 0) + (aptsCount || 0),
        platformRevenue: calculatedRevenue,
      });

      setRecentSignups(signups || []);

      // Resilient Recent Jobs (fetch from job_posts and jobs, then manually enrich clients)
      let jData = [];
      try {
        let posts = [], jobsList = [];
        try { const r1 = await supabase.from('job_posts').select('*').order('created_at', { ascending: false }).limit(5); posts = r1.data || []; } catch (e) {}
        try { const r2 = await supabase.from('jobs').select('*').order('created_at', { ascending: false }).limit(5); jobsList = r2.data || []; } catch (e) {}
        
        const allJobs = [...(posts || []), ...(jobsList || [])];
        const uniqueJobsMap = new Map();
        allJobs.forEach(j => { if (j.id && !uniqueJobsMap.has(j.id)) uniqueJobsMap.set(j.id, j); });
        const sortedJobs = Array.from(uniqueJobsMap.values()).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 5);

        const clientIds = [...new Set(sortedJobs.map(j => j.client_id).filter(Boolean))];
        let userMap = {};
        if (clientIds.length > 0) {
          let usersData = []; try { const r = await supabase.from('users').select('id, name, full_name, email').in('id', clientIds); usersData = r.data || []; } catch (e) {}
          if (usersData) usersData.forEach(u => { userMap[u.id] = u; });
        }

        jData = sortedJobs.map(job => ({
          ...job,
          client: userMap[job.client_id] || { name: 'Client User', email: '' }
        }));
      } catch (e2) {
        console.warn('Failed to load recent jobs cleanly:', e2);
      }
      setRecentJobs(jData);

      // Resilient Recent Proposals
      let prData = [];
      try {
        let props = []; try { const r = await supabase.from('job_proposals').select('*').order('created_at', { ascending: false }).limit(5); props = r.data || []; } catch (e) {}
        if (props && props.length > 0) {
          const lawyerIds = [...new Set(props.map(p => p.lawyer_id).filter(Boolean))];
          const jobIds = [...new Set(props.map(p => p.job_post_id).filter(Boolean))];

          let lMap = {}, jMap = {};
          if (lawyerIds.length > 0) {
            let lUsers = []; try { const r = await supabase.from('users').select('id, name, full_name, email').in('id', lawyerIds); lUsers = r.data || []; } catch (e) {}
            lUsers.forEach(u => { lMap[u.id] = u; });
          }
          if (jobIds.length > 0) {
            let jPosts = []; try { const r = await supabase.from('job_posts').select('id, title').in('id', jobIds); jPosts = r.data || []; } catch (e) {}
            jPosts.forEach(jp => { jMap[jp.id] = jp; });
          }

          prData = props.map(prop => ({
            ...prop,
            lawyer: lMap[prop.lawyer_id] || { name: 'Lawyer User', email: '' },
            job: jMap[prop.job_post_id] || { title: 'Legal Job Post' }
          }));
        }
      } catch (e3) {
        console.warn('Failed to load recent proposals cleanly:', e3);
      }
      setRecentProposals(prData);

      // Resilient Lawyer Payouts & Earnings Breakdown
      let lPayouts = [];
      try {
        let pData = []; try { const r = await supabase.from('lawyer_payouts').select('*').order('total_earned', { ascending: false }).limit(6); pData = r.data || []; } catch (e) {}
        if (pData && pData.length > 0) {
          const lawyerIds = [...new Set(pData.map(p => p.lawyer_id).filter(Boolean))];
          let userMap = {};
          if (lawyerIds.length > 0) {
            let usersData = []; try { const r = await supabase.from('users').select('id, name, email').in('id', lawyerIds); usersData = r.data || []; } catch (e) {}
            usersData.forEach(u => { userMap[u.id] = u; });
          }
          lPayouts = pData.map(item => ({
            ...item,
            lawyer: userMap[item.lawyer_id] || { name: 'Verified Lawyer', email: '' }
          }));
        } else {
          // Fallback: if lawyer_payouts table is empty, show top verified lawyers
          let topLawyers = []; try { const r = await supabase.from('lawyers').select('*').eq('verification_status', 'verified').limit(6); topLawyers = r.data || []; } catch (e) {}
          if (topLawyers && topLawyers.length > 0) {
            const userIds = topLawyers.map(l => l.user_id).filter(Boolean);
            let uMap = {};
            if (userIds.length > 0) {
              let uList = []; try { const r = await supabase.from('users').select('id, name, email').in('id', userIds); uList = r.data || []; } catch (e) {}
              uList.forEach(u => { uMap[u.id] = u; });
            }
            lPayouts = topLawyers.map(tl => ({
              id: tl.id,
              lawyer_id: tl.user_id,
              total_earned: (tl.hourly_rate || 5000) * 10,
              pending_payout: 0,
              lawyer: uMap[tl.user_id] || { name: 'Verified Lawyer', email: '' }
            }));
          }
        }
      } catch (e4) {}
      setLawyerBreakdown(lPayouts);

      let unreadInquiriesCount = unreadInquiries || 0;
      try {
        const localList = JSON.parse(localStorage.getItem('local_contact_inquiries') || '[]');
        const unreadLocal = localList.filter(i => (!i.status || i.status === 'unread')).length;
        unreadInquiriesCount += unreadLocal;
      } catch (e5) {}

      setPendingActions({
        verifications: pendingVerifications || 0,
        flaggedReviews: flaggedReviews || 0,
        unreadInquiries: unreadInquiriesCount,
      });

    } catch (err) {
      console.error(err);
      setError('Failed to load admin overview data. Please check your network connection.');
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateCommissionRate = async (e) => {
    e.preventDefault();
    setSavingRate(true);
    try {
      const { error } = await supabase
        .from('platform_commission_config')
        .upsert({ id: 1, commission_percentage: Number(commissionRate), updated_at: new Date().toISOString() });
      if (error) throw error;
      toast.success(`Platform commission rate updated to ${commissionRate}%`);
      fetchDashboardData();
    } catch (err) {
      console.error(err);
      toast.error('Failed to update commission rate');
    } finally {
      setSavingRate(false);
    }
  };

  const StatCard = ({ title, value, icon, percentChange }) => {
    const isPositive = percentChange >= 0;
    return (
      <div className="bg-surface-white rounded-lg border border-border-subtle p-6 shadow-sm flex flex-col justify-between">
        <div className="flex justify-between items-start mb-4">
          <div className="text-text-muted font-medium text-sm">{title}</div>
          <div className="w-10 h-10 rounded-md bg-bg-light flex items-center justify-center text-xl text-navy-primary">
            {icon}
          </div>
        </div>
        <div className="flex items-end gap-3">
          <div className="text-3xl font-bold text-navy-primary font-serif">
            {title.includes('Revenue') ? `BDT ${Number(value || 0).toLocaleString()}` : (typeof value === 'number' ? value.toLocaleString() : value)}
          </div>
          <div className={`text-sm font-semibold mb-1 flex items-center ${isPositive ? 'text-success-green' : 'text-danger-red'}`}>
            {isPositive ? '↑' : '↓'} {Math.abs(percentChange)}%
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-navy-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 max-w-container-max mx-auto flex items-center justify-center min-h-[400px]">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8 max-w-md text-center space-y-4">
          <span className="material-symbols-outlined text-5xl text-red-500">error_outline</span>
          <h3 className="text-xl font-bold text-navy-primary">Failed to Load Dashboard</h3>
          <p className="text-gray-600 text-sm">{error}</p>
          <button 
            onClick={() => { setLoading(true); setError(null); fetchDashboardData(); }}
            className="px-6 py-2.5 bg-navy-primary hover:bg-navy-primary/90 text-white font-bold rounded-xl shadow transition active:scale-95"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto pb-12">
      <h1 className="text-3xl font-serif font-bold text-navy-primary mb-8">Dashboard Overview</h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard title="Total Users" value={stats.totalUsers} icon="👥" percentChange={12.5} />
        <StatCard title="Total Lawyers" value={stats.totalLawyers} icon="⚖️" percentChange={8.2} />
        <StatCard title="Verified Lawyers" value={stats.verifiedLawyers} icon="✓" percentChange={15.0} />
        <StatCard title="Open Jobs" value={stats.openJobs} icon="💼" percentChange={-2.4} />
        <StatCard title="Active Contracts" value={stats.activeContracts} icon="📄" percentChange={24.1} />
        <StatCard title="Platform Revenue (BDT)" value={Number(stats.platformRevenue || 0).toFixed(2)} icon="💰" percentChange={18.7} />
      </div>

      {/* Commission Configuration Box */}
      <div className="bg-surface-white rounded-lg border border-border-subtle p-6 shadow-sm mb-8 flex flex-col md:flex-row items-center justify-between gap-6">
        <div>
          <h2 className="text-lg font-bold text-navy-primary">Platform Commission Configuration</h2>
          <p className="text-sm text-text-muted mt-1">
            Global commission percentage applied automatically to simulated consultation payments and case milestones via database triggers.
          </p>
        </div>
        <form onSubmit={handleUpdateCommissionRate} className="flex items-center gap-3 shrink-0">
          <div className="relative">
            <input 
              type="number" 
              step="0.01" 
              min="0" 
              max="100" 
              value={commissionRate} 
              onChange={(e) => setCommissionRate(e.target.value)}
              className="w-28 px-3 py-2 border border-border-subtle rounded-md text-navy-primary font-bold pr-8 text-right focus:outline-none focus:border-navy-primary"
            />
            <span className="absolute right-3 top-2.5 text-gray-400 font-bold">%</span>
          </div>
          <button 
            type="submit" 
            disabled={savingRate}
            className="bg-navy-primary text-white px-5 py-2 rounded-md font-bold text-sm hover:bg-navy-secondary transition-colors disabled:opacity-50"
          >
            {savingRate ? 'Saving...' : 'Update Rate'}
          </button>
        </form>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Registration Chart */}
        <div className="bg-surface-white rounded-lg border border-border-subtle p-6 shadow-sm">
          <h2 className="text-lg font-bold text-navy-primary mb-6">User Registrations (Last 6 Months)</h2>
          <div className="h-64 flex items-end gap-4 px-2">
            {registrationData.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                <div className="w-full bg-bg-light rounded-t-sm h-full relative flex items-end">
                  <div 
                    className="w-full bg-accent-gold rounded-t-sm transition-all duration-500 relative group-hover:brightness-110"
                    style={{ height: `${(d.count / maxReg) * 100}%` }}
                  >
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-navy-primary text-white text-xs py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                      {d.count}
                    </div>
                  </div>
                </div>
                <div className="text-xs text-text-muted font-medium">{d.month}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Jobs by Department Chart */}
        <div className="bg-surface-white rounded-lg border border-border-subtle p-6 shadow-sm">
          <h2 className="text-lg font-bold text-navy-primary mb-6">Active Jobs by Department</h2>
          <div className="flex flex-col gap-5 justify-center h-64">
            {jobsByDept.map((d, i) => (
              <div key={i} className="w-full">
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium text-text-dark">{d.dept}</span>
                  <span className="text-text-muted">{d.count}</span>
                </div>
                <div className="w-full bg-bg-light h-3 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-navy-primary rounded-full transition-all duration-500"
                    style={{ width: `${(d.count / maxJobs) * 100}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tables Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Signups */}
        <div className="bg-surface-white rounded-lg border border-border-subtle shadow-sm overflow-hidden flex flex-col">
          <div className="p-5 border-b border-border-subtle">
            <h2 className="text-lg font-bold text-navy-primary">Recent Signups</h2>
          </div>
          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-bg-light text-text-muted text-sm border-b border-border-subtle">
                  <th className="px-5 py-3 font-semibold">User</th>
                  <th className="px-5 py-3 font-semibold">Role</th>
                  <th className="px-5 py-3 font-semibold">Joined</th>
                </tr>
              </thead>
              <tbody>
                {recentSignups.map((user) => (
                  <tr key={user.id} className="border-b border-border-subtle/50 hover:bg-bg-light/50 transition-colors">
                    <td className="px-5 py-4">
                      <div className="font-semibold text-text-dark">{user.name}</div>
                      <div className="text-sm text-text-muted">{user.email}</div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-semibold uppercase tracking-wider ${
                        user.user_type === 'lawyer' ? 'bg-navy-primary text-white' : 'bg-gray-200 text-gray-700'
                      }`}>
                        {user.user_type}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm text-text-muted">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
                {recentSignups.length === 0 && (
                  <tr>
                    <td colSpan="3" className="px-5 py-12 text-center text-text-muted">
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <span className="material-symbols-outlined text-4xl text-gray-300">person_add_disabled</span>
                        <p className="font-bold text-gray-600">No Recent User Signups</p>
                        <p className="text-xs text-gray-400">New user registrations will appear here in real-time.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pending Actions */}
        <div className="bg-surface-white rounded-lg border border-border-subtle shadow-sm overflow-hidden flex flex-col">
          <div className="p-5 border-b border-border-subtle">
            <h2 className="text-lg font-bold text-navy-primary">Pending Actions</h2>
          </div>
          <div className="p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between p-4 bg-amber-50 rounded-lg border border-amber-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-lg">
                  ⚖️
                </div>
                <div>
                  <div className="font-bold text-text-dark">Lawyer Verifications</div>
                  <div className="text-sm text-text-muted">Pending approval</div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-xl font-bold text-amber-600">{pendingActions.verifications}</span>
                <a href="/admin/verifications" className="text-sm font-semibold text-navy-primary hover:underline">Review →</a>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg border border-red-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-100 text-danger-red flex items-center justify-center text-lg">
                  🚩
                </div>
                <div>
                  <div className="font-bold text-text-dark">Flagged Reviews</div>
                  <div className="text-sm text-text-muted">Require moderation</div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-xl font-bold text-danger-red">{pendingActions.flaggedReviews}</span>
                <a href="/admin/reviews" className="text-sm font-semibold text-navy-primary hover:underline">Review →</a>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-lg">
                  ✉️
                </div>
                <div>
                  <div className="font-bold text-text-dark">Contact Inquiries</div>
                  <div className="text-sm text-text-muted">Unread messages</div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-xl font-bold text-blue-600">{pendingActions.unreadInquiries}</span>
                <a href="/admin/settings" className="text-sm font-semibold text-navy-primary hover:underline">View →</a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Live Marketplace Activity (Job Board & Proposals) */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Case Posts */}
        <div className="bg-surface-white rounded-lg border border-border-subtle shadow-sm overflow-hidden flex flex-col">
          <div className="p-5 border-b border-border-subtle flex justify-between items-center">
            <h2 className="text-lg font-bold text-navy-primary flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary">work</span>
              Live Case Posts
            </h2>
            <a href="/admin/jobs" className="text-xs font-bold text-navy-primary hover:underline">View All →</a>
          </div>
          <div className="p-4 space-y-3 flex-1 overflow-y-auto max-h-80 custom-scrollbar">
            {recentJobs.length === 0 ? (
              <p className="text-sm text-text-muted text-center py-8">No job posts yet in marketplace.</p>
            ) : (
              recentJobs.map((job) => (
                <div key={job.id} className="p-3 bg-bg-light rounded-lg border border-border-subtle flex justify-between items-start gap-3">
                  <div className="overflow-hidden">
                    <span className="text-[10px] font-bold uppercase bg-navy-primary/10 text-navy-primary px-2 py-0.5 rounded">
                      {job.legal_category}
                    </span>
                    <h4 className="font-bold text-sm text-text-dark mt-1 truncate">{job.title}</h4>
                    <p className="text-xs text-text-muted">By {job.client?.full_name || job.client?.name || 'Client'} • BDT {job.budget_max || 'Open'}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                      job.status === 'open' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-700'
                    }`}>
                      {job.status}
                    </span>
                    <p className="text-[10px] text-text-muted mt-1">{new Date(job.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Proposals */}
        <div className="bg-surface-white rounded-lg border border-border-subtle shadow-sm overflow-hidden flex flex-col">
          <div className="p-5 border-b border-border-subtle flex justify-between items-center">
            <h2 className="text-lg font-bold text-navy-primary flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary">assignment_ind</span>
              Live Lawyer Proposals
            </h2>
            <span className="text-xs text-text-muted font-medium">Realtime bids</span>
          </div>
          <div className="p-4 space-y-3 flex-1 overflow-y-auto max-h-80 custom-scrollbar">
            {recentProposals.length === 0 ? (
              <p className="text-sm text-text-muted text-center py-8">No lawyer proposals submitted yet.</p>
            ) : (
              recentProposals.map((prop) => (
                <div key={prop.id} className="p-3 bg-bg-light rounded-lg border border-border-subtle flex justify-between items-start gap-3">
                  <div className="overflow-hidden">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-sm text-text-dark truncate">{prop.lawyer?.full_name || prop.lawyer?.name || 'Lawyer'}</span>
                      <span className="text-xs text-text-muted">bid BDT {Number(prop.proposed_fee).toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-text-muted truncate mt-0.5">On: {prop.job?.title || 'Case'}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                      prop.status === 'accepted' ? 'bg-emerald-100 text-emerald-800' :
                      prop.status === 'rejected' ? 'bg-red-100 text-red-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {prop.status}
                    </span>
                    <p className="text-[10px] text-text-muted mt-1">{new Date(prop.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Per-Lawyer Revenue & Earnings Breakdown */}
      <div className="mt-8 bg-surface-white rounded-lg border border-border-subtle shadow-sm overflow-hidden">
        <div className="p-5 border-b border-border-subtle flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-navy-primary">Lawyer Payouts & Platform Commission Breakdown</h2>
            <p className="text-xs text-text-muted">Live overview of earnings and commission generated per verified lawyer.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-bg-light text-text-muted text-sm border-b border-border-subtle">
                <th className="px-5 py-3 font-semibold">Lawyer</th>
                <th className="px-5 py-3 font-semibold">Total Earned (Net)</th>
                <th className="px-5 py-3 font-semibold">Pending Payout</th>
                <th className="px-5 py-3 font-semibold">Estimated Platform Rev ({commissionRate}%)</th>
              </tr>
            </thead>
            <tbody>
              {lawyerBreakdown.map((item) => {
                const earned = Number(item.total_earned || 0);
                const pending = Number(item.pending_payout || 0);
                const estRev = earned > 0 ? (earned / (1 - (commissionRate / 100))) * (commissionRate / 100) : 0;
                return (
                  <tr key={item.lawyer_id} className="border-b border-border-subtle/50 hover:bg-bg-light/50 transition-colors">
                    <td className="px-5 py-4">
                      <div className="font-semibold text-text-dark">{item.lawyer?.name || 'Verified Lawyer'}</div>
                      <div className="text-xs text-text-muted">{item.lawyer?.email || item.lawyer_id}</div>
                    </td>
                    <td className="px-5 py-4 font-bold text-green-700">
                      BDT {earned.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-5 py-4 font-semibold text-amber-600">
                      BDT {pending.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-5 py-4 font-bold text-navy-primary">
                      BDT {estRev.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                );
              })}
              {lawyerBreakdown.length === 0 && (
                <tr>
                  <td colSpan="4" className="px-5 py-12 text-center text-text-muted">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <span className="material-symbols-outlined text-4xl text-gray-300">account_balance_wallet</span>
                      <p className="font-bold text-gray-600">No Lawyer Payout Records Found</p>
                      <p className="text-xs text-gray-400">When lawyers complete consultations or case milestones, their earnings breakdown will display here.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminOverview;
