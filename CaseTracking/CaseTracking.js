import React, { useState } from 'react';
import styles from './CaseTracking.module.css';

const CaseTracking = () => {
  const [cases, setCases] = useState([
    {
      id: 1,
      title: 'Property Dispute Case',
      status: 'In Progress',
      lastUpdate: '2024-01-15',
      description: 'Dispute over property boundaries with neighbor.'
    },
    {
      id: 2,
      title: 'Contract Breach Lawsuit',
      status: 'Pending Review',
      lastUpdate: '2024-01-10',
      description: 'Client suing for breach of contract terms.'
    }
  ]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'In Progress': return '#007bff';
      case 'Pending Review': return '#ffc107';
      case 'Completed': return '#28a745';
      case 'On Hold': return '#6c757d';
      default: return '#6c757d';
    }
  };

  return (
    <div className={styles.caseTracking}>
      <div className={styles.header}>
        <h1>Case Tracking</h1>
        <p>Monitor the progress of your legal cases</p>
      </div>

      <div className={styles.casesGrid}>
        {cases.map((caseItem) => (
          <div key={caseItem.id} className={styles.caseCard}>
            <div className={styles.caseHeader}>
              <h3>{caseItem.title}</h3>
              <span
                className={styles.status}
                style={{ backgroundColor: getStatusColor(caseItem.status) }}
              >
                {caseItem.status}
              </span>
            </div>
            <p className={styles.description}>{caseItem.description}</p>
            <div className={styles.caseFooter}>
              <span>Last Update: {caseItem.lastUpdate}</span>
              <button className={styles.viewDetailsBtn}>View Details</button>
            </div>
          </div>
        ))}
      </div>

      {cases.length === 0 && (
        <div className={styles.noCases}>
          <h3>No cases found</h3>
          <p>You don't have any active cases at the moment.</p>
        </div>
      )}
    </div>
  );
};

export default CaseTracking;