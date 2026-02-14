import { createTheme } from '@mantine/core';

// Design tokens for tribos.studio
// Warm cartographic brand — Anybody / Familjen Grotesk / DM Mono
// Supports both light (default, cream) and dark (warm-black) themes

// ===== Depth Presets =====
// Flat surfaces with sharp borders — no gradients, no edge lighting
export const depth = {
  card: {
    background: 'var(--tribos-card)',
    border: '1.5px solid var(--tribos-border-default)',
    borderRadius: 0,
    boxShadow: 'var(--tribos-shadow-card)',
    boxShadowHover: 'var(--tribos-shadow-card-hover)',
  },

  accentCard: {
    background: 'var(--tribos-card)',
    border: '1.5px solid var(--tribos-terracotta-border)',
    borderRadius: 0,
    boxShadow: 'var(--tribos-shadow-card)',
  },

  recessed: {
    background: 'var(--tribos-input)',
    border: '1px solid var(--tribos-border-default)',
    boxShadow: 'none',
  },

  panel: {
    background: 'var(--tribos-panel)',
    boxShadow: 'none',
  },
};

// Light theme tokens (default — cream/ink)
export const lightTokens = {
  colors: {
    // Primary accent: Terracotta
    terracotta: '#C4785C',
    terracottaLight: '#D4917A',
    terracottaDark: '#A0614A',

    // Brand accents
    mauve: '#C4A0B9',
    teal: '#7BA9A0',
    sage: '#A8BFA8',
    gold: '#D4A843',
    dustyRose: '#9E7E90',
    skyPale: '#B8CDD9',

    // Backgrounds — warm cream elevation scale
    bgPrimary: '#F5F0E8',     // Cream (page background)
    bgSecondary: '#FAF7F2',   // Warm-white (cards)
    bgTertiary: '#E8DDD3',    // Pale-earth (recessed)
    bgElevated: '#FFFFFF',    // Pure white (modals/dropdowns)

    // Borders
    border: '#D4CCC0',
    borderLight: '#E0D8CE',
    borderFocus: 'rgba(196, 120, 92, 0.5)',

    // Text — ink hierarchy
    textPrimary: '#2C2826',   // Ink
    textSecondary: '#6B6460',
    textMuted: '#9E9590',

    // Semantic — mapped to palette
    success: '#A8BFA8',  // Sage
    warning: '#D4A843',  // Gold
    error: '#C4785C',    // Terracotta
    info: '#7BA9A0',     // Teal

    // Training Zone Colors — 7 zones
    zone1: '#A8BFA8', // Recovery - Sage
    zone2: '#7BA9A0', // Endurance - Teal
    zone3: '#D4A843', // Tempo - Gold
    zone4: '#C4785C', // Threshold - Terracotta
    zone5: '#C4A0B9', // VO2max - Mauve
    zone6: '#9E7E90', // Anaerobic - Dusty Rose
    zone7: '#B8CDD9', // Neuromuscular - Sky

    // Legacy aliases (backward compat)
    electricLime: '#C4785C',
    electricLimeLight: '#D4917A',
    electricLimeDark: '#A0614A',
  },

  shadows: {
    xs: '0 1px 2px rgba(0, 0, 0, 0.04)',
    sm: '0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
    md: '0 2px 6px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04)',
    lg: '0 4px 12px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.04)',
    card: '0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
    cardHover: '0 4px 12px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06)',
    focus: '0 0 0 2px rgba(196, 120, 92, 0.25)',
  },
};

