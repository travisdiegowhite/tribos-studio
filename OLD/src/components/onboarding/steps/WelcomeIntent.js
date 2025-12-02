import React from 'react';
import { Stack, Title, Text, TextInput, Button, Group } from '@mantine/core';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import IntentCard from '../shared/IntentCard';

const intents = [
  {
    intent: 'routes',
    title: 'I want to plan better routes',
    description: 'Find new roads and optimize your rides',
  },
  {
    intent: 'training',
    title: 'I want to train smarter',
    description: 'Track fitness, get AI coaching insights',
  },
  {
    intent: 'coach',
    title: "I'm a coach managing athletes",
    description: 'Build plans and monitor your team',
  },
  {
    intent: 'exploring',
    title: 'Just exploring for now',
    description: 'Take a look around, no pressure',
  },
];

/**
 * Step 1: Welcome Intent
 * Collects display name and user intent/motivation
 */
const WelcomeIntent = ({
  displayName,
  setDisplayName,
  intent,
  setIntent,
  onNext,
  canProceed,
}) => {
  const handleSubmit = (e) => {
    e.preventDefault();
    if (canProceed) {
      onNext();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      transition={{ duration: 0.3 }}
    >
      <form onSubmit={handleSubmit}>
        <Stack gap="xl">
          {/* Header */}
          <Stack gap="xs" align="center" ta="center">
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Title order={2} style={{ color: '#E8E8E8' }}>
                Welcome to Tribos
              </Title>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Text size="lg" style={{ color: '#9ca3af' }}>
                Let's get you set up. First, what should we call you?
              </Text>
            </motion.div>
          </Stack>

          {/* Name Input */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <TextInput
              placeholder="Enter your name"
              size="lg"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              styles={{
                input: {
                  backgroundColor: '#2d3748',
                  borderColor: displayName.trim() ? '#10b981' : '#4b5563',
                  color: '#E8E8E8',
                  textAlign: 'center',
                  fontSize: '1.25rem',
                  '&:focus': {
                    borderColor: '#10b981',
                  },
                },
              }}
            />
          </motion.div>

          {/* Intent Selection */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            <Text size="md" fw={500} mb="md" style={{ color: '#D5E1EE' }}>
              What brings you here today?
            </Text>
            <Stack gap="sm">
              {intents.map((item, index) => (
                <IntentCard
                  key={item.intent}
                  intent={item.intent}
                  title={item.title}
                  description={item.description}
                  selected={intent === item.intent}
                  onClick={() => setIntent(item.intent)}
                  index={index}
                />
              ))}
            </Stack>
          </motion.div>

          {/* Continue Button */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
          >
            <Group justify="flex-end">
              <Button
                type="submit"
                size="lg"
                rightSection={<ArrowRight size={18} />}
                disabled={!canProceed}
                style={{
                  backgroundColor: canProceed ? '#10b981' : '#4b5563',
                  color: canProceed ? '#fff' : '#9ca3af',
                }}
              >
                Continue
              </Button>
            </Group>
          </motion.div>
        </Stack>
      </form>
    </motion.div>
  );
};

export default WelcomeIntent;
