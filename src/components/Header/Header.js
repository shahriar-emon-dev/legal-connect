import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import NotificationBell from '../NotificationBell/NotificationBell';

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const close = () => setIsMenuOpen(false);

  const userRole = user?.user_type || user?.role || user?.user_metadata?.role || user?.user_metadata?.user_type || 'client';
  const userName = user?.name || user?.full_name || user?.user_metadata?.name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  const firstName = userName.split(' ')[0];
  const initials = userName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'U';
  const avatarUrl = user?.profile_picture_url || user?.avatar_url || user?.user_metadata?.avatar_url || user?.user_metadata?.profile_picture_url;
  const dashboardPath = userRole === 'lawyer' ? '/lawyer-suite/dashboard' : userRole === 'admin' ? '/admin' : '/client/dashboard';

  return (
    <header className="w-full top-0 sticky z-50 bg-surface-container-lowest border-b border-outline-variant shadow-sm font-body-md">
      <div className="flex justify-between items-center w-full px-6 py-3 max-w-container-max mx-auto">
        <div className="flex items-center gap-8">
          <Link to="/" className="flex items-center" onClick={close}>
            <img src="/logo.svg" alt="LegalConnect" className="h-10 w-auto" />
          </Link>
          
          {/* Desktop Nav */}
          <nav className="hidden md:flex gap-6 items-center">
            <button
              onClick={() => window.dispatchEvent(new Event('open-global-search'))}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200/80 text-gray-600 transition-all text-xs font-bold border border-gray-200/60 shadow-2xs group"
              title="Search directory and records (Ctrl+K)"
            >
              <span className="material-symbols-outlined text-[17px] text-gray-500 group-hover:text-[#041635]">search</span>
              <span>Search...</span>
              <kbd className="hidden lg:inline-block px-1.5 py-0.5 bg-white text-gray-500 rounded font-mono text-[10px] shadow-2xs">⌘K</kbd>
            </button>
            <Link to="/lawyers" className="text-on-surface-variant hover:text-primary transition-colors duration-200 font-body-md text-body-md">Find Lawyers</Link>
            <Link to="/jobs" className="text-on-surface-variant hover:text-primary transition-colors duration-200 font-body-md text-body-md">Job Board</Link>
            <Link to="/legal-updates" className="text-on-surface-variant hover:text-primary transition-colors duration-200 font-body-md text-body-md">Updates</Link>
            <Link to="/contact" className="text-on-surface-variant hover:text-primary transition-colors duration-200 font-body-md text-body-md">Contact</Link>
            <Link to="/ai-advisor" className="text-on-surface-variant hover:text-primary transition-colors duration-200 font-body-md text-body-md font-semibold flex items-center gap-1"><span className="material-symbols-outlined text-[18px]">smart_toy</span> AI Advisor</Link>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          {isAuthenticated ? (
            <>
              <NotificationBell />
              <Link to={dashboardPath} className="hidden md:block text-primary font-bold hover:underline">Dashboard</Link>
              <div className="flex items-center gap-2">
                <span className="hidden md:inline font-semibold text-on-surface text-sm">
                  {firstName}
                </span>
                <div className="w-8 h-8 rounded-full overflow-hidden border border-outline-variant bg-surface-container-high flex items-center justify-center text-primary font-bold cursor-pointer relative group shadow-sm">
                   {avatarUrl ? (
                     <img src={avatarUrl} alt={userName} className="w-full h-full object-cover" />
                   ) : (
                     <span>{initials}</span>
                   )}
                   <div className="absolute top-full right-0 mt-2 bg-white border border-outline-variant rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all w-32 py-2 z-50">
                      <button onClick={handleLogout} className="w-full text-left px-4 py-2 text-sm hover:bg-surface-container text-error font-semibold">Logout</button>
                   </div>
                </div>
              </div>
            </>
          ) : (
            <div className="hidden md:flex items-center gap-4">
              <Link to="/login" className="text-primary font-bold">Login</Link>
              <Link to="/register" className="bg-primary text-white px-4 py-2 rounded font-bold hover:bg-primary/90 transition-colors">Register</Link>
            </div>
          )}

          {/* Mobile Menu Toggle */}
          <button 
            className="md:hidden material-symbols-outlined text-on-surface-variant cursor-pointer active:scale-95"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? 'close' : 'menu'}
          </button>
        </div>
      </div>

      {/* Mobile Nav */}
      {isMenuOpen && (
        <nav className="md:hidden bg-surface-container-lowest border-t border-outline-variant p-4 flex flex-col gap-4 shadow-lg absolute w-full left-0 animate-fadeIn">
            <button
              onClick={() => { close(); window.dispatchEvent(new Event('open-global-search')); }}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-gray-100 text-gray-700 font-bold text-sm border border-gray-200"
            >
              <span className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-[20px] text-[#041635]">search</span>
                <span>Search Advocates, Cases & Jobs</span>
              </span>
              <kbd className="px-2 py-0.5 bg-white rounded text-[11px] text-gray-500 shadow-2xs">Ctrl+K</kbd>
            </button>
            <Link to="/lawyers" onClick={close} className="text-on-surface-variant hover:text-primary font-medium">Find Lawyers</Link>
            <Link to="/jobs" onClick={close} className="text-on-surface-variant hover:text-primary font-medium">Job Board</Link>
            <Link to="/legal-updates" onClick={close} className="text-on-surface-variant hover:text-primary">Legal Updates</Link>
            <Link to="/contact" onClick={close} className="text-on-surface-variant hover:text-primary">Contact</Link>
            <Link to="/ai-advisor" onClick={close} className="text-on-surface-variant hover:text-primary font-semibold flex items-center gap-1"><span className="material-symbols-outlined text-[18px]">smart_toy</span> AI Advisor</Link>
            {isAuthenticated ? (
               <>
                <Link to={dashboardPath} onClick={close} className="text-primary font-bold">Dashboard</Link>
                <div className="flex items-center gap-2 py-1 text-on-surface font-semibold">
                   <div className="w-6 h-6 rounded-full overflow-hidden bg-surface-container-high flex items-center justify-center text-xs text-primary font-bold">
                     {avatarUrl ? <img src={avatarUrl} alt={userName} className="w-full h-full object-cover" /> : initials}
                   </div>
                   <span>{userName}</span>
                </div>
                <button onClick={handleLogout} className="text-left text-error font-bold">Logout</button>
               </>
            ) : (
              <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-outline-variant">
                <Link to="/login" onClick={close} className="text-primary font-bold py-2">Login</Link>
                <Link to="/register" onClick={close} className="bg-primary text-white px-4 py-2 rounded text-center font-bold">Register</Link>
              </div>
            )}
        </nav>
      )}
    </header>
  );
};

export default Header;
