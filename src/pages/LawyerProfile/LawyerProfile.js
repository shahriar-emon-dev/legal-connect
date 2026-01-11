import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Sidebar from '../../components/Sidebar/Sidebar';
import Card from '../../components/Card/Card';
import styles from './LawyerProfile.module.css';

const LawyerProfile = () => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/lawyer/profile', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setProfile(response.data);
    } catch (error) {
      console.error('Error fetching profile:', error);
      // Sample data
      setProfile({
        name: 'John Smith',
        specialization: 'Criminal Law',
        location: 'New York, NY',
        bio: 'Experienced criminal defense attorney with over 10 years of practice. Specializes in criminal defense, DUI cases, and family law.',
        qualifications: 'Juris Doctor (JD) from Harvard Law School, Admitted to New York State Bar',
        experience: '10+ years',
        contact: 'john.smith@lawfirm.com'
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading profile...</div>;
  }

  return (
    <div className={styles.profile}>
      <div className={styles.profileLayout}>
        <Sidebar userType="lawyer" />
        <div className={styles.profileContent}>
          <div className={styles.profileHeader}>
            <h1 className={styles.profileTitle}>Lawyer Profile</h1>
          </div>

          {profile && (
            <section className={styles.section}>
              <Card>
                <div className={styles.profileDetails}>
                  <div className={styles.profileImage}>
                    <img src="/default-avatar.png" alt="Profile" />
                  </div>
                  <div className={styles.profileInfo}>
                    <h2>{profile.name}</h2>
                    <p className={styles.specialization}>{profile.specialization}</p>
                    <p className={styles.location}>📍 {profile.location}</p>
                    <p className={styles.experience}>Experience: {profile.experience}</p>
                    <p className={styles.contact}>Contact: {profile.contact}</p>
                  </div>
                </div>
                <div className={styles.bioSection}>
                  <h3>Professional Bio</h3>
                  <p>{profile.bio}</p>
                </div>
                <div className={styles.qualificationsSection}>
                  <h3>Qualifications</h3>
                  <p>{profile.qualifications}</p>
                </div>
              </Card>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

export default LawyerProfile;