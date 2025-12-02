import React from 'react';
import { Container, Title, Text, Stack, Paper, List, Anchor } from '@mantine/core';

const TermsOfService = () => {
  return (
    <Container size="md" py="xl">
      <Paper p="xl" withBorder>
        <Stack gap="lg">
          <div>
            <Title order={1} mb="xs">Terms of Service</Title>
            <Text c="dimmed" size="sm">Last Updated: {new Date().toLocaleDateString()}</Text>
          </div>

          <div>
            <Title order={2} size="h3" mb="sm">1. Acceptance of Terms</Title>
            <Text>
              By accessing or using this cycling route planning and analysis application ("Service"),
              you agree to be bound by these Terms of Service. If you do not agree to these terms,
              please do not use the Service.
            </Text>
          </div>

          <div>
            <Title order={2} size="h3" mb="sm">2. Description of Service</Title>
            <Text>
              Our Service provides:
            </Text>
            <List>
              <List.Item>Intelligent cycling route generation and planning</List.Item>
              <List.Item>Activity tracking and performance analysis</List.Item>
              <List.Item>Integration with third-party cycling platforms (Strava, Garmin, Wahoo)</List.Item>
              <List.Item>Route mapping and GPS navigation</List.Item>
              <List.Item>Training insights and recommendations</List.Item>
            </List>
          </div>

          <div>
            <Title order={2} size="h3" mb="sm">3. User Accounts</Title>
            <Title order={3} size="h4" mt="md" mb="sm">3.1 Account Creation</Title>
            <List>
              <List.Item>You must provide accurate and complete information</List.Item>
              <List.Item>You must be at least 13 years old to use this Service</List.Item>
              <List.Item>You are responsible for maintaining account security</List.Item>
              <List.Item>One account per person</List.Item>
            </List>

            <Title order={3} size="h4" mt="md" mb="sm">3.2 Account Termination</Title>
            <Text>
              We reserve the right to suspend or terminate accounts that violate these terms
              or for any other reason at our discretion.
            </Text>
          </div>

          <div>
            <Title order={2} size="h3" mb="sm">4. Acceptable Use</Title>
            <Text mb="sm">You agree NOT to:</Text>
            <List>
              <List.Item>Violate any laws or regulations</List.Item>
              <List.Item>Upload malicious code or viruses</List.Item>
              <List.Item>Attempt to gain unauthorized access to the Service</List.Item>
              <List.Item>Harass, abuse, or harm other users</List.Item>
              <List.Item>Use the Service for commercial purposes without authorization</List.Item>
              <List.Item>Scrape, spider, or crawl the Service</List.Item>
              <List.Item>Reverse engineer or decompile any part of the Service</List.Item>
              <List.Item>Share your account credentials</List.Item>
            </List>
          </div>

          <div>
            <Title order={2} size="h3" mb="sm">5. User Content</Title>
            <Title order={3} size="h4" mt="md" mb="sm">5.1 Your Content</Title>
            <Text>
              You retain ownership of routes, activities, and data you upload. By uploading
              content, you grant us a license to store, process, and display it as necessary
              to provide the Service.
            </Text>

            <Title order={3} size="h4" mt="md" mb="sm">5.2 Content Standards</Title>
            <List>
              <List.Item>Do not upload copyrighted material without permission</List.Item>
              <List.Item>Do not share private or sensitive locations</List.Item>
              <List.Item>Be respectful in any community features</List.Item>
            </List>
          </div>

          <div>
            <Title order={2} size="h3" mb="sm">6. Third-Party Integrations</Title>
            <Text mb="sm">
              When connecting third-party services (Strava, Garmin, Wahoo), you agree to:
            </Text>
            <List>
              <List.Item>Comply with their respective terms of service</List.Item>
              <List.Item>Grant us permission to access your data from these services</List.Item>
              <List.Item>Understand that we are not responsible for their availability or accuracy</List.Item>
            </List>
            <Text mt="sm">
              You can revoke these integrations at any time through your settings.
            </Text>
          </div>

          <div>
            <Title order={2} size="h3" mb="sm">7. Intellectual Property</Title>
            <Text mb="sm">
              The Service, including its design, code, algorithms, and branding, is protected by
              copyright and other intellectual property laws. You may not:
            </Text>
            <List>
              <List.Item>Copy, modify, or distribute our code or content</List.Item>
              <List.Item>Use our trademarks without permission</List.Item>
              <List.Item>Create derivative works</List.Item>
            </List>
          </div>

          <div>
            <Title order={2} size="h3" mb="sm">8. Privacy and Data</Title>
            <Text>
              Your use of the Service is also governed by our{' '}
              <Anchor href="/privacy-policy">Privacy Policy</Anchor>.
              We handle your data responsibly and in compliance with applicable laws.
            </Text>
          </div>

          <div>
            <Title order={2} size="h3" mb="sm">9. Disclaimers and Limitations</Title>
            <Title order={3} size="h4" mt="md" mb="sm">9.1 Safety Warning</Title>
            <Text>
              <strong>IMPORTANT:</strong> Cycling involves inherent risks. Routes generated by our
              Service are suggestions only. You are responsible for:
            </Text>
            <List>
              <List.Item>Assessing road conditions, traffic, and weather</List.Item>
              <List.Item>Following traffic laws and regulations</List.Item>
              <List.Item>Using appropriate safety equipment (helmet, lights, etc.)</List.Item>
              <List.Item>Riding within your skill and fitness level</List.Item>
              <List.Item>Bringing appropriate supplies (water, nutrition, repair kit)</List.Item>
            </List>

            <Title order={3} size="h4" mt="md" mb="sm">9.2 Service "As Is"</Title>
            <Text>
              The Service is provided "AS IS" and "AS AVAILABLE" without warranties of any kind,
              either express or implied, including but not limited to:
            </Text>
            <List>
              <List.Item>Accuracy of routes, maps, or elevation data</List.Item>
              <List.Item>Availability or uptime of the Service</List.Item>
              <List.Item>Compatibility with all devices or browsers</List.Item>
              <List.Item>Error-free operation</List.Item>
            </List>

            <Title order={3} size="h4" mt="md" mb="sm">9.3 Limitation of Liability</Title>
            <Text>
              To the maximum extent permitted by law, we are NOT liable for:
            </Text>
            <List>
              <List.Item>Personal injury, death, or property damage from using generated routes</List.Item>
              <List.Item>Indirect, incidental, or consequential damages</List.Item>
              <List.Item>Loss of data, profits, or business opportunities</List.Item>
              <List.Item>Acts or omissions of third-party services (Strava, Garmin, etc.)</List.Item>
            </List>
          </div>

          <div>
            <Title order={2} size="h3" mb="sm">10. Indemnification</Title>
            <Text>
              You agree to indemnify and hold us harmless from any claims, damages, or expenses
              arising from your use of the Service or violation of these terms.
            </Text>
          </div>

          <div>
            <Title order={2} size="h3" mb="sm">11. API Usage and Rate Limits</Title>
            <Text>
              We use third-party APIs (Mapbox, Strava, etc.) that have rate limits. Excessive
              use may result in temporary restrictions. We reserve the right to implement
              rate limiting to ensure fair use.
            </Text>
          </div>

          <div>
            <Title order={2} size="h3" mb="sm">12. Modifications to Service</Title>
            <Text>
              We reserve the right to:
            </Text>
            <List>
              <List.Item>Modify or discontinue features at any time</List.Item>
              <List.Item>Update these terms with notice to users</List.Item>
              <List.Item>Change pricing (if applicable) with advance notice</List.Item>
            </List>
          </div>

          <div>
            <Title order={2} size="h3" mb="sm">13. Governing Law</Title>
            <Text>
              These terms are governed by the laws of [Your Jurisdiction], without regard to
              conflict of law principles. Any disputes shall be resolved in the courts of
              [Your Jurisdiction].
            </Text>
          </div>

          <div>
            <Title order={2} size="h3" mb="sm">14. Dispute Resolution</Title>
            <Text>
              For any disputes, we encourage contacting us first to resolve informally.
              If needed, disputes may be resolved through binding arbitration rather than
              court proceedings.
            </Text>
          </div>

          <div>
            <Title order={2} size="h3" mb="sm">15. Severability</Title>
            <Text>
              If any provision of these terms is found to be unenforceable, the remaining
              provisions will continue in full effect.
            </Text>
          </div>

          <div>
            <Title order={2} size="h3" mb="sm">16. Entire Agreement</Title>
            <Text>
              These Terms, together with our Privacy Policy, constitute the entire agreement
              between you and us regarding the Service.
            </Text>
          </div>

          <div>
            <Title order={2} size="h3" mb="sm">17. Contact Information</Title>
            <Text>
              For questions about these Terms of Service, contact us at:
            </Text>
            <Text mt="sm">
              Email: <Anchor href="mailto:legal@yourdomain.com">legal@yourdomain.com</Anchor>
            </Text>
          </div>

          <div>
            <Text size="sm" c="dimmed" mt="xl">
              By using this Service, you acknowledge that you have read, understood, and agree
              to be bound by these Terms of Service.
            </Text>
          </div>
        </Stack>
      </Paper>
    </Container>
  );
};

export default TermsOfService;
