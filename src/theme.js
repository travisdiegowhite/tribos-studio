import { createTheme } from '@mantine/core';

// Design tokens for tribos.studio
// Supports both dark (default) and light (Claude-inspired cream) themes

// ===== Depth Presets =====
// Bundled style objects for the five depth techniques:
// 1. Gradient surface  2. Top edge highlight  3. Inner glow
// 4. Layered drop shadows  5. Shine line (via CSS class)
export const depth = {
  card: {
    background: 'linear-gradient(180deg, #1e242d 0%, #181d24 40%, #161a22 100%)',
    border: '1px solid #2a3140',
    borderTop: '1px solid rgba(255, 255, 255, 0.09)',
    borderRadius: 16,
    boxShadow: [
      'inset 0 1px 0 rgba(255,255,255,0.07)',
      'inset 0 0 30px rgba(255,255,255,0.01)',
      '0 1px 1px rgba(0,0,0,0.4)',
      '0 4px 8px rgba(0,0,0,0.3)',
      '0 12px 32px rgba(0,0,0,0.35)',
      '0 24px 56px rgba(0,0,0,0.2)',
    ].join(', '),
    boxShadowHover: [
      'inset 0 1px 0 rgba(255,255,255,0.07)',
      'inset 0 0 30px rgba(255,255,255,0.01)',
      '0 2px 4px rgba(0,0,0,0.4)',
      '0 8px 16px rgba(0,0,0,0.35)',
      '0 20px 48px rgba(0,0,0,0.4)',
      '0 32px 72px rgba(0,0,0,0.25)',
    ].join(', '),
  },

  accentCard: {
    background: 'linear-gradient(180deg, #1e242d 0%, #181d24 50%, #161a22 100%)',
    border: '1px solid rgba(74, 222, 128, 0.35)',
    borderTop: '1px solid rgba(74, 222, 128, 0.4)',
    boxShadow: [
      'inset 0 1px 0 rgba(74,222,128,0.08)',
      '0 1px 1px rgba(0,0,0,0.4)',
      '0 4px 8px rgba(0,0,0,0.3)',
      '0 12px 32px rgba(0,0,0,0.35)',
      '0 0 40px rgba(74,222,128,0.06)',
    ].join(', '),
  },

  recessed: {
    background: 'var(--tribos-input)',
    border: '1px solid var(--tribos-border-subtle)',
    boxShadow: 'var(--tribos-shadow-inset)',
  },

  panel: {
    background: 'linear-gradient(180deg, #14181e 0%, #12161b 100%)',
    boxShadow: 'var(--tribos-shadow-panel)',
  },
};

// Dark theme tokens
export const darkTokens = {
  colors: {
    // Primary: Green (shifted from Electric Lime)
    electricLime: '#4ade80',
    electricLimeLight: '#6ee7a0',
    electricLimeDark: '#22c55e',

    // Backgrounds - wider elevation range
    bgPrimary: '#000000',    // Void
    bgSecondary: '#181d24',  // Card
    bgTertiary: '#12161b',   // Panel
    bgElevated: '#2a323e',   // Elevated

    // Borders
    border: '#2a3140',
    borderLight: '#3a4455',
    borderFocus: 'rgba(74, 222, 128, 0.5)',

    // Text - high contrast for readability
    textPrimary: '#f4f5f7',
    textSecondary: '#a0a8b4',
    textMuted: '#6d7888',

    // Semantic
    success: '#4ade80',
    warning: '#f5a623',
    error: '#f87171',
    info: '#60a5fa',

    // Training Zone Colors - FOR CHARTS/VISUALIZATION ONLY
    zone1: '#3B82F6', // Recovery - Blue
    zone2: '#22C55E', // Endurance - Green
    zone3: '#EAB308', // Tempo - Yellow
    zone4: '#F97316', // Threshold - Orange
    zone5: '#EF4444', // VO2max - Red
    zone6: '#A855F7', // Anaerobic - Purple
    zone7: '#EC4899', // Neuromuscular - Pink
  },

  // Shadows for elevation - layered depth system
  shadows: {
    xs: '0 1px 2px rgba(0, 0, 0, 0.3)',
    sm: '0 1px 3px rgba(0, 0, 0, 0.4), 0 4px 8px rgba(0, 0, 0, 0.25)',
    md: depth.card.boxShadow,
    lg: depth.card.boxShadowHover,
    card: depth.card.boxShadow,
    cardHover: depth.card.boxShadowHover,
    focus: '0 0 0 2px rgba(74, 222, 128, 0.3)',
  },
};

