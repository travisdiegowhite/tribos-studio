import { createTheme } from '@mantine/core';

// Design tokens for tribos.studio
// "Department of Cycling Intelligence" — retro-futuristic field guide
// Anybody / Familjen Grotesk / DM Mono
// Light: cooler base, Dark: dark slate

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

// Light theme tokens (default — neutral)
export const lightTokens = {
  colors: {
    // Primary accent: Steel blue (via terracotta token)
    terracotta: '#3A5A8C',
    terracottaLight: '#5A7AAC',
    terracottaDark: '#2E4870',

    // Brand accents
    mauve: '#6B7F94',      // Slate (informational, Z5)
    teal: '#5C7A5E',       // Moss (Z2 endurance)
    sage: '#3D8B50',       // Green (success, positive metrics, AI Coach)
    gold: '#D4820A',       // Amber (warnings, load alerts, fatigue)
    dustyRose: '#8B6B5A',  // Iron (warm brown)
    skyPale: '#8B6B5A',    // Iron

    // Backgrounds — neutral
    bgPrimary: '#F4F4F4',     // Page background
    bgSecondary: '#ECECEC',   // Surface (nav)
    bgTertiary: '#E0E0E0',    // Sunken (recessed areas)
    bgElevated: '#FFFFFF',    // Elevated (modals/inputs)

    // Borders
    border: '#E0E0E0',
    borderLight: '#E0E0E0',
    borderFocus: 'rgba(58, 90, 140, 0.5)',

    // Text
    textPrimary: '#0A0A0A',
    textSecondary: '#383838',
    textMuted: '#717171',

    // Semantic — mapped to palette
    success: '#3D8B50',  // Green
    warning: '#D4820A',  // Amber
    error: '#3A5A8C',    // Primary (steel blue)
    info: '#6B7F94',     // Slate (mauve token)

    // Training Zone Colors — 5 spec zones + 2 extensions
    zone1: '#3D8B50', // Recovery — Green
    zone2: '#4A7A5A', // Endurance — Sage green
    zone3: '#D4820A', // Tempo — Amber
    zone4: '#3A5A8C', // Threshold — Steel blue
    zone5: '#6B7F94', // VO2max — Slate
    zone6: '#8B6B5A', // Anaerobic — Iron
    zone7: '#E0E0E0', // Rest/Neuromuscular — Border gray

    // Legacy aliases (backward compat)
    electricLime: '#3A5A8C',
    electricLimeLight: '#5A7AAC',
    electricLimeDark: '#2E4870',
  },

  shadows: {
    xs: '0 1px 2px rgba(0, 0, 0, 0.04)',
    sm: '0 1px 3px rgba(0, 0, 0, 0.07), 0 4px 12px rgba(0, 0, 0, 0.05)',
    md: '0 2px 6px rgba(0, 0, 0, 0.07), 0 4px 12px rgba(0, 0, 0, 0.05)',
    lg: '0 4px 12px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06)',
    card: '0 1px 3px rgba(0, 0, 0, 0.07), 0 4px 12px rgba(0, 0, 0, 0.05)',
    cardHover: '0 4px 12px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06)',
    focus: '0 0 0 2px rgba(58, 90, 140, 0.25)',
  },
};

// Dark theme tokens (dark slate)
export const darkTokens = {
  colors: {
    // Primary accent: Steel blue (dark-adapted)
    terracotta: '#5A7AAC',
    terracottaLight: '#7A9AC4',
    terracottaDark: '#4A6890',

    // Brand accents — slightly muted for dark
    mauve: '#6B7F94',      // Slate
    mauveDim: '#5B6C7D',
    teal: '#507052',       // Moss (dark)
    tealDim: '#405643',
    sage: '#52B068',       // Green (dark, success, lifted for contrast)
    gold: '#F0960C',       // Amber (dark, warnings, lifted for contrast)
    goldDim: '#D4820A',
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
    borderFocus: 'rgba(90, 122, 172, 0.5)',

    // Text — cool slate hierarchy
    textPrimary: '#E8EBF2',
    textSecondary: '#C8D0E0',
    textMuted: '#8A90A5',
    textDim: '#5A6175',

    // Semantic
    success: '#52B068',
    warning: '#F0960C',
    error: '#5A7AAC',
    info: '#6B7F94',

    // Training Zone Colors — dark adapted
    zone1: '#52B068', // Recovery — Green (dark)
    zone2: '#407045', // Endurance — Moss (dark)
    zone3: '#F0960C', // Tempo — Amber
    zone4: '#5A7AAC', // Threshold — Steel blue
    zone5: '#6B7F94', // VO2max — Slate
    zone6: '#7A5E4E', // Anaerobic — Iron (dark)
    zone7: '#242D3E', // Rest — Border gray (dark)

    // Legacy aliases
    electricLime: '#5A7AAC',
    electricLimeLight: '#7A9AC4',
    electricLimeDark: '#4A6890',
  },

  shadows: {
    xs: '0 1px 2px rgba(0, 0, 0, 0.2)',
    sm: '0 1px 3px rgba(0, 0, 0, 0.3), 0 4px 12px rgba(0, 0, 0, 0.2)',
    md: '0 2px 8px rgba(0, 0, 0, 0.3), 0 4px 12px rgba(0, 0, 0, 0.2)',
    lg: '0 4px 16px rgba(0, 0, 0, 0.35), 0 2px 6px rgba(0, 0, 0, 0.2)',
    card: '0 1px 3px rgba(0, 0, 0, 0.3), 0 4px 12px rgba(0, 0, 0, 0.2)',
    cardHover: '0 4px 12px rgba(0, 0, 0, 0.35), 0 2px 4px rgba(0, 0, 0, 0.2)',
    focus: '0 0 0 2px rgba(90, 122, 172, 0.3)',
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
      '#EFF3F8', '#D4DFED', '#B0C5DD', '#8AAACE',
      '#5A7AAC', '#3A5A8C', '#2E4870', '#233858',
      '#1A2A42', '#121E30',
    ],
    sage: [
      '#EDF7EF', '#D0EAD5', '#A8D8B2', '#7CC58D',
      '#57B26C', '#3D8B50', '#327440', '#285E33',
      '#1F4927', '#17361D',
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
      '#FDF5E6', '#F8E2B0', '#F2CA72', '#ECB23A',
      '#E4980F', '#D4820A', '#B06C08', '#8C5606',
      '#6C4205', '#503104',
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
      '#FFFFFF',  // 0 — elevated / card
      '#F4F4F4',  // 1 — surface
      '#ECECEC',  // 2 — base
      '#E0E0E0',  // 3 — sunken
      '#E0E0E0',  // 4 — border default
      '#717171',  // 5 — muted text
      '#383838',  // 6 — secondary text
      '#0A0A0A',  // 7 — primary text
      '#050505',  // 8 — deep ink
      '#000000',  // 9 — darkest
    ],
    green: [
      '#EDF7EF', '#D0EAD5', '#A8D8B2', '#7CC58D',
      '#57B26C', '#3D8B50', '#327440', '#285E33',
      '#1F4927', '#17361D',
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
    sm: '0 1px 3px rgba(0,0,0,0.07), 0 4px 12px rgba(0,0,0,0.05)',
    md: '0 2px 6px rgba(0,0,0,0.07), 0 4px 12px rgba(0,0,0,0.05)',
    lg: '0 4px 12px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.06)',
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
