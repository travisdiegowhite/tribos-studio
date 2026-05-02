import { createTheme } from '@mantine/core';

// Design tokens for tribos.studio
// Tribos brand system — teal / orange / gold / coral
// Barlow Condensed / Barlow / DM Mono
// Light: warm neutral, Dark: warm dark

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

// Light theme tokens (default — warm neutral)
export const lightTokens = {
  colors: {
    // Primary accent: Teal (via terracotta token for backward compat)
    accent: '#2A8C82',
    terracotta: '#2A8C82',
    terracottaLight: '#3BA89D',
    terracottaDark: '#1E6B63',

    // Brand accents — 4 semantic colors
    teal: '#2A8C82',       // Primary — CTAs, active states, links
    orange: '#D4600A',     // Effort — power, workouts, intensity
    gold: '#C49A0A',       // Achievement — optimal, CTL, gains
    coral: '#C43C2A',      // Warning — fatigue, errors, overtraining

    // Legacy accent names (backward compat → new palette)
    mauve: '#7A7970',      // → muted text
    sage: '#C49A0A',       // → gold (was success/green)
    dustyRose: '#D4600A',  // → orange
    skyPale: '#D4600A',    // → orange

    // Backgrounds — warm neutral
    bgPrimary: '#F4F4F2',
    bgSecondary: '#EBEBE8',
    bgTertiary: '#EBEBE8',
    bgElevated: '#FFFFFF',
    warmBg: '#FBF6F2',
    neutralGray: '#B4B2A9',

    // Borders
    border: '#DDDDD8',
    borderLight: '#DDDDD8',
    borderFocus: 'rgba(42, 140, 130, 0.5)',

    // Text
    textPrimary: '#141410',
    textSecondary: '#3D3C36',
    textMuted: '#7A7970',

    // Semantic
    success: '#C49A0A',   // Gold (positive metrics)
    warning: '#C43C2A',   // Coral (fatigue)
    error: '#C43C2A',     // Coral (errors)
    info: '#2A8C82',      // Teal (interactive)

    // Training Zone Colors — deferred from brand overhaul, keep existing
    zone1: '#3D8B50', // Recovery — Green
    zone2: '#4A7A5A', // Endurance — Sage green
    zone3: '#D4820A', // Tempo — Amber
    zone4: '#3A5A8C', // Threshold — Steel blue
    zone5: '#6B7F94', // VO2max — Slate
    zone6: '#8B6B5A', // Anaerobic — Iron
    zone7: '#DDDDD8', // Rest/Neuromuscular — Border

    // Legacy aliases (backward compat)
    electricLime: '#2A8C82',
    electricLimeLight: '#3BA89D',
    electricLimeDark: '#1E6B63',
  },

  shadows: {
    xs: '0 1px 2px rgba(20, 16, 8, 0.04)',
    sm: '0 1px 3px rgba(20, 16, 8, 0.07), 0 4px 12px rgba(20, 16, 8, 0.05)',
    md: '0 2px 6px rgba(20, 16, 8, 0.08), 0 8px 24px rgba(20, 16, 8, 0.07)',
    lg: '0 4px 12px rgba(20, 16, 8, 0.10), 0 2px 4px rgba(20, 16, 8, 0.06)',
    card: '0 1px 3px rgba(20, 16, 8, 0.07), 0 4px 12px rgba(20, 16, 8, 0.05)',
    cardHover: '0 2px 6px rgba(20, 16, 8, 0.08), 0 8px 24px rgba(20, 16, 8, 0.07)',
    focus: '0 0 0 2px rgba(42, 140, 130, 0.25)',
  },
};

