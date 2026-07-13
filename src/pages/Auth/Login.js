import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/Button/Button';
import Card from '../../components/Card/Card';
import styles from './Auth.module.css';

const Login = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get('redirect');
  const { user, loading: authLoading, setUser } = useAuth();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!authLoading && user) {
      // User is already logged in — redirect to appropriate dashboard
      const role = user.user_type || user.role || 'client';
      let target = '/client/dashboard';
      if (role === 'lawyer') target = '/lawyer-suite/dashboard';
      else if (role === 'admin') target = '/admin';
      navigate(redirect || target, { replace: true });
    }
  }, [user, authLoading, navigate, redirect]);

  const validate = () => {
    const e = {};
    if (!formData.email) e.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(formData.email)) e.email = 'Email is invalid';
    if (!formData.password) e.password = 'Password is required';
    else if (formData.password.length < 8) e.password = 'Password must be at least 8 characters';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setErrors((prev) => ({ ...prev, submit: null }));

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: formData.email.trim().toLowerCase(),
        password: formData.password
      });

      if (error) {
        setErrors((prev) => ({ ...prev, submit: error.message }));
        setLoading(false);
        return;
      }

      if (data.session && data.user) {
        const u = data.user;
        
        // Timeout utility to prevent database locks from hanging the login forever
        const withTimeout = (promise, ms) => {
          return Promise.race([
            promise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Database query timeout')), ms))
          ]);
        };

        // Fetch user profile from database to ensure complete role and profile hydration
        let publicUser = null;
        try {
          const res = await withTimeout(
            supabase.from('users').select('*').eq('auth_id', u.id).maybeSingle(),
            5000
          );
          publicUser = res.data;
          
          if (!publicUser) {
            const resByEmail = await withTimeout(
              supabase.from('users').select('*').eq('email', u.email).maybeSingle(),
              5000
            );
            publicUser = resByEmail.data;
          }
        } catch (err) {
          console.warn('Profile lookup timed out or failed, proceeding with graceful fallback:', err);
        }

        const userRole = publicUser?.user_type || publicUser?.role || u.user_metadata?.role || u.user_metadata?.user_type || 'client';
        const userName = publicUser?.name || publicUser?.full_name || u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split('@')[0];
        const avatarUrl = publicUser?.profile_picture_url || u.user_metadata?.avatar_url || u.user_metadata?.profile_picture_url;

        const hydratedUser = {
          ...u,
          ...u.user_metadata,
          ...publicUser,
          id: publicUser?.id || u.id,
          auth_id: u.id,
          user_type: userRole,
          role: userRole,
          full_name: userName,
          name: userName,
          profile_picture_url: avatarUrl
        };

        // Synchronize global auth state instantly
        setUser(hydratedUser);

        // Execute accurate router push based on role
        let targetDashboard = '/client/dashboard';
        if (userRole === 'lawyer') {
          targetDashboard = '/lawyer-suite/dashboard';
        } else if (userRole === 'admin') {
          targetDashboard = '/admin';
        }

        // Slight delay to ensure context propagates before router unmounts
        setTimeout(() => {
          navigate(redirect || targetDashboard, { replace: true });
        }, 50);
      } else {
        // No session returned (e.g., email not confirmed)
        setLoading(false);
      }
    } catch (err) {
      console.error('Login error:', err);
      setErrors((prev) => ({ ...prev, submit: err?.message || 'Login failed.' }));
      setLoading(false);
    }
  };

  return (
    <div className={styles.authContainer}>
      <Card className={styles.authCard}>
        <h2>Login</h2>
        <p className={styles.subtitle}>Sign in to your account</p>

        <form onSubmit={handleSubmit} className={styles.form}>

          <div className={styles.formGroup}>
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className={errors.email ? styles.inputError : ''}
              placeholder="Enter your email"
            />
            {errors.email && <span className={styles.error}>{errors.email}</span>}
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="password">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? "text" : "password"}
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                className={errors.password ? styles.inputError : ''}
                placeholder="Enter your password"
                style={{ width: '100%', paddingRight: '60px' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', color: '#6B7280' }}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {errors.password && <span className={styles.error}>{errors.password}</span>}
          </div>

          <div style={{ textAlign: 'right', marginTop: '-0.5rem' }}>
            <Link to="/forgot-password" style={{ fontSize: '0.85rem', color: '#0E7490' }}>
              Forgot password?
            </Link>
          </div>

          {errors.submit && <div className={styles.errorMessage}>{errors.submit}</div>}

          <Button type="submit" disabled={loading} className={styles.submitButton}>
            {loading ? 'Logging in…' : 'Login'}
          </Button>
        </form>

        <p className={styles.switchAuth}>
          Don't have an account? <Link to="/register">Register here</Link>
        </p>
      </Card>
    </div>
  );
};

export default Login;
