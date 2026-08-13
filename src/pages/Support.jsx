import { Link } from 'react-router-dom';
import { Container, Title, Text, Stack, Paper, List, Anchor, Group, Button, Box } from '@mantine/core';
import { tokens } from '../theme';
import SEO from '../components/SEO';
import { ArrowLeft, Path } from '@phosphor-icons/react';

function Support() {
  return (
    <>
      <SEO
        title="Support - tribos.studio"
        description="Get help with tribos.studio — account access, device and platform integrations (Strava, Garmin, Wahoo, COROS), and technical support."
        url="https://tribos.studio/support"
        image="https://tribos.studio/og-image.svg"
        type="article"
      />
      <Box
        style={{
          minHeight: '100vh',
          backgroundColor: 'var(--color-bg)',
        }}
      >
        {/* Header */}
        <Box py="md" px={{ base: 'md', md: 'xl' }} style={{ borderBottom: `1px solid ${'var(--tribos-border)'}` }}>
          <Group justify="space-between" align="center">
            <Group gap="sm">
              <Path size={24} color={'var(--color-teal)'} />
              <Text
                component={Link}
                to="/welcome"
                fw={700}
                size="lg"
                style={{
                  color: 'var(--color-teal)',
                  letterSpacing: '-0.02em',
                  textDecoration: 'none',
                }}
              >
                tribos.studio
              </Text>
            </Group>
            <Button
              component={Link}
              to="/welcome"
              variant="subtle"
              color="gray"
              leftSection={<ArrowLeft size={16} />}
            >
              Back
            </Button>
          </Group>
        </Box>

        <Container size="md" py="xl">
          <Paper p="xl" radius="md" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
            <Stack gap="lg">
              <div>
                <Title order={1} mb="xs" style={{ color: 'var(--color-text-primary)' }}>
                  Support
                </Title>
                <Text c="dimmed" size="sm">
                  Help with your account, integrations, and technical issues
                </Text>
              </div>

              <div>
                <Title order={2} size="h3" mb="sm" style={{ color: 'var(--color-text-primary)' }}>
                  Contact Us
                </Title>
                <Text style={{ color: 'var(--color-text-secondary)' }}>
                  For any question — account access, billing, data, bugs, or general help — email
                  us at{' '}
                  <Anchor href="mailto:travis@tribos.studio" style={{ color: 'var(--color-teal)' }}>
                    travis@tribos.studio
                  </Anchor>
                  . We aim to respond within 1–2 business days.
                </Text>
              </div>

              <div>
                <Title order={2} size="h3" mb="sm" style={{ color: 'var(--color-text-primary)' }}>
                  Signing In
                </Title>
                <Text style={{ color: 'var(--color-text-secondary)' }}>
                  Sign in or create an account at the{' '}
                  <Anchor component={Link} to="/auth" style={{ color: 'var(--color-teal)' }}>
                    login page
                  </Anchor>
                  . We support email + password and Google sign-in. If you signed up with email,
                  check your inbox for a confirmation link before your first login. Forgot your
                  password? Use the reset link on the login page.
                </Text>
              </div>

              <div>
                <Title order={2} size="h3" mb="sm" style={{ color: 'var(--color-text-primary)' }}>
                  Device &amp; Platform Integrations
                </Title>
                <Text style={{ color: 'var(--color-text-secondary)' }} mb="sm">
                  tribos.studio syncs activities from Strava, Garmin, Wahoo, and COROS. To connect
                  or disconnect an integration:
                </Text>
                <List style={{ color: 'var(--color-text-secondary)' }}>
                  <List.Item>
                    Go to{' '}
                    <Anchor component={Link} to="/settings" style={{ color: 'var(--color-teal)' }}>
                      Settings
                    </Anchor>{' '}
                    and find the Integrations section
                  </List.Item>
                  <List.Item>
                    Click <strong>Connect</strong> next to the platform and authorize access on the
                    provider&apos;s site
                  </List.Item>
                  <List.Item>
                    New activities sync automatically after each workout; recent history is imported
                    when you first connect
                  </List.Item>
                  <List.Item>
                    Click <strong>Disconnect</strong> at any time to revoke access — you can also
                    revoke authorization from the provider&apos;s own account settings
                  </List.Item>
                </List>
                <Text style={{ color: 'var(--color-text-secondary)' }} mt="sm">
                  If activities stop syncing, disconnecting and reconnecting the integration
                  resolves most issues. If that doesn&apos;t help, email us with the platform name and
                  the approximate date of the missing activity.
                </Text>
              </div>

              <div>
                <Title order={2} size="h3" mb="sm" style={{ color: 'var(--color-text-primary)' }}>
                  Your Data
                </Title>
                <Text style={{ color: 'var(--color-text-secondary)' }}>
                  How we handle your data is described in our{' '}
                  <Anchor component={Link} to="/privacy" style={{ color: 'var(--color-teal)' }}>
                    Privacy Policy
                  </Anchor>
                  . You can delete your account and its data at any time from Settings, or email us
                  and we&apos;ll take care of it.
                </Text>
              </div>

              <Text
                size="sm"
                c="dimmed"
                mt="xl"
                style={{ borderTop: `1px solid ${'var(--tribos-border)'}`, paddingTop: tokens.spacing.md }}
              >
                See also our{' '}
                <Anchor component={Link} to="/terms" style={{ color: 'var(--color-teal)' }}>
                  Terms of Service
                </Anchor>{' '}
                and{' '}
                <Anchor component={Link} to="/privacy" style={{ color: 'var(--color-teal)' }}>
                  Privacy Policy
                </Anchor>
                .
              </Text>
            </Stack>
          </Paper>
        </Container>
      </Box>
    </>
  );
}

export default Support;
