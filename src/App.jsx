import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { MantineProvider, ColorSchemeScript, Center, Loader } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import { Notifications } from '@mantine/notifications';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';
import { UserPreferencesProvider } from './contexts/UserPreferencesContext.jsx';
import { useRouteBuilderV2Access } from './hooks/useRouteBuilderV2Access.ts';
import { theme } from './theme';

// Pages — eagerly loaded (critical path)
import Landing from './pages/Landing.jsx';
import Auth from './pages/Auth.jsx';
import PrivacyPolicy from './pages/PrivacyPolicy.jsx';
import Terms from './pages/Terms.jsx';
import NotFound from './pages/NotFound.jsx';

// Pages — lazy loaded (protected, heavy)
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
// TodayEntry picks the live Today vs. the routing-first glance, gated on the
// Route Builder 2.0 beta cohort (parallel-route swap, live Today untouched).
const TodayEntry = lazy(() => import('./views/today-glance/TodayEntry.tsx'));
const RouteBuilder = lazy(() => import('./pages/RouteBuilder.jsx'));
const TrainingDashboard = lazy(() => import('./pages/TrainingDashboard.jsx'));
const PlannerPage = lazy(() => import('./pages/PlannerPage.tsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));
const CommunityPage = lazy(() => import('./pages/CommunityPage.jsx'));
const GearPage = lazy(() => import('./pages/GearPage.jsx'));
const Admin = lazy(() => import('./pages/Admin.jsx'));
const InternalMetricsAudit = lazy(() => import('./pages/InternalMetricsAudit.tsx'));
const MyRoutes = lazy(() => import('./pages/MyRoutes.jsx'));
const Progress = lazy(() => import('./pages/Progress.jsx'));
const MetricsCalculatorPage = lazy(() => import('./pages/MetricsCalculatorPage.tsx'));
const RouteBuilder2 = lazy(() => import('./pages/RouteBuilder2.tsx'));
const RouteBuilder2HarnessDev = lazy(() => import('./pages/RouteBuilder2HarnessDev.tsx'));

// Dev harness gate: only mount when running in dev AND the v2 flag is on.
const ROUTE_BUILDER_V2_DEV_HARNESS_ENABLED =
  Boolean(import.meta.env?.DEV) &&
  import.meta.env?.VITE_ROUTE_BUILDER_V2_ENABLED === 'true';

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

// Route Builder 2.0 BETA gate (Stabilize S1). Requires the env flag AND the
// per-user user_profiles.route_builder_v2_enabled column. Falls through to v1
// at /ride/new when access is denied.
function RouteBuilderV2Guard({ children }) {
  const { hasAccess, isLoading } = useRouteBuilderV2Access();

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
      </div>
    );
  }

  if (!hasAccess) {
    return <Navigate to="/ride/new" replace />;
  }

  return children;
}

// Public Route wrapper (redirects to today if already logged in)
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
    return <Navigate to="/today" replace />;
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
      <Route path="/learn/metrics" element={<MetricsCalculatorPage />} />
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

      {/* ===== PRIMARY TABS ===== */}

      {/* TODAY — front door. TodayEntry flag-selects the live cluster layout
          or the routing-first glance. */}
      <Route
        path="/today"
        element={
          <ProtectedRoute>
            <TodayEntry />
          </ProtectedRoute>
        }
      />
      {/* Legacy dashboard (kept for fallback / direct linking) */}
      <Route
        path="/today/legacy"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />

      {/* RIDE — route library (renders existing MyRoutes) */}
      <Route
        path="/ride"
        element={
          <ProtectedRoute>
            <MyRoutes />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ride/new"
        element={
          <ProtectedRoute>
            <RouteBuilder />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ride/:routeId"
        element={
          <ProtectedRoute>
            <RouteBuilder />
          </ProtectedRoute>
        }
      />

      {/* Route Builder 2.0 BETA (Stabilize S1: per-user gate). */}
      {/* RouteBuilderV2Guard redirects to /ride/new when the env flag is off */}
      {/* OR user_profiles.route_builder_v2_enabled is false. */}
      <Route
        path="/route-builder-2"
        element={
          <ProtectedRoute>
            <RouteBuilderV2Guard>
              <RouteBuilder2 />
            </RouteBuilderV2Guard>
          </ProtectedRoute>
        }
      />
      <Route
        path="/route-builder-2/:routeId"
        element={
          <ProtectedRoute>
            <RouteBuilderV2Guard>
              <RouteBuilder2 />
            </RouteBuilderV2Guard>
          </ProtectedRoute>
        }
      />

      {/* Hook test harness (P1.2). DEV+env gate at mount, per-user gate via */}
      {/* RouteBuilderV2Guard. The route doesn't even exist in production. */}
      {ROUTE_BUILDER_V2_DEV_HARNESS_ENABLED && (
        <Route
          path="/route-builder-2/dev-harness"
          element={
            <ProtectedRoute>
              <RouteBuilderV2Guard>
                <RouteBuilder2HarnessDev />
              </RouteBuilderV2Guard>
            </ProtectedRoute>
          }
        />
      )}

      {/* TRAIN — training depth (renders existing TrainingDashboard) */}
      <Route
        path="/train"
        element={
          <ProtectedRoute>
            <TrainingDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/train/planner"
        element={
          <ProtectedRoute>
            <PlannerPage />
          </ProtectedRoute>
        }
      />

      {/* PROGRESS — Dedicated progress/trends page */}
      <Route
        path="/progress"
        element={
          <ProtectedRoute>
            <Progress />
          </ProtectedRoute>
        }
      />

      {/* ===== AVATAR DROPDOWN PAGES ===== */}

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
      <Route
        path="/community"
        element={
          <ProtectedRoute>
            <CommunityPage />
          </ProtectedRoute>
        }
      />

      {/* ===== LEGACY REDIRECTS (preserve old bookmarks & internal links) ===== */}

      <Route path="/dashboard" element={<Navigate to="/today" replace />} />
      <Route path="/routes" element={<Navigate to="/ride" replace />} />
      <Route path="/routes/list" element={<Navigate to="/ride" replace />} />
      <Route path="/routes/new" element={<Navigate to="/ride/new" replace />} />
      {/* /routes/:routeId — serve directly (can't redirect with params easily) */}
      <Route
        path="/routes/:routeId"
        element={
          <ProtectedRoute>
            <RouteBuilder />
          </ProtectedRoute>
        }
      />
      <Route path="/routes/manual" element={<Navigate to="/ride/new" replace />} />
      <Route path="/routes/manual/:routeId" element={<Navigate to="/ride/new" replace />} />
      <Route path="/training" element={<Navigate to="/train" replace />} />
      <Route path="/planner" element={<Navigate to="/train/planner" replace />} />
      <Route path="/updates" element={<Navigate to="/settings" replace />} />

      {/* ===== INTERNAL (audit tools, Travis-only) ===== */}
      <Route
        path="/internal/metrics-audit"
        element={
          <ProtectedRoute>
            <InternalMetricsAudit />
          </ProtectedRoute>
        }
      />

      {/* ===== ADMIN ===== */}
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
                  <SpeedInsights />
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
