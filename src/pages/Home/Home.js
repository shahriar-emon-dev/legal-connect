import React from 'react';
import { Link } from 'react-router-dom';
import Button from '../../components/Button/Button';
import styles from './Home.module.css';

const Home = () => {
  return (
    <div className={styles.home}>
      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <h1 className={styles.heroTitle}>Connect with Expert Lawyers</h1>
          <p className={styles.heroSubtitle}>
            Find the right legal professional for your needs. Book consultations, 
            manage documents, and get expert advice all in one place.
          </p>
          <div className={styles.heroButtons}>
            <Link to="/lawyers">
              <Button variant="primary" className={styles.ctaButton}>
                Find a Lawyer
              </Button>
            </Link>
            <Link to="/register">
              <Button variant="outline" className={styles.ctaButton}>
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Services Overview */}
      <section className={styles.section}>
        <div className={styles.container}>
          <h2 className={styles.sectionTitle}>Our Services</h2>
          <div className={styles.servicesGrid}>
            <div className={styles.serviceCard}>
              <div className={styles.serviceIcon}>🔍</div>
              <h3>Find Lawyers</h3>
              <p>Search and filter through our network of qualified lawyers by specialization, location, and ratings.</p>
            </div>
            <div className={styles.serviceCard}>
              <div className={styles.serviceIcon}>📅</div>
              <h3>Book Appointments</h3>
              <p>Schedule consultations with lawyers at your convenience. Manage all your appointments in one place.</p>
            </div>
            <div className={styles.serviceCard}>
              <div className={styles.serviceIcon}>📄</div>
              <h3>Document Management</h3>
              <p>Upload, store, and share legal documents securely. Keep all your important files organized.</p>
            </div>
            <div className={styles.serviceCard}>
              <div className={styles.serviceIcon}>💬</div>
              <h3>Direct Communication</h3>
              <p>Chat with your lawyer in real-time. Get quick answers and stay connected throughout your case.</p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className={`${styles.section} ${styles.howItWorks}`}>
        <div className={styles.container}>
          <h2 className={styles.sectionTitle}>How It Works</h2>
          <div className={styles.steps}>
            <div className={styles.step}>
              <div className={styles.stepNumber}>1</div>
              <h3>Create an Account</h3>
              <p>Sign up as a client or lawyer. Complete your profile to get started.</p>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNumber}>2</div>
              <h3>Find a Lawyer</h3>
              <p>Browse our directory of lawyers. Filter by specialization, location, and ratings.</p>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNumber}>3</div>
              <h3>Book an Appointment</h3>
              <p>Select a date and time that works for you. Confirm your appointment details.</p>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNumber}>4</div>
              <h3>Get Legal Help</h3>
              <p>Attend your consultation, upload documents, and communicate with your lawyer.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className={`${styles.section} ${styles.ctaSection}`}>
        <div className={styles.container}>
          <h2>Ready to Get Started?</h2>
          <p>Join thousands of clients and lawyers already using LegalConnect</p>
          <Link to="/register">
            <Button variant="primary" className={styles.ctaButton}>
              Sign Up Now
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
};

export default Home;


