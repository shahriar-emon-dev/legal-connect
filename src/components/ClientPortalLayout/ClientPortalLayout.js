import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const ClientPortalLayout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const clientName = user?.user_metadata?.name || user?.name || 'Client';
  const clientPic = user?.user_metadata?.avatar_url || user?.profile_picture_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(clientName)}&background=041635&color=fff`;

  return (
    <div className="bg-[#F8F9FF] font-sans text-[#041635] min-h-screen flex w-full max-w-full overflow-x-hidden">
      <style>{`
        .material-symbols-outlined {
            font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
        }
        .portal-scrollbar::-webkit-scrollbar {
            width: 5px;
        }
        .portal-scrollbar::-webkit-scrollbar-thumb {
            background: #cbd5e1;
            border-radius: 10px;
        }
      `}</style>

      {/* Column 1: SideNavBar (Rail/Sidebar) */}
      <aside className="flex flex-col py-6 bg-[#041635] text-white h-screen w-20 md:w-64 fixed left-0 top-0 border-r border-[#1e2f50] shadow-xl z-50 transition-all duration-300 flex-shrink-0 overflow-y-auto portal-scrollbar">
        <div className="px-6 mb-8 flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
          <span className="material-symbols-outlined text-[#fed977] text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>balance</span>
          <div className="hidden md:block">
            <h1 className="font-serif text-xl font-bold leading-none tracking-tight text-white">LegalPortal</h1>
            <p className="text-[10px] uppercase tracking-widest text-[#fed977] mt-1 font-semibold">Client Dashboard</p>
          </div>
        </div>
        
        <nav className="flex-1 px-3 space-y-2 overflow-y-auto portal-scrollbar">
          <NavLink 
            to="/client/portal/overview" 
            className={({ isActive }) => `flex items-center gap-4 px-4 py-3 rounded-xl font-medium text-sm transition-all cursor-pointer active:scale-95 group ${
              isActive ? 'text-white bg-[#1b2b4b] border-l-4 border-[#fed977] font-bold shadow-md' : 'text-[#8393b8] hover:bg-[#1b2b4b] hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-lg">dashboard</span>
            <span className="hidden md:block">Overview</span>
          </NavLink>
          
          <NavLink 
            to="/client/portal/cases" 
            className={({ isActive }) => `flex items-center gap-4 px-4 py-3 rounded-xl font-medium text-sm transition-all cursor-pointer active:scale-95 group ${
              isActive ? 'text-white bg-[#1b2b4b] border-l-4 border-[#fed977] font-bold shadow-md' : 'text-[#8393b8] hover:bg-[#1b2b4b] hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-lg">gavel</span>
            <span className="hidden md:block">My Cases</span>
          </NavLink>

          <NavLink 
            to="/client/portal/my-posts" 
            className={({ isActive }) => `flex items-center gap-4 px-4 py-3 rounded-xl font-medium text-sm transition-all cursor-pointer active:scale-95 group ${
              isActive ? 'text-white bg-[#1b2b4b] border-l-4 border-[#fed977] font-bold shadow-md' : 'text-[#8393b8] hover:bg-[#1b2b4b] hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-lg">work</span>
            <span className="hidden md:block">My Posted Cases</span>
          </NavLink>
          
          <NavLink 
            to="/client/portal/messages" 
            className={({ isActive }) => `flex items-center gap-4 px-4 py-3 rounded-xl font-medium text-sm transition-all cursor-pointer active:scale-95 group ${
              isActive ? 'text-white bg-[#1b2b4b] border-l-4 border-[#fed977] font-bold shadow-md' : 'text-[#8393b8] hover:bg-[#1b2b4b] hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>chat</span>
            <span className="hidden md:block">Messages</span>
          </NavLink>

          <NavLink 
            to="/client/portal/book-consultation" 
            className={({ isActive }) => `flex items-center gap-4 px-4 py-3 rounded-xl font-medium text-sm transition-all cursor-pointer active:scale-95 group ${
              isActive ? 'text-white bg-[#1b2b4b] border-l-4 border-[#fed977] font-bold shadow-md' : 'text-[#8393b8] hover:bg-[#1b2b4b] hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-lg">event_available</span>
            <span className="hidden md:block">Book Consultation</span>
          </NavLink>

          <NavLink 
            to="/client/portal/settings" 
            className={({ isActive }) => `flex items-center gap-4 px-4 py-3 rounded-xl font-medium text-sm transition-all cursor-pointer active:scale-95 group ${
              isActive ? 'text-white bg-[#1b2b4b] border-l-4 border-[#fed977] font-bold shadow-md' : 'text-[#8393b8] hover:bg-[#1b2b4b] hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-lg">settings</span>
            <span className="hidden md:block">Settings</span>
          </NavLink>
        </nav>
        
        <div className="px-3 pt-4 border-t border-[#1b2b4b] space-y-2 mt-auto">
          <div className="hidden md:flex items-center gap-3 px-3 py-2 bg-[#1b2b4b]/60 rounded-xl mb-2 border border-[#2d4068]">
            <img src={clientPic} alt="Client" className="w-9 h-9 rounded-full object-cover border border-[#fed977]" />
            <div className="overflow-hidden">
              <p className="text-xs font-bold text-white truncate">{clientName}</p>
              <p className="text-[10px] text-[#8393b8] uppercase">Client Portal</p>
            </div>
          </div>

          <NavLink to="/" className="flex items-center gap-4 px-4 py-2.5 rounded-xl text-xs font-medium text-[#8393b8] hover:bg-[#1b2b4b] hover:text-white transition-colors cursor-pointer">
            <span className="material-symbols-outlined text-base">home</span>
            <span className="hidden md:block">Home Page</span>
          </NavLink>
          <button onClick={() => { logout(); navigate('/'); }} className="w-full flex items-center gap-4 px-4 py-2.5 rounded-xl text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer">
            <span className="material-symbols-outlined text-base">logout</span>
            <span className="hidden md:block">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area with Outlet for nested routing */}
      <main className="flex-1 ml-20 md:ml-64 min-h-screen w-[calc(100%-5rem)] md:w-[calc(100%-16rem)] max-w-full overflow-x-hidden bg-[#F8F9FF] flex flex-col">
        <Outlet />
      </main>
    </div>
  );
};

export default ClientPortalLayout;
