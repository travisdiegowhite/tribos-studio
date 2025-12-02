import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getUserProfile, createUserProfile, updateUserProfile } from '../services/userProfile';

const STORAGE_KEY = 'tribos_onboarding_state';

const initialState = {
  currentStep: 0,
  displayName: '',
  intent: null, // 'routes' | 'training' | 'coach' | 'exploring'
  goal: {
    type: null, // 'consistency' | 'endurance_event' | 'speed_power' | 'enjoyment'
    eventName: '',
    eventDate: null,
    eventType: null,
  },
  skippedGoal: false,
  startedAt: null,
};

/**
 * Hook for managing onboarding flow state
 * Handles persistence, step navigation, and data saving
 */
export function useOnboarding() {
  const { user } = useAuth();
  const [state, setState] = useState(initialState);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load saved state from localStorage on mount
  useEffect(() => {
    const loadState = async () => {
      try {
        // Check localStorage for in-progress onboarding
        const savedState = localStorage.getItem(STORAGE_KEY);
        if (savedState) {
          const parsed = JSON.parse(savedState);
          setState(prev => ({ ...prev, ...parsed }));
        } else {
          // Start fresh with timestamp
          setState(prev => ({ ...prev, startedAt: Date.now() }));
        }

        // Check existing profile for display name
        if (user?.id) {
          const profile = await getUserProfile(user.id);
          if (profile?.display_name) {
            setState(prev => ({ ...prev, displayName: profile.display_name }));
          }
        }
      } catch (err) {
        console.error('Error loading onboarding state:', err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    loadState();
  }, [user?.id]);

  // Persist state to localStorage when it changes
  useEffect(() => {
    if (!isLoading && state.startedAt) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  }, [state, isLoading]);

  // Actions
  const setDisplayName = useCallback((name) => {
    setState(prev => ({ ...prev, displayName: name }));
  }, []);

  const setIntent = useCallback((intent) => {
    setState(prev => ({ ...prev, intent }));
  }, []);

  const setGoal = useCallback((goalData) => {
    setState(prev => ({
      ...prev,
      goal: { ...prev.goal, ...goalData },
    }));
  }, []);

  const skipGoal = useCallback(() => {
    setState(prev => ({ ...prev, skippedGoal: true }));
  }, []);

  const nextStep = useCallback(() => {
    setState(prev => ({
      ...prev,
      currentStep: Math.min(prev.currentStep + 1, 2), // Now only 3 steps (0-2)
    }));
  }, []);

  const prevStep = useCallback(() => {
    setState(prev => ({
      ...prev,
      currentStep: Math.max(prev.currentStep - 1, 0),
    }));
  }, []);

  const goToStep = useCallback((step) => {
    setState(prev => ({
      ...prev,
      currentStep: Math.max(0, Math.min(step, 2)), // Now only 3 steps (0-2)
    }));
  }, []);

  // Save profile to database (called on step 1 completion)
  const saveDisplayName = useCallback(async () => {
    if (!user?.id || !state.displayName.trim()) return false;

    try {
      // Use createUserProfile which handles upsert logic
      await createUserProfile(user.id, state.displayName.trim());
      console.log('✅ Display name saved:', state.displayName.trim());
      return true;
    } catch (err) {
      console.error('Error saving display name:', err);
      setError(err.message);
      return false;
    }
  }, [user?.id, state.displayName]);

  // Complete onboarding and save all data
  const completeOnboarding = useCallback(async () => {
    if (!user?.id) return false;

    try {
      const duration = state.startedAt ? Math.round((Date.now() - state.startedAt) / 1000) : 0;
      const skippedSteps = [];
      if (state.skippedGoal) skippedSteps.push(2);

      // Prepare profile update
      const profileUpdate = {
        display_name: state.displayName.trim(),
        primary_intent: state.intent,
        onboarding_completed_at: new Date().toISOString(),
        onboarding_version: 2,
      };

      // Add goal data if set
      if (state.goal.type && !state.skippedGoal) {
        profileUpdate.primary_goal = state.goal.type;
        if (state.goal.eventName) profileUpdate.goal_event_name = state.goal.eventName;
        if (state.goal.eventDate) profileUpdate.goal_event_date = state.goal.eventDate;
        if (state.goal.eventType) profileUpdate.goal_event_type = state.goal.eventType;
      }

      // Check if profile exists
      const existingProfile = await getUserProfile(user.id);
      if (existingProfile) {
        await updateUserProfile(user.id, profileUpdate);
      } else {
        await createUserProfile(user.id, state.displayName.trim(), profileUpdate);
      }

      // Mark onboarding complete in localStorage
      localStorage.setItem('tribos_onboarding_completed', 'true');
      localStorage.removeItem(STORAGE_KEY);

      console.log('✅ Onboarding completed', { duration, skippedSteps });
      return true;
    } catch (err) {
      console.error('Error completing onboarding:', err);
      setError(err.message);
      return false;
    }
  }, [user?.id, state]);

  // Computed values
  const canProceed = useMemo(() => {
    switch (state.currentStep) {
      case 0: // WelcomeIntent
        return state.displayName.trim().length > 0 && state.intent !== null;
      case 1: // PersonalizedNextAction
        return true; // Can always proceed
      case 2: // GoalSetting
        return true; // Can always complete
      default:
        return false;
    }
  }, [state.currentStep, state.displayName, state.intent]);

  // Intent-specific configuration for PersonalizedNextAction
  const intentConfig = useMemo(() => {
    switch (state.intent) {
      case 'routes':
        return {
          heading: "Let's find your next ride",
          subheading: 'Our AI can suggest routes based on how you like to ride.',
          primaryCta: { label: 'Create AI Route', path: '/ai-planner' },
          secondaryCta: { label: 'Browse popular routes near me', path: '/routes' },
        };
      case 'training':
        return {
          heading: "Here's where you stand",
          subheading: 'Your dashboard shows your current fitness, training load, and what to focus on next.',
          primaryCta: { label: 'View My Dashboard', path: '/dashboard' },
          secondaryCta: { label: 'Explore AI coaching', path: '/ai-coach' },
        };
      case 'coach':
        return {
          heading: 'Your coach dashboard is ready',
          subheading: 'Invite your first athlete or explore the tools available to you.',
          primaryCta: { label: 'Go to Coach Dashboard', path: '/coach' },
          secondaryCta: { label: 'Invite an athlete', path: '/coach/invite' },
        };
      case 'exploring':
      default:
        return {
          heading: "You're all set",
          subheading: 'Here are a few ways to get started:',
          options: [
            { label: 'Plan a Route', icon: 'map', path: '/ai-planner' },
            { label: 'My Dashboard', icon: 'chart', path: '/dashboard' },
            { label: 'AI Coach', icon: 'brain', path: '/ai-coach' },
            { label: 'Settings', icon: 'settings', path: '/settings' },
          ],
        };
    }
  }, [state.intent]);

  return {
    // State
    ...state,
    isLoading,
    error,

    // Computed
    canProceed,
    intentConfig,

    // Actions
    setDisplayName,
    setIntent,
    setGoal,
    skipGoal,
    nextStep,
    prevStep,
    goToStep,
    saveDisplayName,
    completeOnboarding,
  };
}

export default useOnboarding;
