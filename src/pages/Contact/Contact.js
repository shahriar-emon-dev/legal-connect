import React, { useState } from 'react';
import axios from 'axios';
import Card from '../../components/Card/Card';
import Button from '../../components/Button/Button';
import styles from './Contact.module.css';

const Contact = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

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

    if (!formData.subject.trim()) {
      newErrors.subject = 'Subject is required';
    }

    if (!formData.message.trim()) {
      newErrors.message = 'Message is required';
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
      await axios.post('/api/contact', formData);
      setSubmitted(true);
      setFormData({
        name: '',
        email: '',
        subject: '',
        message: ''
      });
    } catch (error) {
      console.error('Error submitting contact form:', error);
      setErrors({ submit: error.response?.data?.message || 'Failed to send message. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className={styles.contact}>
        <div className={styles.container}>
          <Card className={styles.successCard}>
            <h2>Thank You!</h2>
            <p>Your message has been sent successfully. We'll get back to you soon.</p>
            <Button variant="primary" onClick={() => setSubmitted(false)}>
              Send Another Message
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.contact}>
      <div className={styles.container}>
        <h1 className={styles.title}>Contact Us</h1>
        <p className={styles.subtitle}>Have a question? We'd love to hear from you.</p>

        <div className={styles.contactContent}>
          <Card className={styles.contactCard}>
            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.formGroup}>
                <label htmlFor="name">Name *</label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  className={errors.name ? styles.inputError : ''}
                  placeholder="Your name"
                />
                {errors.name && <span className={styles.error}>{errors.name}</span>}
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="email">Email *</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className={errors.email ? styles.inputError : ''}
                  placeholder="your.email@example.com"
                />
                {errors.email && <span className={styles.error}>{errors.email}</span>}
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="subject">Subject *</label>
                <input
                  type="text"
                  id="subject"
                  name="subject"
                  value={formData.subject}
                  onChange={handleChange}
                  className={errors.subject ? styles.inputError : ''}
                  placeholder="What is this regarding?"
                />
                {errors.subject && <span className={styles.error}>{errors.subject}</span>}
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="message">Message *</label>
                <textarea
                  id="message"
                  name="message"
                  value={formData.message}
                  onChange={handleChange}
                  rows="6"
                  className={errors.message ? styles.inputError : ''}
                  placeholder="Your message..."
                />
                {errors.message && <span className={styles.error}>{errors.message}</span>}
              </div>

              {errors.submit && <div className={styles.errorMessage}>{errors.submit}</div>}

              <Button type="submit" variant="primary" disabled={submitting} className={styles.submitButton}>
                {submitting ? 'Sending...' : 'Send Message'}
              </Button>
            </form>
          </Card>

          <div className={styles.contactInfo}>
            <Card className={styles.infoCard}>
              <h3>Get in Touch</h3>
              <div className={styles.infoItem}>
                <strong>Email:</strong>
                <p>info@legalconnect.com</p>
              </div>
              <div className={styles.infoItem}>
                <strong>Phone:</strong>
                <p>+1 (555) 123-4567</p>
              </div>
              <div className={styles.infoItem}>
                <strong>Address:</strong>
                <p>123 Legal Street<br />New York, NY 10001</p>
              </div>
              <div className={styles.infoItem}>
                <strong>Business Hours:</strong>
                <p>Monday - Friday: 9:00 AM - 6:00 PM<br />Saturday: 10:00 AM - 4:00 PM</p>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Contact;