// Dark theme tokens (warm dark)
export const darkTokens = {
  colors: {
    // Primary accent: Teal (lifted for dark)
    accent: '#3BA89D',
    terracotta: '#3BA89D',
    terracottaLight: '#4CC0B5',
    terracottaDark: '#2A8C82',

    // Brand accents — lifted for dark contrast
    teal: '#3BA89D',
    orange: '#E87020',
    gold: '#D4AA1A',
    coral: '#D45035',

    // Legacy accent names (backward compat)
    mauve: '#7A7970',
    sage: '#D4AA1A',
    dustyRose: '#E87020',
    skyMuted: '#E87020',

    // Backgrounds — warm dark
    bgPrimary: '#141410',
    bgSecondary: '#1A1A16',
    bgTertiary: '#222220',
    bgElevated: '#2A2A28',
    warmBg: '#1F1A16',
    neutralGray: '#7A7970',

    // Borders
    border: '#2E2E2A',
    borderLight: '#1A1A16',
    borderFocus: 'rgba(59, 168, 157, 0.5)',

    // Text — warm light hierarchy
    textPrimary: '#E8E8E4',
    textSecondary: '#B0B0A8',
    textMuted: '#7A7970',
    textDim: '#4A4A42',

    // Semantic
    success: '#D4AA1A',   // Gold
    warning: '#D45035',   // Coral
    error: '#D45035',     // Coral
    info: '#3BA89D',      // Teal

    // Training Zone Colors — dark adapted (deferred from overhaul)
    zone1: '#52B068', // Recovery — Green (dark)
    zone2: '#407045', // Endurance — Moss (dark)
    zone3: '#F0960C', // Tempo — Amber
    zone4: '#5A7AAC', // Threshold — Steel blue
    zone5: '#6B7F94', // VO2max — Slate
    zone6: '#7A5E4E', // Anaerobic — Iron (dark)
    zone7: '#2E2E2A', // Rest — Border (dark)

    // Legacy aliases
    electricLime: '#3BA89D',
    electricLimeLight: '#4CC0B5',
    electricLimeDark: '#2A8C82',
  },

  shadows: {
    xs: '0 1px 2px rgba(0, 0, 0, 0.2)',
    sm: '0 1px 3px rgba(0, 0, 0, 0.30), 0 4px 12px rgba(0, 0, 0, 0.20)',
    md: '0 2px 6px rgba(0, 0, 0, 0.35), 0 8px 24px rgba(0, 0, 0, 0.25)',
    lg: '0 4px 16px rgba(0, 0, 0, 0.35), 0 2px 6px rgba(0, 0, 0, 0.2)',
    card: '0 1px 3px rgba(0, 0, 0, 0.30), 0 4px 12px rgba(0, 0, 0, 0.20)',
    cardHover: '0 2px 6px rgba(0, 0, 0, 0.35), 0 8px 24px rgba(0, 0, 0, 0.25)',
    focus: '0 0 0 2px rgba(59, 168, 157, 0.3)',
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
  primaryColor: 'teal',
  primaryShade: 5,

  colors: {
    teal: [
      '#E6F4F3', '#CCE9E7', '#99D3CE', '#66BDB5',
      '#33A79C', '#2A8C82', '#237368', '#1B5A4E',
      '#134034', '#0C271A',
    ],
    terracotta: [
      '#E6F4F3', '#CCE9E7', '#99D3CE', '#66BDB5',
      '#33A79C', '#2A8C82', '#237368', '#1B5A4E',
      '#134034', '#0C271A',
    ],
    orange: [
      '#FAEEE6', '#F5DDD0', '#EBBBA1', '#E09872',
      '#D57643', '#D4600A', '#A94D08', '#7F3906',
      '#542604', '#2A1302',
    ],
    gold: [
      '#FBF6E6', '#F5E9BF', '#EDDA8F', '#E4CA5F',
      '#DCBA30', '#C49A0A', '#9D7B08', '#765C06',
      '#4F3D04', '#282002',
    ],
    coral: [
      '#FAEAE8', '#F2D0CB', '#E5A19A', '#D87268',
      '#CC4B3A', '#C43C2A', '#9D3022', '#762419',
      '#4F1811', '#280C08',
    ],
    dark: [
      '#E8E8E4',  // 0 — lightest text
      '#C8C8C0',  // 1 — secondary text
      '#96958D',  // 2 — tertiary text
      '#7A7970',  // 3 — dim/muted text
      '#2E2E2A',  // 4 — borders
      '#2A2A28',  // 5 — elevated
      '#222220',  // 6 — card
      '#1A1A16',  // 7 — surface
      '#141410',  // 8 — panel
      '#0E0E0C',  // 9 — deep
    ],
    gray: [
      '#FFFFFF',  // 0 — elevated / card
      '#F4F4F2',  // 1 — bg
      '#EBEBE8',  // 2 — bg-secondary
      '#DDDDD8',  // 3 — border
      '#DDDDD8',  // 4 — border
      '#7A7970',  // 5 — muted text
      '#3D3C36',  // 6 — secondary text
      '#141410',  // 7 — primary text
      '#0A0A08',  // 8 — deep ink
      '#000000',  // 9 — darkest
    ],
    green: [
      '#E6F4F3', '#CCE9E7', '#99D3CE', '#66BDB5',
      '#33A79C', '#2A8C82', '#237368', '#1B5A4E',
      '#134034', '#0C271A',
    ],
  },

  radius: {
    xs: '0px',
    sm: '0px',
    md: '0px',
    lg: '0px',
    xl: '0px',
  },

  fontFamily: "'Barlow', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  fontFamilyMonospace: "'DM Mono', 'SF Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",

  headings: {
    fontFamily: "'Barlow Condensed', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    sizes: {
      h1: { fontSize: '26px', lineHeight: '1.1' },
      h2: { fontSize: '20px', lineHeight: '1.2' },
      h3: { fontSize: '16px', lineHeight: '1.3' },
      h4: { fontSize: '14px', lineHeight: '1.4' },
    },
  },

  defaultRadius: 0,

  shadows: {
    xs: '0 1px 2px rgba(20,16,8,0.04)',
    sm: '0 1px 3px rgba(20,16,8,0.07), 0 4px 12px rgba(20,16,8,0.05)',
    md: '0 2px 6px rgba(20,16,8,0.08), 0 8px 24px rgba(20,16,8,0.07)',
    lg: '0 4px 12px rgba(20,16,8,0.10), 0 2px 4px rgba(20,16,8,0.06)',
    xl: '0 8px 24px rgba(20,16,8,0.10), 0 4px 8px rgba(20,16,8,0.06)',
  },

  other: {
    transitions: sharedTokens.transitions,
    depth,
    colorBg: '#F4F4F2',
    colorBgSecondary: '#EBEBE8',
    colorCard: '#FFFFFF',
    colorBorder: '#DDDDD8',
    colorNavBg: '#141410',
    colorTeal: '#2A8C82',
    colorOrange: '#D4600A',
    colorGold: '#C49A0A',
    colorCoral: '#C43C2A',
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
            boxShadow: '0 0 0 2px rgba(42, 140, 130, 0.1)',
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
            boxShadow: '0 0 0 2px rgba(42, 140, 130, 0.1)',
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
            boxShadow: '0 0 0 2px rgba(42, 140, 130, 0.1)',
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
          fontFamily: "'DM Mono', monospace",
          fontWeight: 500,
          fontSize: 12,
          letterSpacing: '1px',
          textTransform: 'uppercase',
          padding: '10px 16px',
          border: 'none',
          borderBottom: '2px solid transparent',
          transition: 'all 0.15s',
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
