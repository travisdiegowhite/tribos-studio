import React from 'react';
import { Stack, Title, Text, Button, Group, Paper, SimpleGrid, ThemeIcon } from '@mantine/core';
import { motion } from 'framer-motion';
import { ArrowRight, Map, BarChart3, Brain, Settings, Users, UserPlus } from 'lucide-react';

const iconMap = {
  map: Map,
  chart: BarChart3,
  brain: Brain,
  settings: Settings,
  users: Users,
  userplus: UserPlus,
};

/**
 * Step 4: Personalized Next Action
 * Shows intent-based CTAs to guide users to their first action
 */
const PersonalizedNextAction = ({
  intent,
  intentConfig,
  onComplete,
  onNavigate,
}) => {
  const handlePrimaryCta = () => {
    if (intentConfig.primaryCta?.path) {
      onNavigate(intentConfig.primaryCta.path);
    }
    onComplete();
  };

  const handleSecondaryCta = () => {
    if (intentConfig.secondaryCta?.path) {
      onNavigate(intentConfig.secondaryCta.path);
    }
    onComplete();
  };

  const handleOptionClick = (path) => {
    onNavigate(path);
    onComplete();
  };

  // Render explorer layout (4 option cards)
  if (intent === 'exploring' || !intent) {
    return (
      <motion.div
        initial={{ opacity: 0, x: 50 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -50 }}
        transition={{ duration: 0.3 }}
      >
        <Stack gap="xl">
          <Stack gap="xs" align="center" ta="center">
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Title order={2} style={{ color: '#E8E8E8' }}>
                {intentConfig.heading}
              </Title>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Text size="lg" style={{ color: '#9ca3af' }}>
                {intentConfig.subheading}
              </Text>
            </motion.div>
          </Stack>

          <SimpleGrid cols={{ base: 2 }} spacing="md">
            {intentConfig.options?.map((option, index) => {
              const Icon = iconMap[option.icon] || Map;
              return (
                <motion.div
                  key={option.path}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + index * 0.1 }}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <Paper
                    p="lg"
                    radius="md"
                    onClick={() => handleOptionClick(option.path)}
                    style={{
                      backgroundColor: '#2d3748',
                      border: '1px solid #4b5563',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#10b981';
                      e.currentTarget.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#4b5563';
                      e.currentTarget.style.backgroundColor = '#2d3748';
                    }}
                  >
                    <Stack gap="sm" align="center" ta="center">
                      <ThemeIcon size={48} radius="md" variant="light" color="green">
                        <Icon size={24} />
                      </ThemeIcon>
                      <Text fw={600} size="md" style={{ color: '#E8E8E8' }}>
                        {option.label}
                      </Text>
                    </Stack>
                  </Paper>
                </motion.div>
              );
            })}
          </SimpleGrid>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
          >
            <Group justify="center">
              <Button
                variant="subtle"
                onClick={onComplete}
                style={{ color: '#6b7280' }}
              >
                Skip to dashboard
              </Button>
            </Group>
          </motion.div>
        </Stack>
      </motion.div>
    );
  }

  // Render standard layout (primary + secondary CTA)
  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      transition={{ duration: 0.3 }}
    >
      <Stack gap="xl">
        <Stack gap="xs" align="center" ta="center">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Title order={2} style={{ color: '#E8E8E8' }}>
              {intentConfig.heading}
            </Title>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Text size="lg" style={{ color: '#9ca3af' }} maw={450}>
              {intentConfig.subheading}
            </Text>
          </motion.div>
        </Stack>

        {/* Visual representation based on intent */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
        >
          <Paper
            p="xl"
            radius="md"
            style={{
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(34, 211, 238, 0.05) 100%)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
            }}
          >
            <Stack gap="md" align="center">
              <ThemeIcon size={64} radius="xl" variant="light" color="green">
                {intent === 'routes' && <Map size={32} />}
                {intent === 'training' && <BarChart3 size={32} />}
                {intent === 'coach' && <Users size={32} />}
              </ThemeIcon>

              <Text size="md" style={{ color: '#D5E1EE' }} ta="center" maw={350}>
                {intent === 'routes' &&
                  "Our AI analyzes your riding patterns to suggest routes you'll love. Set your time and goals, and we'll handle the rest."}
                {intent === 'training' &&
                  "Track your fitness trends, monitor training load, and get AI-powered insights to optimize your performance."}
                {intent === 'coach' &&
                  "Manage your athletes, create training plans, and track their progress all in one place."}
              </Text>
            </Stack>
          </Paper>
        </motion.div>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Stack gap="md" align="center">
            <Button
              size="lg"
              color="green"
              rightSection={<ArrowRight size={18} />}
              onClick={handlePrimaryCta}
              fullWidth
              maw={300}
            >
              {intentConfig.primaryCta?.label}
            </Button>

            {intentConfig.secondaryCta && (
              <Button
                variant="subtle"
                onClick={handleSecondaryCta}
                style={{ color: '#9ca3af' }}
              >
                {intentConfig.secondaryCta.label} →
              </Button>
            )}
          </Stack>
        </motion.div>
      </Stack>
    </motion.div>
  );
};

export default PersonalizedNextAction;
