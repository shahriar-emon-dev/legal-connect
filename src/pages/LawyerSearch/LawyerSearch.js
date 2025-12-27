import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Card from '../../components/Card/Card';
import Button from '../../components/Button/Button';
import StarRating from '../../components/StarRating/StarRating';
import styles from './LawyerSearch.module.css';

const LawyerSearch = () => {
  const navigate = useNavigate();
  const [lawyers, setLawyers] = useState([]);
  const [filteredLawyers, setFilteredLawyers] = useState([]);
  const [filters, setFilters] = useState({
    name: '',
    specialization: '',
    location: ''
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLawyers();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [filters, lawyers]);

  const fetchLawyers = async () => {
    try {
      const response = await axios.get('/api/lawyers');
      setLawyers(response.data);
      setFilteredLawyers(response.data);
    } catch (error) {
      console.error('Error fetching lawyers:', error);
      // Sample data for demonstration
      const sampleLawyers = [
        {
          id: 1,
          name: 'John Smith',
          specialization: 'Criminal Law',
          location: 'New York, NY',
          rating: 4.5,
          experience: '10 years',
          price: '$200/hour'
        },
        {
          id: 2,
          name: 'Sarah Johnson',
          specialization: 'Corporate Law',
          location: 'Los Angeles, CA',
          rating: 4.8,
          experience: '15 years',
          price: '$250/hour'
        },
        {
          id: 3,
          name: 'Michael Brown',
          specialization: 'Family Law',
          location: 'Chicago, IL',
          rating: 4.2,
          experience: '8 years',
          price: '$180/hour'
        },
        {
          id: 4,
          name: 'Emily Davis',
          specialization: 'Real Estate Law',
          location: 'Miami, FL',
          rating: 4.7,
          experience: '12 years',
          price: '$220/hour'
        },
        {
          id: 5,
          name: 'David Wilson',
          specialization: 'Immigration Law',
          location: 'San Francisco, CA',
          rating: 4.6,
          experience: '9 years',
          price: '$190/hour'
        },
        {
          id: 6,
          name: 'Lisa Anderson',
          specialization: 'Intellectual Property',
          location: 'Boston, MA',
          rating: 4.9,
          experience: '18 years',
          price: '$300/hour'
        }
      ];
      setLawyers(sampleLawyers);
      setFilteredLawyers(sampleLawyers);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...lawyers];

    if (filters.name) {
      filtered = filtered.filter(lawyer =>
        lawyer.name.toLowerCase().includes(filters.name.toLowerCase())
      );
    }

    if (filters.specialization) {
      filtered = filtered.filter(lawyer =>
        lawyer.specialization.toLowerCase().includes(filters.specialization.toLowerCase())
      );
    }

    if (filters.location) {
      filtered = filtered.filter(lawyer =>
        lawyer.location.toLowerCase().includes(filters.location.toLowerCase())
      );
    }

    setFilteredLawyers(filtered);
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleBookAppointment = (lawyerId) => {
    navigate(`/book-appointment/${lawyerId}`);
  };

  if (loading) {
    return <div className={styles.loading}>Loading lawyers...</div>;
  }

  return (
    <div className={styles.lawyerSearch}>
      <div className={styles.container}>
        <h1 className={styles.title}>Find a Lawyer</h1>

        {/* Search and Filters */}
        <div className={styles.filtersSection}>
          <Card className={styles.filtersCard}>
            <div className={styles.searchBar}>
              <input
                type="text"
                name="name"
                placeholder="Search by name..."
                value={filters.name}
                onChange={handleFilterChange}
                className={styles.searchInput}
              />
            </div>
            <div className={styles.filters}>
              <input
                type="text"
                name="specialization"
                placeholder="Specialization (e.g., Criminal Law)"
                value={filters.specialization}
                onChange={handleFilterChange}
                className={styles.filterInput}
              />
              <input
                type="text"
                name="location"
                placeholder="Location (e.g., New York)"
                value={filters.location}
                onChange={handleFilterChange}
                className={styles.filterInput}
              />
            </div>
          </Card>
        </div>

        {/* Results */}
        <div className={styles.results}>
          <p className={styles.resultsCount}>
            Found {filteredLawyers.length} lawyer{filteredLawyers.length !== 1 ? 's' : ''}
          </p>
          
          {filteredLawyers.length === 0 ? (
            <div className={styles.noResults}>
              <p>No lawyers found matching your criteria.</p>
            </div>
          ) : (
            <div className={styles.lawyersGrid}>
              {filteredLawyers.map(lawyer => (
                <Card key={lawyer.id} className={styles.lawyerCard}>
                  <div className={styles.lawyerHeader}>
                    <h3>{lawyer.name}</h3>
                    <StarRating rating={lawyer.rating} />
                  </div>
                  <div className={styles.lawyerInfo}>
                    <p className={styles.specialization}>{lawyer.specialization}</p>
                    <p className={styles.location}>📍 {lawyer.location}</p>
                    <p className={styles.experience}>Experience: {lawyer.experience}</p>
                    <p className={styles.price}>{lawyer.price}</p>
                  </div>
                  <Button
                    variant="primary"
                    onClick={() => handleBookAppointment(lawyer.id)}
                    className={styles.bookButton}
                  >
                    Book Appointment
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LawyerSearch;


