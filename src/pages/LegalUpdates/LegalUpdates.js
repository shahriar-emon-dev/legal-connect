import React, { useState } from 'react';
import styles from './LegalUpdates.module.css';

const LegalUpdates = () => {
  const [updates] = useState([
    {
      id: 1,
      title: 'New Data Protection Regulations',
      date: '2024-01-20',
      category: 'Privacy Law',
      summary: 'Updated regulations regarding personal data handling and privacy protection.',
      content: 'The new regulations require enhanced data protection measures for all businesses handling personal information. Companies must implement stricter consent mechanisms and provide clearer privacy notices to users.'
    },
    {
      id: 2,
      title: 'Supreme Court Ruling on Contract Law',
      date: '2024-01-18',
      category: 'Contract Law',
      summary: 'Recent Supreme Court decision impacts contract interpretation standards.',
      content: 'The Supreme Court has established new guidelines for contract interpretation, emphasizing the importance of clear language and mutual intent in contractual agreements.'
    },
    {
      id: 3,
      title: 'Changes to Employment Legislation',
      date: '2024-01-15',
      category: 'Employment Law',
      summary: 'Updates to workplace regulations and employee rights.',
      content: 'New legislation provides enhanced protections for remote workers and updates minimum wage standards across various industries.'
    }
  ]);

  const [selectedCategory, setSelectedCategory] = useState('All');

  const categories = ['All', 'Privacy Law', 'Contract Law', 'Employment Law', 'Criminal Law', 'Property Law'];

  const filteredUpdates = selectedCategory === 'All'
    ? updates
    : updates.filter(update => update.category === selectedCategory);

  return (
    <div className={styles.legalUpdates}>
      <div className={styles.header}>
        <h1>Legal Updates</h1>
        <p>Stay informed with the latest legal developments and regulatory changes</p>
      </div>

      <div className={styles.filters}>
        <div className={styles.categoryFilter}>
          <label htmlFor="category">Filter by Category:</label>
          <select
            id="category"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className={styles.select}
          >
            {categories.map(category => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.updatesList}>
        {filteredUpdates.map((update) => (
          <div key={update.id} className={styles.updateCard}>
            <div className={styles.updateHeader}>
              <div className={styles.meta}>
                <span className={styles.category}>{update.category}</span>
                <span className={styles.date}>{update.date}</span>
              </div>
              <h3>{update.title}</h3>
            </div>
            <p className={styles.summary}>{update.summary}</p>
            <div className={styles.content}>
              <p>{update.content}</p>
            </div>
            <div className={styles.actions}>
              <button className={styles.readMoreBtn}>Read Full Article</button>
              <button className={styles.shareBtn}>Share</button>
            </div>
          </div>
        ))}
      </div>

      {filteredUpdates.length === 0 && (
        <div className={styles.noUpdates}>
          <h3>No updates found</h3>
          <p>No legal updates match your current filter criteria.</p>
        </div>
      )}
    </div>
  );
};

export default LegalUpdates;