import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useSearchParams, useParams } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary';
import PublicLayout from './components/PublicLayout/PublicLayout';
import DashboardLayout from './components/DashboardLayout/DashboardLayout';
import AdminLayout from './components/AdminLayout/AdminLayout';
import LawyerSuiteLayout from './components/Layout/LawyerSuiteLayout';
import ClientPortalLayout from './components/ClientPortalLayout/ClientPortalLayout';
import PlaceholderPage from './pages/Placeholder/PlaceholderPage';
import './App.css';

// Eager imports for instant routing without loading flashes
import Home from './pages/Home/Home';
import Login from './pages/Auth/Login';
import Register from './pages/Auth/Register';
import ForgotPassword from './pages/Auth/ForgotPassword';
import ResetPassword from './pages/Auth/ResetPassword';
import LawyerSearch from './pages/LawyerSearch/LawyerSearch';
import AppointmentBooking from './pages/AppointmentBooking/AppointmentBooking';
import ClientDashboard from './pages/Dashboard/ClientDashboard';
import ClientCommunicationPortal from './pages/ClientCommunicationPortal/ClientCommunicationPortal';
import LawyerCommunicationPortal from './pages/LawyerSuite/LawyerCommunicationPortal';
import Contact from './pages/Contact/Contact';
import CaseTracking from './pages/CaseTracking/CaseTracking';
import LegalUpdates from './pages/LegalUpdates';
import PublicLawyerProfile from './pages/LawyerProfile/PublicLawyerProfile';
import JobBoard from './pages/JobBoard/JobBoard';
import PostJob from './pages/PostJob/PostJob';
import JobDetail from './pages/JobDetail/JobDetail';
import Workspace from './pages/Workspace/Workspace';
import AIAdvisor from './pages/AIAdvisor/AIAdvisor';
import ClientSettings from './pages/ClientSettings/ClientSettings';
import ClientMyPosts from './pages/ClientMyPosts/ClientMyPosts';

import AdminOverview from './pages/Admin/AdminOverview';
import UsersManagement from './pages/Admin/UsersManagement';
import LawyersManagement from './pages/Admin/LawyersManagement';
import LawyerVerifications from './pages/Admin/LawyerVerifications';
import ClientVerifications from './pages/Admin/ClientVerifications';
import CategoryManagement from './pages/Admin/CategoryManagement';
import JobsManagement from './pages/Admin/JobsManagement';
import FlaggedReviews from './pages/Admin/FlaggedReviews';
import AdminSettings from './pages/Admin/AdminSettings';

import LawyerDashboardView from './pages/LawyerSuite/LawyerDashboardView';
import LawyerBasicInfoView from './pages/LawyerSuite/LawyerBasicInfoView';
import LawyerCredentialsView from './pages/LawyerSuite/LawyerCredentialsView';
import LawyerVerificationView from './pages/LawyerSuite/LawyerVerificationView';
import LawyerAvailabilityView from './pages/LawyerSuite/LawyerAvailabilityView';
import ConsultationSettings from './pages/LawyerSuite/ConsultationSettings';
import LawyerPortfolioView from './pages/LawyerSuite/LawyerPortfolioView';
import LawyerAnalyticsView from './pages/LawyerSuite/LawyerAnalyticsView';
import LawyerCasesView from './pages/LawyerSuite/LawyerCasesView';
import LawyerAppointmentsView from './pages/LawyerSuite/LawyerAppointmentsView';
import LawyerContractsView from './pages/LawyerSuite/LawyerContractsView';
import LawyerBillingView from './pages/LawyerSuite/LawyerBillingView';
import LawyerNotificationsView from './pages/LawyerSuite/LawyerNotificationsView';
import LawyerPrivacyView from './pages/LawyerSuite/LawyerPrivacyView';
import LawyerProposalsView from './pages/LawyerSuite/LawyerProposalsView';

const GlobalLoadingFallback = () => (
  <div className="min-h-screen bg-[#F4F6F9] flex flex-col items-center justify-center p-8 text-center animate-fadeIn">
    <div className="w-16 h-16 border-4 border-[#041635] border-t-transparent rounded-full animate-spin mb-4"></div>
    <h3 className="font-serif text-xl font-bold text-[#041635]">LegalConnect</h3>
    <p className="text-gray-500 text-sm mt-1">Loading secure legal platform...</p>
  </div>
);

const BookAppointmentRedirect = () => {
  const { lawyerId } = useParams();
  if (lawyerId) {
    return <Navigate to={`/client/portal/book-consultation/${lawyerId}`} replace />;
  }
  return <Navigate to="/client/portal/book-consultation" replace />;
};

