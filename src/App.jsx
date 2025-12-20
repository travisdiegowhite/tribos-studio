import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MantineProvider, ColorSchemeScript } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import { Notifications } from '@mantine/notifications';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';
import { UserPreferencesProvider } from './contexts/UserPreferencesContext.jsx';
import { theme } from './theme';

// Pages
import Landing from './pages/Landing.jsx';
import Auth from './pages/Auth.jsx';
import Dashboard from './pages/Dashboard.jsx';
import RouteBuilder from './pages/RouteBuilder.jsx';
import MyRoutes from './pages/MyRoutes.jsx';
import TrainingDashboard from './pages/TrainingDashboard.jsx';
import Settings from './pages/Settings.jsx';
import PrivacyPolicy from './pages/PrivacyPolicy.jsx';
import Terms from './pages/Terms.jsx';
import NotFound from './pages/NotFound.jsx';
import Admin from './pages/Admin.jsx';

// OAuth Callbacks
import StravaCallback from './pages/oauth/StravaCallback.jsx';
import GarminCallback from './pages/oauth/GarminCallback.jsx';
import WahooCallback from './pages/oauth/WahooCallback.jsx';
import AuthCallback from './pages/oauth/AuthCallback.jsx';
import GoogleCalendarCallback from './pages/oauth/GoogleCalendarCallback.jsx';

// Components
import BetaFeedbackWidget from './components/BetaFeedbackWidget.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

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

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<Landing />} />
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
            <Navigate to="/routes/new" replace />
          </ProtectedRoute>
        }
      />
      <Route
        path="/routes/list"
        element={
          <ProtectedRoute>
            <MyRoutes />
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
      <Route
        path="/training"
        element={
          <ProtectedRoute>
            <TrainingDashboard />
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
  );
}

function App() {
  return (
    <>
      <ColorSchemeScript defaultColorScheme="dark" />
      <MantineProvider theme={theme} defaultColorScheme="dark">
        <DatesProvider settings={{ firstDayOfWeek: 0 }}>
          <ErrorBoundary>
            <Notifications position="top-right" />
            <AuthProvider>
              <UserPreferencesProvider>
                <BrowserRouter>
                  <AppRoutes />
                  <BetaFeedbackWidget />
                </BrowserRouter>
                <Analytics />
                <SpeedInsights />
              </UserPreferencesProvider>
            </AuthProvider>
          </ErrorBoundary>
        </DatesProvider>
      </MantineProvider>
    </>
  );
}

export default App;
