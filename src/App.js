import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Header from './components/Header/Header';
import Footer from './components/Footer/Footer';
import Home from './pages/Home/Home';
import Login from './pages/Auth/Login';
import Register from './pages/Auth/Register';
import LawyerSearch from './pages/LawyerSearch/LawyerSearch';
import AppointmentBooking from './pages/AppointmentBooking/AppointmentBooking';
import ClientDashboard from './pages/Dashboard/ClientDashboard';
import LawyerDashboard from './pages/Dashboard/LawyerDashboard';
import LawyerProfile from './pages/LawyerProfile/LawyerProfile';
import ClientCommunicationPortal from './pages/ClientCommunicationPortal/ClientCommunicationPortal';
import DocumentUpload from './pages/DocumentUpload/DocumentUpload';
import Chat from './pages/Chat/Chat';
import Contact from './pages/Contact/Contact';
import CaseTracking from './pages/CaseTracking/CaseTracking';
import LegalUpdates from './pages/LegalUpdates/LegalUpdates';
import FeedbackRatings from './pages/FeedbackRatings/FeedbackRatings';
import './App.css';

function App() {
  return (
    <Router>
      <div className="App">
        <Header />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/lawyers" element={<LawyerSearch />} />
            <Route path="/book-appointment/:lawyerId?" element={<AppointmentBooking />} />
            <Route path="/client/dashboard" element={<ClientDashboard />} />
            <Route path="/lawyer/dashboard" element={<LawyerDashboard />} />
            <Route path="/lawyer/profile" element={<LawyerProfile />} />
            <Route path="/lawyer/communication" element={<ClientCommunicationPortal />} />
            <Route path="/documents/upload" element={<DocumentUpload />} />
            <Route path="/cases" element={<CaseTracking />} />
            <Route path="/legal-updates" element={<LegalUpdates />} />
            <Route path="/feedback" element={<FeedbackRatings />} />
            <Route path="/chat/:userId?" element={<Chat />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </Router>
  );
}

export default App;


