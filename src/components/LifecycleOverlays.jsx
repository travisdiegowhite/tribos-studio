/**
 * LifecycleOverlays — app-wide user-lifecycle surfaces, mounted once by
 * AppShell so they reach the user on every authenticated page.
 *
 * The legacy Dashboard used to own the onboarding + What's New checks, which
 * meant new users landing on the canonical /today (TodaySpine) never saw
 * onboarding and had no feedback button. Keep this in AppShell, not a page.
 *
 * - OnboardingModal: first-run flow (DB-backed check, localStorage cache)
 * - WhatsNewModal: returning users who haven't seen the latest updates
 * - BetaFeedbackWidget: floating feedback button, bottom right (referenced by
 *   the onboarding "Ready" screen and the welcome emails)
 */
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { supabase } from '../lib/supabase';
import OnboardingModal from './OnboardingModal.jsx';
import WhatsNewModal, { hasSeenLatestUpdates } from './WhatsNewModal.jsx';
import BetaFeedbackWidget from './BetaFeedbackWidget.jsx';

function LifecycleOverlays({ showFeedbackButton = true }) {
  const { user } = useAuth();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showWhatsNew, setShowWhatsNew] = useState(false);

  useEffect(() => {
    const checkOnboarding = async () => {
      if (!user) return;

      // Always check database first for onboarding status (persists across browsers)
      try {
        const { data } = await supabase
          .from('user_profiles')
          .select('onboarding_completed')
          .eq('id', user.id)
          .single();

        if (data?.onboarding_completed) {
          localStorage.setItem(`tribos_welcome_seen_${user.id}`, 'true');
          if (!hasSeenLatestUpdates(user.id)) {
            setShowWhatsNew(true);
          }
          return;
        }
      } catch {
        // Profile doesn't exist yet — user needs onboarding
      }

      // Only show onboarding if not completed in database
      const hasSeenWelcome = localStorage.getItem(`tribos_welcome_seen_${user.id}`);
      if (!hasSeenWelcome) {
        localStorage.setItem(`tribos_welcome_seen_${user.id}`, 'true');
        setShowOnboarding(true);
      } else if (!hasSeenLatestUpdates(user.id)) {
        setShowWhatsNew(true);
      }
    };

    checkOnboarding();
  }, [user]);

  const handleCloseOnboarding = useCallback(() => setShowOnboarding(false), []);
  const handleCloseWhatsNew = useCallback(() => setShowWhatsNew(false), []);

  if (!user) return null;

  return (
    <>
      <OnboardingModal opened={showOnboarding} onClose={handleCloseOnboarding} />
      <WhatsNewModal opened={showWhatsNew} onClose={handleCloseWhatsNew} userId={user.id} />
      {showFeedbackButton && <BetaFeedbackWidget />}
    </>
  );
}

export default LifecycleOverlays;
