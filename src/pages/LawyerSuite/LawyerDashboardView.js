import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';
import { realtimeSync } from '../../services/realtimeSync.service';

const LawyerDashboardView = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    activeAppointments: 0,
    openCases: 0,
    unreadMessages: 0,
    avgRating: 0.0,
    totalEarnings: 0,
    pendingProposals: 0
  });
  const [activeCasesList, setActiveCasesList] = useState([]);
  const [upcomingAppointmentsList, setUpcomingAppointmentsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDashboardData = useCallback(async () => {
    if (!user) return;
    try {
      let userIds = [...new Set([user?.id, user?.auth_id].filter(Boolean))];
      if (userIds.length === 0) return;

      try {
        const { data: lRes } = await supabase
          .from('lawyers')
          .select('id, user_id')
          .or(`user_id.in.(${userIds.map(id => `"${id}"`).join(',')}),id.in.(${userIds.map(id => `"${id}"`).join(',')})`);
        if (lRes) {
          lRes.forEach(l => {
            if (l.id) userIds.push(l.id);
            if (l.user_id) userIds.push(l.user_id);
          });
          userIds = [...new Set(userIds)];
        }
      } catch (lErr) {}

      // Fetch total earnings from payments
      const { data: paymentsData } = await supabase
        .from('payments')
        .select('amount, lawyer_payout, status')
        .in('lawyer_id', userIds)
        .in('status', ['completed', 'released']);

      // Fetch open cases count
      const { count: openCasesCount } = await supabase
        .from('cases')
        .select('*', { count: 'exact', head: true })
        .in('lawyer_id', userIds)
        .in('status', ['Active', 'active', 'Pending', 'pending']);

      // Fetch active appointments (future)
      let upcomingApts = [];
      let appointmentsCount = 0;
      try {
        const res = await supabase
          .from('appointments')
          .select('*, client:users!appointments_client_id_fkey(name)', { count: 'exact' })
          .in('lawyer_id', userIds)
          .order('scheduled_at', { ascending: true })
          .limit(5);
        if (res.data) {
          upcomingApts = res.data;
          appointmentsCount = res.count || upcomingApts.length;
        }
      } catch (e) {}

      if (!upcomingApts || upcomingApts.length === 0) {
        try {
          const res = await supabase
            .from('appointments')
            .select('*', { count: 'exact' })
            .in('lawyer_id', userIds)
            .order('scheduled_at', { ascending: true })
            .limit(5);
          if (res.data && res.data.length > 0) {
            upcomingApts = res.data;
            appointmentsCount = res.count || upcomingApts.length;
            const cIds = [...new Set(upcomingApts.map(a => a.client_id).filter(Boolean))];
            let uList = [];
            if (cIds.length > 0) {
              const { data: uRes } = await supabase.from('users').select('id, name').in('id', cIds);
              if (uRes) uList = uRes;
            }
            upcomingApts = upcomingApts.map(a => ({
              ...a,
              client: uList.find(u => u.id === a.client_id) || { name: 'Client' }
            }));
          }
        } catch (e2) {}
      }

      setUpcomingAppointmentsList(upcomingApts || []);

      // Fetch unread messages via conversations table
      let unreadMsgCount = 0;
      try {
        const { data: lawyerConversations } = await supabase
          .from('conversations')
          .select('id')
          .in('lawyer_id', userIds);
        if (lawyerConversations && lawyerConversations.length > 0) {
          const convIds = lawyerConversations.map(c => c.id);
          const { count } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .in('conversation_id', convIds)
            .eq('is_read', false)
            .not('sender_id', 'in', `(${userIds.join(',')})`);
          unreadMsgCount = count || 0;
        }
      } catch (e) {}

      // Fetch real pending proposals count from job_proposals
      const { count: pendingProposalsCount } = await supabase
        .from('job_proposals')
        .select('*', { count: 'exact', head: true })
        .in('lawyer_id', userIds)
        .eq('status', 'pending');

      // Fetch lawyer rating from lawyers table
      const { data: lawyerData } = await supabase
        .from('lawyers')
        .select('avg_rating')
        .in('user_id', userIds)
        .maybeSingle();

      // Fetch active cases with milestones
      let activeCases = [];
      try {
        const { data } = await supabase
          .from('cases')
          .select('*, case_milestones(*)')
          .in('lawyer_id', userIds)
          .in('status', ['Active', 'active', 'Pending', 'pending'])
          .limit(3);
        if (data) activeCases = data;
      } catch (e) {
        try {
          const { data: fb } = await supabase
            .from('cases')
            .select('*')
            .in('lawyer_id', userIds)
            .in('status', ['Active', 'active', 'Pending', 'pending'])
            .limit(3);
          if (fb) activeCases = fb;
        } catch (e2) {}
      }

      const totalEarnings = (paymentsData || [])
        .reduce((sum, p) => sum + Number(p.lawyer_payout || p.amount || 0), 0);

      setStats({
        activeAppointments: appointmentsCount || 0,
        openCases: openCasesCount || 0,
        unreadMessages: unreadMsgCount,
        avgRating: lawyerData?.avg_rating || 0,
        totalEarnings,
        pendingProposals: pendingProposalsCount || 0
      });

      setActiveCasesList(activeCases || []);

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setError('Failed to load dashboard data. Please check your network connection.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Realtime: re-fetch when admin changes this lawyer's verification status
  useEffect(() => {
    if (!user) return;
    const unsub = realtimeSync.subscribe((event) => {
      const myId = user.id || user.auth_id;
      const affectsMe =
        (event.userId && event.userId === myId) ||
        (event.record?.user_id && event.record.user_id === myId);
      if (affectsMe) {
        fetchDashboardData();
      }
    });
    return () => unsub();
  }, [user, fetchDashboardData]);

  // Supabase CDC: live updates for appointments, cases, messages, contracts
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`lawyer_dashboard_realtime_${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cases' }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contracts' }, () => fetchDashboardData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (loading) {
    return (
      <div className="p-8 max-w-container-max mx-auto flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-primary font-medium">Loading lawyer suite dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 max-w-container-max mx-auto flex items-center justify-center min-h-[400px]">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8 max-w-md text-center space-y-4">
          <span className="material-symbols-outlined text-5xl text-red-500">error_outline</span>
          <h3 className="text-xl font-bold text-primary">Failed to Load Dashboard</h3>
          <p className="text-gray-600 text-sm">{error}</p>
          <button 
            onClick={() => { setLoading(true); setError(null); fetchDashboardData(); }}
            className="px-6 py-2.5 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl shadow transition active:scale-95"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-container-max mx-auto space-y-8 animate-fadeIn">
      {/* Statistics Bar (5 Cards) */}
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 md:gap-6">
        <div className="bg-surface-container-lowest p-6 rounded-lg border border-outline-variant shadow-sm hover:shadow-md transition-shadow group">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-primary-container text-white rounded-lg">
              <span className="material-symbols-outlined" data-icon="event_note">event_note</span>
            </div>
          </div>
          <p className="text-display-lg font-display-lg text-primary">{stats.activeAppointments}</p>
          <p className="text-on-surface-variant text-body-sm font-medium">Active Appointments</p>
        </div>
        
        <div className="bg-surface-container-lowest p-6 rounded-lg border border-outline-variant shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-secondary text-white rounded-lg">
              <span className="material-symbols-outlined" data-icon="folder_shared">folder_shared</span>
            </div>
          </div>
          <p className="text-display-lg font-display-lg text-primary">{stats.openCases}</p>
          <p className="text-on-surface-variant text-body-sm font-medium">Open Cases</p>
        </div>
        
        <div className="bg-surface-container-lowest p-6 rounded-lg border border-outline-variant shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-on-tertiary-container text-white rounded-lg">
              <span className="material-symbols-outlined" data-icon="contract_edit">contract_edit</span>
            </div>
          </div>
          <p className="text-display-lg font-display-lg text-primary">{stats.pendingProposals}</p>
          <p className="text-on-surface-variant text-body-sm font-medium">Pending Proposals</p>
        </div>
        
        <div className="bg-surface-container-lowest p-6 rounded-lg border border-outline-variant shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-primary text-white rounded-lg">
              <span className="material-symbols-outlined" data-icon="chat_bubble">chat_bubble</span>
            </div>
          </div>
          <p className="text-display-lg font-display-lg text-primary">{stats.unreadMessages}</p>
          <p className="text-on-surface-variant text-body-sm font-medium">Unread Messages</p>
        </div>
        
        <div className="bg-surface-container-lowest p-6 rounded-lg border border-outline-variant shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-secondary-container text-on-secondary-container rounded-lg">
              <span className="material-symbols-outlined filled-icon" data-icon="star">star</span>
            </div>
          </div>
          <p className="text-display-lg font-display-lg text-primary">{stats.avgRating || 'N/A'}</p>
          <p className="text-on-surface-variant text-body-sm font-medium">Avg Rating</p>
        </div>
      </section>

      {/* Three-Column Main Grid */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Column 1: Upcoming Consultations & Schedule */}
        <div className="lg:col-span-4 bg-surface-container-lowest rounded-lg border border-outline-variant shadow-sm flex flex-col h-full overflow-hidden">
          <div className="p-6 border-b border-outline-variant flex justify-between items-center bg-surface-container-low/30">
            <h3 className="font-headline-md text-headline-md text-primary">Upcoming Consultations</h3>
            <Link to="/lawyer-suite/appointments" className="text-xs font-bold text-primary hover:underline uppercase tracking-widest">View All</Link>
          </div>
          <div className="p-6 space-y-4">
            {upcomingAppointmentsList && upcomingAppointmentsList.length > 0 ? upcomingAppointmentsList.map(apt => (
              <div key={apt.id} className="p-3 bg-surface-container-low rounded-lg border border-outline-variant space-y-1">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-sm text-primary">{apt.client?.name || 'Client'}</span>
                  <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded font-bold uppercase">{apt.status}</span>
                </div>
                <p className="text-xs text-on-surface-variant">{apt.session_type || 'Consultation'} • BDT {apt.agreed_fee || apt.fee_amount || 0}</p>
                <p className="text-[11px] text-gray-500">{apt.scheduled_at ? new Date(apt.scheduled_at).toLocaleString() : 'Date TBD'}</p>
              </div>
            )) : (
              <div className="text-center py-8 space-y-2">
                <span className="material-symbols-outlined text-4xl text-gray-300">event_available</span>
                <p className="text-sm font-bold text-primary">No upcoming consultations</p>
                <p className="text-xs text-gray-500 max-w-[200px] mx-auto">Your booked sessions and consultation appointments will appear here.</p>
              </div>
            )}
          </div>
        </div>

        {/* Column 2: Active Cases */}
        <div className="lg:col-span-5 bg-surface-container-lowest rounded-lg border border-outline-variant shadow-sm">
          <div className="p-6 border-b border-outline-variant flex justify-between items-center bg-surface-container-low/30">
            <h3 className="font-headline-md text-headline-md text-primary">Active Case Progress</h3>
          </div>
          <div className="p-6 space-y-8">
            {activeCasesList.length > 0 ? activeCasesList.map(c => {
              const milestones = c.case_milestones || [];
              const total = milestones.length;
              const done = milestones.filter(m => m.status === 'completed').length;
              const pct = total > 0 ? Math.round((done / total) * 100) : 0;
              return (
              <div key={c.id} className="space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-headline-sm text-body-md text-primary font-bold">{c.title}</h4>
                    <p className="text-xs text-on-surface-variant font-medium">Case ID: #{c.id.toString().slice(0,8).toUpperCase()}</p>
                  </div>
                  <span className="bg-success-green/15 text-success-green text-[10px] px-2 py-0.5 rounded-full font-bold border border-success-green/20">IN PROGRESS</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-[11px] font-bold text-on-surface-variant">
                    <span>{total > 0 ? `${done}/${total} milestones done` : 'No milestones yet'}</span>
                    <span>{pct}%</span>
                  </div>
                  {total > 0 && (
                    <div className="h-1.5 bg-surface-container rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </div>
                <button onClick={() => navigate(`/lawyer-suite/cases/${c.id}`)} className="w-full py-2 border border-outline text-primary font-bold text-xs uppercase tracking-widest rounded hover:bg-secondary-fixed transition-colors active:scale-95">View Details</button>
              </div>
            );
            }) : (
              <div className="text-center py-12 space-y-2">
                <span className="material-symbols-outlined text-4xl text-gray-300">folder_open</span>
                <p className="text-sm font-bold text-primary">No active legal matters</p>
                <p className="text-xs text-gray-500 max-w-[240px] mx-auto">When clients hire you or initiate milestone contracts, your case progress will be tracked here.</p>
              </div>
            )}
          </div>
        </div>

        {/* Column 3: Stacked Widgets */}
        <div className="lg:col-span-3 space-y-8 h-full">
          {/* Promo Card */}
          <Link to="/lawyer-suite/analytics" className="block relative bg-primary overflow-hidden rounded-lg p-6 group cursor-pointer active:scale-[0.98] transition-transform">
            <div className="relative z-10 text-white">
              <h4 className="font-headline-sm text-headline-sm mb-2 text-secondary-fixed">Pro Insights</h4>
              <p className="text-xs text-on-primary-container leading-relaxed">Your billable efficiency is up 14% this month. See how you compare to peers.</p>
              <button className="mt-4 text-xs font-bold uppercase tracking-widest border-b border-secondary-fixed text-secondary-fixed pb-0.5 group-hover:pl-2 transition-all">Explore Analytics</button>
            </div>
            <span className="material-symbols-outlined absolute -right-4 -bottom-4 text-[120px] text-white opacity-5 group-hover:rotate-12 transition-transform duration-500">trending_up</span>
          </Link>
        </div>
      </section>

      {/* Earnings Summary Full-Width Bar */}
      <section className="bg-primary-container text-white p-8 rounded-lg shadow-lg relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-center justify-between gap-12 relative z-10">
          <div className="space-y-2 text-center md:text-left">
            <h3 className="font-headline-md text-headline-md text-secondary-fixed font-bold">Earnings Summary</h3>
            <p className="text-on-primary-container text-body-sm">All time performance review</p>
            <div className="pt-4">
              <span className="text-display-lg font-display-lg">BDT {Number(stats.totalEarnings).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default LawyerDashboardView;
