import React, { useState } from 'react';
import { Stack, Title, Text, Button, Group, Paper, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { motion } from 'framer-motion';
import { Check, Calendar, Target, Zap, Heart, Bike } from 'lucide-react';

const goals = [
  {
    type: 'consistency',
    title: 'Ride more consistently',
    description: 'Build a regular riding habit',
    icon: Calendar,
  },
  {
    type: 'endurance_event',
    title: 'Build endurance for a big event',
    description: 'Train for a specific goal',
    icon: Target,
    showEventFields: true,
  },
  {
    type: 'speed_power',
    title: 'Get faster and improve power',
    description: 'Focus on performance gains',
    icon: Zap,
  },
  {
    type: 'enjoyment',
    title: 'Just enjoy riding, no specific goal',
    description: 'Ride for fun and exploration',
    icon: Heart,
  },
];

/**
 * Step 5: Goal Setting (Optional)
 * Captures user's cycling goal for AI recommendations
 */
const GoalSetting = ({
  goal,
  setGoal,
  onComplete,
  onSkip,
}) => {
  const [selectedGoal, setSelectedGoal] = useState(goal.type);
  const [eventName, setEventName] = useState(goal.eventName || '');
  const [eventDate, setEventDate] = useState(goal.eventDate ? new Date(goal.eventDate) : null);

  const showEventFields = selectedGoal === 'endurance_event';

  const handleGoalSelect = (type) => {
    setSelectedGoal(type);
    setGoal({ type });
  };

  const handleSave = () => {
    const goalData = {
      type: selectedGoal,
      eventName: showEventFields ? eventName : null,
      eventDate: showEventFields && eventDate ? eventDate.toISOString().split('T')[0] : null,
      eventType: showEventFields ? 'event' : null,
    };
    setGoal(goalData);
    onComplete();
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      transition={{ duration: 0.3 }}
    >
      <Stack gap="xl">
        {/* Header */}
        <Stack gap="xs" align="center" ta="center">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Title order={2} style={{ color: '#E8E8E8' }}>
              One more thing
            </Title>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Text size="lg" style={{ color: '#9ca3af' }} maw={400}>
              What are you working toward? This helps our AI give better recommendations.
            </Text>
          </motion.div>
        </Stack>

        {/* Goal options */}
        <Stack gap="sm">
          {goals.map((goalOption, index) => {
            const Icon = goalOption.icon;
            const isSelected = selectedGoal === goalOption.type;

            return (
              <motion.div
                key={goalOption.type}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + index * 0.1 }}
              >
                <Paper
                  p="md"
                  radius="md"
                  onClick={() => handleGoalSelect(goalOption.type)}
                  style={{
                    backgroundColor: isSelected ? 'rgba(16, 185, 129, 0.15)' : '#2d3748',
                    border: isSelected ? '2px solid #10b981' : '2px solid transparent',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <Group justify="space-between" wrap="nowrap">
                    <Group gap="md" wrap="nowrap">
                      <Icon
                        size={24}
                        style={{ color: isSelected ? '#10b981' : '#6b7280' }}
                      />
                      <div>
                        <Text fw={600} size="md" style={{ color: '#E8E8E8' }}>
                          {goalOption.title}
                        </Text>
                        <Text size="sm" style={{ color: '#9ca3af' }}>
                          {goalOption.description}
                        </Text>
                      </div>
                    </Group>

                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        border: isSelected ? '2px solid #10b981' : '2px solid #4b5563',
                        backgroundColor: isSelected ? '#10b981' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {isSelected && <Check size={14} style={{ color: '#fff' }} />}
                    </div>
                  </Group>
                </Paper>
              </motion.div>
            );
          })}
        </Stack>

        {/* Event fields (shown conditionally) */}
        {showEventFields && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Paper
              p="lg"
              radius="md"
              style={{
                backgroundColor: '#2d3748',
                border: '1px solid #4b5563',
              }}
            >
              <Stack gap="md">
                <TextInput
                  label="Event name (optional)"
                  placeholder="e.g., Gran Fondo, Century ride"
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  leftSection={<Bike size={16} />}
                  styles={{
                    input: {
                      backgroundColor: '#1f2937',
                      borderColor: '#4b5563',
                      color: '#E8E8E8',
                    },
                    label: {
                      color: '#9ca3af',
                    },
                  }}
                />

                <DateInput
                  label="Event date (optional)"
                  placeholder="Select date"
                  value={eventDate}
                  onChange={setEventDate}
                  leftSection={<Calendar size={16} />}
                  minDate={new Date()}
                  styles={{
                    input: {
                      backgroundColor: '#1f2937',
                      borderColor: '#4b5563',
                      color: '#E8E8E8',
                    },
                    label: {
                      color: '#9ca3af',
                    },
                  }}
                />
              </Stack>
            </Paper>
          </motion.div>
        )}

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
        >
          <Group justify="space-between">
            <Button
              variant="subtle"
              onClick={onSkip}
              style={{ color: '#9ca3af' }}
            >
              Maybe later
            </Button>

            <Button
              size="lg"
              onClick={handleSave}
              disabled={!selectedGoal}
              style={{
                backgroundColor: selectedGoal ? '#10b981' : '#4b5563',
                color: selectedGoal ? '#fff' : '#9ca3af',
              }}
            >
              Save & finish
            </Button>
          </Group>
        </motion.div>
      </Stack>
    </motion.div>
  );
};

export default GoalSetting;
