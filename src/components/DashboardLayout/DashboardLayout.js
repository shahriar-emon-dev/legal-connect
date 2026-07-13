import React from 'react';
import { Outlet } from 'react-router-dom';

/**
 * DashboardLayout - Wraps all portal and dashboard pages.
 * Renders sidebar + page content ONLY (no TopNavbar, no Footer).
 * Ensures that public header and footer are completely absent from dashboard routes.
 */
const DashboardLayout = () => {
  return (
    <div className="dashboard-layout min-h-screen bg-[#F8F9FF] text-[#041635] w-full max-w-full overflow-x-hidden">
      <Outlet />
    </div>
  );
};

export default DashboardLayout;