const ChatRedirect = () => {
  const { userId } = useParams();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const userRole = user?.user_type || user?.role || user?.user_metadata?.role || 'client';

  const query = searchParams.toString();
  const queryString = query ? `&${query}` : '';

  if (userRole === 'lawyer') {
    return <Navigate to={userId ? `/lawyer-suite/communication?clientId=${userId}${queryString}` : `/lawyer-suite/communication${query ? `?${query}` : ''}`} replace />;
  }
  return <Navigate to={userId ? `/client/portal/messages?lawyerId=${userId}${queryString}` : `/client/portal/messages${query ? `?${query}` : ''}`} replace />;
};

const ClientPortalIndexRedirect = () => {
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab');
  if (tab === 'messages') return <Navigate to={`messages?${searchParams.toString()}`} replace />;
  if (tab === 'cases') return <Navigate to={`cases?${searchParams.toString()}`} replace />;
  if (tab === 'settings') return <Navigate to={`settings?${searchParams.toString()}`} replace />;
  if (tab === 'book-consultation') return <Navigate to={`book-consultation?${searchParams.toString()}`} replace />;
  return <Navigate to="overview" replace />;
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="App">
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              success: { style: { background: '#1E6B4A', color: 'white' } },
              error: { style: { background: '#DC2626', color: 'white' } },
            }}
          />
          <ErrorBoundary>
            <Suspense fallback={<GlobalLoadingFallback />}>
              <Routes>
                
                {/* ZONE 1: PUBLIC ZONE (Wrapped in PublicLayout with TopNavbar and Footer) */}
                <Route element={<PublicLayout />}>
                  <Route path="/" element={<ErrorBoundary><Home /></ErrorBoundary>} />
                  <Route path="/login" element={<ErrorBoundary><Login /></ErrorBoundary>} />
                  <Route path="/register" element={<ErrorBoundary><Register /></ErrorBoundary>} />
                  <Route path="/forgot-password" element={<ErrorBoundary><ForgotPassword /></ErrorBoundary>} />
                  <Route path="/reset-password/:token" element={<ErrorBoundary><ResetPassword /></ErrorBoundary>} />
                  <Route path="/lawyers" element={<ErrorBoundary><LawyerSearch /></ErrorBoundary>} />
                  <Route path="/find-lawyers" element={<Navigate to="/lawyers" replace />} />
                  <Route path="/lawyers/:slug" element={<ErrorBoundary><PublicLawyerProfile /></ErrorBoundary>} />
                  <Route path="/legal-updates" element={<ErrorBoundary><LegalUpdates /></ErrorBoundary>} />
                  <Route path="/updates" element={<Navigate to="/legal-updates" replace />} />
                  <Route path="/contact" element={<ErrorBoundary><Contact /></ErrorBoundary>} />
                  <Route path="/ai-advisor" element={<ErrorBoundary><AIAdvisor /></ErrorBoundary>} />
                  <Route path="/jobs" element={<ErrorBoundary><JobBoard /></ErrorBoundary>} />
                  <Route path="/job-board" element={<Navigate to="/jobs" replace />} />
                  <Route path="/jobs/:id" element={<ErrorBoundary><JobDetail /></ErrorBoundary>} />
                  
                  {/* Placeholder pages for footer targets */}
                  <Route path="/pricing" element={<PlaceholderPage title="Pricing & Plans" />} />
                  <Route path="/faq" element={<PlaceholderPage title="Frequently Asked Questions (FAQ)" />} />
                  <Route path="/help" element={<PlaceholderPage title="Help Center" />} />
                  <Route path="/privacy-policy" element={<PlaceholderPage title="Privacy Policy" />} />
                  <Route path="/privacy" element={<Navigate to="/privacy-policy" replace />} />
                  <Route path="/terms-of-service" element={<PlaceholderPage title="Terms of Service" />} />
                  <Route path="/terms" element={<Navigate to="/terms-of-service" replace />} />
                  <Route path="/cookie-policy" element={<PlaceholderPage title="Cookie Policy" />} />
                  <Route path="/lawyers/verification-info" element={<PlaceholderPage title="Lawyer Verification Process" />} />
                  <Route path="/lawyers/success-stories" element={<PlaceholderPage title="Lawyer Success Stories" />} />
                  
                  <Route path="/book-appointment/:lawyerId?" element={<BookAppointmentRedirect />} />
                  <Route path="/feedback" element={<Navigate to="/lawyers" replace />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>

                {/* ZONE 2: PORTAL ZONE (Wrapped in DashboardLayout: sidebar + content ONLY, NO Navbar, NO Footer) */}
                <Route element={<DashboardLayout />}>
                  {/* Portal Redirects */}
                  <Route path="/client/dashboard" element={<Navigate to="/client/portal/overview" replace />} />
                  <Route path="/lawyer/dashboard" element={<Navigate to="/lawyer-suite/dashboard" replace />} />
                  <Route path="/lawyer/profile" element={<Navigate to="/lawyer-suite/profile/basic" replace />} />
                  <Route path="/cases" element={<Navigate to="/client/portal/cases" replace />} />

                  {/* Authenticated Workspace & Chat */}
                  <Route path="/chat/:userId?" element={
                    <ProtectedRoute><ErrorBoundary><ChatRedirect /></ErrorBoundary></ProtectedRoute>
                  } />
                  <Route path="/chat" element={
                    <ProtectedRoute><ErrorBoundary><ChatRedirect /></ErrorBoundary></ProtectedRoute>
                  } />
                  <Route path="/jobs/post" element={
                    <ProtectedRoute roles={['client']}><ErrorBoundary><PostJob /></ErrorBoundary></ProtectedRoute>
                  } />
                  <Route path="/workspace/:id" element={
                    <ProtectedRoute><ErrorBoundary><Workspace /></ErrorBoundary></ProtectedRoute>
                  } />

                  {/* Client Portal Nested Layout */}
                  <Route path="/client/portal" element={
                    <ProtectedRoute roles={['client']}>
                      <ErrorBoundary>
                        <ClientPortalLayout />
                      </ErrorBoundary>
                    </ProtectedRoute>
                  }>
                    <Route index element={<ClientPortalIndexRedirect />} />
                    <Route path="overview" element={<ClientDashboard inline={true} />} />
                    <Route path="cases" element={<CaseTracking inline={true} />} />
                    <Route path="cases/:caseId" element={<CaseTracking inline={true} />} />
                    <Route path="my-posts" element={<ClientMyPosts />} />
                    <Route path="post-case" element={<PostJob />} />
                    <Route path="messages" element={<ClientCommunicationPortal inline={true} />} />
                    <Route path="book-consultation" element={<AppointmentBooking inline={true} />} />
                    <Route path="book-consultation/:lawyerId" element={<AppointmentBooking inline={true} />} />
                    <Route path="settings" element={<ClientSettings inline={true} />} />
                  </Route>

                  {/* Admin Routes */}
                  <Route path="/admin" element={
                    <ProtectedRoute roles={['admin']}>
                      <ErrorBoundary>
                        <AdminLayout />
                      </ErrorBoundary>
                    </ProtectedRoute>
                  }>
                    <Route index element={<AdminOverview />} />
                    <Route path="users" element={<UsersManagement />} />
                    <Route path="lawyers" element={<LawyersManagement />} />
                    <Route path="verifications" element={<LawyerVerifications />} />
                    <Route path="client-verifications" element={<ClientVerifications />} />
                    <Route path="categories" element={<CategoryManagement />} />
                    <Route path="jobs" element={<JobsManagement />} />
                    <Route path="reviews" element={<FlaggedReviews />} />
                    <Route path="notifications" element={<div>Admin Notifications Page (Placeholder)</div>} />
                    <Route path="settings" element={<AdminSettings />} />
                  </Route>

                  {/* Lawyer Suite Routes */}
                  <Route path="/lawyer-suite" element={
                    <ProtectedRoute roles={['lawyer']}>
                      <ErrorBoundary><LawyerSuiteLayout /></ErrorBoundary>
                    </ProtectedRoute>
                  }>
                    <Route index element={<Navigate to="dashboard" replace />} />
                    <Route path="dashboard" element={<LawyerDashboardView />} />
                    <Route path="communication" element={<LawyerCommunicationPortal />} />
                    <Route path="profile/basic" element={<LawyerBasicInfoView />} />
                    <Route path="profile/credentials" element={<LawyerCredentialsView />} />
                    <Route path="profile/verifications" element={<LawyerVerificationView />} />
                    <Route path="schedule/availability" element={<LawyerAvailabilityView />} />
                    <Route path="schedule/settings" element={<ConsultationSettings />} />
                    <Route path="portfolio" element={<LawyerPortfolioView />} />
                    <Route path="analytics" element={<LawyerAnalyticsView />} />
                    <Route path="cases" element={<LawyerCasesView />} />
                    <Route path="cases/:caseId" element={<LawyerCasesView />} />
                    <Route path="proposals" element={<LawyerProposalsView />} />
                    <Route path="appointments" element={<LawyerAppointmentsView />} />
                    <Route path="contracts" element={<LawyerContractsView />} />
                    <Route path="billing" element={<LawyerBillingView />} />
                    <Route path="notifications" element={<LawyerNotificationsView />} />
                    <Route path="privacy" element={<LawyerPrivacyView />} />
                  </Route>
                </Route>

              </Routes>
            </Suspense>
          </ErrorBoundary>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
