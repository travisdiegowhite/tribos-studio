import { Link } from 'react-router-dom';
import { Container, Title, Text, Stack, Paper, List, Anchor, Group, Button, Box, Alert } from '@mantine/core';
import { IconArrowLeft, IconRoute, IconSparkles } from '@tabler/icons-react';
import { tokens } from '../theme';
import SEO from '../components/SEO';

export default function PrivacyPolicy() {
  return (
    <>
      <SEO
        title="Privacy Policy - tribos.studio"
        description="Learn how tribos.studio collects, uses, and protects your personal information and cycling data. Our commitment to privacy and data security."
        url="https://tribos.studio/privacy"
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
        <Box py="md" px={{ base: 'md', md: 'xl' }} style={{ borderBottom: '1px solid var(--tribos-border)' }}>
          <Group justify="space-between" align="center">
            <Group gap="sm">
              <IconRoute size={24} color="var(--tribos-terracotta-500)" />
              <Text
                component={Link}
                to="/"
                fw={700}
                size="lg"
                style={{
                  color: 'var(--tribos-terracotta-500)',
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
                  Privacy Policy
                </Title>
                <Text c="dimmed" size="sm">Last Updated: February 2026</Text>
              </div>

              <div>
                <Title order={2} size="h3" mb="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                  1. Introduction
                </Title>
                <Text style={{ color: 'var(--tribos-text-secondary)' }}>
                  This Privacy Policy describes how tribos.studio ("we", "us", "our") collects, uses, and protects
                  your personal information when you use our cycling training platform. We are committed to
                  transparency about our data practices, including our use of artificial intelligence and
                  third-party integrations like Garmin Connect.
                </Text>
              </div>

              <div>
                <Title order={2} size="h3" mb="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                  2. Information We Collect
                </Title>

                <Title order={3} size="h4" mt="md" mb="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                  2.1 Account Information
                </Title>
                <List style={{ color: 'var(--tribos-text-secondary)' }}>
                  <List.Item>Email address (for authentication)</List.Item>
                  <List.Item>Password (encrypted and securely stored via Supabase Auth)</List.Item>
                  <List.Item>Profile information (name, location, preferences)</List.Item>
                </List>

                <Title order={3} size="h4" mt="md" mb="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                  2.2 Activity Data
                </Title>
                <List style={{ color: 'var(--tribos-text-secondary)' }}>
                  <List.Item>GPS tracks from uploaded routes or imported activities</List.Item>
                  <List.Item>Cycling and running metrics (distance, speed, elevation, heart rate, power, cadence)</List.Item>
                  <List.Item>Activity dates, times, and duration</List.Item>
                  <List.Item>Equipment and bike computer information</List.Item>
                </List>

                <Title order={3} size="h4" mt="md" mb="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                  2.3 Third-Party Integration Data
                </Title>
                <Text mt="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
                  When you connect third-party services (Strava, Garmin Connect, Wahoo Fitness), we collect:
                </Text>
                <List style={{ color: 'var(--tribos-text-secondary)' }}>
                  <List.Item>OAuth tokens (securely encrypted, never exposed to your browser)</List.Item>
                  <List.Item>Activity data synced from these services</List.Item>
                  <List.Item>Athlete/user profile information from these services</List.Item>
                  <List.Item>Workout, training, and health metric data</List.Item>
                </List>
              </div>

              <div>
                <Title order={2} size="h3" mb="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                  3. How We Use Your Information
                </Title>
                <List style={{ color: 'var(--tribos-text-secondary)' }}>
                  <List.Item><strong>Route Planning:</strong> Generate personalized cycling routes based on your preferences and history</List.Item>
                  <List.Item><strong>Training Analysis:</strong> Provide insights into your riding patterns, performance, and fitness trends</List.Item>
                  <List.Item><strong>AI Coaching:</strong> Offer AI-powered training recommendations (with your explicit consent — see Section 4)</List.Item>
                  <List.Item><strong>Sync:</strong> Automatically import activities from connected devices and services</List.Item>
                  <List.Item><strong>Service Improvement:</strong> Analyze aggregate, anonymized data to improve our algorithms</List.Item>
                </List>

                <Title order={3} size="h4" mt="md" mb="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                  3.1 Garmin Connect Data Usage
                </Title>
                <Text mb="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
                  When you connect your Garmin account, we use the Garmin Connect API to access your data specifically for:
                </Text>
                <List style={{ color: 'var(--tribos-text-secondary)' }}>
                  <List.Item>Importing your cycling activities, workouts, and training data from Garmin Connect</List.Item>
                  <List.Item>Analyzing your performance metrics (heart rate, power, cadence, speed, distance, elevation) to provide personalized recommendations</List.Item>
                  <List.Item>Understanding your training patterns and fitness level to suggest appropriate training and routes</List.Item>
                  <List.Item>Synchronizing activity data to display your ride history and statistics</List.Item>
                  <List.Item>Creating training plans aligned with your Garmin-recorded fitness trends</List.Item>
                </List>
                <Text mt="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
                  All data retrieved from Garmin Connect is stored securely, encrypted, and used solely for providing
                  our services to you. We do not share your Garmin data with third parties except as required to provide
                  our services (e.g., hosting infrastructure). You can disconnect your Garmin account at any time,
                  which will immediately stop data synchronization and remove stored Garmin OAuth tokens.
                </Text>
                <Text mt="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
                  For more information about how Garmin handles your data, please review the{' '}
                  <Anchor href="https://www.garmin.com/privacy/connect" target="_blank" style={{ color: 'var(--tribos-terracotta-500)' }}>
                    Garmin Connect Privacy Notice
                  </Anchor>.
                </Text>
              </div>

              {/* AI TRANSPARENCY SECTION - Conspicuous per Garmin Agreement Section 15.10 */}
              <Alert
                icon={<IconSparkles size={20} />}
                title="AI-Powered Features and Data Processing"
                color="terracotta"
                variant="light"
                radius="md"
              >
                <Text size="sm" fw={500} mb="xs">
                  tribos.studio uses artificial intelligence to provide coaching, training analysis, and route generation features.
                  This section explains how AI processes your data.
                </Text>
              </Alert>

              <div id="ai">
                <Title order={2} size="h3" mb="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                  4. AI-Powered Features and Data Processing
                </Title>

                <Title order={3} size="h4" mt="md" mb="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                  4.1 How We Use AI
                </Title>
                <Text mb="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
                  tribos.studio uses AI technology powered by Anthropic's Claude to provide several features:
                </Text>
                <List style={{ color: 'var(--tribos-text-secondary)' }}>
                  <List.Item><strong>AI Coach:</strong> Provides personalized training advice and answers cycling-related questions based on your training data, activity history, and fitness profile</List.Item>
                  <List.Item><strong>Route Generation:</strong> Creates cycling routes based on your preferences, location, and fitness level</List.Item>
                  <List.Item><strong>Training Insights:</strong> Analyzes your activity patterns to generate proactive coaching recommendations</List.Item>
                  <List.Item><strong>Training Plan Generation:</strong> Creates personalized training plans based on your goals and current fitness</List.Item>
                  <List.Item><strong>Fueling Guidance:</strong> Provides nutrition recommendations for rides based on duration and intensity</List.Item>
                </List>

                <Title order={3} size="h4" mt="md" mb="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                  4.2 What Data AI Processes
                </Title>
                <Text mb="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
                  When you use AI-powered features, the following data may be sent to Anthropic's API for processing:
                </Text>
                <List style={{ color: 'var(--tribos-text-secondary)' }}>
                  <List.Item>Your recent activity summaries (distance, duration, intensity metrics)</List.Item>
                  <List.Item>Your fitness profile (FTP, weight, fitness level, training goals)</List.Item>
                  <List.Item>Your conversation history with the AI coach</List.Item>
                  <List.Item>Your training plan details and compliance data</List.Item>
                  <List.Item>Route preferences and location context</List.Item>
                </List>
                <Text mt="sm" fw={500} style={{ color: 'var(--tribos-text-secondary)' }}>
                  Important: Raw GPS coordinates, your exact home location, and personally identifiable
                  information (email, full name) are NOT sent to the AI. Data sent to Anthropic is processed
                  in accordance with Anthropic's data usage policies and is not used to train AI models.
                </Text>

                <Title order={3} size="h4" mt="md" mb="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                  4.3 AI Consent
                </Title>
                <Text style={{ color: 'var(--tribos-text-secondary)' }}>
                  AI-powered features require your explicit opt-in consent before any data is processed by AI systems.
                  You will be prompted for consent the first time you use an AI feature. You can grant or withdraw
                  AI consent at any time from Settings. Withdrawing consent will immediately stop all AI processing
                  of your data — the AI Coach, AI-generated route suggestions, and proactive training insights will
                  be disabled. Your existing data, activity history, and all non-AI features will remain unaffected.
                </Text>
              </div>

              <div>
                <Title order={2} size="h3" mb="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                  5. Garmin Data Transfer and Processing
                </Title>
                <Text mb="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
                  When you connect your Garmin Connect account, you consent to the following data transfers:
                </Text>
                <List style={{ color: 'var(--tribos-text-secondary)' }}>
                  <List.Item>Your Garmin activity data (rides, workouts, health metrics) is transferred from Garmin Connect to our servers via the Garmin Connect API</List.Item>
                  <List.Item>tribos.studio may send data back to Garmin Connect (e.g., routes exported to your Garmin device)</List.Item>
                  <List.Item>This data is stored in encrypted form on Supabase-hosted PostgreSQL databases</List.Item>
                  <List.Item>Your Garmin OAuth tokens are encrypted at rest and never exposed to client-side code</List.Item>
                  <List.Item>We access only the data scopes you authorize during the Garmin OAuth flow</List.Item>
                </List>
                <Text mt="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
                  You must not upload or transmit data to or from Garmin Connect if you are restricted from doing so
                  by any applicable law or regulation.
                </Text>
                <Text mt="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
                  <strong>Legal basis:</strong> Your explicit consent provided when connecting your Garmin account.
                  You may withdraw consent at any time by disconnecting your Garmin account in Settings, which will
                  immediately stop data synchronization and delete stored Garmin OAuth tokens.
                </Text>
                <Text mt="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
                  For details on how Garmin processes your data, see the{' '}
                  <Anchor href="https://www.garmin.com/privacy/connect" target="_blank" style={{ color: 'var(--tribos-terracotta-500)' }}>
                    Garmin Connect Privacy Notice
                  </Anchor>.
                </Text>
              </div>

              <div>
                <Title order={2} size="h3" mb="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                  6. Data Storage and Security
                </Title>
                <Text mb="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
                  We take data security seriously and implement industry-standard practices:
                </Text>
                <List style={{ color: 'var(--tribos-text-secondary)' }}>
                  <List.Item>All data is stored on secure servers (Supabase) with encryption at rest</List.Item>
                  <List.Item>Passwords are hashed using bcrypt via Supabase Auth</List.Item>
                  <List.Item>OAuth tokens are encrypted and never exposed to the client</List.Item>
                  <List.Item>HTTPS/TLS encryption for all data in transit</List.Item>
                  <List.Item>Row-level security (RLS) ensures users can only access their own data</List.Item>
                  <List.Item>API rate limiting to prevent abuse</List.Item>
                </List>
              </div>

              <div>
                <Title order={2} size="h3" mb="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                  7. Third-Party Services
                </Title>
                <Text mb="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
                  We integrate with the following third-party services. Each has their own privacy policy:
                </Text>
                <List style={{ color: 'var(--tribos-text-secondary)' }}>
                  <List.Item>
                    <strong>Garmin Connect:</strong>{' '}
                    <Anchor href="https://www.garmin.com/privacy/connect" target="_blank" style={{ color: 'var(--tribos-terracotta-500)' }}>
                      Garmin Connect Privacy Notice
                    </Anchor>
                    {' '}&mdash; Activity sync and device data
                  </List.Item>
                  <List.Item>
                    <strong>Strava:</strong>{' '}
                    <Anchor href="https://www.strava.com/legal/privacy" target="_blank" style={{ color: 'var(--tribos-terracotta-500)' }}>
                      Strava Privacy Policy
                    </Anchor>
                    {' '}&mdash; Activity sync
                  </List.Item>
                  <List.Item>
                    <strong>Wahoo Fitness:</strong>{' '}
                    <Anchor href="https://www.wahoofitness.com/privacy-policy" target="_blank" style={{ color: 'var(--tribos-terracotta-500)' }}>
                      Wahoo Privacy Policy
                    </Anchor>
                    {' '}&mdash; Activity sync
                  </List.Item>
                  <List.Item>
                    <strong>Anthropic (Claude AI):</strong>{' '}
                    <Anchor href="https://www.anthropic.com/privacy" target="_blank" style={{ color: 'var(--tribos-terracotta-500)' }}>
                      Anthropic Privacy Policy
                    </Anchor>
                    {' '}&mdash; AI-powered coaching, route generation, and training insights
                  </List.Item>
                  <List.Item>
                    <strong>Mapbox:</strong>{' '}
                    <Anchor href="https://www.mapbox.com/legal/privacy" target="_blank" style={{ color: 'var(--tribos-terracotta-500)' }}>
                      Mapbox Privacy Policy
                    </Anchor>
                    {' '}&mdash; Maps and geocoding
                  </List.Item>
                  <List.Item>
                    <strong>Supabase:</strong>{' '}
                    <Anchor href="https://supabase.com/privacy" target="_blank" style={{ color: 'var(--tribos-terracotta-500)' }}>
                      Supabase Privacy Policy
                    </Anchor>
                    {' '}&mdash; Database, authentication, and hosting
                  </List.Item>
                  <List.Item>
                    <strong>Vercel:</strong>{' '}
                    <Anchor href="https://vercel.com/legal/privacy-policy" target="_blank" style={{ color: 'var(--tribos-terracotta-500)' }}>
                      Vercel Privacy Policy
                    </Anchor>
                    {' '}&mdash; Application hosting and serverless functions
                  </List.Item>
                  <List.Item>
                    <strong>Sentry:</strong>{' '}
                    <Anchor href="https://sentry.io/privacy/" target="_blank" style={{ color: 'var(--tribos-terracotta-500)' }}>
                      Sentry Privacy Policy
                    </Anchor>
                    {' '}&mdash; Error monitoring and crash reporting
                  </List.Item>
                  <List.Item>
                    <strong>PostHog:</strong>{' '}
                    <Anchor href="https://posthog.com/privacy" target="_blank" style={{ color: 'var(--tribos-terracotta-500)' }}>
                      PostHog Privacy Policy
                    </Anchor>
                    {' '}&mdash; Product analytics (anonymized)
                  </List.Item>
                </List>
              </div>

              <div>
                <Title order={2} size="h3" mb="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                  8. Data Sharing
                </Title>
                <Text mb="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
                  We do NOT sell your personal data. We may share data only in these limited circumstances:
                </Text>
                <List style={{ color: 'var(--tribos-text-secondary)' }}>
                  <List.Item><strong>With your consent:</strong> When you explicitly authorize sharing (e.g., connecting Garmin Connect or Strava)</List.Item>
                  <List.Item><strong>Service providers:</strong> Infrastructure partners necessary to provide the service (hosting, database, error monitoring)</List.Item>
                  <List.Item><strong>AI processing:</strong> Activity summaries sent to Anthropic's API when you consent to AI features (see Section 4)</List.Item>
                  <List.Item><strong>Legal requirements:</strong> When required by law or to protect rights and safety</List.Item>
                </List>
              </div>

              <div>
                <Title order={2} size="h3" mb="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                  9. Your Rights
                </Title>
                <Text mb="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
                  You have the following rights regarding your data:
                </Text>
                <List style={{ color: 'var(--tribos-text-secondary)' }}>
                  <List.Item><strong>Access:</strong> Request a copy of your data (available via "Export My Data" in Settings)</List.Item>
                  <List.Item><strong>Rectification:</strong> Update or correct inaccurate information in your profile</List.Item>
                  <List.Item><strong>Erasure:</strong> Request deletion of your account and all associated data (available in Settings)</List.Item>
                  <List.Item><strong>Data Portability:</strong> Download your data in a portable JSON format</List.Item>
                  <List.Item><strong>Restriction:</strong> Request restriction of processing of your data</List.Item>
                  <List.Item><strong>Objection:</strong> Object to processing based on legitimate interest</List.Item>
                  <List.Item><strong>Disconnect:</strong> Revoke third-party integrations at any time</List.Item>
                  <List.Item><strong>AI Opt-out:</strong> Disable AI processing of your data at any time in Settings</List.Item>
                </List>
              </div>

              <div>
                <Title order={2} size="h3" mb="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                  10. Data Retention
                </Title>
                <List style={{ color: 'var(--tribos-text-secondary)' }}>
                  <List.Item>Account data: Retained while your account is active</List.Item>
                  <List.Item>Activity data: Retained until you delete it or close your account</List.Item>
                  <List.Item>AI conversation history: Retained while your account is active; deleted on account deletion</List.Item>
                  <List.Item>OAuth tokens: Automatically deleted when you disconnect a service</List.Item>
                  <List.Item>Deleted data: Permanently removed within 30 days of deletion request</List.Item>
                </List>
              </div>

              <div>
                <Title order={2} size="h3" mb="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                  11. Cookies and Tracking
                </Title>
                <Text mb="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
                  We use essential cookies for authentication and session management.
                  We do not use tracking cookies or third-party advertising cookies.
                </Text>

                <Title order={3} size="h4" mt="md" mb="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                  11.1 Usage Analytics
                </Title>
                <Text mb="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
                  For logged-in users, we collect usage data to improve our service, including pages visited,
                  features used, sync events, and file uploads. This data is stored securely in our database,
                  associated with your user account, and is{' '}
                  <strong>never shared with or sold to third parties</strong>.
                </Text>
              </div>

              <div>
                <Title order={2} size="h3" mb="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                  12. Children's Privacy
                </Title>
                <Text style={{ color: 'var(--tribos-text-secondary)' }}>
                  Our service is not intended for children under 13 (or 16 in the EEA). We do not knowingly
                  collect information from children. If you believe a child has provided us with personal
                  information, please contact us immediately.
                </Text>
              </div>

              <div>
                <Title order={2} size="h3" mb="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                  13. International Data Transfers
                </Title>
                <Text style={{ color: 'var(--tribos-text-secondary)' }}>
                  Your data may be processed in the United States or other countries where our
                  service providers operate. We ensure appropriate safeguards are in place for
                  international data transfers in compliance with applicable data protection laws.
                </Text>
              </div>

              <div>
                <Title order={2} size="h3" mb="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                  14. GDPR Compliance (EU Users)
                </Title>
                <Text mb="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
                  If you are in the European Economic Area (EEA), you have additional rights under the
                  General Data Protection Regulation (GDPR), including those listed in Section 9 above.
                </Text>

                <Title order={3} size="h4" mt="md" mb="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                  14.1 Legal Basis for Processing
                </Title>
                <List style={{ color: 'var(--tribos-text-secondary)' }}>
                  <List.Item><strong>Consent:</strong> Connecting third-party services (Garmin, Strava, Wahoo), using AI-powered features, analytics</List.Item>
                  <List.Item><strong>Contract performance:</strong> Providing the core service (route planning, training tracking, activity storage)</List.Item>
                  <List.Item><strong>Legitimate interest:</strong> Service improvement, security monitoring, fraud prevention</List.Item>
                </List>
              </div>

              <div>
                <Title order={2} size="h3" mb="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                  15. California Privacy Rights (CCPA)
                </Title>
                <Text style={{ color: 'var(--tribos-text-secondary)' }}>
                  California residents have the right to know what personal information is collected,
                  request deletion, and opt-out of the sale of personal information. We do not sell
                  personal data. Contact us to exercise these rights.
                </Text>
              </div>

              <div>
                <Title order={2} size="h3" mb="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                  16. Changes to This Policy
                </Title>
                <Text style={{ color: 'var(--tribos-text-secondary)' }}>
                  We may update this Privacy Policy periodically. We will notify you of significant
                  changes via email or in-app notification. Continued use of the service after
                  changes constitutes acceptance of the updated policy.
                </Text>
              </div>

              <div>
                <Title order={2} size="h3" mb="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                  17. Contact Us
                </Title>
                <Text style={{ color: 'var(--tribos-text-secondary)' }}>
                  For questions about this Privacy Policy, to exercise your data rights, or to report
                  a privacy concern, contact us at:
                </Text>
                <Text mt="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
                  Email:{' '}
                  <Anchor href="mailto:travis@tribos.studio" style={{ color: 'var(--tribos-terracotta-500)' }}>
                    travis@tribos.studio
                  </Anchor>
                </Text>
              </div>

              <Text size="sm" c="dimmed" mt="xl" style={{ borderTop: '1px solid var(--tribos-border)', paddingTop: tokens.spacing.md }}>
                By using tribos.studio, you acknowledge that you have read and understood this Privacy Policy.
              </Text>
            </Stack>
          </Paper>
        </Container>
      </Box>
    </>
  );
}