// Dark theme tokens (warm-black)
export const darkTokens = {
  colors: {
    // Primary accent: Terracotta (same across themes)
    terracotta: '#C4785C',
    terracottaLight: '#D4917A',
    terracottaDark: '#A0614A',

    // Brand accents — slightly desaturated for dark
    mauve: '#B08DA5',
    mauveDim: '#8A6E80',
    teal: '#6E9B92',
    tealDim: '#4A7A70',
    sage: '#8BA88B',
    gold: '#D4A843',
    goldDim: '#B08E3A',
    dustyRose: '#9E7E90',
    skyMuted: '#5C7A8A',

    // Backgrounds — warm-black elevation scale
    bgPrimary: '#111010',     // Deep (page background)
    bgSecondary: '#1A1917',   // Surface (cards)
    bgTertiary: '#1E1D1B',    // Card bg
    bgElevated: '#232220',    // Elevated (modals)

    // Borders
    border: '#3A3835',
    borderLight: '#2E2C28',
    borderFocus: 'rgba(196, 120, 92, 0.5)',

    // Text — warm cream hierarchy
    textPrimary: '#E8E2D8',
    textSecondary: '#A09888',
    textMuted: '#6B6360',
    textDim: '#4A4542',

    // Semantic
    success: '#8BA88B',
    warning: '#D4A843',
    error: '#C4785C',
    info: '#6E9B92',

    // Training Zone Colors — 7 zones (dark adapted)
    zone1: '#8BA88B', // Recovery - Sage (desaturated)
    zone2: '#6E9B92', // Endurance - Teal (desaturated)
    zone3: '#D4A843', // Tempo - Gold (same)
    zone4: '#C4785C', // Threshold - Terracotta (same)
    zone5: '#B08DA5', // VO2max - Mauve (desaturated)
    zone6: '#9E7E90', // Anaerobic - Dusty Rose (same)
    zone7: '#5C7A8A', // Neuromuscular - Sky (desaturated)

    // Legacy aliases
    electricLime: '#C4785C',
    electricLimeLight: '#D4917A',
    electricLimeDark: '#A0614A',
  },

  shadows: {
    xs: '0 1px 2px rgba(0, 0, 0, 0.2)',
    sm: '0 1px 3px rgba(0, 0, 0, 0.25), 0 1px 2px rgba(0, 0, 0, 0.15)',
    md: '0 2px 8px rgba(0, 0, 0, 0.3), 0 1px 3px rgba(0, 0, 0, 0.2)',
    lg: '0 4px 16px rgba(0, 0, 0, 0.35), 0 2px 6px rgba(0, 0, 0, 0.2)',
    card: '0 1px 3px rgba(0, 0, 0, 0.25), 0 1px 2px rgba(0, 0, 0, 0.15)',
    cardHover: '0 4px 12px rgba(0, 0, 0, 0.35), 0 2px 4px rgba(0, 0, 0, 0.2)',
    focus: '0 0 0 2px rgba(196, 120, 92, 0.3)',
  },
};

// Default export — uses light theme (new default)
export const tokens = lightTokens;

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
    sm: '0px',
    md: '0px',
    lg: '0px',
    xl: '0px',
    full: '9999px',
  },

  transitions: {
    fast: '100ms ease',
    normal: '150ms ease',
    slow: '250ms ease',
  },

  breakpoints: {
    xs: '480px',
    sm: '768px',
    md: '1024px',
    lg: '1200px',
    xl: '1400px',
  },

  mobileSpacing: {
    touch: '44px',
    gap: '8px',
    gapLg: '12px',
    padding: '16px',
  },
};

// Merge shared tokens into both theme token sets
Object.assign(tokens, sharedTokens);
Object.assign(darkTokens, sharedTokens);
Object.assign(lightTokens, sharedTokens);

// Helper to get tokens based on color scheme
export function getThemeTokens(colorScheme) {
  return colorScheme === 'dark' ? darkTokens : lightTokens;
}

