import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import Card from '../../components/Card/Card';
import Button from '../../components/Button/Button';
import styles from './AppointmentBooking.module.css';

const AppointmentBooking = () => {
  const navigate = useNavigate();
  const { lawyerId } = useParams();
  const [lawyers, setLawyers] = useState([]);
  const [formData, setFormData] = useState({
    lawyerId: lawyerId || '',
    date: '',
    time: '',
    reason: '',
    notes: ''
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchLawyers();
    if (lawyerId) {
      setFormData(prev => ({ ...prev, lawyerId }));
    }
  }, [lawyerId]);

  const fetchLawyers = async () => {
    try {
      const response = await axios.get('/api/lawyers');
      setLawyers(response.data);
    } catch (error) {
      console.error('Error fetching lawyers:', error);
      // Sample data
      setLawyers([
        { id: 1, name: 'John Smith', specialization: 'Criminal Law' },
        { id: 2, name: 'Sarah Johnson', specialization: 'Corporate Law' },
        { id: 3, name: 'Michael Brown', specialization: 'Family Law' }
      ]);
    }
  };

  const validate = () => {
    const newErrors = {};

    if (!formData.lawyerId) {
      newErrors.lawyerId = 'Please select a lawyer';
    }

    if (!formData.date) {
      newErrors.date = 'Please select a date';
    } else {
      const selectedDate = new Date(formData.date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (selectedDate < today) {
        newErrors.date = 'Please select a future date';
      }
    }

    if (!formData.time) {
      newErrors.time = 'Please select a time';
    }

    if (!formData.reason.trim()) {
      newErrors.reason = 'Please provide a reason for the appointment';
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

    setSubmitting(true);
    try {
      await axios.post('/api/appointments', formData, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      alert('Appointment booked successfully!');
      navigate('/client/dashboard');
    } catch (error) {
      console.error('Error booking appointment:', error);
      setErrors({ submit: error.response?.data?.message || 'Failed to book appointment. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  const getMinDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  return (
    <div className={styles.appointmentBooking}>
      <div className={styles.container}>
        <h1 className={styles.title}>Book an Appointment</h1>

        <Card className={styles.bookingCard}>
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.formGroup}>
              <label htmlFor="lawyerId">Select Lawyer *</label>
              <select
                id="lawyerId"
                name="lawyerId"
                value={formData.lawyerId}
                onChange={handleChange}
                className={errors.lawyerId ? styles.inputError : ''}
                disabled={!!lawyerId}
              >
                <option value="">Choose a lawyer...</option>
                {lawyers.map(lawyer => (
                  <option key={lawyer.id} value={lawyer.id}>
                    {lawyer.name} - {lawyer.specialization}
                  </option>
                ))}
              </select>
              {errors.lawyerId && <span className={styles.error}>{errors.lawyerId}</span>}
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label htmlFor="date">Date *</label>
                <input
                  type="date"
                  id="date"
                  name="date"
                  value={formData.date}
                  onChange={handleChange}
                  min={getMinDate()}
                  className={errors.date ? styles.inputError : ''}
                />
                {errors.date && <span className={styles.error}>{errors.date}</span>}
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="time">Time *</label>
                <input
                  type="time"
                  id="time"
                  name="time"
                  value={formData.time}
                  onChange={handleChange}
                  className={errors.time ? styles.inputError : ''}
                />
                {errors.time && <span className={styles.error}>{errors.time}</span>}
              </div>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="reason">Reason for Appointment *</label>
              <input
                type="text"
                id="reason"
                name="reason"
                value={formData.reason}
                onChange={handleChange}
                placeholder="e.g., Initial consultation, Case review"
                className={errors.reason ? styles.inputError : ''}
              />
              {errors.reason && <span className={styles.error}>{errors.reason}</span>}
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="notes">Additional Notes</label>
              <textarea
                id="notes"
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                rows="4"
                placeholder="Any additional information you'd like to share..."
                className={styles.textarea}
              />
            </div>

            {errors.submit && <div className={styles.errorMessage}>{errors.submit}</div>}

            <div className={styles.formActions}>
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigate(-1)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={submitting}
              >
                {submitting ? 'Booking...' : 'Book Appointment'}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default AppointmentBooking;


