import React, { Suspense, useState, useEffect } from 'react';
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
import GlobalSearchModal from './components/Search/GlobalSearchModal';
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

// Public Pages (Replaced Placeholders)
import PricingPage from './pages/Public/PricingPage';
import FAQPage from './pages/Public/FAQPage';
import HelpCenterPage from './pages/Public/HelpCenterPage';
import LegalDocumentsPage from './pages/Public/LegalDocumentsPage';
import LawyerVerificationInfoPage from './pages/Public/LawyerVerificationInfoPage';
import LawyerSuccessStoriesPage from './pages/Public/LawyerSuccessStoriesPage';
import NotFoundPage from './pages/Public/NotFoundPage';

// Code-Split / Lazy imports for Admin & Lawyer Suite to optimize bundle size
const AdminOverview = React.lazy(() => import('./pages/Admin/AdminOverview'));
const UsersManagement = React.lazy(() => import('./pages/Admin/UsersManagement'));
const LawyersManagement = React.lazy(() => import('./pages/Admin/LawyersManagement'));
const LawyerVerifications = React.lazy(() => import('./pages/Admin/LawyerVerifications'));
const ClientVerifications = React.lazy(() => import('./pages/Admin/ClientVerifications'));
const CategoryManagement = React.lazy(() => import('./pages/Admin/CategoryManagement'));
const JobsManagement = React.lazy(() => import('./pages/Admin/JobsManagement'));
const FlaggedReviews = React.lazy(() => import('./pages/Admin/FlaggedReviews'));
const AdminSettings = React.lazy(() => import('./pages/Admin/AdminSettings'));
const AdminNotifications = React.lazy(() => import('./pages/Admin/AdminNotifications'));
const SupportMessages = React.lazy(() => import('./pages/Admin/SupportMessages'));

const LawyerDashboardView = React.lazy(() => import('./pages/LawyerSuite/LawyerDashboardView'));
const LawyerBasicInfoView = React.lazy(() => import('./pages/LawyerSuite/LawyerBasicInfoView'));
const LawyerCredentialsView = React.lazy(() => import('./pages/LawyerSuite/LawyerCredentialsView'));
const LawyerVerificationView = React.lazy(() => import('./pages/LawyerSuite/LawyerVerificationView'));
const LawyerAvailabilityView = React.lazy(() => import('./pages/LawyerSuite/LawyerAvailabilityView'));
const ConsultationSettings = React.lazy(() => import('./pages/LawyerSuite/ConsultationSettings'));
const LawyerPortfolioView = React.lazy(() => import('./pages/LawyerSuite/LawyerPortfolioView'));
const LawyerAnalyticsView = React.lazy(() => import('./pages/LawyerSuite/LawyerAnalyticsView'));
const LawyerCasesView = React.lazy(() => import('./pages/LawyerSuite/LawyerCasesView'));
const LawyerAppointmentsView = React.lazy(() => import('./pages/LawyerSuite/LawyerAppointmentsView'));
const LawyerContractsView = React.lazy(() => import('./pages/LawyerSuite/LawyerContractsView'));
const LawyerBillingView = React.lazy(() => import('./pages/LawyerSuite/LawyerBillingView'));
const LawyerNotificationsView = React.lazy(() => import('./pages/LawyerSuite/LawyerNotificationsView'));
const LawyerPrivacyView = React.lazy(() => import('./pages/LawyerSuite/LawyerPrivacyView'));
const LawyerProposalsView = React.lazy(() => import('./pages/LawyerSuite/LawyerProposalsView'));
const FeedbackRatings = React.lazy(() => import('./pages/FeedbackRatings/FeedbackRatings'));

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

