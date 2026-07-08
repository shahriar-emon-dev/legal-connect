import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import toast from 'react-hot-toast';

const JobsManagement = () => {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('All');
  
  useEffect(() => {
    fetchJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      
      let postsData = [], jobsData = [], deptsData = [];
      try { const r = await supabase.from('job_posts').select('*').order('created_at', { ascending: false }); postsData = r.data || []; } catch (e) {}
      try { const r = await supabase.from('jobs').select('*').order('created_at', { ascending: false }); jobsData = r.data || []; } catch (e) {}
      try { const r = await supabase.from('departments').select('*'); deptsData = r.data || []; } catch (e) {}

      const allJobsRaw = [...postsData, ...jobsData];
      const uniqueMap = new Map();
      allJobsRaw.forEach(j => {
        if (j.id && !uniqueMap.has(j.id)) uniqueMap.set(j.id, j);
      });

      let list = Array.from(uniqueMap.values()).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

      if (statusFilter !== 'All') {
        list = list.filter(j => (j.status || '').toLowerCase() === statusFilter.toLowerCase());
      }

      const clientIds = [...new Set(list.map(j => j.client_id).filter(Boolean))];
      let userMap = {};
      if (clientIds.length > 0) {
        let usersList = []; try { const r = await supabase.from('users').select('id, name, full_name, email').in('id', clientIds); usersList = r.data || []; } catch (e) {}
        usersList.forEach(u => { userMap[u.id] = u; });
      }

      const deptMap = {};
      if (deptsData) deptsData.forEach(d => { deptMap[d.id] = d; });

      const enrichedList = list.map(job => ({
        ...job,
        client: userMap[job.client_id] || { name: 'Client User', email: '' },
        department: deptMap[job.department_id] || { name: job.category || 'General Legal' }
      }));

      setJobs(enrichedList);
    } catch (err) {
      console.error('Error fetching jobs:', err);
      toast.error('Failed to load jobs');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteJob = async (jobId, jobTitle) => {
    if (!window.confirm(`Are you sure you want to completely delete the job "${jobTitle}"? This cannot be undone.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('jobs')
        .delete()
        .eq('id', jobId);

      if (error) throw error;
      
      toast.success('Job deleted successfully');
      setJobs(jobs.filter(j => j.id !== jobId));
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete job');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'open': return 'bg-green-100 text-success-green';
      case 'awarded': return 'bg-blue-100 text-blue-700';
      case 'cancelled': return 'bg-gray-200 text-gray-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  return (
    <div className="max-w-7xl mx-auto pb-12">
      <h1 className="text-3xl font-serif font-bold text-navy-primary mb-8">Jobs Management</h1>

      {/* Toolbar */}
      <div className="bg-surface-white rounded-t-lg border border-border-subtle border-b-0 p-4 shadow-sm flex items-center justify-between">
        <select 
          className="px-4 py-2 border border-border-subtle rounded-md bg-white focus:outline-none focus:border-accent-gold"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="All">All Statuses</option>
          <option value="Open">Open</option>
          <option value="Awarded">Awarded</option>
          <option value="Cancelled">Cancelled</option>
        </select>
        
        <div className="text-sm text-text-muted font-medium">
          Showing <span className="text-navy-primary font-bold">{jobs.length}</span> jobs
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-surface-white rounded-b-lg border border-border-subtle shadow-sm overflow-hidden relative min-h-[400px]">
        {loading && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-sm flex items-center justify-center z-10">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-navy-primary"></div>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-bg-light text-text-muted text-sm border-b border-border-subtle">
                <th className="px-6 py-4 font-semibold">Job Title</th>
                <th className="px-6 py-4 font-semibold">Client Name</th>
                <th className="px-6 py-4 font-semibold">Department</th>
                <th className="px-6 py-4 font-semibold">Budget Range</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold whitespace-nowrap">Created Date</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => (
                <tr key={job.id} className="border-b border-border-subtle/50 hover:bg-bg-light/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-semibold text-text-dark">{job.title}</div>
                    {job.is_urgent && (
                      <span className="text-[10px] font-bold text-danger-red uppercase tracking-wider">Urgent</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-text-dark">{job.client?.name || 'Unknown Client'}</div>
                    <div className="text-xs text-text-muted">{job.client?.email}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2.5 py-1 rounded bg-navy-primary/10 text-navy-primary text-[11px] font-bold uppercase tracking-wider">
                      {job.department?.name || 'Uncategorized'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-text-dark">
                    BDT {Number(job.budget_min).toLocaleString()} - BDT {Number(job.budget_max).toLocaleString()}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${getStatusColor(job.status)}`}>
                      {job.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-text-muted text-sm whitespace-nowrap">
                    {new Date(job.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <a 
                        href={`/jobs/${job.id}`}
                        target="_blank"
                        rel="noreferrer"
                        title="View Job Post"
                        className="p-2 text-text-muted hover:text-navy-primary transition-colors"
                      >
                        👁️
                      </a>
                      <button 
                        onClick={() => handleDeleteJob(job.id, job.title)}
                        title="Delete Job"
                        className="p-2 text-text-muted hover:text-danger-red transition-colors"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {error && (
                <tr>
                  <td colSpan="7" className="px-6 py-8">
                    <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center space-y-4 max-w-md mx-auto">
                      <span className="material-symbols-outlined text-5xl text-red-500">error_outline</span>
                      <h3 className="text-xl font-bold text-navy-primary">Failed to Load Jobs</h3>
                      <p className="text-gray-600 text-sm">{error}</p>
                      <button 
                        onClick={() => { setLoading(true); setError(null); fetchJobs(); }}
                        className="px-6 py-2.5 bg-navy-primary hover:bg-navy-primary/90 text-white font-bold rounded-xl shadow transition active:scale-95"
                      >
                        Retry
                      </button>
                    </div>
                  </td>
                </tr>
              )}
              {!loading && !error && jobs.length === 0 && (
                <tr>
                  <td colSpan="7" className="px-6 py-12 text-center text-text-muted">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <span className="material-symbols-outlined text-5xl text-gray-300">work_off</span>
                      <p className="font-bold text-gray-600 text-lg">No Jobs Found</p>
                      <p className="text-sm text-gray-400">No client jobs match the selected filter criteria.</p>
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

export default JobsManagement;
