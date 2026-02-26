/**
 * Garmin Connect Branding Components
 *
 * Garmin Connect branding following Garmin API Brand Guidelines:
 * https://developer.garmin.com/brand-guidelines/overview/
 *
 * Requirements (per Garmin Connect Developer Program Agreement):
 * - Display "Powered by Garmin Connect" when showing Garmin-sourced data (Section 6.4)
 * - Include Garmin Brand Features on content retrieved from Garmin Connect (Section 6.1)
 * - Do not modify Garmin logos or brand features (Section 6.3c)
 */

import { Text, Group, Anchor } from '@mantine/core';

// Garmin brand color
export const GARMIN_BLUE = '#007dcd';

/**
 * "Powered by Garmin Connect" Attribution
 * Required when displaying Garmin-sourced data (Section 6.4)
 *
 * @param {Object} props
 * @param {string} props.variant - 'light' (for dark backgrounds) or 'dark' (for light backgrounds)
 * @param {string} props.size - 'sm', 'md', or 'lg'
 */
export function PoweredByGarmin({ variant = 'light', size = 'sm' }) {
  const textColor = variant === 'light' ? '#999999' : '#666666';
  const garminColor = variant === 'light' ? '#FFFFFF' : GARMIN_BLUE;

  const fontSize = size === 'sm' ? '10px' : size === 'md' ? '12px' : '14px';
  const garminFontSize = size === 'sm' ? '11px' : size === 'md' ? '13px' : '15px';

  return (
    <Group gap={4} wrap="nowrap">
      <Text
        size={fontSize}
        style={{
          color: textColor,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          fontWeight: 400,
        }}
      >
        Powered by
      </Text>
      <Text
        size={garminFontSize}
        style={{
          color: garminColor,
          fontWeight: 700,
          letterSpacing: '1px',
        }}
      >
        GARMIN CONNECT
      </Text>
    </Group>
  );
}

/**
 * "View on Garmin Connect" Link
 * Links to the activity on Garmin Connect
 *
 * @param {Object} props
 * @param {string} props.activityId - The Garmin activity ID
 * @param {string} props.variant - 'inline' (text link) or 'button' (styled button)
 */
export function ViewOnGarminLink({ activityId, variant = 'inline' }) {
  const url = `https://connect.garmin.com/modern/activity/${activityId}`;

  if (variant === 'button') {
    return (
      <Anchor
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 12px',
          backgroundColor: 'transparent',
          border: `1px solid ${GARMIN_BLUE}`,
          borderRadius: '4px',
          color: GARMIN_BLUE,
          fontSize: '12px',
          fontWeight: 600,
          textDecoration: 'none',
          transition: 'background-color 0.2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = `${GARMIN_BLUE}10`;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        View on Garmin Connect
      </Anchor>
    );
  }

  return (
    <Anchor
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        color: GARMIN_BLUE,
        fontWeight: 600,
        fontSize: '12px',
        textDecoration: 'underline',
      }}
    >
      View on Garmin Connect
    </Anchor>
  );
}

/**
 * Garmin Attribution Footer
 * Use at the bottom of sections displaying Garmin data
 */
export function GarminAttribution({ activityCount = null }) {
  return (
    <Group justify="space-between" align="center" mt="xs">
      <PoweredByGarmin variant="light" size="sm" />
      {activityCount !== null && (
        <Text size="xs" c="dimmed">
          {activityCount} {activityCount === 1 ? 'activity' : 'activities'} from Garmin
        </Text>
      )}
    </Group>
  );
}

export default {
  PoweredByGarmin,
  ViewOnGarminLink,
  GarminAttribution,
  GARMIN_BLUE,
};
