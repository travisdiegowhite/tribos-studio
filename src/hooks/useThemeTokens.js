import { useMantineTheme, useMantineColorScheme } from '@mantine/core';
import { darkTokens, lightTokens, getThemeTokens } from '../theme';
import { depth } from '../theme';

/**
 * Hook to get theme-aware design tokens
 * Returns the appropriate tokens (dark or light) based on current color scheme,
 * plus depth presets, surface tokens, and accent color references.
 *
 * @example
 * const { tokens, depth, terracotta, card } = useThemeTokens();
 *
 * // Use depth presets in styles
 * <Paper style={{ ...depth.card }} className="tribos-depth-card" />
 *
 * // Use accent colors
 * <Badge style={{ background: terracotta.surface, color: terracotta[500] }}>Active</Badge>
 */
export function useThemeTokens() {
  const { colorScheme, setColorScheme, toggleColorScheme } = useMantineColorScheme();
  const mantineTheme = useMantineTheme();

  const tokens = getThemeTokens(colorScheme);

  return {
    // Existing API (preserved for backward compatibility)
    tokens,
    colorScheme,
    setColorScheme,
    toggleColorScheme,
    isDark: colorScheme === 'dark',
    isLight: colorScheme === 'light',

    // Surfaces
    void: 'var(--tribos-void)',
    nav: 'var(--tribos-nav)',
    panel: 'var(--tribos-panel)',
    card: 'var(--tribos-card)',
    cardTop: 'var(--tribos-card-top)',
    cardBottom: 'var(--tribos-card-bottom)',
    cardHover: 'var(--tribos-card-hover)',
    elevated: 'var(--tribos-elevated)',
    input: 'var(--tribos-input)',

    // Borders
    borderSubtle: 'var(--tribos-border-subtle)',
    borderDefault: 'var(--tribos-border-default)',
    borderHover: 'var(--tribos-border-hover)',

    // Shadows
    shadowCard: 'var(--tribos-shadow-card)',
    shadowCardHover: 'var(--tribos-shadow-card-hover)',
    shadowPanel: 'var(--tribos-shadow-panel)',
    shadowInset: 'var(--tribos-shadow-inset)',

    // Depth presets — spread directly into style props
    depth,

    // Primary accent — Terracotta
    terracotta: {
      500: 'var(--tribos-terracotta-500)',
      400: 'var(--tribos-terracotta-400)',
      600: 'var(--tribos-terracotta-600)',
      surface: 'var(--tribos-terracotta-surface)',
      surfaceStrong: 'var(--tribos-terracotta-surface-strong)',
      border: 'var(--tribos-terracotta-border)',
      borderStrong: 'var(--tribos-terracotta-border-strong)',
    },

    // Legacy green alias → terracotta
    green: {
      500: 'var(--tribos-terracotta-500)',
      400: 'var(--tribos-terracotta-400)',
      600: 'var(--tribos-terracotta-600)',
      bright: 'var(--tribos-terracotta-400)',
      surface: 'var(--tribos-terracotta-surface)',
      surfaceStrong: 'var(--tribos-terracotta-surface-strong)',
      border: 'var(--tribos-terracotta-border)',
      borderStrong: 'var(--tribos-terracotta-border-strong)',
      glow: 'none',
    },

    // Brand accents
    mauve: {
      500: 'var(--tribos-mauve-500)',
      surface: 'var(--tribos-mauve-surface)',
      border: 'var(--tribos-mauve-border)',
    },
    teal: {
      500: 'var(--tribos-teal-500)',
      surface: 'var(--tribos-teal-surface)',
      border: 'var(--tribos-teal-border)',
    },
    sage: {
      500: 'var(--tribos-sage-500)',
      surface: 'var(--tribos-sage-surface)',
      border: 'var(--tribos-sage-border)',
    },
    gold: {
      500: 'var(--tribos-gold-500)',
      surface: 'var(--tribos-gold-surface)',
      border: 'var(--tribos-gold-border)',
    },
    sky: {
      500: 'var(--tribos-sky-500)',
      surface: 'var(--tribos-sky-surface)',
      border: 'var(--tribos-sky-border)',
    },

    // Legacy aliases → mapped to new palette
    amber: {
      500: 'var(--tribos-gold-500)',
      400: 'var(--tribos-amber-400)',
      surface: 'var(--tribos-gold-surface)',
      border: 'var(--tribos-gold-border)',
    },
    blue: {
      500: 'var(--tribos-teal-500)',
      400: 'var(--tribos-blue-400)',
      surface: 'var(--tribos-teal-surface)',
      border: 'var(--tribos-teal-border)',
    },
    purple: {
      500: 'var(--tribos-mauve-500)',
      surface: 'var(--tribos-mauve-surface)',
      border: 'var(--tribos-mauve-border)',
    },
    red: {
      500: 'var(--tribos-terracotta-500)',
      surface: 'var(--tribos-terracotta-surface)',
    },

    // Text
    text100: 'var(--tribos-text-100)',
    text200: 'var(--tribos-text-200)',
    text300: 'var(--tribos-text-300)',
    text400: 'var(--tribos-text-400)',
    text500: 'var(--tribos-text-500)',
    text600: 'var(--tribos-text-600)',

    // Removed: edgeLight, edgeLightStrong, innerGlow, innerGlowStrong (not in new design)

    // Mantine theme passthrough
    theme: mantineTheme,
  };
}

// Re-export token sets for direct access when needed
export { darkTokens, lightTokens, getThemeTokens };

export default useThemeTokens;
