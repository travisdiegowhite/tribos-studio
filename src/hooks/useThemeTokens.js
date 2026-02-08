import { useMantineTheme, useMantineColorScheme } from '@mantine/core';
import { darkTokens, lightTokens, getThemeTokens } from '../theme';
import { depth } from '../theme';

/**
 * Hook to get theme-aware design tokens
 * Returns the appropriate tokens (dark or light) based on current color scheme,
 * plus depth presets, surface tokens, and accent color references.
 *
 * @example
 * const { tokens, depth, green, card } = useThemeTokens();
 *
 * // Use depth presets in styles
 * <Paper style={{ ...depth.card, borderRadius: 16 }} className="tribos-depth-card" />
 *
 * // Use accent colors
 * <Badge style={{ background: green.surface, color: green[500] }}>Active</Badge>
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
    edgeLight: 'var(--tribos-edge-light)',
    edgeLightStrong: 'var(--tribos-edge-light-strong)',

    // Shadows
    shadowCard: 'var(--tribos-shadow-card)',
    shadowCardHover: 'var(--tribos-shadow-card-hover)',
    shadowPanel: 'var(--tribos-shadow-panel)',
    shadowInset: 'var(--tribos-shadow-inset)',
    innerGlow: 'var(--tribos-inner-glow)',
    innerGlowStrong: 'var(--tribos-inner-glow-strong)',

    // Depth presets — spread directly into style props
    depth,

    // Accent colors
    green: {
      500: 'var(--tribos-green-500)',
      400: 'var(--tribos-green-400)',
      600: 'var(--tribos-green-600)',
      bright: 'var(--tribos-green-bright)',
      surface: 'var(--tribos-green-surface)',
      surfaceStrong: 'var(--tribos-green-surface-strong)',
      border: 'var(--tribos-green-border)',
      borderStrong: 'var(--tribos-green-border-strong)',
      glow: 'var(--tribos-green-glow)',
    },
    amber: {
      500: 'var(--tribos-amber-500)',
      400: 'var(--tribos-amber-400)',
      surface: 'var(--tribos-amber-surface)',
      border: 'var(--tribos-amber-border)',
    },
    blue: {
      500: 'var(--tribos-blue-500)',
      400: 'var(--tribos-blue-400)',
      surface: 'var(--tribos-blue-surface)',
      border: 'var(--tribos-blue-border)',
    },
    purple: {
      500: 'var(--tribos-purple-500)',
      surface: 'var(--tribos-purple-surface)',
      border: 'var(--tribos-purple-border)',
    },
    red: {
      500: 'var(--tribos-red-500)',
      surface: 'var(--tribos-red-surface)',
    },

    // Text
    text100: 'var(--tribos-text-100)',
    text200: 'var(--tribos-text-200)',
    text300: 'var(--tribos-text-300)',
    text400: 'var(--tribos-text-400)',
    text500: 'var(--tribos-text-500)',
    text600: 'var(--tribos-text-600)',

    // Mantine theme passthrough
    theme: mantineTheme,
  };
}

// Re-export token sets for direct access when needed
export { darkTokens, lightTokens, getThemeTokens };

export default useThemeTokens;