// Light theme tokens - Tribos fresh gray-green
export const lightTokens = {
  colors: {
    // Primary: Adjusted lime for light backgrounds
    electricLime: '#22A822',
    electricLimeLight: '#32CD32',
    electricLimeDark: '#1A8A1A',

    // Backgrounds - cool gray with subtle green undertone
    bgPrimary: '#F4F6F5',     // Soft gray-green base
    bgSecondary: '#FAFBFA',   // Near-white with green hint for cards
    bgTertiary: '#EAEDEB',    // Muted cool gray
    bgElevated: '#FFFFFF',    // Pure white for elevated surfaces

    // Borders - subtle warm grays
    border: 'rgba(0, 0, 0, 0.08)',
    borderLight: 'rgba(0, 0, 0, 0.12)',
    borderFocus: 'rgba(34, 168, 34, 0.5)',

    // Text - darker for better contrast
    textPrimary: '#171a18',
    textSecondary: '#3d4240',
    textMuted: '#5f6563',

    // Semantic - slightly adjusted for light bg
    success: '#22A822',
    warning: '#D99700',
    error: '#DC3030',
    info: '#0096B4',

    // Training Zone Colors - same for consistency
    zone1: '#3B82F6',
    zone2: '#22C55E',
    zone3: '#EAB308',
    zone4: '#F97316',
    zone5: '#EF4444',
    zone6: '#A855F7',
    zone7: '#EC4899',
  },

  // Shadows for light theme - softer, warmer
  shadows: {
    xs: '0 1px 2px rgba(0, 0, 0, 0.05)',
    sm: '0 2px 4px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
    md: '0 4px 12px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.04)',
    lg: '0 8px 24px rgba(0, 0, 0, 0.1), 0 4px 8px rgba(0, 0, 0, 0.06)',
    // Card shadow - subtle lift
    card: '0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
    cardHover: '0 4px 12px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06)',
    // Green glow for focus states
    focus: '0 0 0 2px rgba(34, 168, 34, 0.25)',
  },
};

// Default export for backward compatibility - uses dark theme
// Components should use useThemeTokens() hook for theme-aware tokens
export const tokens = darkTokens;

// Shared tokens (theme-independent)
export const sharedTokens = {
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    xxl: '48px',
  },

  radius: {
    sm: '6px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    full: '9999px',
  },

  // Transitions
  transitions: {
    fast: '100ms ease',
    normal: '150ms ease',
    slow: '250ms ease',
  },

  // Centralized breakpoints - use these consistently across all components
  // Usage: useMediaQuery(`(max-width: ${sharedTokens.breakpoints.sm})`)
  breakpoints: {
    xs: '480px',   // Small phones
    sm: '768px',   // Tablets / large phones (primary mobile breakpoint)
    md: '1024px',  // Small laptops / tablets landscape
    lg: '1200px',  // Desktops
    xl: '1400px',  // Large desktops
  },

  // Mobile-specific spacing (use on mobile for better touch targets)
  mobileSpacing: {
    touch: '44px',    // Minimum touch target size (iOS standard)
    gap: '8px',       // Minimum gap between elements on mobile
    gapLg: '12px',    // Comfortable gap for cards/list items
    padding: '16px',  // Container padding on mobile
  },
};

// Merge shared tokens into both theme token sets
Object.assign(tokens, sharedTokens);
Object.assign(darkTokens, sharedTokens);
Object.assign(lightTokens, sharedTokens);

// Helper to get tokens based on color scheme
export function getThemeTokens(colorScheme) {
  return colorScheme === 'light' ? lightTokens : darkTokens;
}

