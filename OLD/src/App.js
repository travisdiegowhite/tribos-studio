// src/App.js
import React, { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { MantineProvider, Loader, Center, Button } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import { Toaster } from 'react-hot-toast';
import { Analytics } from '@vercel/analytics/react';
import Auth from './components/Auth';
import AppLayout from './components/AppLayout';
import DemoModeBanner from './components/DemoModeBanner';
import ErrorBoundary from './components/ErrorBoundary';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { UnitPreferencesProvider } from './utils/units';
import { supabase } from './supabase';
import { hasUserProfile } from './services/userProfile';
import { theme } from './theme';
import './App.css';
import './styles/trail-tech-theme.css';
import './styles/mobile.css';

// Lazy load heavy components for code splitting
const Dashboard = lazy(() => import('./components/Map'));
const FileUpload = lazy(() => import('./components/FileUpload'));
const AIRouteMap = lazy(() => import('./components/AIRouteMap'));
const StravaIntegration = lazy(() => import('./components/StravaIntegration'));
const FitnessIntegrations = lazy(() => import('./components/FitnessIntegrations'));
const StravaCallback = lazy(() => import('./components/StravaCallback'));
const WahooCallback = lazy(() => import('./components/WahooCallback'));
const GarminCallback = lazy(() => import('./components/GarminCallback'));
const PrivacyPolicy = lazy(() => import('./components/PrivacyPolicy'));
const TermsOfService = lazy(() => import('./components/TermsOfService'));
const TrainingResearch = lazy(() => import('./components/TrainingResearch'));
const RouteBuilder = lazy(() => import('./components/RouteBuilder'));
const RouteStudio = lazy(() => import('./components/RouteStudio'));
const RouteDiscovery = lazy(() => import('./components/RouteDiscovery'));
const ViewRoutes = lazy(() => import('./components/ViewRoutes'));
const TrainingDashboard = lazy(() => import('./components/TrainingDashboard'));
const TrainingPlanBuilder = lazy(() => import('./components/TrainingPlanBuilder'));
const TrainingPlanView = lazy(() => import('./components/TrainingPlanView'));
const WorkoutLibrary = lazy(() => import('./components/WorkoutLibrary'));
const HelpCenter = lazy(() => import('./components/HelpCenter'));
const OnboardingFlow = lazy(() => import('./components/onboarding/OnboardingFlow'));
const CoachDashboard = lazy(() => import('./components/coach/CoachDashboard'));
const AthleteDetailView = lazy(() => import('./components/coach/AthleteDetailView'));
const CoachSettings = lazy(() => import('./components/coach/CoachSettings'));
const CoachMessages = lazy(() => import('./components/coach/CoachMessages'));
const ConversationView = lazy(() => import('./components/coach/ConversationView'));
const WorkoutAssignment = lazy(() => import('./components/coach/WorkoutAssignment'));
const ProgressTracking = lazy(() => import('./components/coach/ProgressTracking'));
const AthleteMessageCenter = lazy(() => import('./components/coach/AthleteMessageCenter'));
const AthleteConversationView = lazy(() => import('./components/coach/AthleteConversationView'));
const WorkoutCalendar = lazy(() => import('./components/athlete/WorkoutCalendar'));
const WorkoutLibraryPage = lazy(() => import('./pages/WorkoutLibraryPage'));
const InsightsDashboard = lazy(() => import('./components/coach/InsightsDashboard'));
const WorkoutHistoryView = lazy(() => import('./components/athlete/WorkoutHistoryView'));
const FirstInsightsModal = lazy(() => import('./components/FirstInsightsModal'));

// Loading fallback component
const LoadingFallback = () => (
  <Center style={{ height: '100vh' }}>
    <Loader size="xl" />
  </Center>
);

const AppContent = () => {
  const { user, isNewUser } = useAuth();
  const location = useLocation();
  const [activePage, setActivePage] = useState('ai-routes');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showFirstInsights, setShowFirstInsights] = useState(false);
  const [userRideCount, setUserRideCount] = useState(null);
  const [previousRideCount, setPreviousRideCount] = useState(null);

  // Update active page based on route
  useEffect(() => {
    const path = location.pathname;
    if (path === '/') setActivePage('dashboard');
    else if (path === '/ai-planner') setActivePage('ai-routes');
    else if (path === '/route-builder') setActivePage('route-builder');
    else if (path === '/route-studio') setActivePage('route-studio');
    else if (path === '/routes') setActivePage('routes');
    else if (path === '/discover') setActivePage('discover');
    else if (path === '/upload') setActivePage('upload');
    else if (path === '/import') setActivePage('import');
    else if (path === '/help') setActivePage('help');
    else if (path === '/workouts') setActivePage('workouts');
    else if (path === '/workouts/library') setActivePage('workout-library');
    else if (path.startsWith('/training')) setActivePage('training');
    else if (path === '/coach/insights') setActivePage('coach-insights');
    else if (path.startsWith('/coach')) setActivePage('coach');
    else if (path.startsWith('/messages')) setActivePage('messages');
    else if (path.startsWith('/athlete/workouts')) setActivePage('athlete-workouts');
    else if (path === '/athlete/history') setActivePage('athlete-history');
  }, [location]);

  // Fetch user's ride count to determine if they're truly new
  useEffect(() => {
    if (user) {
      const fetchRideCount = async () => {
        try {
          const { count, error } = await supabase
            .from('routes')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .not('recorded_at', 'is', null);

          if (error) {
            console.error('Error fetching ride count:', error);
            setUserRideCount(0);
          } else {
            const newCount = count || 0;

            // Check if this is first import (went from 0 to some rides)
            // and user hasn't seen the first insights modal yet
            const hasSeenInsights = localStorage.getItem('tribos_first_insights_seen') === 'true';
            const justImported = previousRideCount === 0 && newCount > 0;
            const hasRidesButNotSeen = newCount > 0 && !hasSeenInsights && previousRideCount === null;

            if ((justImported || hasRidesButNotSeen) && !hasSeenInsights) {
              // Small delay to let the page settle after import
              setTimeout(() => setShowFirstInsights(true), 1000);
            }

            setPreviousRideCount(userRideCount);
            setUserRideCount(newCount);
          }
        } catch (err) {
          console.error('Error in ride count fetch:', err);
          setUserRideCount(0);
        }
      };

      fetchRideCount();

      // Also re-fetch when user navigates away from import page
      // This catches when they complete an import and navigate elsewhere
      const handleVisibilityChange = () => {
        if (!document.hidden) {
          fetchRideCount();
        }
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
  }, [user, location.pathname]);

  // Check if user should see onboarding - triggered by missing user profile
  useEffect(() => {
    if (user) {
      const checkOnboardingStatus = async () => {
        const onboardingCompleted = localStorage.getItem('tribos_onboarding_completed');
        const isNewSignup = sessionStorage.getItem('tribos_new_signup');

        // Check for URL parameter to manually trigger onboarding
        const urlParams = new URLSearchParams(window.location.search);
        const forceOnboarding = urlParams.get('showOnboarding') === 'true';

        // Check if returning from OAuth during onboarding
        const oauthReturn = localStorage.getItem('tribos_onboarding_oauth_return');
        if (oauthReturn === 'true') {
          console.log('🔙 Returning from OAuth during onboarding');
          localStorage.removeItem('tribos_onboarding_oauth_return');
          localStorage.removeItem('tribos_onboarding_oauth_provider');
          setShowOnboarding(true);
          return;
        }

        // Check if user has completed their profile (has display name)
        const hasProfile = await hasUserProfile(user.id);

        // Multi-layered new user detection
        const shouldShowOnboarding =
          forceOnboarding || // Manual trigger via URL
          isNewSignup === 'true' || // Email confirmation flow
          (!hasProfile && !onboardingCompleted); // User hasn't set display name

        if (shouldShowOnboarding) {
          console.log('🎓 Showing onboarding:', {
            forceOnboarding,
            isNewSignup: isNewSignup === 'true',
            hasProfile,
            onboardingCompleted: !!onboardingCompleted
          });

          // Clear the new signup flag
          sessionStorage.removeItem('tribos_new_signup');

          // Clear URL parameter if used
          if (forceOnboarding) {
            urlParams.delete('showOnboarding');
            const newSearch = urlParams.toString();
            const newUrl = window.location.pathname + (newSearch ? '?' + newSearch : '');
            window.history.replaceState({}, '', newUrl);
          }

          // Show onboarding after a short delay
          const timer = setTimeout(() => setShowOnboarding(true), 500);
          return () => clearTimeout(timer);
        }
      };

      checkOnboardingStatus();
    }
  }, [user, isNewUser]);

  // Handle OAuth callback routes (no layout needed)
  if (location.pathname === '/strava/callback') {
    return <Suspense fallback={<LoadingFallback />}><StravaCallback /></Suspense>;
  }
  if (location.pathname === '/wahoo/callback') {
    return <Suspense fallback={<LoadingFallback />}><WahooCallback /></Suspense>;
  }
  if (location.pathname === '/garmin/callback') {
    return <Suspense fallback={<LoadingFallback />}><GarminCallback /></Suspense>;
  }

  // Handle public pages (no auth required, no layout)
  if (location.pathname === '/privacy' || location.pathname === '/privacy-policy') {
    return <Suspense fallback={<LoadingFallback />}><PrivacyPolicy /></Suspense>;
  }
  if (location.pathname === '/terms' || location.pathname === '/terms-of-service') {
    return <Suspense fallback={<LoadingFallback />}><TermsOfService /></Suspense>;
  }
  if (location.pathname === '/training-research') {
    return <Suspense fallback={<LoadingFallback />}><TrainingResearch /></Suspense>;
  }

  const renderContent = () => {
    if (!user) return <Auth />;

    return (
      <>
        <ErrorBoundary>
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/ai-planner" element={<AIRouteMap />} />
              <Route path="/map" element={<Navigate to="/" replace />} />
              <Route path="/route-builder" element={<RouteBuilder />} />
              <Route path="/route-studio" element={<RouteStudio />} />
              <Route path="/routes" element={<ViewRoutes />} />
              <Route path="/discover" element={<RouteDiscovery />} />
              <Route path="/upload" element={<FileUpload />} />
              <Route path="/import" element={<FitnessIntegrations />} />
              <Route path="/help" element={<HelpCenter />} />
              <Route path="/training" element={<TrainingDashboard />} />
              <Route path="/training/plans/new" element={<TrainingPlanBuilder />} />
              <Route path="/training/plans/:planId" element={<TrainingPlanView />} />
              <Route path="/workouts" element={<WorkoutLibrary />} />
              <Route path="/workouts/library" element={<WorkoutLibraryPage />} />
              <Route path="/coach" element={<CoachDashboard />} />
              <Route path="/coach/insights" element={<InsightsDashboard />} />
              <Route path="/coach/settings" element={<CoachSettings />} />
              <Route path="/coach/messages" element={<CoachMessages />} />
              <Route path="/coach/messages/:relationshipId" element={<ConversationView />} />
              <Route path="/coach/athletes/:athleteId" element={<AthleteDetailView />} />
              <Route path="/coach/athletes/:athleteId/assign-workout" element={<WorkoutAssignment />} />
              <Route path="/coach/athletes/:athleteId/progress" element={<ProgressTracking />} />
              <Route path="/messages" element={<AthleteMessageCenter />} />
              <Route path="/messages/:relationshipId" element={<AthleteConversationView />} />
              <Route path="/athlete/workouts" element={<WorkoutCalendar />} />
              <Route path="/athlete/history" element={<WorkoutHistoryView />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <OnboardingFlow opened={showOnboarding} onClose={() => setShowOnboarding(false)} />
            <FirstInsightsModal
              opened={showFirstInsights}
              onClose={() => setShowFirstInsights(false)}
              userId={user?.id}
            />
          </Suspense>
        </ErrorBoundary>
      </>
    );
  };

  return (
    <>
      <DemoModeBanner />
      <AppLayout
        activePage={activePage}
        setActivePage={setActivePage}
        onShowOnboarding={() => setShowOnboarding(true)}
        userRideCount={userRideCount}
      >
        {renderContent()}
      </AppLayout>
    </>
  );
};

function App() {

  return (
    <MantineProvider theme={theme}>
      <Notifications />
      <Toaster position="top-right" />
      <AuthProvider>
        <UnitPreferencesProvider>
          <Router>
            <AppContent />
          </Router>
        </UnitPreferencesProvider>
      </AuthProvider>
      <Analytics />
    </MantineProvider>
  );
}

export default App;