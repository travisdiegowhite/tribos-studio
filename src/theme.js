import { createTheme } from '@mantine/core';

// Design tokens for tribos.studio
// "Department of Cycling Intelligence" — retro-futuristic field guide
// Anybody / Familjen Grotesk / DM Mono
// Light: parchment-to-bone, Dark: cool green-black

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

// Light theme tokens (default — warmer cool)
export const lightTokens = {
  colors: {
    // Primary accent: Green (via terracotta token)
    terracotta: '#6B8C72',
    terracottaLight: '#82A98A',
    terracottaDark: '#5A7760',

    // Brand accents
    mauve: '#6B7F94',      // Slate (informational, Z5)
    teal: '#5C7A5E',       // Moss (Z2 endurance)
    sage: '#6B8C72',       // Forest (Z1 recovery)
    gold: '#B8860B',       // Amber (Z3 tempo)
    dustyRose: '#8B6B5A',  // Iron (warm brown)
    skyPale: '#8B6B5A',    // Iron

    // Backgrounds — warmer cool
    bgPrimary: '#F7F7F6',     // Page background
    bgSecondary: '#EFEFED',   // Surface (nav)
    bgTertiary: '#E3E3E0',    // Sunken (recessed areas)
    bgElevated: '#FAFAF9',    // Elevated (modals/inputs)

    // Borders
    border: '#E3E3E0',
    borderLight: '#E3E3E0',
    borderFocus: 'rgba(107, 140, 114, 0.5)',

    // Text
    textPrimary: '#111110',
    textSecondary: '#4E4E4A',
    textMuted: '#909088',

    // Semantic — mapped to palette
    success: '#6B8C72',  // Green
    warning: '#B8860B',  // Amber
    error: '#6B8C72',    // Green (primary accent)
    info: '#6B7F94',     // Slate (mauve token)

    // Training Zone Colors — 5 spec zones + 2 extensions
    zone1: '#6B8C72', // Recovery — Forest
    zone2: '#5C7A5E', // Endurance — Moss
    zone3: '#B8860B', // Tempo — Amber
    zone4: '#6B8C72', // Threshold — Green
    zone5: '#6B7F94', // VO2max — Slate
    zone6: '#8B6B5A', // Anaerobic — Iron
    zone7: '#E3E3E0', // Rest/Neuromuscular — Border gray

    // Legacy aliases (backward compat)
    electricLime: '#6B8C72',
    electricLimeLight: '#82A98A',
    electricLimeDark: '#5A7760',
  },

  shadows: {
    xs: '0 1px 2px rgba(0, 0, 0, 0.04)',
    sm: '0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
    md: '0 2px 6px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04)',
    lg: '0 4px 12px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.04)',
    card: '0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
    cardHover: '0 4px 12px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06)',
    focus: '0 0 0 2px rgba(107, 140, 114, 0.25)',
  },
};

