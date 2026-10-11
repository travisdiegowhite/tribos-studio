/**
 * Shared ink-zine pieces for the Progress tab (CLAUDE.md "Design System"):
 * flat sections divided by rules, Tribos Display headings, Courier numbers,
 * role colours only. Every Progress component builds on these so the tab reads
 * as one sheet rather than a stack of cards.
 */

import { useEffect, useState } from 'react';
import { Box, Group, Text, useComputedColorScheme } from '@mantine/core';

export const display = {
  fontFamily: 'var(--font-display)',
  fontWeight: 900,
  textTransform: 'uppercase',
  letterSpacing: '0.01em',
  // The condensed face's space is very narrow; without this "RAMP RATE" reads as one word.
  wordSpacing: '0.18em',
  lineHeight: 1,
};
export const mono = { fontFamily: 'var(--font-mono)' };
/** Small caps label over a number. */
export const kicker = {
  fontFamily: 'var(--font-body)',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--color-text-muted)',
};

/**
 * Role colours by meaning. Good news is ink (the tick carries "done"); effort,
 * warnings and declines are signal text; recovery and "planned" are easy.
 */
export const TONE = {
  good: 'var(--color-text-primary)',
  done: 'var(--color-done)',
  warn: 'var(--color-signal-text)',
  easy: 'var(--color-easy)',
  muted: 'var(--color-text-muted)',
  neutral: 'var(--color-text-primary)',
};

/** Mantine color props for badges, alerts and progress bars: theme ramps that map to roles. */
export const MANTINE_TONE = {
  good: 'ink',
  done: 'blue', // → accent ramp
  warn: 'signal',
  easy: 'easy',
  neutral: 'gray',
};

/** Chart colours, as CSS variables (pass through style={{ stroke }} / recharts props). */
export const CHART = {
  fitness: 'var(--chart-fitness)',
  fatigue: 'var(--chart-fatigue)',
  form: 'var(--color-easy)',
  bar: 'var(--chart-bar)',
  grid: 'var(--chart-grid)',
  baseline: 'var(--chart-baseline)',
  future: 'var(--chart-future)',
  axis: 'var(--color-text-muted)',
};

/**
 * CHART with every var() resolved to its current value. Recharts writes colours
 * into SVG presentation attributes, which don't reliably resolve var() (see
 * src/views/today-glance/tokens.ts), so charts read these instead. Re-resolves
 * when the colour scheme changes.
 */
export function useChartColors() {
  const scheme = useComputedColorScheme('light');
  const [colors, setColors] = useState(CHART);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.getComputedStyle) return undefined;
    const root = document.documentElement;
    const read = () => {
      const styles = window.getComputedStyle(root);
      const resolve = (v) => {
        const m = /^var\((--[\w-]+)\)$/.exec(v);
        const value = m ? styles.getPropertyValue(m[1]).trim() : '';
        return value || v;
      };
      setColors(Object.fromEntries(Object.entries(CHART).map(([k, v]) => [k, resolve(v)])));
    };
    read();
    // Mantine flips data-mantine-color-scheme on <html> after React renders, so
    // re-read when it changes rather than trusting the first render.
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ['data-mantine-color-scheme', 'class', 'style'] });
    return () => observer.disconnect();
  }, [scheme]);
  return colors;
}

/** Recharts tooltip box: flat, ruled, mono. */
export const tooltipStyle = {
  backgroundColor: 'var(--color-card)',
  border: '1px solid var(--color-border)',
  borderRadius: 0,
  boxShadow: 'none',
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  color: 'var(--color-text-primary)',
};

/** A ruled section: ink rule, Tribos Display heading, optional control on the right. */
export function ProgressSection({ title, aside = null, children, id }) {
  return (
    <Box component="section" id={id} style={{ borderTop: '1.5px solid var(--color-ink)', paddingTop: 12 }}>
      <Group justify="space-between" align="center" mb={14} wrap="wrap" gap="xs">
        <Text component="h2" style={{ ...display, fontSize: 22, margin: 0 }}>
          {title}
        </Text>
        {aside}
      </Group>
      {children}
    </Box>
  );
}

/** A sub-heading inside a section (smaller, still display). */
export function SubHeading({ children, aside = null }) {
  return (
    <Group justify="space-between" align="center" mb={8} wrap="wrap" gap="xs">
      <Text style={{ ...display, fontSize: 15 }}>{children}</Text>
      {aside}
    </Group>
  );
}

/**
 * One ruled row of numbers: caps label, Courier value, optional note. Cells
 * wrap on narrow screens; every cell carries a left rule and the grid is
 * pulled left under a clipping box, so the first cell of each line never
 * shows a stray rule or indent.
 */
export function StatRow({ stats, minWidth = 140 }) {
  return (
    <Box style={{ overflow: 'hidden', borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)' }}>
      <Box
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}px, 1fr))`,
          marginLeft: -13,
        }}
      >
        {stats.map((s) => (
          <Box
            key={s.label}
            style={{ padding: '10px 12px', borderLeft: '1px solid var(--color-border)', minWidth: 0 }}
          >
            <Text style={kicker}>{s.label}</Text>
            <Text style={{ ...mono, fontSize: 22, fontWeight: 700, color: s.color ?? TONE.neutral, marginTop: 2 }}>
              {s.value}
            </Text>
            {s.note && (
              <Text size="xs" c="var(--color-text-secondary)" mt={2}>
                {s.note}
              </Text>
            )}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
