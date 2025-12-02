import React from 'react';
import { Container, Title, Text, Stack, Paper, List, Anchor } from '@mantine/core';

const PrivacyPolicy = () => {
  return (
    <Container size="md" py="xl">
      <Paper p="xl" withBorder>
        <Stack gap="lg">
          <div>
            <Title order={1} mb="xs">Privacy Policy</Title>
            <Text c="dimmed" size="sm">Last Updated: {new Date().toLocaleDateString()}</Text>
          </div>

          <div>
            <Title order={2} size="h3" mb="sm">1. Introduction</Title>
            <Text>
              This Privacy Policy describes how we collect, use, and protect your personal information
              when you use our cycling route planning and analysis application.
            </Text>
          </div>

          <div>
            <Title order={2} size="h3" mb="sm">2. Information We Collect</Title>
            <Title order={3} size="h4" mt="md" mb="sm">2.1 Account Information</Title>
            <List>
              <List.Item>Email address (for authentication)</List.Item>
              <List.Item>Password (encrypted and securely stored)</List.Item>
              <List.Item>Profile information (name, preferences)</List.Item>
            </List>

            <Title order={3} size="h4" mt="md" mb="sm">2.2 Activity Data</Title>
            <List>
              <List.Item>GPS tracks from uploaded routes or imported activities</List.Item>
              <List.Item>Cycling metrics (distance, speed, elevation, heart rate, power)</List.Item>
              <List.Item>Activity dates and times</List.Item>
              <List.Item>Equipment and bike computer information</List.Item>
            </List>

            <Title order={3} size="h4" mt="md" mb="sm">2.3 Third-Party Integration Data</Title>
            <Text mt="sm">
              When you connect third-party services (Strava, Garmin Connect, Wahoo Fitness), we collect:
            </Text>
            <List>
              <List.Item>OAuth tokens (securely encrypted)</List.Item>
              <List.Item>Activity data from these services</List.Item>
              <List.Item>Athlete/user profile information</List.Item>
              <List.Item>Workout and training data</List.Item>
            </List>
          </div>

          <div>
            <Title order={2} size="h3" mb="sm">3. How We Use Your Information</Title>
            <List>
              <List.Item><strong>Route Planning:</strong> Generate personalized cycling routes based on your preferences and history</List.Item>
              <List.Item><strong>Analysis:</strong> Provide insights into your riding patterns and performance</List.Item>
              <List.Item><strong>Recommendations:</strong> Suggest routes and training plans tailored to your goals</List.Item>
              <List.Item><strong>Sync:</strong> Automatically import activities from connected devices and services</List.Item>
              <List.Item><strong>Service Improvement:</strong> Analyze aggregate data to improve our algorithms</List.Item>
            </List>

            <Title order={3} size="h4" mt="md" mb="sm">3.1 Garmin API Data Usage</Title>
            <Text mb="sm">
              When you connect your Garmin account, we use the Garmin Connect API to access and use your data specifically for:
            </Text>
            <List>
              <List.Item>Importing your cycling activities, workouts, and training data from Garmin Connect</List.Item>
              <List.Item>Analyzing your performance metrics (heart rate, power, cadence, speed, distance, elevation) to provide personalized route recommendations</List.Item>
              <List.Item>Understanding your training patterns and fitness level to suggest appropriate route difficulty and duration</List.Item>
              <List.Item>Synchronizing activity data to display your ride history and statistics within our application</List.Item>
              <List.Item>Generating data-driven insights based on your Garmin training data to improve route planning</List.Item>
              <List.Item>Creating training plans that align with your Garmin-recorded fitness trends</List.Item>
            </List>
            <Text mt="sm">
              All data retrieved from Garmin Connect API is stored securely, encrypted, and used solely for providing
              our cycling route planning and analysis services to you. We do not share your Garmin data with third parties
              except as required to provide our services (e.g., hosting infrastructure). You can disconnect your Garmin
              account at any time, which will immediately stop data synchronization and remove stored Garmin OAuth tokens.
            </Text>
          </div>

          <div>
            <Title order={2} size="h3" mb="sm">4. Data Storage and Security</Title>
            <Text mb="sm">
              We take data security seriously and implement industry-standard practices:
            </Text>
            <List>
              <List.Item>All data is stored on secure servers (Supabase) with encryption at rest</List.Item>
              <List.Item>Passwords are hashed using bcrypt</List.Item>
              <List.Item>OAuth tokens are encrypted and never exposed to the client</List.Item>
              <List.Item>HTTPS/TLS encryption for all data in transit</List.Item>
              <List.Item>Regular security audits and updates</List.Item>
              <List.Item>Row-level security (RLS) ensures users can only access their own data</List.Item>
            </List>
          </div>

          <div>
            <Title order={2} size="h3" mb="sm">5. Third-Party Services</Title>
            <Text mb="sm">
              We integrate with the following third-party services. Each has their own privacy policy:
            </Text>
            <List>
              <List.Item>
                <strong>Strava:</strong>{' '}
                <Anchor href="https://www.strava.com/legal/privacy" target="_blank">
                  Strava Privacy Policy
                </Anchor>
              </List.Item>
              <List.Item>
                <strong>Garmin Connect:</strong>{' '}
                <Anchor href="https://www.garmin.com/en-US/privacy/connect/" target="_blank">
                  Garmin Privacy Policy
                </Anchor>
              </List.Item>
              <List.Item>
                <strong>Wahoo Fitness:</strong>{' '}
                <Anchor href="https://www.wahoofitness.com/privacy-policy" target="_blank">
                  Wahoo Privacy Policy
                </Anchor>
              </List.Item>
              <List.Item>
                <strong>Mapbox:</strong>{' '}
                <Anchor href="https://www.mapbox.com/legal/privacy" target="_blank">
                  Mapbox Privacy Policy
                </Anchor>
              </List.Item>
            </List>
          </div>

          <div>
            <Title order={2} size="h3" mb="sm">6. Data Sharing</Title>
            <Text mb="sm">
              We do NOT sell your personal data. We may share data only in these limited circumstances:
            </Text>
            <List>
              <List.Item><strong>With your consent:</strong> When you explicitly authorize sharing</List.Item>
              <List.Item><strong>Service providers:</strong> Hosting, analytics (anonymized), and infrastructure partners</List.Item>
              <List.Item><strong>Legal requirements:</strong> When required by law or to protect rights and safety</List.Item>
            </List>
          </div>

          <div>
            <Title order={2} size="h3" mb="sm">7. Your Rights</Title>
            <Text mb="sm">You have the following rights regarding your data:</Text>
            <List>
              <List.Item><strong>Access:</strong> Request a copy of your data</List.Item>
              <List.Item><strong>Correction:</strong> Update inaccurate information</List.Item>
              <List.Item><strong>Deletion:</strong> Request deletion of your account and data</List.Item>
              <List.Item><strong>Export:</strong> Download your data in a portable format</List.Item>
              <List.Item><strong>Disconnect:</strong> Revoke third-party integrations at any time</List.Item>
              <List.Item><strong>Opt-out:</strong> Disable specific features or data collection</List.Item>
            </List>
          </div>

          <div>
            <Title order={2} size="h3" mb="sm">8. Data Retention</Title>
            <List>
              <List.Item>Account data: Retained while account is active</List.Item>
              <List.Item>Activity data: Retained until you delete it or close your account</List.Item>
              <List.Item>OAuth tokens: Automatically deleted when you disconnect a service</List.Item>
              <List.Item>Deleted data: Permanently removed within 30 days</List.Item>
            </List>
          </div>

          <div>
            <Title order={2} size="h3" mb="sm">9. Cookies and Tracking</Title>
            <Text>
              We use essential cookies for authentication and session management.
              We do not use tracking cookies or third-party advertising cookies.
            </Text>
          </div>

          <div>
            <Title order={2} size="h3" mb="sm">10. Children's Privacy</Title>
            <Text>
              Our service is not intended for children under 13. We do not knowingly collect
              information from children. If you believe a child has provided us with personal
              information, please contact us.
            </Text>
          </div>

          <div>
            <Title order={2} size="h3" mb="sm">11. International Users</Title>
            <Text>
              Your data may be processed in the United States or other countries where our
              service providers operate. We ensure appropriate safeguards are in place for
              international data transfers.
            </Text>
          </div>

          <div>
            <Title order={2} size="h3" mb="sm">12. Changes to This Policy</Title>
            <Text>
              We may update this Privacy Policy periodically. We will notify you of significant
              changes via email or in-app notification. Continued use of the service after
              changes constitutes acceptance.
            </Text>
          </div>

          <div>
            <Title order={2} size="h3" mb="sm">13. Contact Us</Title>
            <Text>
              For questions about this Privacy Policy or to exercise your rights, contact us at:
            </Text>
            <Text mt="sm">
              Email: <Anchor href="mailto:travis@tribos.studio">travis@tribos.studio</Anchor>
            </Text>
            <Text mt="xs">
              Administrator: <Anchor href="mailto:travis@tribos.studio">travis@tribos.studio</Anchor>
            </Text>
          </div>

          <div>
            <Title order={2} size="h3" mb="sm">14. GDPR Compliance (EU Users)</Title>
            <Text mb="sm">
              If you are in the European Economic Area (EEA), you have additional rights under GDPR:
            </Text>
            <List>
              <List.Item>Right to data portability</List.Item>
              <List.Item>Right to restrict processing</List.Item>
              <List.Item>Right to object to processing</List.Item>
              <List.Item>Right to lodge a complaint with a supervisory authority</List.Item>
            </List>
          </div>

          <div>
            <Title order={2} size="h3" mb="sm">15. California Privacy Rights (CCPA)</Title>
            <Text>
              California residents have the right to know what personal information is collected,
              request deletion, and opt-out of sale (we don't sell data). Contact us to exercise
              these rights.
            </Text>
          </div>
        </Stack>
      </Paper>
    </Container>
  );
};

export default PrivacyPolicy;