// Dark theme tokens (dark slate)
export const darkTokens = {
  colors: {
    // Primary accent: Green (dark-adapted)
    terracotta: '#7FA887',
    terracottaLight: '#98BDA0',
    terracottaDark: '#6A9072',

    // Brand accents — slightly muted for dark
    mauve: '#6B7F94',      // Slate
    mauveDim: '#5B6C7D',
    teal: '#507052',       // Moss (dark)
    tealDim: '#405643',
    sage: '#5E8068',       // Forest (dark)
    gold: '#D49820',       // Amber (dark)
    goldDim: '#B8860B',
    dustyRose: '#7A5E4E',  // Iron (dark)
    skyMuted: '#7A5E4E',   // Iron (dark)

    // Backgrounds — dark slate
    bgPrimary: '#141820',     // Deep (page background)
    bgSecondary: '#1C2230',   // Surface (cards)
    bgTertiary: '#242D3E',    // Elevated
    bgElevated: '#242D3E',    // Elevated (modals)

    // Borders
    border: '#242D3E',
    borderLight: '#1C2230',
    borderFocus: 'rgba(127, 168, 135, 0.5)',

    // Text — cool slate hierarchy
    textPrimary: '#E8EBF2',
    textSecondary: '#C8D0E0',
    textMuted: '#8A90A5',
    textDim: '#5A6175',

    // Semantic
    success: '#7FA887',
    warning: '#D49820',
    error: '#7FA887',
    info: '#6B7F94',

    // Training Zone Colors — dark adapted
    zone1: '#5E8068', // Recovery — Forest (dark)
    zone2: '#507052', // Endurance — Moss (dark)
    zone3: '#D49820', // Tempo — Amber
    zone4: '#7FA887', // Threshold — Green
    zone5: '#6B7F94', // VO2max — Slate
    zone6: '#7A5E4E', // Anaerobic — Iron (dark)
    zone7: '#242D3E', // Rest — Border gray (dark)

    // Legacy aliases
    electricLime: '#7FA887',
    electricLimeLight: '#98BDA0',
    electricLimeDark: '#6A9072',
  },

  shadows: {
    xs: '0 1px 2px rgba(0, 0, 0, 0.2)',
    sm: '0 1px 3px rgba(0, 0, 0, 0.25), 0 1px 2px rgba(0, 0, 0, 0.15)',
    md: '0 2px 8px rgba(0, 0, 0, 0.3), 0 1px 3px rgba(0, 0, 0, 0.2)',
    lg: '0 4px 16px rgba(0, 0, 0, 0.35), 0 2px 6px rgba(0, 0, 0, 0.2)',
    card: '0 1px 3px rgba(0, 0, 0, 0.25), 0 1px 2px rgba(0, 0, 0, 0.15)',
    cardHover: '0 4px 12px rgba(0, 0, 0, 0.35), 0 2px 4px rgba(0, 0, 0, 0.2)',
    focus: '0 0 0 2px rgba(127, 168, 135, 0.3)',
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
      '#F0F5F1', '#D8E6DB', '#BCD4C1', '#9CC1A4',
      '#82A98A', '#6B8C72', '#5A7760', '#4A624F',
      '#3B4E3F', '#2D3B30',
    ],
    sage: [
      '#F0F5F1', '#D8E6DB', '#BCD4C1', '#9CC1A4',
      '#82A98A', '#6B8C72', '#5A7760', '#4A624F',
      '#3B4E3F', '#2D3B30',
    ],
    teal: [
      '#EEF3EF', '#D4E2D6', '#B5CEB8', '#93B896',
      '#77A07A', '#5C7A5E', '#4E6850', '#405643',
      '#334536', '#27352A',
    ],
    mauve: [
      '#F1F4F7', '#D9E0E8', '#BCC8D4', '#9DAFC0',
      '#8497AA', '#6B7F94', '#5B6C7D', '#4B5967',
      '#3C4752', '#2E363E',
    ],
    gold: [
      '#FBF6E8', '#F2E3B8', '#E7CC80', '#DBB44A',
      '#D4A020', '#B8860B', '#9A7009', '#7C5A07',
      '#604506', '#463204',
    ],
    sky: [
      '#F5F0ED', '#E5DCD6', '#D1C1B6', '#BCA495',
      '#A38877', '#8B6B5A', '#765B4C', '#624B3E',
      '#4E3C32', '#3B2E26',
    ],
    dark: [
      '#E8EBF2',  // 0 — lightest text
      '#C8D0E0',  // 1 — secondary text
      '#8A90A5',  // 2 — tertiary text
      '#5A6175',  // 3 — dim text
      '#242D3E',  // 4 — borders
      '#242D3E',  // 5 — elevated
      '#1C2230',  // 6 — card
      '#1C2230',  // 7 — surface
      '#141820',  // 8 — panel
      '#141820',  // 9 — deep
    ],
    gray: [
      '#FAFAF9',  // 0 — elevated
      '#F7F7F6',  // 1 — surface
      '#EFEFED',  // 2 — base
      '#E3E3E0',  // 3 — sunken
      '#E3E3E0',  // 4 — border default
      '#909088',  // 5 — muted text
      '#4E4E4A',  // 6 — secondary text
      '#111110',  // 7 — primary text
      '#0A0A09',  // 8 — deep ink
      '#050504',  // 9 — darkest
    ],
    green: [
      '#F0F5F1', '#D8E6DB', '#BCD4C1', '#9CC1A4',
      '#82A98A', '#6B8C72', '#5A7760', '#4A624F',
      '#3B4E3F', '#2D3B30',
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
          fontSize: 12,
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
            boxShadow: '0 0 0 2px rgba(158, 90, 60, 0.1)',
          },
          '&::placeholder': { color: 'var(--tribos-text-400)' },
        },
        label: {
          fontFamily: "'DM Mono', monospace",
          fontSize: 12,
          fontWeight: 500,
          letterSpacing: '2px',
          textTransform: 'uppercase',
          color: 'var(--tribos-text-300)',
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
            boxShadow: '0 0 0 2px rgba(158, 90, 60, 0.1)',
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

    DateInput: {
      defaultProps: { radius: 0 },
      styles: () => ({
        input: {
          background: 'var(--tribos-input)',
          border: '1px solid var(--tribos-border-default)',
          color: 'var(--tribos-text-100)',
          transition: 'all 0.15s',
          '&:focus': {
            borderColor: 'var(--tribos-terracotta-border)',
            boxShadow: '0 0 0 2px rgba(158, 90, 60, 0.1)',
          },
          '&::placeholder': { color: 'var(--tribos-text-400)' },
        },
        label: {
          fontFamily: "'DM Mono', monospace",
          fontSize: 12,
          fontWeight: 500,
          letterSpacing: '2px',
          textTransform: 'uppercase',
          color: 'var(--tribos-text-300)',
        },
        calendarHeader: {
          background: 'var(--tribos-elevated)',
        },
        day: {
          color: 'var(--tribos-text-100)',
          '&:hover': {
            background: 'var(--tribos-terracotta-surface)',
          },
          '&[data-selected]': {
            background: 'var(--tribos-terracotta-500)',
            color: '#fff',
          },
        },
      }),
    },

    Badge: {
      defaultProps: { radius: 0 },
      styles: () => ({
        root: {
          fontFamily: "'DM Mono', monospace",
          fontWeight: 500,
          fontSize: 11,
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
          fontSize: 12,
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
          color: 'var(--tribos-text-300)',
          fontFamily: "'DM Mono', monospace",
          fontWeight: 500,
          fontSize: 12,
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
          fontSize: 12,
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
