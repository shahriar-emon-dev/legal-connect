import React from "react";
import { Link } from "react-router-dom";
import Button from "../../components/Button/Button";
import styles from "./Home.module.css";

const Home = () => {
  return (
    <div className={styles.home}>
      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroLeft}>
            <div className={styles.heroBadge}>
              <span className={styles.badgeDot}></span>
              <span>Bangladesh&apos;s first legal marketplace</span>
            </div>

            <h1 className={styles.heroTitle}>
              Post your case.
              <br />
              <span>Choose your counsel.</span>
              <br />
              Track your justice.
            </h1>

            <p className={styles.heroSubtitle}>
              Connect with 50,000+ verified lawyers across Bangladesh. Compare
              proposals, work in a secure digital workspace, and close cases
              with confidence.
            </p>

            <div className={styles.heroButtons}>
              <Link to="/register" className={styles.primaryHeroBtn}>
                Post your case free
              </Link>
              <Link to="/register" className={styles.secondaryHeroBtn}>
                Join as a lawyer
              </Link>
              <Link to="/contact" className={styles.linkHeroBtn}>
                Watch demo
              </Link>
            </div>

            <div className={styles.heroTrust}>
              <div className={styles.trustItem}>
                <span className={styles.trustIcon}>★</span>
                <span>4.9/5 from 2,400+ cases</span>
              </div>
              <div className={styles.trustItem}>
                <span className={styles.trustIcon}>✦</span>
                <span>Bar-verified lawyers only</span>
              </div>
              <div className={styles.trustItem}>
                <span className={styles.trustIcon}>▣</span>
                <span>Bank-grade document vault</span>
              </div>
            </div>
          </div>

          <div className={styles.heroRight}>
            <div className={`${styles.floatCard} ${styles.activeCaseCard}`}>
              <div className={styles.cardTop}>
                <span className={styles.cardLabel}>Active case</span>
                <span className={styles.progressPill}>In progress</span>
              </div>
              <p className={styles.caseTitle}>Property dispute - Dhaka</p>
              <p className={styles.caseLawyer}>Advocate Rahima Begum</p>
              <div className={styles.caseDateRow}>
                <span>Hearing date</span>
                <strong>May 12, 2026</strong>
              </div>
            </div>

            <div className={`${styles.floatCard} ${styles.proposalCard}`}>
              <div className={styles.proposalHead}>
                <div className={styles.avatar}>AR</div>
                <div>
                  <p className={styles.proposalName}>Adv. A. Rahman</p>
                  <p className={styles.proposalMeta}>★ 4.8 - IP Specialist</p>
                </div>
              </div>
              <p className={styles.proposalText}>
                I have 12 years of IP litigation experience and can take this
                case.
              </p>
              <div className={styles.proposalBottom}>
                <span className={styles.bidPrice}>৳ 45,000</span>
                <button type="button" className={styles.acceptBidBtn}>
                  Accept bid
                </button>
              </div>
            </div>

            <div className={styles.statCards}>
              <div className={styles.statCard}>
                <strong>12K+</strong>
                <span>Lawyers</span>
              </div>
              <div className={styles.statCard}>
                <strong>98%</strong>
                <span>Resolved</span>
              </div>
            </div>
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
              <p>
                Search and filter through our network of qualified lawyers by
                specialization, location, and ratings.
              </p>
            </div>
            <div className={styles.serviceCard}>
              <div className={styles.serviceIcon}>📅</div>
              <h3>Book Appointments</h3>
              <p>
                Schedule consultations with lawyers at your convenience. Manage
                all your appointments in one place.
              </p>
            </div>
            <div className={styles.serviceCard}>
              <div className={styles.serviceIcon}>📄</div>
              <h3>Document Management</h3>
              <p>
                Upload, store, and share legal documents securely. Keep all your
                important files organized.
              </p>
            </div>
            <div className={styles.serviceCard}>
              <div className={styles.serviceIcon}>💬</div>
              <h3>Direct Communication</h3>
              <p>
                Chat with your lawyer in real-time. Get quick answers and stay
                connected throughout your case.
              </p>
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
              <p>
                Sign up as a client or lawyer. Complete your profile to get
                started.
              </p>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNumber}>2</div>
              <h3>Find a Lawyer</h3>
              <p>
                Browse our directory of lawyers. Filter by specialization,
                location, and ratings.
              </p>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNumber}>3</div>
              <h3>Book an Appointment</h3>
              <p>
                Select a date and time that works for you. Confirm your
                appointment details.
              </p>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNumber}>4</div>
              <h3>Get Legal Help</h3>
              <p>
                Attend your consultation, upload documents, and communicate with
                your lawyer.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className={`${styles.section} ${styles.ctaSection}`}>
        <div className={styles.container}>
          <h2>Ready to Get Started?</h2>
          <p>
            Join thousands of clients and lawyers already using LegalConnect
          </p>
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
