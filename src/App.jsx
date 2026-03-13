import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { MantineProvider, ColorSchemeScript, Center, Loader } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import { Notifications } from '@mantine/notifications';
import { Analytics } from '@vercel/analytics/react';
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';
import { UserPreferencesProvider } from './contexts/UserPreferencesContext.jsx';
import { theme } from './theme';

// Pages — eagerly loaded (critical path)
import Landing from './pages/Landing.jsx';
import Auth from './pages/Auth.jsx';
import PrivacyPolicy from './pages/PrivacyPolicy.jsx';
import Terms from './pages/Terms.jsx';
import NotFound from './pages/NotFound.jsx';

// Pages — lazy loaded (protected, heavy)
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const RouteBuilder = lazy(() => import('./pages/RouteBuilder.jsx'));
const TrainingDashboard = lazy(() => import('./pages/TrainingDashboard.jsx'));
const PlannerPage = lazy(() => import('./pages/PlannerPage.tsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));
const CommunityPage = lazy(() => import('./pages/CommunityPage.jsx'));
const GearPage = lazy(() => import('./pages/GearPage.jsx'));
const Admin = lazy(() => import('./pages/Admin.jsx'));
const MyRoutes = lazy(() => import('./pages/MyRoutes.jsx'));

// OAuth Callbacks
import StravaCallback from './pages/oauth/StravaCallback.jsx';
import GarminCallback from './pages/oauth/GarminCallback.jsx';
import WahooCallback from './pages/oauth/WahooCallback.jsx';
import CorosCallback from './pages/oauth/CorosCallback.jsx';
import AuthCallback from './pages/oauth/AuthCallback.jsx';
import GoogleCalendarCallback from './pages/oauth/GoogleCalendarCallback.jsx';

// Components
import ErrorBoundary from './components/ErrorBoundary.jsx';
import PageTracker from './components/PageTracker.jsx';
import { CoachCommandBarProvider, CoachCommandBar } from './components/coach';

// Styles
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/charts/styles.css';
import '@mantine/dates/styles.css';
import './styles/global.css';

// Protected Route wrapper
function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }

  return children;
}

// Public Route wrapper (redirects to dashboard if already logged in)
function PublicRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

function PageLoader() {
  return (
    <Center style={{ height: '100vh' }}>
      <Loader size="lg" color="var(--color-teal)" />
    </Center>
  );
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<PublicRoute><Landing /></PublicRoute>} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/terms" element={<Terms />} />
      <Route
        path="/auth"
        element={
          <PublicRoute>
            <Auth />
          </PublicRoute>
        }
      />

      {/* OAuth Callbacks */}
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/oauth/strava/callback" element={<StravaCallback />} />
      <Route path="/oauth/garmin/callback" element={<GarminCallback />} />
      <Route path="/oauth/google/callback" element={<GoogleCalendarCallback />} />
      <Route path="/wahoo/callback" element={<WahooCallback />} />
      <Route path="/oauth/coros/callback" element={<CorosCallback />} />

      {/* Protected routes */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/routes"
        element={
          <ProtectedRoute>
            <MyRoutes />
          </ProtectedRoute>
        }
      />
      {/* Redirect old /routes/list bookmarks to the routes page */}
      <Route
        path="/routes/list"
        element={
          <ProtectedRoute>
            <Navigate to="/routes" replace />
          </ProtectedRoute>
        }
      />
      <Route
        path="/routes/new"
        element={
          <ProtectedRoute>
            <RouteBuilder />
          </ProtectedRoute>
        }
      />
      <Route
        path="/routes/:routeId"
        element={
          <ProtectedRoute>
            <RouteBuilder />
          </ProtectedRoute>
        }
      />
      {/* Manual builder deprecated — redirect to unified builder */}
      <Route
        path="/routes/manual"
        element={
          <ProtectedRoute>
            <Navigate to="/routes/new" replace />
          </ProtectedRoute>
        }
      />
      <Route
        path="/routes/manual/:routeId"
        element={
          <ProtectedRoute>
            <Navigate to="/routes/new" replace />
          </ProtectedRoute>
        }
      />
      <Route
        path="/planner"
        element={
          <ProtectedRoute>
            <PlannerPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/training"
        element={
          <ProtectedRoute>
            <TrainingDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/community"
        element={
          <ProtectedRoute>
            <CommunityPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <Settings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/gear"
        element={
          <ProtectedRoute>
            <GearPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/gear/:gearId"
        element={
          <ProtectedRoute>
            <GearPage />
          </ProtectedRoute>
        }
      />
      {/* Updates route redirects to Settings (content moved there) */}
      <Route path="/updates" element={<Navigate to="/settings" replace />} />
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <Admin />
          </ProtectedRoute>
        }
      />

      {/* Catch all - 404 page */}
      <Route path="*" element={<NotFound />} />
    </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <>
      <ColorSchemeScript defaultColorScheme="light" forceColorScheme={null} />
      <MantineProvider theme={theme} defaultColorScheme="light">
        <DatesProvider settings={{ firstDayOfWeek: 0, consistentWeeks: true }}>
          <ErrorBoundary>
            <Notifications position="top-right" />
            <AuthProvider>
              <UserPreferencesProvider>
                <CoachCommandBarProvider>
                  <BrowserRouter>
                    <PageTracker />
                    <AppRoutes />
                    <CoachCommandBar />
                  </BrowserRouter>
                  <Analytics />
                </CoachCommandBarProvider>
              </UserPreferencesProvider>
            </AuthProvider>
          </ErrorBoundary>
        </DatesProvider>
      </MantineProvider>
    </>
  );
}

export default App;
