/**
 * ConsentGate — asks a signed-in athlete to accept the current Terms and
 * Privacy Policy, and (when Garmin is connected) the Garmin data-transfer
 * notice, when we have no record of either.
 *
 * Why it exists: signup used to stash ToS acceptance in localStorage and
 * flush it only in the same browser (Auth.jsx → AppShell), so an email
 * confirmed on another device, or any Google signup, recorded nothing — in
 * October 2026 not one profile had tos_accepted_at. The Garmin Connect
 * Developer Program Agreement needs both on record: end-user terms that
 * protect Garmin (§5.3) and express consent before data moves to or from
 * Garmin (§4.5). Bumping CURRENT_TOS_VERSION re-asks everyone.
 *
 * Mounted by LifecycleOverlays, where it outranks every other modal. It
 * cannot be dismissed without accepting; signing out is the way out.
 */

import { useState } from 'react';
import { Anchor, Button, Checkbox, Group, Modal, Stack, Text, Title } from '@mantine/core';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { CURRENT_TOS_VERSION, CURRENT_PRIVACY_VERSION } from '../utils/legalVersions';

/**
 * Which consents a profile is missing.
 * @param {{ tos_accepted_at?: string|null, tos_version?: string|null, garmin_data_consent_at?: string|null } | null} profile
 * @param {boolean} garminConnected
 */
export function missingConsents(profile, garminConnected) {
  const terms = !profile?.tos_accepted_at || !profile?.tos_version || profile.tos_version < CURRENT_TOS_VERSION;
  const garmin = garminConnected && !profile?.garmin_data_consent_at;
  return { terms, garmin };
}

function ConsentGate({ opened, userId, needsTerms, needsGarmin, onAccepted, onSignOut }) {
  const [termsChecked, setTermsChecked] = useState(false);
  const [garminChecked, setGarminChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const canAccept = (!needsTerms || termsChecked) && (!needsGarmin || garminChecked);

  const handleAccept = async () => {
    setSaving(true);
    setError(null);
    const now = new Date().toISOString();
    const update = { id: userId };
    if (needsTerms) {
      Object.assign(update, {
        tos_accepted_at: now,
        tos_version: CURRENT_TOS_VERSION,
        privacy_accepted_at: now,
        privacy_version: CURRENT_PRIVACY_VERSION,
      });
    }
    if (needsGarmin) update.garmin_data_consent_at = now;

    const { error: saveError } = await supabase
      .from('user_profiles')
      .upsert(update, { onConflict: 'id' });
    setSaving(false);
    if (saveError) {
      setError('Could not save that just now. Please try again.');
      return;
    }
    onAccepted();
  };

  return (
    <Modal
      opened={opened}
      onClose={() => {}}
      withCloseButton={false}
      closeOnClickOutside={false}
      closeOnEscape={false}
      centered
      size="md"
      radius={0}
      zIndex={500}
      title={
        <Title order={4} style={{ color: 'var(--color-text-primary)' }}>
          {needsTerms ? 'We updated our Terms and Privacy Policy' : 'Garmin data sharing'}
        </Title>
      }
    >
      <Stack gap="md">
        {needsTerms && (
          <>
            <Text size="sm" style={{ color: 'var(--color-text-secondary)' }}>
              They now spell out how the coach uses your training data, which companies help us run
              tribos, and the terms that apply to data from Garmin Connect.
            </Text>
            <Checkbox
              checked={termsChecked}
              onChange={(e) => setTermsChecked(e.currentTarget.checked)}
              size="sm"
              label={
                <Text size="sm" component="span">
                  I agree to the{' '}
                  <Anchor component={Link} to="/terms" target="_blank">Terms of Service</Anchor>
                  {' '}and{' '}
                  <Anchor component={Link} to="/privacy" target="_blank">Privacy Policy</Anchor>
                </Text>
              }
            />
          </>
        )}

        {needsGarmin && (
          <>
            <Text size="sm" style={{ color: 'var(--color-text-secondary)' }}>
              Your Garmin Connect account is connected. tribos receives your Garmin activities and
              health metrics to provide training analysis, and sends routes back to Garmin Connect
              when you choose &quot;Send to Garmin&quot;. See the{' '}
              <Anchor href="https://www.garmin.com/privacy/connect" target="_blank">
                Garmin Connect Privacy Notice
              </Anchor>
              . Do not share data with Garmin if you are restricted from doing so.
            </Text>
            <Checkbox
              checked={garminChecked}
              onChange={(e) => setGarminChecked(e.currentTarget.checked)}
              size="sm"
              label="I consent to the transfer of my data between Garmin Connect and tribos as described above"
            />
          </>
        )}

        {error && (
          <Text size="sm" c="red">{error}</Text>
        )}

        <Group justify="space-between">
          <Button variant="subtle" color="gray" onClick={onSignOut}>
            Sign out
          </Button>
          <Button onClick={handleAccept} disabled={!canAccept} loading={saving}>
            Continue
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export default ConsentGate;