// Mantine theme configuration
export const theme = createTheme({
  primaryColor: 'green',
  primaryShade: { light: 6, dark: 4 },

  colors: {
    green: [
      '#e6fff0', '#b3ffd6', '#86efac', '#6ee7a0',
      '#4ade80', '#22c55e', '#16a34a', '#15803d',
      '#166534', '#14532d',
    ],
    dark: [
      '#f4f5f7',  // 0 — lightest text
      '#d0d5dc',  // 1
      '#a0a8b4',  // 2
      '#6d7888',  // 3
      '#4a5363',  // 4
      '#2a323e',  // 5 — elevated
      '#1e242d',  // 6 — card top
      '#181d24',  // 7 — card base
      '#12161b',  // 8 — panel
      '#000000',  // 9 — void
    ],
    // Light theme gray scale (warm tones)
    gray: [
      '#fafaf9',
      '#f5f5f4',
      '#e7e5e4',
      '#d6d3d1',
      '#a8a29e',
      '#78716c',
      '#57534e',
      '#44403c',
      '#292524',
      '#1c1917',
    ],
  },

  radius: {
    xs: '6px',
    sm: '8px',
    md: '10px',
    lg: '14px',
    xl: '16px',
  },

  fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  fontFamilyMonospace: "'JetBrains Mono', 'SF Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",

  headings: {
    fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontWeight: '700',
    sizes: {
      h1: { fontSize: '26px', lineHeight: '1.2' },
      h2: { fontSize: '20px', lineHeight: '1.3' },
      h3: { fontSize: '16px', lineHeight: '1.4' },
      h4: { fontSize: '14px', lineHeight: '1.45' },
    },
  },

  defaultRadius: 'md',

  shadows: {
    xs: '0 1px 2px rgba(0,0,0,0.3)',
    sm: '0 1px 3px rgba(0,0,0,0.4), 0 4px 8px rgba(0,0,0,0.25)',
    md: depth.card.boxShadow,
    lg: depth.card.boxShadowHover,
    xl: '0 2px 4px rgba(0,0,0,0.4), 0 12px 32px rgba(0,0,0,0.45), 0 32px 72px rgba(0,0,0,0.3)',
  },

  other: {
    // Expose tokens to components via theme.other
    transitions: sharedTokens.transitions,
    depth,
  },

  components: {
    Paper: {
      defaultProps: { radius: 'xl' },
      styles: () => ({
        root: {
          background: depth.card.background,
          border: depth.card.border,
          borderTop: depth.card.borderTop,
          boxShadow: depth.card.boxShadow,
          transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        },
      }),
    },

    Card: {
      defaultProps: { radius: 'xl', padding: 0 },
      styles: () => ({
        root: {
          background: depth.card.background,
          border: depth.card.border,
          borderTop: depth.card.borderTop,
          boxShadow: depth.card.boxShadow,
          overflow: 'hidden',
          transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          '&:hover': {
            boxShadow: depth.card.boxShadowHover,
            borderColor: 'var(--tribos-border-hover)',
            transform: 'translateY(-2px)',
          },
        },
      }),
    },

    Button: {
      defaultProps: { radius: 'md' },
      styles: () => ({
        root: {
          fontWeight: 600,
          transition: 'all 0.15s',
        },
      }),
    },

    TextInput: {
      defaultProps: { radius: 'md' },
      styles: () => ({
        input: {
          background: 'var(--tribos-input)',
          border: '1px solid var(--tribos-border-subtle)',
          color: 'var(--tribos-text-100)',
          boxShadow: 'var(--tribos-shadow-inset)',
          transition: 'all 0.15s',
          '&:focus': {
            borderColor: 'var(--tribos-green-border)',
            boxShadow: 'var(--tribos-shadow-inset), 0 0 0 3px rgba(74,222,128,0.06)',
          },
          '&::placeholder': { color: 'var(--tribos-text-500)' },
        },
        label: {
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '1px',
          textTransform: 'uppercase',
          color: 'var(--tribos-text-500)',
        },
      }),
    },

    Textarea: {
      styles: () => ({
        input: {
          background: 'var(--tribos-input)',
          border: '1px solid var(--tribos-border-subtle)',
          color: 'var(--tribos-text-100)',
          boxShadow: 'var(--tribos-shadow-inset)',
          '&:focus': {
            borderColor: 'var(--tribos-green-border)',
            boxShadow: 'var(--tribos-shadow-inset), 0 0 0 3px rgba(74,222,128,0.06)',
          },
        },
      }),
    },

    PasswordInput: {
      defaultProps: { radius: 'md' },
    },

    Select: {
      defaultProps: { radius: 'md' },
      styles: () => ({
        input: {
          background: 'var(--tribos-input)',
          border: '1px solid var(--tribos-border-subtle)',
          color: 'var(--tribos-text-100)',
          boxShadow: 'var(--tribos-shadow-inset)',
        },
        dropdown: {
          background: 'var(--tribos-elevated)',
          border: '1px solid var(--tribos-border-default)',
          boxShadow: 'var(--tribos-shadow-card-hover)',
        },
      }),
    },

    Badge: {
      styles: () => ({
        root: { fontWeight: 600, fontSize: 11, textTransform: 'none' },
      }),
    },

    Tabs: {
      styles: () => ({
        list: {
          background: 'linear-gradient(180deg, #14181e, #111519)',
          border: '1px solid var(--tribos-border-subtle)',
          borderRadius: 12,
          padding: 4,
          boxShadow: 'var(--tribos-shadow-inset)',
          gap: 2,
          '&::before': { display: 'none' },
        },
        tab: {
          borderRadius: 8,
          color: 'var(--tribos-text-400)',
          fontWeight: 500,
          fontSize: 13,
          padding: '8px 18px',
          border: 'none',
          transition: 'all 0.15s',
          '&:hover': {
            background: 'rgba(255,255,255,0.03)',
            color: 'var(--tribos-text-300)',
          },
          '&[data-active]': {
            background: 'linear-gradient(180deg, var(--tribos-card-top), var(--tribos-card))',
            color: 'var(--tribos-text-100)',
            border: '1px solid var(--tribos-border-default)',
            borderTop: '1px solid var(--tribos-edge-light-strong)',
            boxShadow: 'var(--tribos-inner-glow), 0 2px 8px rgba(0,0,0,0.3)',
          },
        },
      }),
    },

    SegmentedControl: {
      styles: () => ({
        root: {
          background: 'var(--tribos-input)',
          border: '1px solid var(--tribos-border-subtle)',
          borderRadius: 10,
          padding: 4,
          boxShadow: 'var(--tribos-shadow-inset)',
        },
        indicator: {
          background: 'linear-gradient(180deg, var(--tribos-card-top), var(--tribos-card))',
          border: '1px solid var(--tribos-border-default)',
          borderTop: '1px solid var(--tribos-edge-light-strong)',
          borderRadius: 7,
          boxShadow: 'var(--tribos-inner-glow), 0 2px 6px rgba(0,0,0,0.3)',
        },
        label: {
          color: 'var(--tribos-text-500)',
          fontWeight: 500,
          fontSize: 12,
          '&[data-active]': { color: 'var(--tribos-text-100) !important' },
        },
      }),
    },

    AppShell: {
      styles: () => ({
        main: { background: 'var(--tribos-void)' },
        navbar: {
          background: depth.panel.background,
          borderRight: '1px solid var(--tribos-border-default)',
          boxShadow: depth.panel.boxShadow,
        },
        header: {
          background: 'var(--tribos-nav)',
          borderBottom: '1px solid var(--tribos-border-subtle)',
          boxShadow: '0 1px 0 var(--tribos-edge-light)',
        },
      }),
    },

    NavLink: {
      styles: () => ({
        root: {
          borderRadius: 8,
          color: 'var(--tribos-text-400)',
          '&:hover': {
            background: 'rgba(255,255,255,0.04)',
            color: 'var(--tribos-text-300)',
          },
          '&[data-active]': {
            background: 'var(--tribos-green-surface-strong)',
            color: 'var(--tribos-green-500)',
            border: '1px solid var(--tribos-green-border)',
            boxShadow: 'var(--tribos-inner-glow)',
          },
        },
      }),
    },

    ActionIcon: {
      styles: () => ({
        root: {
          transition: 'all 150ms ease',
        },
      }),
    },

    Modal: {
      defaultProps: { radius: 'lg', centered: true },
      styles: () => ({
        content: {
          background: 'var(--tribos-elevated)',
          border: '1px solid var(--tribos-border-default)',
          boxShadow: 'var(--tribos-shadow-card-hover)',
        },
        header: {
          background: 'var(--tribos-elevated)',
        },
      }),
    },

    Drawer: {
      styles: () => ({
        content: {
          background: 'var(--tribos-elevated)',
          border: '1px solid var(--tribos-border-default)',
        },
      }),
    },

    Menu: {
      styles: () => ({
        dropdown: {
          background: 'var(--tribos-elevated)',
          border: '1px solid var(--tribos-border-default)',
          boxShadow: 'var(--tribos-shadow-card-hover)',
        },
        item: {
          color: 'var(--tribos-text-300)',
          transition: 'background-color 100ms ease',
          '&:hover': {
            background: 'rgba(255,255,255,0.04)',
            color: 'var(--tribos-text-100)',
          },
        },
      }),
    },

    Tooltip: {
      styles: () => ({
        tooltip: {
          background: 'var(--tribos-elevated)',
          border: '1px solid var(--tribos-border-default)',
          color: 'var(--tribos-text-200)',
          boxShadow: 'var(--tribos-shadow-card)',
          fontSize: 12,
        },
      }),
    },

    Notification: {
      defaultProps: { radius: 'md' },
      styles: () => ({
        root: {
          background: 'var(--tribos-elevated)',
          border: '1px solid var(--tribos-border-default)',
          boxShadow: 'var(--tribos-shadow-card)',
        },
      }),
    },
  },
});

export default theme;
