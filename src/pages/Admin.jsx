/**
 * Admin Page
 * Secure admin dashboard for managing users, templates, and viewing system data
 *
 * SECURITY: Access is restricted to travis@tribos.studio ONLY
 * - Frontend check prevents unauthorized access to UI
 * - Backend API verifies JWT and email before any operation
 * - All actions are logged to admin_audit_log table
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
  Badge,
} from '@mantine/core';
import {
  IconSettings,
  IconTemplate,
  IconBike,
  IconAlertCircle,
  IconShieldCheck,
  IconUsers,
  IconMessage,
  IconWebhook,
  IconLock,
  IconChartBar,
  IconMail,
  IconTrendingUp,
} from '@tabler/icons-react';
import AppShell from '../components/AppShell';
import { useAuth } from '../contexts/AuthContext';
import PlanTemplateManager from '../components/admin/PlanTemplateManager';
import WorkoutTemplateManager from '../components/admin/WorkoutTemplateManager';
import UserManagement from '../components/admin/UserManagement';
import FeedbackViewer from '../components/admin/FeedbackViewer';
import WebhookViewer from '../components/admin/WebhookViewer';
import ActivityDashboard from '../components/admin/ActivityDashboard';
import UserInsights from '../components/admin/UserInsights';
import EmailCampaigns from '../components/admin/EmailCampaigns';

// SECURITY: This is the ONLY email with admin access
// This is enforced both here (UI) and in the backend API
const ADMIN_EMAIL = 'travis@tribos.studio';

export default function Admin() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('users');

  // SECURITY: Strict email check - must match exactly
  // No dev mode bypass - admin access is always restricted
  const isAdmin = user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  if (!isAdmin) {
    return (
      <AppShell>
        <Container size="md" py="xl">
          <Alert
            icon={<IconLock size={24} />}
            title="Access Denied"
            color="red"
            variant="filled"
          >
            <Text>You don't have permission to access the admin panel.</Text>
            <Text size="sm" mt="xs">
              This area is restricted to authorized administrators only.
            </Text>
            {user?.email && (
              <Text size="xs" mt="md" opacity={0.7}>
                Signed in as: {user.email}
              </Text>
            )}
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
            <Group justify="space-between">
              <div>
                <Group spacing="xs">
                  <IconShieldCheck size={24} color="var(--mantine-color-green-6)" />
                  <Title order={2}>Admin Dashboard</Title>
                  <Badge color="green" variant="light" size="sm">
                    Secure
                  </Badge>
                </Group>
                <Text c="dimmed" size="sm" mt={4}>
                  Manage users, templates, and view system data
                </Text>
              </div>
              <Badge color="blue" variant="outline">
                {user.email}
              </Badge>
            </Group>
          </Paper>

          {/* Security Notice */}
          <Alert
            icon={<IconShieldCheck size={16} />}
            color="green"
            variant="light"
          >
            <Text size="sm">
              All admin actions are logged for security. Backend API independently verifies your authorization.
            </Text>
          </Alert>

          {/* Main Content */}
          <Tabs value={activeTab} onChange={setActiveTab}>
            <Tabs.List>
              <Tabs.Tab value="users" leftSection={<IconUsers size={16} />}>
                Users
              </Tabs.Tab>
              <Tabs.Tab value="activity" leftSection={<IconChartBar size={16} />}>
                Activity
              </Tabs.Tab>
              <Tabs.Tab value="insights" leftSection={<IconTrendingUp size={16} />}>
                Insights
              </Tabs.Tab>
              <Tabs.Tab value="email" leftSection={<IconMail size={16} />}>
                Email
              </Tabs.Tab>
              <Tabs.Tab value="feedback" leftSection={<IconMessage size={16} />}>
                Feedback
              </Tabs.Tab>
              <Tabs.Tab value="webhooks" leftSection={<IconWebhook size={16} />}>
                Webhooks
              </Tabs.Tab>
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

            <Tabs.Panel value="users" pt="lg">
              <UserManagement />
            </Tabs.Panel>

            <Tabs.Panel value="activity" pt="lg">
              <ActivityDashboard />
            </Tabs.Panel>

            <Tabs.Panel value="insights" pt="lg">
              <UserInsights />
            </Tabs.Panel>

            <Tabs.Panel value="email" pt="lg">
              <EmailCampaigns />
            </Tabs.Panel>

            <Tabs.Panel value="feedback" pt="lg">
              <FeedbackViewer />
            </Tabs.Panel>

            <Tabs.Panel value="webhooks" pt="lg">
              <WebhookViewer />
            </Tabs.Panel>

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
