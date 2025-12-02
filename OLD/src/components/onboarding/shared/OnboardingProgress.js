import React from 'react';
import { Group } from '@mantine/core';
import { motion } from 'framer-motion';

/**
 * Minimal progress indicator for onboarding steps
 * Shows dots that fill as user progresses
 */
const OnboardingProgress = ({ currentStep, totalSteps = 5 }) => {
  return (
    <Group gap={8} justify="center">
      {Array.from({ length: totalSteps }).map((_, index) => (
        <motion.div
          key={index}
          initial={false}
          animate={{
            scale: index === currentStep ? 1.2 : 1,
            backgroundColor: index <= currentStep ? '#10b981' : '#374151',
          }}
          transition={{ duration: 0.3 }}
          style={{
            width: index === currentStep ? 24 : 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: index <= currentStep ? '#10b981' : '#374151',
          }}
        />
      ))}
    </Group>
  );
};

export default OnboardingProgress;
