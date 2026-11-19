/**
 * The card every coach visual sits in: a ruled sheet with a kicker title,
 * the coach's one-line caption, the chart, and a footer with provider
 * attribution and a link to the full view. Flat, no radius, no shadow.
 */

import type { ReactNode } from 'react';
import { Anchor, Box, Group, Loader, Text, useComputedColorScheme } from '@mantine/core';
import { Link } from 'react-router-dom';
import { ArrowRight } from '@phosphor-icons/react';
import { PoweredByGarmin } from '../../../components/GarminBranding';
import { PoweredByStrava } from '../../../components/StravaBranding';

interface VisualFrameProps {
  title: string;
  caption?: string;
  /** Data providers whose rows are on screen; each gets its attribution. */
  providers?: Array<string | null | undefined>;
  openHref?: string;
  openLabel?: string;
  children: ReactNode;
}

export function VisualFrame({ title, caption, providers = [], openHref, openLabel = 'Open', children }: VisualFrameProps) {
  const lower = new Set(providers.filter(Boolean).map((p) => String(p).toLowerCase()));
  // Strava's 'light' badge is white text, for dark backgrounds.
  const stravaVariant = useComputedColorScheme('light') === 'dark' ? 'light' : 'dark';
  return (
    <Box
      style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg)' }}
      data-testid="coach-visual"
    >
      <Box style={{ padding: '10px 14px 8px', borderBottom: '1px solid var(--color-border)' }}>
        <Text
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 900,
            textTransform: 'uppercase',
            fontSize: 15,
            letterSpacing: 0.3,
          }}
        >
          {title}
        </Text>
        {caption && (
          <Text style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 2 }}>
            {caption}
          </Text>
        )}
      </Box>
      <Box style={{ padding: '10px 14px' }}>{children}</Box>
      {(lower.size > 0 || openHref) && (
        <Group justify="space-between" style={{ padding: '6px 14px 10px' }} wrap="wrap" gap={8}>
          <Group gap={10}>
            {lower.has('garmin') && <PoweredByGarmin variant="light" size="sm" />}
            {lower.has('strava') && <PoweredByStrava variant={stravaVariant} size="sm" />}
          </Group>
          {openHref && (
            <Anchor component={Link} to={openHref} size="sm" c="var(--color-text-primary)">
              <Group gap={4} wrap="nowrap">
                {openLabel}
                <ArrowRight size={14} />
              </Group>
            </Anchor>
          )}
        </Group>
      )}
    </Box>
  );
}

export function VisualLoading({ height = 200 }: { height?: number }) {
  return (
    <Box style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Loader size="sm" color="dark" />
    </Box>
  );
}

export function VisualMissing({ title, reason }: { title: string; reason: string }) {
  return (
    <VisualFrame title={title}>
      <Text size="sm" c="dimmed">
        {reason}
      </Text>
    </VisualFrame>
  );
}
