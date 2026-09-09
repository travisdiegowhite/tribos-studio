/**
 * Shared styling for the Garage surfaces. Everything resolves to the live
 * `--color-*` tokens (src/styles/global.css) so dark mode is automatic, and
 * the wear ramp reuses the Spine's effort ramp: fresh/wearing in → teal,
 * nearly done → gold, past due → coral.
 */

import type { CSSProperties } from 'react';
import type { WearLevel } from '../../lib/gear/wearSeries';

export const FONT = {
  display: "'Barlow Condensed', sans-serif",
  body: "'Barlow', sans-serif",
  mono: "'DM Mono', monospace",
};

export const SURFACE_COLOR = {
  road: 'var(--color-teal)',
  offroad: 'var(--color-orange)',
  indoor: 'var(--color-text-muted)',
} as const;

export function levelColor(level: WearLevel): string {
  switch (level) {
    case 'replace': return 'var(--color-coral)';
    case 'warning': return 'var(--color-gold)';
    case 'ok': return 'var(--color-teal)';
    default: return 'var(--color-text-muted)';
  }
}

export function levelSubtle(level: WearLevel): string {
  switch (level) {
    case 'replace': return 'var(--color-coral-subtle)';
    case 'warning': return 'var(--color-gold-subtle)';
    case 'ok': return 'var(--color-teal-subtle)';
    default: return 'transparent';
  }
}

/** DM Mono 11px uppercase, 1px tracking — the app's data-label recipe. */
export const monoLabel: CSSProperties = {
  fontFamily: FONT.mono,
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '1px',
  textTransform: 'uppercase',
  color: 'var(--color-text-secondary)',
};

export const monoCaption: CSSProperties = {
  ...monoLabel,
  fontSize: 10,
  fontWeight: 400,
  color: 'var(--color-text-muted)',
};

export const cardStyle: CSSProperties = {
  background: 'var(--color-card)',
  border: '1.5px solid var(--color-border)',
  padding: '13px 16px 16px',
  boxShadow: 'var(--shadow-sm)',
  borderRadius: 0,
};
