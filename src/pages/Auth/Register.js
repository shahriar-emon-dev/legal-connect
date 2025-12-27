import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import Button from '../../components/Button/Button';
import Card from '../../components/Card/Card';
import styles from './Auth.module.css';

const Register = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    userType: 'client',
    phone: '',
    specialization: '',
    location: ''
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const newErrors = {};
    
    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }
    
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
    
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }
    
    if (formData.userType === 'lawyer') {
      if (!formData.specialization.trim()) {
        newErrors.specialization = 'Specialization is required';
      }
      if (!formData.location.trim()) {
        newErrors.location = 'Location is required';
      }
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
      const response = await axios.post('/api/auth/register', formData);
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
      console.error('Registration error:', error);
      setErrors({ submit: error.response?.data?.message || 'Registration failed. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.authContainer}>
      <Card className={styles.authCard}>
        <h2>Register</h2>
        <p className={styles.subtitle}>Create a new account</p>
        
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
            <label htmlFor="name">Full Name</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className={errors.name ? styles.inputError : ''}
              placeholder="Enter your full name"
            />
            {errors.name && <span className={styles.error}>{errors.name}</span>}
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
            <label htmlFor="phone">Phone</label>
            <input
              type="tel"
              id="phone"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder="Enter your phone number"
            />
          </div>

          {formData.userType === 'lawyer' && (
            <>
              <div className={styles.formGroup}>
                <label htmlFor="specialization">Specialization</label>
                <input
                  type="text"
                  id="specialization"
                  name="specialization"
                  value={formData.specialization}
                  onChange={handleChange}
                  className={errors.specialization ? styles.inputError : ''}
                  placeholder="e.g., Criminal Law, Corporate Law"
                />
                {errors.specialization && <span className={styles.error}>{errors.specialization}</span>}
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="location">Location</label>
                <input
                  type="text"
                  id="location"
                  name="location"
                  value={formData.location}
                  onChange={handleChange}
                  className={errors.location ? styles.inputError : ''}
                  placeholder="City, State"
                />
                {errors.location && <span className={styles.error}>{errors.location}</span>}
              </div>
            </>
          )}

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

          <div className={styles.formGroup}>
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              className={errors.confirmPassword ? styles.inputError : ''}
              placeholder="Confirm your password"
            />
            {errors.confirmPassword && <span className={styles.error}>{errors.confirmPassword}</span>}
          </div>

          {errors.submit && <div className={styles.errorMessage}>{errors.submit}</div>}

          <Button type="submit" disabled={loading} className={styles.submitButton}>
            {loading ? 'Registering...' : 'Register'}
          </Button>
        </form>

        <p className={styles.switchAuth}>
          Already have an account? <Link to="/login">Login here</Link>
        </p>
      </Card>
    </div>
  );
};

export default Register;


