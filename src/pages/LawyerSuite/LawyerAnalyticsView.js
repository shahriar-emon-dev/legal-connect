import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';

const LawyerAnalyticsView = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('30days');

  const fetchAnalytics = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const userIds = [...new Set([user.id, user.auth_id].filter(Boolean))];

      // Resolve lawyer record
      let lawyerRecord = null;
      try {
        const { data } = await supabase.from('lawyers').select('*').in('user_id', userIds).maybeSingle();
        lawyerRecord = data;
      } catch (e) {}

      // Date filter
      const now = new Date();
      let since = new Date();
      if (dateRange === '7days') since.setDate(now.getDate() - 7);
      else if (dateRange === '30days') since.setDate(now.getDate() - 30);
      else since.setFullYear(now.getFullYear() - 1);
      const sinceISO = since.toISOString();

      // Fetch real counts in parallel
      const [
        { count: totalAppointments },
        { count: activeAppointments },
        { count: totalCases },
        { count: completedCases },
        { count: totalProposals },
        { count: acceptedProposals },
        { data: paymentsData },
        { data: reviewsData },
      ] = await Promise.all([
        supabase.from('appointments').select('*', { count: 'exact', head: true })
          .in('lawyer_id', userIds).gte('created_at', sinceISO),
        supabase.from('appointments').select('*', { count: 'exact', head: true })
          .in('lawyer_id', userIds).in('status', ['confirmed', 'Upcoming', 'In Progress']),
        supabase.from('cases').select('*', { count: 'exact', head: true })
          .in('lawyer_id', userIds).gte('created_at', sinceISO),
        supabase.from('cases').select('*', { count: 'exact', head: true })
          .in('lawyer_id', userIds).in('status', ['Completed', 'completed', 'Closed', 'closed']),
        supabase.from('job_proposals').select('*', { count: 'exact', head: true })
          .in('lawyer_id', userIds).gte('created_at', sinceISO),
        supabase.from('job_proposals').select('*', { count: 'exact', head: true })
          .in('lawyer_id', userIds).eq('status', 'accepted'),
        supabase.from('payments').select('amount, status, created_at')
          .in('lawyer_id', userIds).gte('created_at', sinceISO),
        supabase.from('reviews').select('rating, created_at')
          .eq('reviewee_id', user.id).gte('created_at', sinceISO),
      ]);

      const totalEarnings = (paymentsData || [])
        .filter(p => p.status === 'completed' || p.status === 'released')
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);

      const avgRating = reviewsData && reviewsData.length > 0
        ? (reviewsData.reduce((s, r) => s + r.rating, 0) / reviewsData.length).toFixed(1)
        : (lawyerRecord?.avg_rating || lawyerRecord?.rating || 0);

      const conversionRate = totalProposals > 0
        ? ((acceptedProposals / totalProposals) * 100).toFixed(1)
        : 0;

      const successRate = totalCases > 0
        ? ((completedCases / totalCases) * 100).toFixed(1)
        : 0;

      setStats({
        totalAppointments: totalAppointments || 0,
        activeAppointments: activeAppointments || 0,
        totalCases: totalCases || 0,
        completedCases: completedCases || 0,
        totalProposals: totalProposals || 0,
        acceptedProposals: acceptedProposals || 0,
        totalEarnings,
        avgRating,
        conversionRate,
        successRate,
        reviewCount: reviewsData?.length || 0,
        profileStrength: lawyerRecord ? computeProfileStrength(lawyerRecord) : 0,
      });
    } catch (err) {
      console.error('Analytics fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?.auth_id, dateRange]);

  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

  const computeProfileStrength = (lawyer) => {
    let score = 0;
    if (lawyer.profile_picture_url) score += 20;
    if (lawyer.bio || lawyer.about) score += 20;
    if (lawyer.specialization) score += 15;
    if (lawyer.bar_council_number) score += 15;
    if (lawyer.experience_years) score += 15;
    if (lawyer.education) score += 15;
    return score;
  };

  if (loading) return (
    <div className="p-8 flex items-center justify-center min-h-[400px]">
      <div className="text-center space-y-3">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm font-bold text-gray-500">Loading analytics...</p>
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-8 max-w-container-max mx-auto animate-fadeIn space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-outline-variant pb-4">
        <div>
          <h2 className="font-headline-md text-3xl text-primary font-bold">Performance Insights</h2>
          <p className="text-on-surface-variant font-body-md mt-1">Live overview of your professional reach and engagement.</p>
        </div>
        <div className="flex gap-2 text-sm font-bold">
          {[
            { id: '7days', label: 'Last 7 Days' },
            { id: '30days', label: 'Last 30 Days' },
            { id: 'year', label: 'This Year' },
          ].map(r => (
            <button
              key={r.id}
              onClick={() => setDateRange(r.id)}
              className={`px-4 py-2 rounded-full transition-colors ${dateRange === r.id ? 'bg-primary text-white' : 'text-on-surface-variant hover:bg-surface-container'}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          label="Appointments"
          value={stats?.totalAppointments ?? 0}
          sub={`${stats?.activeAppointments ?? 0} active`}
          icon="event"
          iconBg="bg-secondary-fixed text-on-secondary-fixed"
        />
        <MetricCard
          label="Total Cases"
          value={stats?.totalCases ?? 0}
          sub={`${stats?.completedCases ?? 0} completed`}
          icon="folder_shared"
          iconBg="bg-surface-container text-primary"
        />
        <MetricCard
          label="Conversion Rate"
          value={`${stats?.conversionRate ?? 0}%`}
          sub={`${stats?.acceptedProposals ?? 0} of ${stats?.totalProposals ?? 0} proposals`}
          icon="percent"
          iconBg="bg-surface-container text-primary"
        />
        <MetricCard
          label="Total Earnings"
          value={`৳ ${(stats?.totalEarnings ?? 0).toLocaleString()}`}
          sub="Released payments"
          icon="payments"
          iconBg="bg-surface-container text-secondary"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Performance Summary */}
        <div className="lg:col-span-2 bg-surface-container-lowest p-6 rounded-xl border border-outline-variant shadow-sm">
          <h3 className="font-bold text-primary text-lg mb-6">Performance Summary</h3>
          <div className="space-y-5">
            <ProgressRow label="Case Success Rate" value={stats?.successRate ?? 0} color="bg-primary" />
            <ProgressRow label="Proposal Acceptance Rate" value={stats?.conversionRate ?? 0} color="bg-secondary" />
            <ProgressRow label="Profile Strength" value={stats?.profileStrength ?? 0} color="bg-on-tertiary-container" />
          </div>

          <div className="mt-8 grid grid-cols-2 gap-4 pt-6 border-t border-outline-variant">
            <div className="text-center">
              <p className="text-3xl font-bold text-primary">{stats?.avgRating || 'N/A'}</p>
              <p className="text-xs text-on-surface-variant font-bold uppercase tracking-wider mt-1">Avg Rating</p>
              <p className="text-xs text-gray-400">{stats?.reviewCount || 0} reviews</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-primary">{stats?.completedCases ?? 0}</p>
              <p className="text-xs text-on-surface-variant font-bold uppercase tracking-wider mt-1">Cases Completed</p>
              <p className="text-xs text-gray-400">All time</p>
            </div>
          </div>
        </div>

        {/* Profile Strength */}
        <div className="bg-primary text-white rounded-xl shadow-lg p-8 flex flex-col justify-between relative overflow-hidden">
          <div className="text-center relative z-10">
            <h3 className="font-bold text-secondary-fixed text-lg mb-6">Profile Strength</h3>
            <div className="relative w-32 h-32 mx-auto mb-6 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" className="stroke-white/10 fill-none" strokeWidth="8" />
                <circle cx="50" cy="50" r="40" className="stroke-secondary-fixed fill-none" strokeWidth="8"
                  strokeDasharray="251.2"
                  strokeDashoffset={251.2 - (251.2 * (stats?.profileStrength ?? 0) / 100)}
                  strokeLinecap="round" />
              </svg>
              <div className="absolute flex flex-col items-center">
                <span className="text-3xl font-bold text-white leading-none">{stats?.profileStrength ?? 0}%</span>
                <span className="text-[10px] uppercase tracking-widest text-on-primary-container mt-1">Complete</span>
              </div>
            </div>
          </div>
          <div className="space-y-3 relative z-10">
            <p className="text-xs text-on-primary-container leading-relaxed">
              Complete your profile to increase visibility in search results and attract more clients.
            </p>
            <button
              onClick={() => navigate('/lawyer-suite/profile')}
              className="w-full py-3 rounded-lg border border-secondary-fixed text-secondary-fixed font-bold hover:bg-secondary-fixed hover:text-on-secondary-fixed transition-colors"
            >
              Improve Profile
            </button>
          </div>
        </div>
      </div>

      {/* Earnings Summary */}
      <div className="bg-primary-container text-white p-8 rounded-xl shadow-lg relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
          <div className="space-y-2 text-center md:text-left">
            <h3 className="font-headline-md text-headline-md text-secondary-fixed font-bold">Earnings Summary</h3>
            <p className="text-on-primary-container text-body-sm">Period: {dateRange === '7days' ? 'Last 7 days' : dateRange === '30days' ? 'Last 30 days' : 'This year'}</p>
            <div className="pt-4">
              <span className="text-display-lg font-display-lg">৳ {(stats?.totalEarnings ?? 0).toLocaleString()}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6 text-center">
            <div>
              <p className="text-2xl font-bold text-white">{stats?.totalProposals ?? 0}</p>
              <p className="text-xs text-on-primary-container">Proposals Sent</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{stats?.acceptedProposals ?? 0}</p>
              <p className="text-xs text-on-primary-container">Proposals Accepted</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const MetricCard = ({ label, value, sub, icon, iconBg }) => (
  <div className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant shadow-sm flex flex-col justify-between">
    <div className="flex justify-between items-start mb-6">
      <div className={`p-3 rounded-lg ${iconBg}`}>
        <span className="material-symbols-outlined">{icon}</span>
      </div>
    </div>
    <div>
      <p className="text-on-surface-variant text-label-md font-bold uppercase tracking-widest mb-1">{label}</p>
      <p className="text-headline-md text-3xl font-bold text-primary">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  </div>
);

const ProgressRow = ({ label, value, color }) => (
  <div>
    <div className="flex justify-between text-sm mb-2">
      <span className="text-on-surface-variant font-medium">{label}</span>
      <span className="font-bold text-primary">{value}%</span>
    </div>
    <div className="h-2 bg-surface-container rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all duration-700`} style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  </div>
);

export default LawyerAnalyticsView;