function GlobalSearchHandler() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
    };
    const handleOpenEvent = () => setIsOpen(true);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('open-global-search', handleOpenEvent);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('open-global-search', handleOpenEvent);
    };
  }, []);

  return <GlobalSearchModal isOpen={isOpen} onClose={() => setIsOpen(false)} />;
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="App">
          <GlobalSearchHandler />
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
                  <Route path="/reset-password" element={<ErrorBoundary><ResetPassword /></ErrorBoundary>} />
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
                  
                  {/* Production public pages */}
                  <Route path="/pricing" element={<ErrorBoundary><PricingPage /></ErrorBoundary>} />
                  <Route path="/faq" element={<ErrorBoundary><FAQPage /></ErrorBoundary>} />
                  <Route path="/help" element={<ErrorBoundary><HelpCenterPage /></ErrorBoundary>} />
                  <Route path="/privacy-policy" element={<ErrorBoundary><LegalDocumentsPage initialTab="privacy" /></ErrorBoundary>} />
                  <Route path="/privacy" element={<Navigate to="/privacy-policy" replace />} />
                  <Route path="/terms-of-service" element={<ErrorBoundary><LegalDocumentsPage initialTab="terms" /></ErrorBoundary>} />
                  <Route path="/terms" element={<Navigate to="/terms-of-service" replace />} />
                  <Route path="/cookie-policy" element={<ErrorBoundary><LegalDocumentsPage initialTab="cookie" /></ErrorBoundary>} />
                  <Route path="/lawyers/verification-info" element={<ErrorBoundary><LawyerVerificationInfoPage /></ErrorBoundary>} />
                  <Route path="/lawyers/success-stories" element={<ErrorBoundary><LawyerSuccessStoriesPage /></ErrorBoundary>} />
                  
                  <Route path="/book-appointment/:lawyerId?" element={<BookAppointmentRedirect />} />
                  <Route path="/feedback" element={<Navigate to="/lawyers" replace />} />
                  <Route path="*" element={<ErrorBoundary><NotFoundPage /></ErrorBoundary>} />
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
                    <Route index element={<ErrorBoundary><AdminOverview /></ErrorBoundary>} />
                    <Route path="users" element={<ErrorBoundary><UsersManagement /></ErrorBoundary>} />
                    <Route path="lawyers" element={<ErrorBoundary><LawyersManagement /></ErrorBoundary>} />
                    <Route path="verifications" element={<ErrorBoundary><LawyerVerifications /></ErrorBoundary>} />
                    <Route path="client-verifications" element={<ErrorBoundary><ClientVerifications /></ErrorBoundary>} />
                    <Route path="categories" element={<ErrorBoundary><CategoryManagement /></ErrorBoundary>} />
                    <Route path="jobs" element={<ErrorBoundary><JobsManagement /></ErrorBoundary>} />
                    <Route path="reviews" element={<ErrorBoundary><FlaggedReviews /></ErrorBoundary>} />
                    <Route path="messages" element={<ErrorBoundary><SupportMessages /></ErrorBoundary>} />
                    <Route path="notifications" element={<ErrorBoundary><AdminNotifications /></ErrorBoundary>} />
                    <Route path="settings" element={<ErrorBoundary><AdminSettings /></ErrorBoundary>} />
                  </Route>

                  {/* Lawyer Suite Routes */}
                  <Route path="/lawyer-suite" element={
                    <ProtectedRoute roles={['lawyer']}>
                      <ErrorBoundary><LawyerSuiteLayout /></ErrorBoundary>
                    </ProtectedRoute>
                  }>
                    <Route index element={<Navigate to="dashboard" replace />} />
                    <Route path="dashboard" element={<ErrorBoundary><LawyerDashboardView /></ErrorBoundary>} />
                    <Route path="communication" element={<ErrorBoundary><LawyerCommunicationPortal /></ErrorBoundary>} />
                    <Route path="profile/basic" element={<ErrorBoundary><LawyerBasicInfoView /></ErrorBoundary>} />
                    <Route path="profile/credentials" element={<ErrorBoundary><LawyerCredentialsView /></ErrorBoundary>} />
                    <Route path="profile/verifications" element={<ErrorBoundary><LawyerVerificationView /></ErrorBoundary>} />
                    <Route path="schedule/availability" element={<ErrorBoundary><LawyerAvailabilityView /></ErrorBoundary>} />
                    <Route path="schedule/settings" element={<ErrorBoundary><ConsultationSettings /></ErrorBoundary>} />
                    <Route path="portfolio" element={<ErrorBoundary><LawyerPortfolioView /></ErrorBoundary>} />
                    <Route path="analytics" element={<ErrorBoundary><LawyerAnalyticsView /></ErrorBoundary>} />
                    <Route path="reviews" element={<ErrorBoundary><FeedbackRatings standalone={true} /></ErrorBoundary>} />
                    <Route path="cases" element={<ErrorBoundary><LawyerCasesView /></ErrorBoundary>} />
                    <Route path="cases/:caseId" element={<ErrorBoundary><LawyerCasesView /></ErrorBoundary>} />
                    <Route path="proposals" element={<ErrorBoundary><LawyerProposalsView /></ErrorBoundary>} />
                    <Route path="appointments" element={<ErrorBoundary><LawyerAppointmentsView /></ErrorBoundary>} />
                    <Route path="contracts" element={<ErrorBoundary><LawyerContractsView /></ErrorBoundary>} />
                    <Route path="billing" element={<ErrorBoundary><LawyerBillingView /></ErrorBoundary>} />
                    <Route path="notifications" element={<ErrorBoundary><LawyerNotificationsView /></ErrorBoundary>} />
                    <Route path="privacy" element={<ErrorBoundary><LawyerPrivacyView /></ErrorBoundary>} />
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
