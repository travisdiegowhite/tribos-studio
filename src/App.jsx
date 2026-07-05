import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { peekReturnTo, clearReturnTo } from './utils/returnTo';
import { MantineProvider, ColorSchemeScript, Center, Loader } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import { Notifications } from '@mantine/notifications';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
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
// The routing-first glance — the previous /today, kept reachable at
// /today/glance as a fallback after the Spine flip.
const TodayEntry = lazy(() => import('./views/today-glance/TodayEntry.tsx'));
// Training-Arc Today (docs/today-view) — the canonical /today since the flip;
// /today/spine remains a working alias.
const TodaySpine = lazy(() => import('./views/today-spine/TodaySpine.tsx'));
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
const SharedRoute = lazy(() => import('./pages/SharedRoute.tsx'));
const RouteBuilder2HarnessDev = lazy(() => import('./pages/RouteBuilder2HarnessDev.tsx'));

// Dev harness gate: only mount when running in dev. The route doesn't exist in
// production builds.
const ROUTE_BUILDER_V2_DEV_HARNESS_ENABLED = Boolean(import.meta.env?.DEV);

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

// Open Route wrapper — waits for the auth check, then renders regardless of
// session state. Used for the route builder, which guests can try without an
// account (persistence stays gated: saving prompts signup, and the API
// rejects tokenless writes).
function OpenRoute({ children }) {
  const { loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
      </div>
    );
  }

  return children;
}

// Redirect that preserves the query string (a static <Navigate to="/ride/new">
// would drop ?from_activity=…, ?distance=…, etc. that the builder reads).
function RedirectToRideNew() {
  const location = useLocation();
  return <Navigate to={`/ride/new${location.search}`} replace />;
}

// Root route — the product is the front door: signed-out visitors go
// straight into the route builder (open to guests); signed-in users go to
// /today. The marketing landing page lives at /welcome.
function RootRoute() {
  const { isAuthenticated, loading } = useAuth();

  // Same post-auth returnTo handling as PublicRoute (peek in render, clear
  // in an effect — StrictMode double-renders would lose a consumed value).
  const returnTo = peekReturnTo();
  useEffect(() => {
    if (!loading && isAuthenticated && returnTo) clearReturnTo();
  }, [loading, isAuthenticated, returnTo]);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to={returnTo || '/today'} replace />;
  }

  return <RedirectToRideNew />;
}

// Public Route wrapper (redirects to today if already logged in)
function PublicRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  // Guests who signed up from the route builder stash a return path. The
  // post-auth navigate usually consumes it, but this redirect can win the
  // race — honor the stash here too (peek in render, clear in an effect;
  // StrictMode double-renders would lose a value consumed during render).
  const returnTo = peekReturnTo();
  useEffect(() => {
    if (!loading && isAuthenticated && returnTo) clearReturnTo();
  }, [loading, isAuthenticated, returnTo]);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to={returnTo || '/today'} replace />;
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
      {/* Public routes. Root sends guests straight into the route builder;
          the marketing landing page moved to /welcome (unguarded — viewable
          signed in or out). */}
      <Route path="/" element={<RootRoute />} />
      <Route path="/welcome" element={<Landing />} />
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
      {/* Public share links — no auth guard; the API only serves routes
          explicitly marked public by their owner. */}
      <Route path="/r/:routeId" element={<SharedRoute />} />
      <Route path="/oauth/strava/callback" element={<StravaCallback />} />
      <Route path="/oauth/garmin/callback" element={<GarminCallback />} />
      <Route path="/oauth/google/callback" element={<GoogleCalendarCallback />} />
      <Route path="/wahoo/callback" element={<WahooCallback />} />
      <Route path="/oauth/coros/callback" element={<CorosCallback />} />

      {/* ===== PRIMARY TABS ===== */}

      {/* TODAY — front door. The Training-Arc Spine is the canonical Today. */}
      <Route
        path="/today"
        element={
          <ProtectedRoute>
            <TodaySpine />
          </ProtectedRoute>
        }
      />
      {/* Alias kept so existing /today/spine links keep working post-flip. */}
      <Route
        path="/today/spine"
        element={
          <ProtectedRoute>
            <TodaySpine />
          </ProtectedRoute>
        }
      />
      {/* The routing-first glance — previous /today, kept as a fallback. */}
      <Route
        path="/today/glance"
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
      {/* New route — RB2 is the canonical builder. Open to guests (no
          account needed to build/generate; saving prompts signup). */}
      <Route
        path="/ride/new"
        element={
          <OpenRoute>
            <RouteBuilder2 />
          </OpenRoute>
        }
      />
      {/* Hidden v1 fallback (kept reachable by direct URL). */}
      <Route
        path="/ride/new/classic"
        element={
          <ProtectedRoute>
            <RouteBuilder />
          </ProtectedRoute>
        }
      />
      {/* Edit an existing route — RB2 loads it by id. Open: guests get a
          load error from the API rather than an auth redirect. */}
      <Route
        path="/ride/:routeId"
        element={
          <OpenRoute>
            <RouteBuilder2 />
          </OpenRoute>
        }
      />

      {/* Legacy aliases for RB2 (kept working for deep links + internal nav). */}
      <Route
        path="/route-builder-2"
        element={
          <OpenRoute>
            <RouteBuilder2 />
          </OpenRoute>
        }
      />
      <Route
        path="/route-builder-2/:routeId"
        element={
          <OpenRoute>
            <RouteBuilder2 />
          </OpenRoute>
        }
      />

      {/* Hook test harness (P1.2). DEV-only — the route doesn't exist in production. */}
      {ROUTE_BUILDER_V2_DEV_HARNESS_ENABLED && (
        <Route
          path="/route-builder-2/dev-harness"
          element={
            <ProtectedRoute>
              <RouteBuilder2HarnessDev />
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
      <Route path="/routes/new" element={<RedirectToRideNew />} />
      {/* /routes/:routeId — serve RB2 directly (it loads the route by id). */}
      <Route
        path="/routes/:routeId"
        element={
          <OpenRoute>
            <RouteBuilder2 />
          </OpenRoute>
        }
      />
      <Route path="/routes/manual" element={<RedirectToRideNew />} />
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
