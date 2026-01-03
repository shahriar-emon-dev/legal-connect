import React, { useState } from 'react';
import styles from './FeedbackRatings.module.css';

const FeedbackRatings = () => {
  const [feedback, setFeedback] = useState({
    rating: 0,
    comment: '',
    category: 'General'
  });

  const [submittedFeedback, setSubmittedFeedback] = useState([]);

  const categories = ['General', 'Lawyer Service', 'Platform Usability', 'Customer Support', 'Billing'];

  const handleRating = (rating) => {
    setFeedback(prev => ({ ...prev, rating }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (feedback.rating === 0) {
      alert('Please select a rating');
      return;
    }

    const newFeedback = {
      id: Date.now(),
      ...feedback,
      date: new Date().toLocaleDateString()
    };

    setSubmittedFeedback(prev => [newFeedback, ...prev]);
    setFeedback({ rating: 0, comment: '', category: 'General' });
    alert('Thank you for your feedback!');
  };

  const renderStars = (rating, interactive = false) => {
    return [1, 2, 3, 4, 5].map(star => (
      <span
        key={star}
        className={`${styles.star} ${rating >= star ? styles.active : ''} ${interactive ? styles.interactive : ''}`}
        onClick={interactive ? () => handleRating(star) : undefined}
      >
        ★
      </span>
    ));
  };

  return (
    <div className={styles.feedbackRatings}>
      <div className={styles.header}>
        <h1>Feedback & Ratings</h1>
        <p>Help us improve by sharing your experience</p>
      </div>

      <div className={styles.content}>
        <div className={styles.feedbackForm}>
          <h2>Submit Your Feedback</h2>
          <form onSubmit={handleSubmit}>
            <div className={styles.formGroup}>
              <label>Category:</label>
              <select
                value={feedback.category}
                onChange={(e) => setFeedback(prev => ({ ...prev, category: e.target.value }))}
                className={styles.select}
              >
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label>Rating:</label>
              <div className={styles.rating}>
                {renderStars(feedback.rating, true)}
              </div>
            </div>

            <div className={styles.formGroup}>
              <label>Comments:</label>
              <textarea
                value={feedback.comment}
                onChange={(e) => setFeedback(prev => ({ ...prev, comment: e.target.value }))}
                placeholder="Tell us about your experience..."
                rows={4}
                className={styles.textarea}
              />
            </div>

            <button type="submit" className={styles.submitBtn}>
              Submit Feedback
            </button>
          </form>
        </div>

        <div className={styles.recentFeedback}>
          <h2>Recent Feedback</h2>
          {submittedFeedback.length === 0 ? (
            <p className={styles.noFeedback}>No feedback submitted yet.</p>
          ) : (
            <div className={styles.feedbackList}>
              {submittedFeedback.map(item => (
                <div key={item.id} className={styles.feedbackItem}>
                  <div className={styles.feedbackHeader}>
                    <span className={styles.category}>{item.category}</span>
                    <div className={styles.rating}>
                      {renderStars(item.rating)}
                    </div>
                    <span className={styles.date}>{item.date}</span>
                  </div>
                  {item.comment && (
                    <p className={styles.comment}>{item.comment}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FeedbackRatings;