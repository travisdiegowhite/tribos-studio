import React from 'react';
import { Paper, Group, Stack, Text, ThemeIcon } from '@mantine/core';
import { motion } from 'framer-motion';
import { Map, TrendingUp, Users, Eye } from 'lucide-react';

const intentIcons = {
  routes: Map,
  training: TrendingUp,
  coach: Users,
  exploring: Eye,
};

/**
 * Radio-style card for intent selection in onboarding
 */
const IntentCard = ({ intent, title, description, selected, onClick, index = 0 }) => {
  const Icon = intentIcons[intent] || Eye;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.1 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <Paper
        p="md"
        radius="md"
        onClick={onClick}
        style={{
          backgroundColor: selected ? 'rgba(16, 185, 129, 0.15)' : '#2d3748',
          border: selected ? '2px solid #10b981' : '2px solid transparent',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
      >
        <Group gap="md" wrap="nowrap">
          <ThemeIcon
            size={48}
            radius="md"
            variant={selected ? 'filled' : 'light'}
            color={selected ? 'green' : 'gray'}
          >
            <Icon size={24} />
          </ThemeIcon>
          <Stack gap={4} style={{ flex: 1 }}>
            <Text fw={600} size="md" style={{ color: '#E8E8E8' }}>
              {title}
            </Text>
            <Text size="sm" style={{ color: '#9ca3af' }}>
              {description}
            </Text>
          </Stack>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              border: selected ? '2px solid #10b981' : '2px solid #4b5563',
              backgroundColor: selected ? '#10b981' : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease',
            }}
          >
            {selected && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: '#fff',
                }}
              />
            )}
          </div>
        </Group>
      </Paper>
    </motion.div>
  );
};

export default IntentCard;
