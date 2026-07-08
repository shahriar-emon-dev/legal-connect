import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
// Uses Tailwind for rapid UI

const AdminLayout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const navItems = [
    { name: 'Overview', path: '/admin', icon: '📊', exact: true },
    { name: 'Users', path: '/admin/users', icon: '👥' },
    { name: 'Lawyers', path: '/admin/lawyers', icon: '⚖️' },
    { name: 'Jobs', path: '/admin/jobs', icon: '💼' },
    { name: 'Lawyer Verifications', path: '/admin/verifications', icon: '⚖️' },
    { name: 'Client Verifications', path: '/admin/client-verifications', icon: '👤' },
    { name: 'Categories', path: '/admin/categories', icon: '🗂️' },
    { name: 'Reviews', path: '/admin/reviews', icon: '⭐' },
    { name: 'Messages', path: '/admin/messages', icon: '💬' },
    { name: 'Notifications', path: '/admin/notifications', icon: '🔔' },
    { name: 'Settings', path: '/admin/settings', icon: '⚙️' },
  ];

  return (
    <div className="flex h-screen bg-bg-light font-sans text-text-dark">
      {/* SIDEBAR */}
      <aside className="w-64 bg-navy-primary text-white flex flex-col shadow-xl z-20 flex-shrink-0">
        <div className="p-6 border-b border-white/10 flex items-center justify-center">
          <div className="text-2xl font-serif font-bold text-accent-gold flex items-center gap-2">
            <span className="text-3xl">⚖️</span>
            LegalConnect<span className="text-[10px] uppercase tracking-widest text-teal-accent ml-1">Admin</span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-6 px-3 flex flex-col gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.name}
              to={item.path}
              end={item.exact}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-md transition-all font-medium text-[15px] ${
                  isActive
                    ? 'bg-white/10 border-l-4 border-accent-gold text-white'
                    : 'text-white/70 hover:bg-white/5 hover:text-white border-l-4 border-transparent'
                }`
              }
            >
              <span className="text-lg w-6 text-center">{item.icon}</span>
              {item.name}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10">
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-4 py-2 text-white/70 hover:text-white hover:bg-white/5 rounded-md transition-all text-sm font-semibold"
          >
            <span>🚪</span> Logout
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* TOP BAR */}
        <header className="h-16 bg-surface-white border-b border-border-subtle shadow-sm flex items-center justify-between px-8 z-10">
          <div className="text-text-muted text-sm font-semibold">Admin Control Panel</div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-sm font-bold text-navy-primary">{user?.name || 'Admin User'}</div>
                <div className="text-xs text-text-muted uppercase tracking-wider">Administrator</div>
              </div>
              <div className="w-10 h-10 rounded-full bg-navy-primary text-white flex items-center justify-center font-bold font-serif border-2 border-accent-gold shadow-md overflow-hidden">
                {user?.profile_picture_url ? (
                  <img src={user.profile_picture_url} alt="Admin" className="w-full h-full object-cover" />
                ) : (
                  (user?.name || 'A')[0].toUpperCase()
                )}
              </div>
            </div>
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main className="flex-1 overflow-y-auto p-8 bg-bg-light">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
