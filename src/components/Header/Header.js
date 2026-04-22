import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import styles from './Header.module.css';

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navigate = useNavigate();
  const isAuthenticated = localStorage.getItem('token'); // Simple auth check
  const userType = localStorage.getItem('userType'); // 'client' or 'lawyer'

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userType');
    localStorage.removeItem('userId');
    navigate('/');
  };

  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <Link to="/" className={styles.logo}>
          <img src="/logo.svg" alt="LegalConnect" className={styles.logoImage} />
        </Link>
        
        <button 
          className={styles.menuToggle}
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          aria-label="Toggle menu"
        >
          <span></span>
          <span></span>
          <span></span>
        </button>

        <nav className={`${styles.nav} ${isMenuOpen ? styles.navOpen : ''}`}>
          <Link to="/" onClick={() => setIsMenuOpen(false)}>Home</Link>
          <Link to="/lawyers" onClick={() => setIsMenuOpen(false)}>Find Lawyers</Link>
          <Link to="/cases" onClick={() => setIsMenuOpen(false)}>Case Tracking</Link>
          <Link to="/legal-updates" onClick={() => setIsMenuOpen(false)}>Legal Updates</Link>
          <Link to="/feedback" onClick={() => setIsMenuOpen(false)}>Feedback</Link>
          <Link to="/contact" onClick={() => setIsMenuOpen(false)}>Contact</Link>
          
          {isAuthenticated ? (
            <>
              {userType === 'client' ? (
                <Link to="/client/dashboard" onClick={() => setIsMenuOpen(false)}>Dashboard</Link>
              ) : (
                <Link to="/lawyer/dashboard" onClick={() => setIsMenuOpen(false)}>Dashboard</Link>
              )}
              <button onClick={handleLogout} className={styles.logoutBtn}>Logout</button>
            </>
          ) : (
            <>
              <Link to="/login" onClick={() => setIsMenuOpen(false)}>Login</Link>
              <Link to="/register" onClick={() => setIsMenuOpen(false)} className={styles.registerBtn}>Register</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
};

export default Header;


