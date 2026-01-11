import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import styles from './Sidebar.module.css';

const Sidebar = ({ userType }) => {
  const location = useLocation();

  const clientLinks = [
    { path: '/client/dashboard', label: 'Dashboard', icon: '📊' },
    { path: '/lawyers', label: 'Find Lawyers', icon: '🔍' },
    { path: '/documents/upload', label: 'Upload Documents', icon: '📄' },
    { path: '/chat', label: 'Messages', icon: '💬' },
  ];

  const lawyerLinks = [
    { path: '/lawyer/dashboard', label: 'Dashboard', icon: '📊' },
    { path: '/lawyer/profile', label: 'Profile', icon: '👤' },
    { path: '/lawyer/communication', label: 'Communication', icon: '💬' },
    { path: '/lawyer/dashboard/appointments', label: 'Appointments', icon: '📅' },
    { path: '/lawyer/dashboard/documents', label: 'Documents', icon: '📄' },
  ];

  const links = userType === 'client' ? clientLinks : lawyerLinks;

  return (
    <aside className={styles.sidebar}>
      <nav className={styles.nav}>
        {links.map((link) => (
          <Link
            key={link.path}
            to={link.path}
            className={`${styles.navLink} ${location.pathname === link.path ? styles.active : ''}`}
          >
            <span className={styles.icon}>{link.icon}</span>
            <span>{link.label}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;


