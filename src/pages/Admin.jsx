/**
 * Admin Page
 * Manage training plan templates and workout library
 */

import { useState } from 'react';
import {
  Container,
  Title,
  Tabs,
  Group,
  Text,
  Alert,
  Paper,
  Stack,
} from '@mantine/core';
import {
  IconSettings,
  IconTemplate,
  IconBike,
  IconAlertCircle,
  IconShieldCheck,
} from '@tabler/icons-react';
import AppShell from '../components/AppShell';
import { useAuth } from '../contexts/AuthContext';
import PlanTemplateManager from '../components/admin/PlanTemplateManager';
import WorkoutTemplateManager from '../components/admin/WorkoutTemplateManager';

// Admin email whitelist - in production, this would be a database table
const ADMIN_EMAILS = [
  'admin@tribos.studio',
  'travis@tribos.studio',
  // Add other admin emails here
];

export default function Admin() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('plans');

  // Check if user is admin
  const isAdmin = user?.email && ADMIN_EMAILS.some(
    (email) => user.email.toLowerCase() === email.toLowerCase()
  );

  // For development, also check user metadata
  const isDev = import.meta.env.DEV;
  const hasAdminAccess = isAdmin || isDev;

  if (!hasAdminAccess) {
    return (
      <AppShell>
        <Container size="md" py="xl">
          <Alert
            icon={<IconAlertCircle size={24} />}
            title="Access Denied"
            color="red"
            variant="filled"
          >
            <Text>You don't have permission to access the admin panel.</Text>
            <Text size="sm" mt="xs">
              If you believe this is an error, please contact support.
            </Text>
          </Alert>
        </Container>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Container size="xl" py="md">
        <Stack spacing="lg">
          {/* Header */}
          <Paper p="md" radius="md" withBorder>
            <Group position="apart">
              <div>
                <Group spacing="xs">
                  <IconShieldCheck size={24} color="var(--mantine-color-green-6)" />
                  <Title order={2}>Admin Dashboard</Title>
                </Group>
                <Text c="dimmed" size="sm" mt={4}>
                  Manage training plan templates and workout definitions
                </Text>
              </div>
              {isDev && !isAdmin && (
                <Alert
                  icon={<IconAlertCircle size={16} />}
                  color="yellow"
                  variant="light"
                  py={8}
                  px={12}
                >
                  Development mode - admin access enabled
                </Alert>
              )}
            </Group>
          </Paper>

          {/* Main Content */}
          <Tabs value={activeTab} onChange={setActiveTab}>
            <Tabs.List>
              <Tabs.Tab value="plans" leftSection={<IconTemplate size={16} />}>
                Training Plans
              </Tabs.Tab>
              <Tabs.Tab value="workouts" leftSection={<IconBike size={16} />}>
                Workout Library
              </Tabs.Tab>
              <Tabs.Tab value="settings" leftSection={<IconSettings size={16} />}>
                Settings
              </Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="plans" pt="lg">
              <PlanTemplateManager />
            </Tabs.Panel>

            <Tabs.Panel value="workouts" pt="lg">
              <WorkoutTemplateManager />
            </Tabs.Panel>

            <Tabs.Panel value="settings" pt="lg">
              <Paper p="lg" withBorder radius="md">
                <Stack>
                  <Title order={4}>Admin Settings</Title>
                  <Text c="dimmed">
                    Additional admin settings will be available here.
                  </Text>
                  <Alert icon={<IconAlertCircle size={16} />} color="blue">
                    Database migration status and cache management coming soon.
                  </Alert>
                </Stack>
              </Paper>
            </Tabs.Panel>
          </Tabs>
        </Stack>
      </Container>
    </AppShell>
  );
}
