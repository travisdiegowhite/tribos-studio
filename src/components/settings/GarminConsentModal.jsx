/**
 * Garmin Data Transfer Consent Modal
 *
 * Shown before initiating Garmin OAuth flow per Garmin Connect
 * Developer Program Agreement Section 4.5.
 *
 * Requires explicit user consent before data transfer begins.
 */

import { useState } from 'react';
import { Modal, Text, Stack, List, Button, Group, Checkbox, Anchor } from '@mantine/core';
import { Link } from 'react-router-dom';

export default function GarminConsentModal({ opened, onClose, onConsent }) {
  const [accepted, setAccepted] = useState(false);

  const handleConsent = () => {
    onConsent();
    setAccepted(false);
  };

  const handleClose = () => {
    setAccepted(false);
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Connect to Garmin Connect"
      size="md"
    >
      <Stack gap="md">
        <Text size="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
          By connecting your Garmin Connect account, you consent to tribos.studio
          accessing and processing the following data:
        </Text>

        <List size="sm" spacing="xs" style={{ color: 'var(--tribos-text-secondary)' }}>
          <List.Item>Activity data (rides, workouts, GPS tracks)</List.Item>
          <List.Item>Health metrics (heart rate, sleep, stress data)</List.Item>
          <List.Item>Training and fitness data</List.Item>
          <List.Item>Device and athlete profile information</List.Item>
        </List>

        <Text size="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
          This data will be stored securely and used to provide route planning,
          training analysis, and coaching features. tribos.studio may also send
          data back to Garmin Connect (e.g., routes exported to your device).
        </Text>

        <Text size="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
          See our{' '}
          <Anchor component={Link} to="/privacy" target="_blank" style={{ color: 'var(--tribos-terracotta-500)' }}>
            Privacy Policy
          </Anchor>
          {' '}and the{' '}
          <Anchor href="https://www.garmin.com/privacy/connect" target="_blank" style={{ color: 'var(--tribos-terracotta-500)' }}>
            Garmin Connect Privacy Notice
          </Anchor>
          {' '}for complete details.
        </Text>

        <Text size="xs" c="dimmed">
          You can disconnect Garmin at any time from Settings, which will immediately
          stop data syncing and delete your Garmin OAuth tokens. You must not upload
          or transmit data if restricted by applicable law.
        </Text>

        <Checkbox
          label="I consent to the transfer and processing of my Garmin Connect data as described above"
          checked={accepted}
          onChange={(e) => setAccepted(e.currentTarget.checked)}
          color="terracotta"
          size="sm"
        />

        <Group justify="flex-end">
          <Button variant="subtle" color="gray" onClick={handleClose}>
            Cancel
          </Button>
          <Button color="terracotta" disabled={!accepted} onClick={handleConsent}>
            Connect Garmin
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
