import React, { useEffect, useCallback } from 'react';
import { Modal, Stack, Paper, Box } from '@mantine/core';
import { AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import useOnboarding from '../../hooks/useOnboarding';
import OnboardingProgress from './shared/OnboardingProgress';
import WelcomeIntent from './steps/WelcomeIntent';
import PersonalizedNextAction from './steps/PersonalizedNextAction';
import GoalSetting from './steps/GoalSetting';
import * as analytics from '../../services/onboardingAnalytics';

/**
 * OnboardingFlow - Main orchestrator component for the onboarding experience
 * Manages step navigation and renders appropriate step components
 *
 * Steps:
 * 0 - WelcomeIntent: Name + intent selection
 * 1 - PersonalizedNextAction: Show what they can do
 * 2 - GoalSetting: Set goals
 */
const OnboardingFlow = ({ opened, onClose }) => {
  const navigate = useNavigate();

  const {
    // State
    currentStep,
    displayName,
    intent,
    goal,
    isLoading,
    startedAt,

    // Computed
    canProceed,
    intentConfig,

    // Actions
    setDisplayName,
    setIntent,
    setGoal,
    skipGoal,
    nextStep,
    saveDisplayName,
    completeOnboarding,
  } = useOnboarding();

  // Track onboarding start
  useEffect(() => {
    if (opened && startedAt) {
      analytics.trackOnboardingStarted();
    }
  }, [opened, startedAt]);

  // Track abandonment on unmount
  useEffect(() => {
    return () => {
      if (opened && currentStep < 2 && startedAt) {
        const timeSpent = Math.round((Date.now() - startedAt) / 1000);
        analytics.trackOnboardingAbandoned(currentStep, timeSpent);
      }
    };
  }, [opened, currentStep, startedAt]);

  // Handle step 1 completion (save display name + intent)
  const handleStep1Complete = useCallback(async () => {
    const saved = await saveDisplayName();
    if (saved) {
      analytics.trackIntentSelected(intent);
      nextStep();
    }
  }, [saveDisplayName, intent, nextStep]);

  // Handle step 2 completion (personalized action)
  const handleStep2Complete = useCallback(() => {
    nextStep();
  }, [nextStep]);

  // Handle navigation from personalized action
  const handleNavigate = useCallback((path) => {
    analytics.trackCtaClicked(path, intent);
  }, [intent]);

  // Handle full completion (from goal setting or skip)
  const handleFinalComplete = useCallback(async () => {
    if (goal.type) {
      analytics.trackGoalSet(goal.type, !!goal.eventDate);
    }

    const duration = startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0;
    const skippedSteps = [];

    analytics.trackOnboardingCompleted(duration, skippedSteps, intent);

    const success = await completeOnboarding();
    if (success) {
      onClose();
      // Navigate to the fitness integrations page after onboarding
      navigate('/import');
    }
  }, [goal, startedAt, intent, completeOnboarding, onClose, navigate]);

  // Handle goal skip
  const handleSkipGoal = useCallback(async () => {
    analytics.trackGoalSkipped();
    skipGoal();

    const duration = startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0;
    const skippedSteps = [2];

    analytics.trackOnboardingCompleted(duration, skippedSteps, intent);

    const success = await completeOnboarding();
    if (success) {
      onClose();
      // Navigate to the fitness integrations page after onboarding
      navigate('/import');
    }
  }, [startedAt, intent, skipGoal, completeOnboarding, onClose, navigate]);

  // Render current step
  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <WelcomeIntent
            displayName={displayName}
            setDisplayName={setDisplayName}
            intent={intent}
            setIntent={setIntent}
            onNext={handleStep1Complete}
            canProceed={canProceed}
          />
        );

      case 1:
        return (
          <PersonalizedNextAction
            intent={intent}
            intentConfig={intentConfig}
            onComplete={handleStep2Complete}
            onNavigate={handleNavigate}
          />
        );

      case 2:
        return (
          <GoalSetting
            goal={goal}
            setGoal={setGoal}
            onComplete={handleFinalComplete}
            onSkip={handleSkipGoal}
          />
        );

      default:
        return null;
    }
  };

  if (isLoading) {
    return null;
  }

  return (
    <Modal
      opened={opened}
      onClose={() => {}} // Prevent closing by clicking outside
      size="lg"
      centered
      padding={0}
      withCloseButton={false}
      closeOnClickOutside={false}
      closeOnEscape={false}
      styles={{
        content: {
          backgroundColor: '#1e2433',
          border: '1px solid #374151',
          borderRadius: '12px',
          maxHeight: '90vh',
          overflow: 'hidden',
        },
        body: {
          padding: 0,
          maxHeight: '90vh',
          overflowY: 'auto',
        },
      }}
    >
      <Box
        p="xl"
        style={{
          background: 'linear-gradient(180deg, #1e2433 0%, #252d3d 100%)',
          minHeight: '500px',
        }}
      >
        <Stack gap="xl">
          {/* Progress indicator */}
          <OnboardingProgress currentStep={currentStep} totalSteps={3} />

          {/* Step content */}
          <Paper
            p="lg"
            radius="md"
            style={{
              backgroundColor: 'transparent',
            }}
          >
            <AnimatePresence mode="wait">
              {renderStep()}
            </AnimatePresence>
          </Paper>
        </Stack>
      </Box>
    </Modal>
  );
};

export default OnboardingFlow;
