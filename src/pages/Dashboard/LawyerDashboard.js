import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Sidebar from '../../components/Sidebar/Sidebar';
import Card from '../../components/Card/Card';
import Button from '../../components/Button/Button';
import styles from './Dashboard.module.css';

const LawyerDashboard = () => {
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: '',
    specialization: '',
    location: '',
    bio: ''
  });

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const token = localStorage.getItem('token');
      const [appointmentsRes, documentsRes, notificationsRes, profileRes] = await Promise.all([
        axios.get('/api/lawyer/appointments', {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        axios.get('/api/lawyer/documents', {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        axios.get('/api/lawyer/notifications', {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        axios.get('/api/lawyer/profile', {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);
      setAppointments(appointmentsRes.data);
      setDocuments(documentsRes.data);
      setNotifications(notificationsRes.data);
      setProfile(profileRes.data);
      setProfileForm({
        name: profileRes.data.name || '',
        specialization: profileRes.data.specialization || '',
        location: profileRes.data.location || '',
        bio: profileRes.data.bio || ''
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      // Sample data
      setAppointments([
        {
          id: 1,
          clientName: 'Jane Doe',
          date: '2024-01-15',
          time: '10:00 AM',
          status: 'upcoming',
          reason: 'Initial Consultation'
        },
        {
          id: 2,
          clientName: 'Bob Smith',
          date: '2024-01-16',
          time: '2:00 PM',
          status: 'upcoming',
          reason: 'Case Review'
        }
      ]);
      setDocuments([
        {
          id: 1,
          clientName: 'Jane Doe',
          name: 'Contract_Review.pdf',
          uploadedAt: '2024-01-10',
          size: '2.5 MB'
        }
      ]);
      setNotifications([
        {
          id: 1,
          type: 'chat',
          message: 'New message from Jane Doe',
          time: '2 hours ago'
        },
        {
          id: 2,
          type: 'appointment',
          message: 'New appointment request from Bob Smith',
          time: '5 hours ago'
        }
      ]);
      setProfile({
        name: 'John Smith',
        specialization: 'Criminal Law',
        location: 'New York, NY',
        bio: 'Experienced criminal defense attorney'
      });
      setProfileForm({
        name: 'John Smith',
        specialization: 'Criminal Law',
        location: 'New York, NY',
        bio: 'Experienced criminal defense attorney'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      await axios.put('/api/lawyer/profile', profileForm, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setShowProfileEdit(false);
      fetchDashboardData();
    } catch (error) {
      console.error('Error updating profile:', error);
    }
  };

  const upcomingAppointments = appointments.filter(apt => apt.status === 'upcoming').slice(0, 5);

  if (loading) {
    return <div className={styles.loading}>Loading dashboard...</div>;
  }

  return (
    <div className={styles.dashboard}>
      <div className={styles.dashboardLayout}>
        <Sidebar userType="lawyer" />
        <div className={styles.dashboardContent}>
          <div className={styles.dashboardHeader}>
            <h1 className={styles.dashboardTitle}>Lawyer Dashboard</h1>
            <Button variant="primary" onClick={() => setShowProfileEdit(!showProfileEdit)}>
              {showProfileEdit ? 'Cancel Edit' : 'Edit Profile'}
            </Button>
          </div>

          {/* Profile Section */}
          {showProfileEdit ? (
            <section className={styles.section}>
              <Card>
                <h2>Edit Profile</h2>
                <form onSubmit={handleProfileUpdate} className={styles.profileForm}>
                  <div className={styles.formGroup}>
                    <label>Name</label>
                    <input
                      type="text"
                      value={profileForm.name}
                      onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Specialization</label>
                    <input
                      type="text"
                      value={profileForm.specialization}
                      onChange={(e) => setProfileForm({ ...profileForm, specialization: e.target.value })}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Location</label>
                    <input
                      type="text"
                      value={profileForm.location}
                      onChange={(e) => setProfileForm({ ...profileForm, location: e.target.value })}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Bio</label>
                    <textarea
                      value={profileForm.bio}
                      onChange={(e) => setProfileForm({ ...profileForm, bio: e.target.value })}
                      rows="4"
                    />
                  </div>
                  <Button type="submit" variant="primary">Save Changes</Button>
                </form>
              </Card>
            </section>
          ) : (
            profile && (
              <section className={styles.section}>
                <Card>
                  <h2>Profile</h2>
                  <div className={styles.profileInfo}>
                    <p><strong>Name:</strong> {profile.name}</p>
                    <p><strong>Specialization:</strong> {profile.specialization}</p>
                    <p><strong>Location:</strong> {profile.location}</p>
                    <p><strong>Bio:</strong> {profile.bio}</p>
                  </div>
                </Card>
              </section>
            )
          )}

          {/* Notifications */}
          <section className={styles.section}>
            <h2>Notifications</h2>
            {notifications.length === 0 ? (
              <Card>
                <p className={styles.emptyState}>No new notifications.</p>
              </Card>
            ) : (
              <Card>
                <div className={styles.notificationsList}>
                  {notifications.map(notif => (
                    <div key={notif.id} className={styles.notificationItem}>
                      <span className={styles.notificationIcon}>
                        {notif.type === 'chat' ? '💬' : '📅'}
                      </span>
                      <div className={styles.notificationContent}>
                        <p>{notif.message}</p>
                        <span className={styles.notificationTime}>{notif.time}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </section>

          {/* Upcoming Appointments */}
          <section className={styles.section}>
            <h2>Upcoming Appointments</h2>
            {upcomingAppointments.length === 0 ? (
              <Card>
                <p className={styles.emptyState}>No upcoming appointments.</p>
              </Card>
            ) : (
              <Card>
                <div className={styles.appointmentsTable}>
                  <table>
                    <thead>
                      <tr>
                        <th>Client</th>
                        <th>Date & Time</th>
                        <th>Reason</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {upcomingAppointments.map(appointment => (
                        <tr key={appointment.id}>
                          <td>{appointment.clientName}</td>
                          <td>
                            {new Date(appointment.date).toLocaleDateString()} at {appointment.time}
                          </td>
                          <td>{appointment.reason}</td>
                          <td>
                            <span className={styles[appointment.status]}>{appointment.status}</span>
                          </td>
                          <td>
                            <Button
                              variant="outline"
                              onClick={() => navigate(`/chat/${appointment.clientId}`)}
                            >
                              Chat
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </section>

          {/* Client Documents */}
          <section className={styles.section}>
            <h2>Client Documents</h2>
            {documents.length === 0 ? (
              <Card>
                <p className={styles.emptyState}>No documents received.</p>
              </Card>
            ) : (
              <Card>
                <div className={styles.documentsList}>
                  {documents.map(doc => (
                    <div key={doc.id} className={styles.documentItem}>
                      <div className={styles.documentInfo}>
                        <span className={styles.documentIcon}>📄</span>
                        <div>
                          <p className={styles.documentName}>{doc.name}</p>
                          <p className={styles.documentMeta}>
                            From: {doc.clientName} • {new Date(doc.uploadedAt).toLocaleDateString()} • {doc.size}
                          </p>
                        </div>
                      </div>
                      <Button variant="outline">View</Button>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default LawyerDashboard;


