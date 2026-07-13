import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../services/supabase';
import toast from 'react-hot-toast';

const UsersManagement = () => {
  const [users, setUsers] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 15;

  // Modals state
  const [editingUser, setEditingUser] = useState(null);
  const [resetPasswordUser, setResetPasswordUser] = useState(null);
  const [deletingUser, setDeletingUser] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', phone: '', user_type: 'client', is_active: true });
  const [actionLoading, setActionLoading] = useState(false);

  // Stats state
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalClients: 0,
    totalLawyers: 0,
    totalAdmins: 0,
    activeUsers: 0,
    suspendedUsers: 0,
  });

  const fetchOverallStats = useCallback(async () => {
    try {
      const { data, error: statsError } = await supabase
        .from('users')
        .select('id, user_type, is_active');
      
      if (statsError) throw statsError;
      const allUsers = data || [];
      
      setStats({
        totalUsers: allUsers.length,
        totalClients: allUsers.filter(u => u.user_type === 'client').length,
        totalLawyers: allUsers.filter(u => u.user_type === 'lawyer').length,
        totalAdmins: allUsers.filter(u => u.user_type === 'admin').length,
        activeUsers: allUsers.filter(u => u.is_active !== false).length,
        suspendedUsers: allUsers.filter(u => u.is_active === false).length,
      });
    } catch (err) {
      console.warn('Could not compute overall user stats:', err);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      let query = supabase
        .from('users')
        .select('*', { count: 'exact' });

      if (roleFilter !== 'All') {
        query = query.eq('user_type', roleFilter.toLowerCase());
      }
      
      if (statusFilter !== 'All') {
        if (statusFilter === 'Active') {
          query = query.or('is_active.eq.true,is_active.is.null');
        } else {
          query = query.eq('is_active', false);
        }
      }

      if (searchTerm.trim()) {
        const term = searchTerm.trim();
        query = query.or(`name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
      }

      // Pagination calculation
      const from = (currentPage - 1) * rowsPerPage;
      const to = from + rowsPerPage - 1;
      
      const { data, count, error: fetchError } = await query
        .order('created_at', { ascending: false })
        .range(from, to);

      if (fetchError) throw fetchError;
      
      const rawUsers = data || [];
      setTotalCount(count || rawUsers.length);

      // Enrich with verification status from lawyers / client_verifications tables
      const lawyerUserIds = rawUsers.filter(u => u.user_type === 'lawyer').map(u => u.id);
      let lawyerVerifMap = {};
      if (lawyerUserIds.length > 0) {
        try {
          const { data: lData } = await supabase
            .from('lawyers')
            .select('user_id, is_verified, verification_status')
            .in('user_id', lawyerUserIds);
          if (lData) {
            lData.forEach(l => {
              lawyerVerifMap[l.user_id] = l.is_verified || l.verification_status === 'verified' ? 'Verified' : (l.verification_status || 'Pending');
            });
          }
        } catch (e) {}
      }

      const enriched = rawUsers.map(u => {
        let verifStatus = 'Unverified';
        if (u.user_type === 'lawyer') {
          verifStatus = lawyerVerifMap[u.id] || 'Pending';
        } else if (u.user_type === 'admin') {
          verifStatus = 'Verified';
        } else {
          verifStatus = u.is_verified ? 'Verified' : 'Unverified';
        }
        return {
          ...u,
          verification_status_label: verifStatus
        };
      });

      setUsers(enriched);
    } catch (err) {
      console.error('Error fetching users:', err);
      setError('Failed to load system users. Please check your network connection.');
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [currentPage, roleFilter, statusFilter, searchTerm, rowsPerPage]);

  useEffect(() => {
    fetchOverallStats();
    fetchUsers();
  }, [fetchOverallStats, fetchUsers]);

  const handleDeactivateToggle = async (user) => {
    const newStatus = user.is_active === false ? true : false;
    const actionText = newStatus ? 'activate' : 'suspend';
    
    if (!window.confirm(`Are you sure you want to ${actionText} account for ${user.name}?`)) {
      return;
    }

    try {
      const { error: updateError } = await supabase
        .from('users')
        .update({ is_active: newStatus })
        .eq('id', user.id);

      if (updateError) throw updateError;
      
      toast.success(`User ${actionText}d successfully`);
      setUsers(users.map(u => u.id === user.id ? { ...u, is_active: newStatus } : u));
      fetchOverallStats();
    } catch (err) {
      console.error(err);
      toast.error(`Failed to ${actionText} user: ${err.message || ''}`);
    }
  };

  const handleOpenEdit = (user) => {
    setEditingUser(user);
    setEditForm({
      name: user.name || '',
      phone: user.phone || '',
      user_type: user.user_type || 'client',
      is_active: user.is_active !== false
    });
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingUser) return;
    try {
      setActionLoading(true);
      const { error: editErr } = await supabase
        .from('users')
        .update({
          name: editForm.name,
          phone: editForm.phone,
          user_type: editForm.user_type,
          is_active: editForm.is_active
        })
        .eq('id', editingUser.id);

      if (editErr) throw editErr;
      toast.success('User details updated successfully');
      setEditingUser(null);
      fetchUsers();
      fetchOverallStats();
    } catch (err) {
      console.error('Save edit error:', err);
      toast.error(`Failed to update user: ${err.message || ''}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleTriggerPasswordReset = async () => {
    if (!resetPasswordUser || !resetPasswordUser.email) return;
    try {
      setActionLoading(true);
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(resetPasswordUser.email, {
        redirectTo: `${window.location.origin}/reset-password`
      });
      if (resetErr) throw resetErr;
      toast.success(`Password reset link sent to ${resetPasswordUser.email}`);
      setResetPasswordUser(null);
    } catch (err) {
      console.error('Password reset error:', err);
      toast.error(`Failed to send reset link: ${err.message || ''}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deletingUser) return;
    try {
      setActionLoading(true);
      const { error: delErr } = await supabase
        .from('users')
        .delete()
        .eq('id', deletingUser.id);

      if (delErr) throw delErr;
      toast.success('User account removed permanently');
      setDeletingUser(null);
      fetchUsers();
      fetchOverallStats();
    } catch (err) {
      console.error('Delete user error:', err);
      toast.error(`Could not delete user: ${err.message || ''}`);
    } finally {
      setActionLoading(false);
    }
  };

  const exportCSV = () => {
    const headers = ['ID', 'Full Name', 'Email', 'Phone', 'Role', 'Account Status', 'Verification Status', 'Join Date'];
    const csvData = users.map(u => [
      u.id,
      `"${(u.name || '').replace(/"/g, '""')}"`,
      `"${(u.email || '').replace(/"/g, '""')}"`,
      `"${(u.phone || '').replace(/"/g, '""')}"`,
      (u.user_type || '').toUpperCase(),
      u.is_active !== false ? 'Active' : 'Suspended',
      u.verification_status_label || 'Unverified',
      new Date(u.created_at).toLocaleDateString()
    ].join(','));
    
    const csvContent = [headers.join(','), ...csvData].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'legalconnect_all_users.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / rowsPerPage));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 font-sans">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border-subtle pb-6">
        <div>
          <h1 className="text-3xl font-serif font-bold text-navy-primary tracking-tight">System Users Management</h1>
          <p className="text-sm text-text-muted mt-1">
            Audit, inspect, and manage every registered account across all user roles (Clients, Lawyers, and Administrators).
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { fetchOverallStats(); fetchUsers(); }}
            className="px-4 py-2.5 rounded-xl border border-border-subtle bg-white text-navy-primary hover:bg-bg-light transition flex items-center gap-2 font-semibold text-sm shadow-sm"
          >
            <span>🔄</span> Refresh
          </button>
          <button 
            onClick={exportCSV}
            className="bg-navy-primary text-white px-5 py-2.5 rounded-xl hover:bg-navy-primary/90 transition flex items-center gap-2 font-semibold text-sm shadow-md"
          >
            <span>📥</span> Export CSV
          </button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-border-subtle shadow-sm flex flex-col justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Total Users</span>
          <div className="text-2xl font-black text-navy-primary mt-2">{stats.totalUsers.toLocaleString()}</div>
          <span className="text-[11px] text-gray-500 mt-1">Every registered account</span>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-border-subtle shadow-sm flex flex-col justify-between border-l-4 border-l-blue-500">
          <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Total Clients</span>
          <div className="text-2xl font-black text-blue-600 mt-2">{stats.totalClients.toLocaleString()}</div>
          <span className="text-[11px] text-gray-500 mt-1">Individual / Corporate</span>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-border-subtle shadow-sm flex flex-col justify-between border-l-4 border-l-amber-500">
          <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Total Lawyers</span>
          <div className="text-2xl font-black text-amber-600 mt-2">{stats.totalLawyers.toLocaleString()}</div>
          <span className="text-[11px] text-gray-500 mt-1">Advocates & Counselors</span>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-border-subtle shadow-sm flex flex-col justify-between border-l-4 border-l-purple-500">
          <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Total Admins</span>
          <div className="text-2xl font-black text-purple-600 mt-2">{stats.totalAdmins.toLocaleString()}</div>
          <span className="text-[11px] text-gray-500 mt-1">System administrators</span>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-border-subtle shadow-sm flex flex-col justify-between border-l-4 border-l-emerald-500">
          <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Active Users</span>
          <div className="text-2xl font-black text-emerald-600 mt-2">{stats.activeUsers.toLocaleString()}</div>
          <span className="text-[11px] text-gray-500 mt-1">In good standing</span>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-border-subtle shadow-sm flex flex-col justify-between border-l-4 border-l-rose-500">
          <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Suspended</span>
          <div className="text-2xl font-black text-rose-600 mt-2">{stats.suspendedUsers.toLocaleString()}</div>
          <span className="text-[11px] text-gray-500 mt-1">Deactivated accounts</span>
        </div>
      </div>

      {/* Toolbar & Filter Section */}
      <div className="bg-white rounded-2xl border border-border-subtle p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto flex-1">
            <div className="relative flex-1 sm:max-w-md">
              <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-lg">search</span>
              <input 
                type="text" 
                placeholder="Search by name, email, or phone number..." 
                className="w-full pl-10 pr-4 py-2.5 border border-border-subtle rounded-xl focus:outline-none focus:border-accent-gold text-sm transition"
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              />
            </div>
            <select 
              className="px-4 py-2.5 border border-border-subtle rounded-xl bg-white focus:outline-none focus:border-accent-gold text-sm font-medium text-navy-primary transition"
              value={roleFilter}
              onChange={(e) => { setRoleFilter(e.target.value); setCurrentPage(1); }}
            >
              <option value="All">All Roles</option>
              <option value="Client">Client Only</option>
              <option value="Lawyer">Lawyer Only</option>
              <option value="Admin">Admin Only</option>
            </select>
            <select 
              className="px-4 py-2.5 border border-border-subtle rounded-xl bg-white focus:outline-none focus:border-accent-gold text-sm font-medium text-navy-primary transition"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
            >
              <option value="All">All Statuses</option>
              <option value="Active">Active Accounts</option>
              <option value="Suspended">Suspended / Inactive</option>
            </select>
          </div>
          <div className="text-sm font-semibold text-text-muted">
            Showing <span className="text-navy-primary font-bold">{users.length}</span> of <span className="text-navy-primary font-bold">{totalCount}</span> accounts
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-2xl border border-border-subtle shadow-sm overflow-hidden relative min-h-[420px]">
        {loading && (
          <div className="absolute inset-0 bg-white/70 backdrop-blur-sm flex flex-col items-center justify-center z-10 gap-3">
            <div className="animate-spin rounded-full h-11 w-11 border-4 border-navy-primary border-t-transparent"></div>
            <span className="text-sm font-semibold text-navy-primary">Synchronizing User Registry...</span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-bg-light/80 text-text-muted text-xs font-bold uppercase tracking-wider border-b border-border-subtle">
                <th className="px-6 py-4 whitespace-nowrap">Avatar & Full Name</th>
                <th className="px-6 py-4">Email Address</th>
                <th className="px-6 py-4 whitespace-nowrap">Phone</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 whitespace-nowrap">Verification</th>
                <th className="px-6 py-4 whitespace-nowrap">Join Date</th>
                <th className="px-6 py-4 whitespace-nowrap">Last Login</th>
                <th className="px-6 py-4 text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle/60 text-sm">
              {users.map(u => {
                const isSuspended = u.is_active === false;
                return (
                  <tr key={u.id} className={`hover:bg-bg-light/40 transition-colors ${isSuspended ? 'bg-rose-50/30' : ''}`}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-navy-primary text-white flex items-center justify-center font-bold text-sm uppercase overflow-hidden shadow-sm flex-shrink-0">
                          {u.profile_picture_url ? (
                            <img src={u.profile_picture_url} alt={u.name} className="w-full h-full object-cover" />
                          ) : (
                            (u.name || 'U')[0]
                          )}
                        </div>
                        <div>
                          <div className={`font-bold ${isSuspended ? 'text-gray-500 line-through' : 'text-navy-primary'}`}>
                            {u.name || 'Unnamed User'}
                          </div>
                          <div className="text-xs text-gray-400 font-mono">ID: {u.id.slice(0, 8)}...</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-600 font-medium">{u.email || '—'}</td>
                    <td className="px-6 py-4 text-gray-500 whitespace-nowrap">{u.phone || 'Not provided'}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black tracking-wide uppercase ${
                        u.user_type === 'admin' ? 'bg-purple-100 text-purple-700 border border-purple-200' :
                        u.user_type === 'lawyer' ? 'bg-amber-100 text-amber-800 border border-amber-200' : 
                        'bg-blue-100 text-blue-700 border border-blue-200'
                      }`}>
                        <span>{u.user_type === 'admin' ? '🛡️' : u.user_type === 'lawyer' ? '⚖️' : '👤'}</span>
                        {u.user_type || 'CLIENT'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase ${
                        !isSuspended ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-rose-100 text-rose-800 border border-rose-200'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${!isSuspended ? 'bg-emerald-600' : 'bg-rose-600'}`}></span>
                        {!isSuspended ? 'Active' : 'Suspended'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2.5 py-1 rounded-md text-xs font-semibold ${
                        u.verification_status_label === 'Verified' ? 'bg-emerald-50 text-emerald-700' :
                        u.verification_status_label === 'Pending' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {u.verification_status_label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-500 whitespace-nowrap">
                      {new Date(u.created_at || Date.now()).toLocaleDateString('en-GB')}
                    </td>
                    <td className="px-6 py-4 text-gray-500 whitespace-nowrap">
                      {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString('en-GB') : 'Active recently'}
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleOpenEdit(u)}
                          title="Edit User Details"
                          className="p-2 text-gray-500 hover:text-navy-primary hover:bg-bg-light rounded-lg transition"
                        >
                          <span className="material-symbols-outlined text-lg">edit</span>
                        </button>
                        <button 
                          onClick={() => handleDeactivateToggle(u)}
                          title={isSuspended ? "Activate Account" : "Suspend Account"}
                          className={`p-2 rounded-lg transition ${isSuspended ? 'text-emerald-600 hover:bg-emerald-50' : 'text-amber-600 hover:bg-amber-50'}`}
                        >
                          <span className="material-symbols-outlined text-lg">{isSuspended ? 'lock_open' : 'block'}</span>
                        </button>
                        <button
                          onClick={() => setResetPasswordUser(u)}
                          title="Send Password Reset"
                          className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                        >
                          <span className="material-symbols-outlined text-lg">key</span>
                        </button>
                        <button
                          onClick={() => setDeletingUser(u)}
                          title="Delete User Account"
                          className="p-2 text-gray-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                        >
                          <span className="material-symbols-outlined text-lg">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {error && (
                <tr>
                  <td colSpan="9" className="px-6 py-12">
                    <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center space-y-4 max-w-md mx-auto">
                      <span className="material-symbols-outlined text-5xl text-red-500">error_outline</span>
                      <h3 className="text-xl font-bold text-navy-primary">Failed to Load Users</h3>
                      <p className="text-gray-600 text-sm">{error}</p>
                      <button 
                        onClick={fetchUsers}
                        className="px-6 py-2.5 bg-navy-primary hover:bg-navy-primary/90 text-white font-bold rounded-xl shadow transition active:scale-95"
                      >
                        Retry Query
                      </button>
                    </div>
                  </td>
                </tr>
              )}

              {!loading && !error && users.length === 0 && (
                <tr>
                  <td colSpan="9" className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center justify-center space-y-3 max-w-md mx-auto">
                      <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
                        <span className="material-symbols-outlined text-3xl">group_off</span>
                      </div>
                      <p className="font-bold text-navy-primary text-lg">No User Accounts Found</p>
                      <p className="text-sm text-gray-500">
                        No accounts match your current role filter (<span className="font-semibold text-navy-primary">{roleFilter}</span>) and status criteria. Try broadening your search.
                      </p>
                      <button
                        onClick={() => { setSearchTerm(''); setRoleFilter('All'); setStatusFilter('All'); setCurrentPage(1); }}
                        className="px-4 py-2 bg-navy-primary text-white rounded-xl text-sm font-semibold hover:bg-navy-primary/90 transition"
                      >
                        Clear All Filters
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="bg-bg-light/40 border-t border-border-subtle p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-sm text-text-muted">
              Page <span className="font-bold text-navy-primary">{currentPage}</span> of <span className="font-bold text-navy-primary">{totalPages}</span> ({totalCount} total entries)
            </div>
            <div className="flex items-center gap-2">
              <button 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="px-4 py-2 bg-white border border-border-subtle rounded-xl text-sm font-semibold text-navy-primary hover:bg-bg-light disabled:opacity-40 transition shadow-sm"
              >
                Previous
              </button>
              <button 
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className="px-4 py-2 bg-white border border-border-subtle rounded-xl text-sm font-semibold text-navy-primary hover:bg-bg-light disabled:opacity-40 transition shadow-sm"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL 1: Edit User */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-border-subtle space-y-6">
            <div className="flex items-center justify-between border-b border-border-subtle pb-4">
              <h3 className="text-2xl font-serif font-bold text-navy-primary">Edit Account Details</h3>
              <button onClick={() => setEditingUser(null)} className="text-gray-400 hover:text-gray-600 transition">
                <span className="material-symbols-outlined text-2xl">close</span>
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4 text-sm">
              <div>
                <label className="block font-bold text-navy-primary mb-1.5">Full Name</label>
                <input
                  type="text"
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-4 py-2.5 border border-border-subtle rounded-xl focus:outline-none focus:border-accent-gold"
                />
              </div>
              <div>
                <label className="block font-bold text-navy-primary mb-1.5">Phone Number</label>
                <input
                  type="text"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  className="w-full px-4 py-2.5 border border-border-subtle rounded-xl focus:outline-none focus:border-accent-gold"
                  placeholder="+8801..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-navy-primary mb-1.5">Account Role</label>
                  <select
                    value={editForm.user_type}
                    onChange={(e) => setEditForm({ ...editForm, user_type: e.target.value })}
                    className="w-full px-4 py-2.5 border border-border-subtle rounded-xl bg-white font-semibold text-navy-primary focus:outline-none focus:border-accent-gold"
                  >
                    <option value="client">Client</option>
                    <option value="lawyer">Lawyer</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-navy-primary mb-1.5">Status</label>
                  <select
                    value={editForm.is_active ? 'active' : 'suspended'}
                    onChange={(e) => setEditForm({ ...editForm, is_active: e.target.value === 'active' })}
                    className="w-full px-4 py-2.5 border border-border-subtle rounded-xl bg-white font-semibold text-navy-primary focus:outline-none focus:border-accent-gold"
                  >
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-border-subtle">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-5 py-2.5 rounded-xl border border-border-subtle font-bold text-gray-600 hover:bg-bg-light transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-6 py-2.5 rounded-xl bg-navy-primary text-white font-bold hover:bg-navy-primary/90 transition shadow-md disabled:opacity-50 flex items-center gap-2"
                >
                  {actionLoading && <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>}
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Reset Password Trigger */}
      {resetPasswordUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-border-subtle space-y-5 text-center">
            <div className="w-16 h-16 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-3xl">key</span>
            </div>
            <h3 className="text-2xl font-serif font-bold text-navy-primary">Send Password Reset</h3>
            <p className="text-gray-600 text-sm">
              Are you sure you want to send a secure password reset email to <span className="font-bold text-navy-primary">{resetPasswordUser.email}</span>?
            </p>
            <div className="flex items-center justify-center gap-3 pt-4">
              <button
                type="button"
                onClick={() => setResetPasswordUser(null)}
                className="px-5 py-2.5 rounded-xl border border-border-subtle font-bold text-gray-600 hover:bg-bg-light transition w-full"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleTriggerPasswordReset}
                disabled={actionLoading}
                className="px-5 py-2.5 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition shadow-md disabled:opacity-50 w-full"
              >
                Send Email
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Delete Confirmation */}
      {deletingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-rose-200 space-y-5 text-center">
            <div className="w-16 h-16 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-3xl">warning</span>
            </div>
            <h3 className="text-2xl font-serif font-bold text-rose-700">Delete User Account</h3>
            <p className="text-gray-600 text-sm">
              This action is <span className="font-bold text-rose-600">permanent</span>. All data, cases, and credentials associated with <span className="font-bold text-navy-primary">{deletingUser.name} ({deletingUser.email})</span> will be deleted from the system.
            </p>
            <div className="flex items-center justify-center gap-3 pt-4">
              <button
                type="button"
                onClick={() => setDeletingUser(null)}
                className="px-5 py-2.5 rounded-xl border border-border-subtle font-bold text-gray-600 hover:bg-bg-light transition w-full"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteUser}
                disabled={actionLoading}
                className="px-5 py-2.5 rounded-xl bg-rose-600 text-white font-bold hover:bg-rose-700 transition shadow-md disabled:opacity-50 w-full"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersManagement;