// Mantine theme configuration
export const theme = createTheme({
  primaryColor: 'terracotta',
  primaryShade: { light: 5, dark: 4 },

  colors: {
    terracotta: [
      '#FDF5F2', '#F8E4DC', '#F0CABC', '#E5AD98',
      '#D4917A', '#C4785C', '#A86348', '#8C5038',
      '#6E3E2B', '#52301F',
    ],
    sage: [
      '#F4F8F4', '#E2ECE2', '#C8D9C8', '#B0C8B0',
      '#A8BFA8', '#8BA88B', '#6E8E6E', '#577457',
      '#435A43', '#334433',
    ],
    teal: [
      '#F0F7F5', '#D8ECE7', '#BBD9D2', '#9EC7BD',
      '#7BA9A0', '#6E9B92', '#5A8578', '#47705F',
      '#355A49', '#254535',
    ],
    mauve: [
      '#F8F3F6', '#EDDFE8', '#DCC5D5', '#CBB0C3',
      '#C4A0B9', '#B08DA5', '#96748D', '#7C5D75',
      '#63485E', '#4C3649',
    ],
    gold: [
      '#FBF6EC', '#F5E8CE', '#EDD5A6', '#E4C27E',
      '#D4A843', '#B08E3A', '#8E7330', '#6E5926',
      '#52421D', '#3A2E14',
    ],
    sky: [
      '#F3F7FA', '#DDE9F0', '#C4D8E4', '#B8CDD9',
      '#9EBCCC', '#5C7A8A', '#4A6573', '#39505D',
      '#2B3D48', '#1F2C34',
    ],
    dark: [
      '#E8E2D8',  // 0 — lightest text (warm cream)
      '#A09888',  // 1 — secondary text
      '#6B6360',  // 2 — muted text
      '#4A4542',  // 3 — dim text
      '#3A3835',  // 4 — borders
      '#232220',  // 5 — elevated
      '#1E1D1B',  // 6 — card
      '#1A1917',  // 7 — surface
      '#141312',  // 8 — panel
      '#111010',  // 9 — deep
    ],
    gray: [
      '#FAF7F2',  // 0 — warm white
      '#F5F0E8',  // 1 — cream
      '#E8DDD3',  // 2 — pale earth
      '#D4CCC0',  // 3 — borders
      '#B5ADA3',  // 4
      '#9E9590',  // 5 — muted text
      '#6B6460',  // 6 — secondary text
      '#4A4440',  // 7
      '#2C2826',  // 8 — ink
      '#1A1816',  // 9 — deep ink
    ],
    green: [
      '#F4F8F4', '#E2ECE2', '#C8D9C8', '#B0C8B0',
      '#A8BFA8', '#8BA88B', '#6E8E6E', '#577457',
      '#435A43', '#334433',
    ],
  },

  radius: {
    xs: '0px',
    sm: '0px',
    md: '0px',
    lg: '0px',
    xl: '0px',
  },

  fontFamily: "'Familjen Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  fontFamilyMonospace: "'DM Mono', 'SF Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",

  headings: {
    fontFamily: "'Anybody', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontWeight: '800',
    sizes: {
      h1: { fontSize: '26px', lineHeight: '1.1' },
      h2: { fontSize: '20px', lineHeight: '1.2' },
      h3: { fontSize: '16px', lineHeight: '1.3' },
      h4: { fontSize: '14px', lineHeight: '1.4' },
    },
  },

  defaultRadius: 0,

  shadows: {
    xs: '0 1px 2px rgba(0,0,0,0.04)',
    sm: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
    md: '0 2px 6px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)',
    lg: '0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)',
    xl: '0 8px 24px rgba(0,0,0,0.1), 0 4px 8px rgba(0,0,0,0.06)',
  },

  other: {
    transitions: sharedTokens.transitions,
    depth,
  },

  components: {
    Paper: {
      defaultProps: { radius: 0 },
      styles: () => ({
        root: {
          background: 'var(--tribos-card)',
          border: '1.5px solid var(--tribos-border-default)',
          borderRadius: 0,
          boxShadow: 'var(--tribos-shadow-card)',
          transition: 'box-shadow 0.15s ease, border-color 0.15s ease',
        },
      }),
    },

    Card: {
      defaultProps: { radius: 0, padding: 'lg' },
      styles: () => ({
        root: {
          background: 'var(--tribos-card)',
          border: '1.5px solid var(--tribos-border-default)',
          borderRadius: 0,
          boxShadow: 'var(--tribos-shadow-card)',
          overflow: 'hidden',
          transition: 'box-shadow 0.15s ease, border-color 0.15s ease',
          '&:hover': {
            boxShadow: 'var(--tribos-shadow-card-hover)',
            borderColor: 'var(--tribos-border-hover)',
          },
        },
      }),
    },

    Button: {
      defaultProps: { radius: 0 },
      styles: () => ({
        root: {
          fontWeight: 600,
          fontFamily: "'DM Mono', monospace",
          fontSize: 11,
          letterSpacing: '1px',
          textTransform: 'uppercase',
          transition: 'all 0.15s',
        },
      }),
    },

    TextInput: {
      defaultProps: { radius: 0 },
      styles: () => ({
        input: {
          background: 'var(--tribos-input)',
          border: '1px solid var(--tribos-border-default)',
          color: 'var(--tribos-text-100)',
          transition: 'all 0.15s',
          '&:focus': {
            borderColor: 'var(--tribos-terracotta-border)',
            boxShadow: '0 0 0 2px rgba(196, 120, 92, 0.1)',
          },
          '&::placeholder': { color: 'var(--tribos-text-500)' },
        },
        label: {
          fontFamily: "'DM Mono', monospace",
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: '2px',
          textTransform: 'uppercase',
          color: 'var(--tribos-text-500)',
        },
      }),
    },

    Textarea: {
      defaultProps: { radius: 0 },
      styles: () => ({
        input: {
          background: 'var(--tribos-input)',
          border: '1px solid var(--tribos-border-default)',
          color: 'var(--tribos-text-100)',
          '&:focus': {
            borderColor: 'var(--tribos-terracotta-border)',
            boxShadow: '0 0 0 2px rgba(196, 120, 92, 0.1)',
          },
        },
      }),
    },

    PasswordInput: {
      defaultProps: { radius: 0 },
    },

    Select: {
      defaultProps: { radius: 0 },
      styles: () => ({
        input: {
          background: 'var(--tribos-input)',
          border: '1px solid var(--tribos-border-default)',
          color: 'var(--tribos-text-100)',
        },
        dropdown: {
          background: 'var(--tribos-elevated)',
          border: '1px solid var(--tribos-border-default)',
          borderRadius: 0,
          boxShadow: 'var(--tribos-shadow-card-hover)',
        },
      }),
    },

    Badge: {
      defaultProps: { radius: 0 },
      styles: () => ({
        root: {
          fontFamily: "'DM Mono', monospace",
          fontWeight: 500,
          fontSize: 10,
          letterSpacing: '1px',
          textTransform: 'uppercase',
        },
      }),
    },

    Tabs: {
      styles: () => ({
        list: {
          borderBottom: '1px solid var(--tribos-border-default)',
          gap: 0,
          '&::before': { display: 'none' },
        },
        tab: {
          borderRadius: 0,
          color: 'var(--tribos-text-400)',
          fontFamily: "'DM Mono', monospace",
          fontWeight: 500,
          fontSize: 11,
          letterSpacing: '1px',
          textTransform: 'uppercase',
          padding: '10px 16px',
          border: 'none',
          borderBottom: '2px solid transparent',
          transition: 'all 0.15s',
          '&:hover': {
            background: 'transparent',
            color: 'var(--tribos-text-100)',
          },
          '&[data-active]': {
            background: 'transparent',
            color: 'var(--tribos-text-100)',
            borderBottom: '2px solid var(--tribos-terracotta-500)',
          },
        },
      }),
    },

    SegmentedControl: {
      styles: () => ({
        root: {
          background: 'var(--tribos-input)',
          border: '1px solid var(--tribos-border-default)',
          borderRadius: 0,
          padding: 2,
        },
        indicator: {
          background: 'var(--tribos-card)',
          border: '1px solid var(--tribos-border-default)',
          borderRadius: 0,
          boxShadow: 'var(--tribos-shadow-xs)',
        },
        label: {
          color: 'var(--tribos-text-500)',
          fontFamily: "'DM Mono', monospace",
          fontWeight: 500,
          fontSize: 11,
          letterSpacing: '1px',
          textTransform: 'uppercase',
          '&[data-active]': { color: 'var(--tribos-text-100) !important' },
        },
      }),
    },

    AppShell: {
      styles: () => ({
        main: { background: 'var(--tribos-void)' },
        navbar: {
          background: 'var(--tribos-panel)',
          borderRight: '1px solid var(--tribos-border-default)',
        },
        header: {
          background: 'var(--tribos-nav)',
          borderBottom: '1px solid var(--tribos-border-default)',
        },
      }),
    },

    NavLink: {
      styles: () => ({
        root: {
          borderRadius: 0,
          color: 'var(--tribos-text-400)',
          '&:hover': {
            background: 'var(--tribos-terracotta-surface)',
            color: 'var(--tribos-text-100)',
          },
          '&[data-active]': {
            background: 'var(--tribos-terracotta-surface)',
            color: 'var(--tribos-terracotta-500)',
            borderLeft: '2px solid var(--tribos-terracotta-500)',
          },
        },
      }),
    },

    ActionIcon: {
      defaultProps: { radius: 0 },
      styles: () => ({
        root: {
          transition: 'all 150ms ease',
        },
      }),
    },

    Modal: {
      defaultProps: { radius: 0, centered: true },
      styles: () => ({
        content: {
          background: 'var(--tribos-elevated)',
          border: '1px solid var(--tribos-border-default)',
          borderRadius: 0,
          boxShadow: 'var(--tribos-shadow-card-hover)',
        },
        header: {
          background: 'var(--tribos-elevated)',
        },
      }),
    },

    Drawer: {
      defaultProps: { radius: 0 },
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
          borderRadius: 0,
          boxShadow: 'var(--tribos-shadow-card-hover)',
        },
        item: {
          color: 'var(--tribos-text-300)',
          borderRadius: 0,
          transition: 'background-color 100ms ease',
          '&:hover': {
            background: 'var(--tribos-terracotta-surface)',
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
          borderRadius: 0,
          boxShadow: 'var(--tribos-shadow-card)',
          fontFamily: "'DM Mono', monospace",
          fontSize: 11,
        },
      }),
    },

    Notification: {
      defaultProps: { radius: 0 },
      styles: () => ({
        root: {
          background: 'var(--tribos-elevated)',
          border: '1px solid var(--tribos-border-default)',
          borderRadius: 0,
          boxShadow: 'var(--tribos-shadow-card)',
        },
      }),
    },
  },
});

export default theme;
