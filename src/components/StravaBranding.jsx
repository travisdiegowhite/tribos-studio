/**
 * Strava Branding Components
 *
 * Official Strava branding assets following Strava's API Guidelines:
 * https://developers.strava.com/guidelines/
 *
 * Requirements:
 * - Use official "Connect with Strava" button for OAuth
 * - Display "Powered by Strava" when showing Strava data
 * - Include "View on Strava" links with proper attribution
 * - Never use Strava logo as app icon
 * - Never modify or animate Strava logos
 */

import { Box, Text, Group, Anchor } from '@mantine/core';

// Strava brand color
export const STRAVA_ORANGE = '#FC4C02';

/**
 * Official "Connect with Strava" Button
 * Use this for OAuth authorization flows
 *
 * @param {Object} props
 * @param {function} props.onClick - Click handler for authorization
 * @param {boolean} props.disabled - Whether button is disabled
 * @param {string} props.variant - 'orange' (default) or 'light'
 */
export function ConnectWithStravaButton({ onClick, disabled = false, variant = 'orange' }) {
  const isOrange = variant === 'orange';

  return (
    <Box
      component="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        padding: '12px 24px',
        backgroundColor: isOrange ? STRAVA_ORANGE : 'white',
        border: isOrange ? 'none' : `1px solid ${STRAVA_ORANGE}`,
        borderRadius: '4px',
        color: isOrange ? 'white' : STRAVA_ORANGE,
        fontSize: '14px',
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'opacity 0.2s, transform 0.2s',
        minWidth: '193px',
        height: '48px',
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.opacity = '0.9';
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled) {
          e.currentTarget.style.opacity = '1';
        }
      }}
    >
      <StravaLogo size={20} color={isOrange ? 'white' : STRAVA_ORANGE} />
      <span>Connect with Strava</span>
    </Box>
  );
}

/**
 * Strava Logo SVG Component
 * The official Strava wordmark
 */
export function StravaLogo({ size = 24, color = STRAVA_ORANGE }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169"
        fill={color}
      />
    </svg>
  );
}

/**
 * "Powered by Strava" Attribution
 * Required when displaying Strava data
 *
 * @param {Object} props
 * @param {string} props.variant - 'light' (for dark backgrounds) or 'dark' (for light backgrounds)
 * @param {string} props.size - 'sm', 'md', or 'lg'
 */
export function PoweredByStrava({ variant = 'light', size = 'sm' }) {
  const textColor = variant === 'light' ? '#999999' : '#666666';
  const stravaColor = variant === 'light' ? '#FFFFFF' : '#FC4C02';

  const fontSize = size === 'sm' ? '10px' : size === 'md' ? '12px' : '14px';
  const stravaFontSize = size === 'sm' ? '11px' : size === 'md' ? '13px' : '15px';

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
      <Group gap={4} wrap="nowrap">
        <StravaLogo size={size === 'sm' ? 14 : size === 'md' ? 16 : 18} color={stravaColor} />
        <Text
          size={stravaFontSize}
          style={{
            color: stravaColor,
            fontWeight: 700,
            letterSpacing: '1px',
          }}
        >
          STRAVA
        </Text>
      </Group>
    </Group>
  );
}

/**
 * "View on Strava" Link
 * Required when displaying individual activities from Strava
 *
 * Per Strava guidelines, links should be:
 * - Bold, underlined, or orange (#FC5200)
 * - Text format: "View on Strava"
 *
 * @param {Object} props
 * @param {string} props.activityId - The Strava activity ID
 * @param {string} props.variant - 'inline' (text link) or 'button' (styled button)
 */
export function ViewOnStravaLink({ activityId, variant = 'inline' }) {
  const url = `https://www.strava.com/activities/${activityId}`;

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
          border: `1px solid ${STRAVA_ORANGE}`,
          borderRadius: '4px',
          color: STRAVA_ORANGE,
          fontSize: '12px',
          fontWeight: 600,
          textDecoration: 'none',
          transition: 'background-color 0.2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = `${STRAVA_ORANGE}10`;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <StravaLogo size={14} color={STRAVA_ORANGE} />
        View on Strava
      </Anchor>
    );
  }

  // Inline variant - simple text link
  return (
    <Anchor
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        color: STRAVA_ORANGE,
        fontWeight: 600,
        fontSize: '12px',
        textDecoration: 'underline',
      }}
    >
      View on Strava
    </Anchor>
  );
}

/**
 * Strava Attribution Footer
 * Use at the bottom of sections displaying Strava data
 */
export function StravaAttribution({ activityCount = null }) {
  return (
    <Group justify="space-between" align="center" mt="xs">
      <PoweredByStrava variant="light" size="sm" />
      {activityCount !== null && (
        <Text size="xs" c="dimmed">
          {activityCount} {activityCount === 1 ? 'activity' : 'activities'} from Strava
        </Text>
      )}
    </Group>
  );
}

export default {
  ConnectWithStravaButton,
  StravaLogo,
  PoweredByStrava,
  ViewOnStravaLink,
  StravaAttribution,
  STRAVA_ORANGE,
};
