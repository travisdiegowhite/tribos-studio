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
 * - AgePromptModal: settled users who never told us their age
 * - BetaFeedbackWidget: floating feedback button, bottom right (referenced by
 *   the onboarding "Ready" screen and the welcome emails)
 *
 * - ConsentGate: athletes with no current Terms acceptance, or Garmin
 *   connected without the data-transfer consent (Garmin Agreement §4.5/§5.3)
 *
 * ConsentGate outranks everything: no other modal opens until it resolves,
 * because it gates using the app at all.
 *
 * The other three modals are STRICTLY ORDERED and never stack. Onboarding outranks
 * What's New, which outranks the age prompt — a first-run flow interrupted by
 * a changelog is worse than a changelog seen a day late, and both matter more
 * than a nudge that has several more chances to land. useAgePrompt does
 * nothing at all (not even counting the visit) while it is disabled, so a
 * suppressed showing is deferred rather than spent.
 */
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { supabase } from '../lib/supabase';
import OnboardingModal from './OnboardingModal.jsx';
import WhatsNewModal, { hasSeenLatestUpdates } from './WhatsNewModal.jsx';
import AgePromptModal from './AgePromptModal.jsx';
import BetaFeedbackWidget from './BetaFeedbackWidget.jsx';
import ConsentGate, { missingConsents } from './ConsentGate.jsx';
import { garminService } from '../utils/garminService';
import { CURRENT_TOS_VERSION } from '../utils/legalVersions';
import { useAgePrompt } from '../hooks/useAgePrompt';
import {
  hasSeenOnboarding,
  markOnboardingSeen,
  hasOnboardingDraft,
  clearOnboardingDraft,
} from '../utils/onboardingState';

function hasPendingSignupConsent() {
  try {
    const pending = JSON.parse(localStorage.getItem('tribos_consent_pending') || 'null');
    return !!pending?.tos_accepted_at && pending.tos_version >= CURRENT_TOS_VERSION;
  } catch {
    return false;
  }
}

function LifecycleOverlays({ showFeedbackButton = true }) {
  const { user, signOut } = useAuth();
  // null while checking; ConsentGate holds every other modal back until then.
  const [consentNeeded, setConsentNeeded] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  // Tri-state on purpose: null means "still asking the database". Treating
  // unknown as settled would race the age prompt in front of onboarding for
  // brand-new users.
  const [settled, setSettled] = useState(null);

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
          markOnboardingSeen(user.id);
          clearOnboardingDraft(user.id);
          if (!hasSeenLatestUpdates(user.id)) {
            setShowWhatsNew(true);
          }
          setSettled(true);
          return;
        }
      } catch {
        // Profile doesn't exist yet — user needs onboarding
      }

      // Not completed in the database. Show the wizard unless this browser
      // has already finished or explicitly skipped it. The seen flag is
      // written by the wizard itself on completion/skip — writing it here,
      // before it opened, is what made an interrupted wizard vanish for good.
      // A wizard draft means the athlete is mid-flow (back from a device
      // connect) — resume it even if this browser had skipped before.
      if (!hasSeenOnboarding(user.id) || hasOnboardingDraft(user.id)) {
        setShowOnboarding(true);
      } else if (!hasSeenLatestUpdates(user.id)) {
        setShowWhatsNew(true);
      }
      setSettled(false);
    };

    checkOnboarding();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('tos_accepted_at, tos_version, garmin_data_consent_at')
          .eq('id', user.id)
          .maybeSingle();
        // Only ask the server about Garmin when the consent is missing.
        let garminConnected = false;
        if (!profile?.garmin_data_consent_at && garminService.isConfigured()) {
          const status = await garminService.getConnectionStatus().catch(() => null);
          garminConnected = !!status?.connected;
        }
        const needed = missingConsents(profile, garminConnected);
        // Just signed up in this browser: AppShell is flushing the acceptance
        // the signup form captured, so don't ask twice.
        if (needed.terms && hasPendingSignupConsent()) needed.terms = false;
        if (!cancelled) setConsentNeeded(needed);
      } catch {
        // Never lock the app on a failed check; it runs again next load.
        if (!cancelled) setConsentNeeded({ terms: false, garmin: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const consentPending = consentNeeded === null || consentNeeded.terms || consentNeeded.garmin;

  const agePrompt = useAgePrompt(user?.id, {
    enabled: !consentPending && settled === true && !showOnboarding && !showWhatsNew,
  });

  const handleCloseOnboarding = useCallback(() => setShowOnboarding(false), []);
  const handleCloseWhatsNew = useCallback(() => setShowWhatsNew(false), []);

  if (!user) return null;

  return (
    <>
      <ConsentGate
        opened={!!consentNeeded && (consentNeeded.terms || consentNeeded.garmin)}
        userId={user.id}
        needsTerms={!!consentNeeded?.terms}
        needsGarmin={!!consentNeeded?.garmin}
        onAccepted={() => setConsentNeeded({ terms: false, garmin: false })}
        onSignOut={signOut}
      />
      <OnboardingModal opened={!consentPending && showOnboarding} onClose={handleCloseOnboarding} />
      <WhatsNewModal opened={!consentPending && showWhatsNew} onClose={handleCloseWhatsNew} userId={user.id} />
      <AgePromptModal
        opened={agePrompt.shouldShow}
        onClose={agePrompt.close}
        onSave={agePrompt.saveBirthYear}
        saving={agePrompt.saving}
      />
      {showFeedbackButton && <BetaFeedbackWidget />}
    </>
  );
}

export default LifecycleOverlays;
