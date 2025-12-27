import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import Button from '../../components/Button/Button';
import Card from '../../components/Card/Card';
import styles from './Auth.module.css';

const Login = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    userType: 'client'
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const newErrors = {};
    
    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    }
    
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validate()) {
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post('/api/auth/login', formData);
      // Store token and user info
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('userType', formData.userType);
      localStorage.setItem('userId', response.data.userId);
      
      // Redirect to appropriate dashboard
      if (formData.userType === 'client') {
        navigate('/client/dashboard');
      } else {
        navigate('/lawyer/dashboard');
      }
    } catch (error) {
      console.error('Login error:', error);
      setErrors({ submit: error.response?.data?.message || 'Login failed. Please try again.' });
    } finally {
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
            <label htmlFor="userType">I am a:</label>
            <select
              id="userType"
              name="userType"
              value={formData.userType}
              onChange={handleChange}
              className={styles.select}
            >
              <option value="client">Client</option>
              <option value="lawyer">Lawyer</option>
            </select>
          </div>

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
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              className={errors.password ? styles.inputError : ''}
              placeholder="Enter your password"
            />
            {errors.password && <span className={styles.error}>{errors.password}</span>}
          </div>

          {errors.submit && <div className={styles.errorMessage}>{errors.submit}</div>}

          <Button type="submit" disabled={loading} className={styles.submitButton}>
            {loading ? 'Logging in...' : 'Login'}
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


