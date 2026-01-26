import { Link } from 'react-router-dom';
import { Container, Title, Text, Stack, Paper, List, Anchor, Group, Button, Box } from '@mantine/core';
import { IconArrowLeft, IconRoute } from '@tabler/icons-react';
import { tokens } from '../theme';
import SEO from '../components/SEO';

function Terms() {
  return (
    <>
      <SEO
        title="Terms of Service - tribos.studio"
        description="Read the terms of service for tribos.studio, including user responsibilities, account usage, and service guidelines for our cycling training platform."
        url="https://tribos.studio/terms"
        image="https://tribos.studio/og-image.svg"
        type="article"
      />
      <Box
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--tribos-bg-primary)',
      }}
    >
      {/* Header */}
      <Box py="md" px={{ base: 'md', md: 'xl' }} style={{ borderBottom: `1px solid ${'var(--tribos-border)'}` }}>
        <Group justify="space-between" align="center">
          <Group gap="sm">
            <IconRoute size={24} color={'var(--tribos-lime)'} />
            <Text
              component={Link}
              to="/"
              fw={700}
              size="lg"
              style={{
                color: 'var(--tribos-lime)',
                letterSpacing: '-0.02em',
                textDecoration: 'none',
              }}
            >
              tribos.studio
            </Text>
          </Group>
          <Button
            component={Link}
            to="/"
            variant="subtle"
            color="gray"
            leftSection={<IconArrowLeft size={16} />}
          >
            Back
          </Button>
        </Group>
      </Box>

      <Container size="md" py="xl">
        <Paper p="xl" radius="md" style={{ backgroundColor: 'var(--tribos-bg-secondary)' }}>
          <Stack gap="lg">
            <div>
              <Title order={1} mb="xs" style={{ color: 'var(--tribos-text-primary)' }}>
                Terms of Service
              </Title>
              <Text c="dimmed" size="sm">Last Updated: December 2025</Text>
            </div>

            <div>
              <Title order={2} size="h3" mb="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                1. Acceptance of Terms
              </Title>
              <Text style={{ color: 'var(--tribos-text-secondary)' }}>
                By accessing or using tribos.studio ("Service"), you agree to be bound by these
                Terms of Service. If you do not agree to these terms, please do not use the Service.
              </Text>
            </div>

            <div>
              <Title order={2} size="h3" mb="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                2. Beta Program
              </Title>
              <Text style={{ color: 'var(--tribos-text-secondary)' }} mb="sm">
                You are participating in a beta version of tribos.studio. This means:
              </Text>
              <List style={{ color: 'var(--tribos-text-secondary)' }}>
                <List.Item>The Service is under active development and may change</List.Item>
                <List.Item>Features may be added, modified, or removed without notice</List.Item>
                <List.Item>You may encounter bugs or unexpected behavior</List.Item>
                <List.Item>Your feedback helps shape the product</List.Item>
              </List>
            </div>

            <div>
              <Title order={2} size="h3" mb="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                3. Description of Service
              </Title>
              <Text style={{ color: 'var(--tribos-text-secondary)' }} mb="sm">
                tribos.studio provides:
              </Text>
              <List style={{ color: 'var(--tribos-text-secondary)' }}>
                <List.Item>Intelligent cycling route generation and planning</List.Item>
                <List.Item>Activity tracking and performance analysis</List.Item>
                <List.Item>Integration with third-party cycling platforms (Strava, Garmin, Wahoo)</List.Item>
                <List.Item>Training load and recovery tracking</List.Item>
                <List.Item>AI-powered training insights and recommendations</List.Item>
              </List>
            </div>

            <div>
              <Title order={2} size="h3" mb="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                4. User Accounts
              </Title>
              <List style={{ color: 'var(--tribos-text-secondary)' }}>
                <List.Item>You must provide accurate and complete information</List.Item>
                <List.Item>You must be at least 13 years old to use this Service</List.Item>
                <List.Item>You are responsible for maintaining account security</List.Item>
                <List.Item>One account per person</List.Item>
              </List>
            </div>

            <div>
              <Title order={2} size="h3" mb="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                5. Acceptable Use
              </Title>
              <Text style={{ color: 'var(--tribos-text-secondary)' }} mb="sm">
                You agree NOT to:
              </Text>
              <List style={{ color: 'var(--tribos-text-secondary)' }}>
                <List.Item>Violate any laws or regulations</List.Item>
                <List.Item>Upload malicious code or viruses</List.Item>
                <List.Item>Attempt to gain unauthorized access to the Service</List.Item>
                <List.Item>Harass, abuse, or harm other users</List.Item>
                <List.Item>Share your account credentials</List.Item>
                <List.Item>Scrape, spider, or crawl the Service</List.Item>
              </List>
            </div>

            <div>
              <Title order={2} size="h3" mb="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                6. User Content
              </Title>
              <Text style={{ color: 'var(--tribos-text-secondary)' }}>
                You retain ownership of routes, activities, and data you upload. By uploading
                content, you grant us a license to store, process, and display it as necessary
                to provide the Service.
              </Text>
            </div>

            <div>
              <Title order={2} size="h3" mb="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                7. Third-Party Integrations
              </Title>
              <Text style={{ color: 'var(--tribos-text-secondary)' }} mb="sm">
                When connecting third-party services (Strava, Garmin, Wahoo), you agree to:
              </Text>
              <List style={{ color: 'var(--tribos-text-secondary)' }}>
                <List.Item>Comply with their respective terms of service</List.Item>
                <List.Item>Grant us permission to access your data from these services</List.Item>
                <List.Item>Understand that we are not responsible for their availability</List.Item>
              </List>
              <Text style={{ color: 'var(--tribos-text-secondary)' }} mt="sm">
                You can revoke these integrations at any time through your settings.
              </Text>
            </div>

            <div>
              <Title order={2} size="h3" mb="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                8. Safety Warning
              </Title>
              <Text style={{ color: 'var(--tribos-text-secondary)' }} mb="sm">
                <strong>IMPORTANT:</strong> Cycling involves inherent risks. Routes generated by our
                Service are suggestions only. You are responsible for:
              </Text>
              <List style={{ color: 'var(--tribos-text-secondary)' }}>
                <List.Item>Assessing road conditions, traffic, and weather</List.Item>
                <List.Item>Following traffic laws and regulations</List.Item>
                <List.Item>Using appropriate safety equipment (helmet, lights, etc.)</List.Item>
                <List.Item>Riding within your skill and fitness level</List.Item>
                <List.Item>Bringing appropriate supplies (water, nutrition, repair kit)</List.Item>
              </List>
            </div>

            <div>
              <Title order={2} size="h3" mb="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                9. Disclaimers
              </Title>
              <Text style={{ color: 'var(--tribos-text-secondary)' }} mb="sm">
                The Service is provided "AS IS" and "AS AVAILABLE" without warranties of any kind,
                including but not limited to:
              </Text>
              <List style={{ color: 'var(--tribos-text-secondary)' }}>
                <List.Item>Accuracy of routes, maps, or elevation data</List.Item>
                <List.Item>Availability or uptime of the Service</List.Item>
                <List.Item>Compatibility with all devices or browsers</List.Item>
                <List.Item>Error-free operation</List.Item>
              </List>
            </div>

            <div>
              <Title order={2} size="h3" mb="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                10. Limitation of Liability
              </Title>
              <Text style={{ color: 'var(--tribos-text-secondary)' }} mb="sm">
                To the maximum extent permitted by law, we are NOT liable for:
              </Text>
              <List style={{ color: 'var(--tribos-text-secondary)' }}>
                <List.Item>Personal injury, death, or property damage from using generated routes</List.Item>
                <List.Item>Indirect, incidental, or consequential damages</List.Item>
                <List.Item>Loss of data, profits, or business opportunities</List.Item>
                <List.Item>Acts or omissions of third-party services</List.Item>
              </List>
            </div>

            <div>
              <Title order={2} size="h3" mb="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                11. Privacy
              </Title>
              <Text style={{ color: 'var(--tribos-text-secondary)' }}>
                Your use of the Service is also governed by our{' '}
                <Anchor component={Link} to="/privacy" style={{ color: 'var(--tribos-lime)' }}>
                  Privacy Policy
                </Anchor>.
                We handle your data responsibly and in compliance with applicable laws.
              </Text>
            </div>

            <div>
              <Title order={2} size="h3" mb="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                12. Changes to Terms
              </Title>
              <Text style={{ color: 'var(--tribos-text-secondary)' }}>
                We reserve the right to modify these terms at any time. We will notify users of
                significant changes. Continued use of the Service after changes constitutes
                acceptance of the new terms.
              </Text>
            </div>

            <div>
              <Title order={2} size="h3" mb="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                13. Contact
              </Title>
              <Text style={{ color: 'var(--tribos-text-secondary)' }}>
                For questions about these Terms of Service, contact us at:{' '}
                <Anchor href="mailto:travis@tribos.studio" style={{ color: 'var(--tribos-lime)' }}>
                  travis@tribos.studio
                </Anchor>
              </Text>
            </div>

            <Text size="sm" c="dimmed" mt="xl" style={{ borderTop: `1px solid ${'var(--tribos-border)'}`, paddingTop: tokens.spacing.md }}>
              By using tribos.studio, you acknowledge that you have read, understood, and agree
              to be bound by these Terms of Service.
            </Text>
          </Stack>
        </Paper>
      </Container>
    </Box>
    </>
  );
}

export default Terms;
