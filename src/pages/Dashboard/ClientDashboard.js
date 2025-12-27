import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Sidebar from '../../components/Sidebar/Sidebar';
import Card from '../../components/Card/Card';
import Button from '../../components/Button/Button';
import Timeline from '../../components/Timeline/Timeline';
import styles from './Dashboard.module.css';

const ClientDashboard = () => {
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [caseProgress, setCaseProgress] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const token = localStorage.getItem('token');
      const [appointmentsRes, documentsRes, progressRes] = await Promise.all([
        axios.get('/api/appointments', {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        axios.get('/api/documents', {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        axios.get('/api/cases/progress', {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);
      setAppointments(appointmentsRes.data);
      setDocuments(documentsRes.data);
      setCaseProgress(progressRes.data);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      // Sample data
      setAppointments([
        {
          id: 1,
          lawyerName: 'John Smith',
          date: '2024-01-15',
          time: '10:00 AM',
          status: 'upcoming',
          reason: 'Initial Consultation'
        },
        {
          id: 2,
          lawyerName: 'Sarah Johnson',
          date: '2024-01-20',
          time: '2:00 PM',
          status: 'upcoming',
          reason: 'Case Review'
        }
      ]);
      setDocuments([
        {
          id: 1,
          name: 'Contract_Review.pdf',
          uploadedAt: '2024-01-10',
          size: '2.5 MB'
        },
        {
          id: 2,
          name: 'Legal_Document.docx',
          uploadedAt: '2024-01-12',
          size: '1.8 MB'
        }
      ]);
      setCaseProgress([
        {
          title: 'Case Filed',
          date: '2024-01-05',
          description: 'Initial case documents submitted'
        },
        {
          title: 'First Consultation',
          date: '2024-01-10',
          description: 'Met with lawyer for initial consultation'
        },
        {
          title: 'Document Review',
          date: '2024-01-12',
          description: 'All documents reviewed and approved'
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const upcomingAppointments = appointments.filter(apt => apt.status === 'upcoming').slice(0, 3);

  if (loading) {
    return <div className={styles.loading}>Loading dashboard...</div>;
  }

  return (
    <div className={styles.dashboard}>
      <div className={styles.dashboardLayout}>
        <Sidebar userType="client" />
        <div className={styles.dashboardContent}>
          <h1 className={styles.dashboardTitle}>Client Dashboard</h1>

          {/* Upcoming Appointments */}
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>Upcoming Appointments</h2>
              <Button variant="primary" onClick={() => navigate('/lawyers')}>
                Book New Appointment
              </Button>
            </div>
            {upcomingAppointments.length === 0 ? (
              <Card>
                <p className={styles.emptyState}>No upcoming appointments. Book one now!</p>
              </Card>
            ) : (
              <div className={styles.cardsGrid}>
                {upcomingAppointments.map(appointment => (
                  <Card key={appointment.id} className={styles.appointmentCard}>
                    <h3>{appointment.lawyerName}</h3>
                    <p className={styles.appointmentDate}>
                      📅 {new Date(appointment.date).toLocaleDateString()} at {appointment.time}
                    </p>
                    <p className={styles.appointmentReason}>{appointment.reason}</p>
                    <p className={styles.appointmentStatus}>
                      Status: <span className={styles[appointment.status]}>{appointment.status}</span>
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => navigate(`/chat/${appointment.lawyerId}`)}
                      className={styles.actionButton}
                    >
                      Message Lawyer
                    </Button>
                  </Card>
                ))}
              </div>
            )}
          </section>

          {/* Recent Documents */}
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>Recent Documents</h2>
              <Button variant="primary" onClick={() => navigate('/documents/upload')}>
                Upload Document
              </Button>
            </div>
            {documents.length === 0 ? (
              <Card>
                <p className={styles.emptyState}>No documents uploaded yet.</p>
              </Card>
            ) : (
              <Card>
                <div className={styles.documentsList}>
                  {documents.slice(0, 5).map(doc => (
                    <div key={doc.id} className={styles.documentItem}>
                      <div className={styles.documentInfo}>
                        <span className={styles.documentIcon}>📄</span>
                        <div>
                          <p className={styles.documentName}>{doc.name}</p>
                          <p className={styles.documentMeta}>
                            Uploaded: {new Date(doc.uploadedAt).toLocaleDateString()} • {doc.size}
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

          {/* Case Progress */}
          <section className={styles.section}>
            <h2>Case Progress</h2>
            <Card>
              {caseProgress.length === 0 ? (
                <p className={styles.emptyState}>No case progress to display.</p>
              ) : (
                <Timeline events={caseProgress} />
              )}
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
};

export default ClientDashboard;

