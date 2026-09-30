import { createTheme, defaultVariantColorsResolver, parseThemeColor } from '@mantine/core';

// Design tokens for tribos.studio
// Podium palette on the zine layout — white paper, black ink, three bright
// hues and one ultramarine accent. Tribos Display (condensed Archivo, headings and stamps) /
// Archivo (UI) / Courier Prime (numbers, the coach), plus a marker hand.
// Direction + rollout: docs/DESIGN-OVERHAUL-PLAN-2026-09.md
//
// Roles (the legacy teal/orange/gold/coral keys below resolve to these):
//   ink    — near-black: text, lines, primary actions
//   accent — ultramarine, sparingly: active tab, links, endurance, the tick
//   signal — magenta: effort, CTAs, stamps, hand notes, warnings
//   done   — ridden/completed, always with the hand-drawn tick
//   easy   — cyan: recovery and "planned"
//   moment — lime, for overprints and the coach block; never text

// ===== Depth Presets =====
// Flat surfaces, sharp corners, no shadows — hierarchy comes from rules and type
export const depth = {
  card: {
    background: 'var(--tribos-card)',
    border: '1.5px solid var(--tribos-border-default)',
    borderRadius: 0,
    boxShadow: 'none',
    boxShadowHover: 'none',
  },

  accentCard: {
    background: 'var(--tribos-card)',
    border: '1.5px solid var(--tribos-terracotta-border)',
    borderRadius: 0,
    boxShadow: 'none',
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

const NO_SHADOWS = {
  xs: 'none',
  sm: 'none',
  md: 'none',
  lg: 'none',
  card: 'none',
  cardHover: 'none',
};

// Light theme tokens (default — warm paper)
export const lightTokens = {
  colors: {
    // Roles
    ink: '#0A0A14',
    signal: '#FF3DB8',
    signalText: '#C4007A',
    done: '#2B2BFF',
    easy: '#006DA8',
    moment: '#B6F500',
    highlight: '#B6F500',
    stamp: '#C4007A',

    // Primary accent (legacy key names kept; values are the ink role)
    accent: '#0A0A14',
    terracotta: '#0A0A14',
    terracottaLight: '#2A2A36',
    terracottaDark: '#000000',

    // Legacy brand keys → roles
    teal: '#0A0A14',       // → ink (primary, links, active)
    orange: '#FF3DB8',     // → signal (effort)
    gold: '#2B2BFF',       // → done (achievement, ridden)
    coral: '#C4007A',      // → signal text (warning, errors)

    // Legacy accent names (backward compat)
    mauve: '#5E5E6E',
    sage: '#2B2BFF',
    dustyRose: '#FF3DB8',
    skyPale: '#006DA8',

    // Backgrounds — paper
    bgPrimary: '#FFFFFF',
    bgSecondary: '#F8F8FA',
    bgTertiary: '#F8F8FA',
    bgElevated: '#F3F3F6',

    // Borders
    border: '#D6D6E0',
    borderLight: '#D6D6E0',
    borderFocus: 'rgba(10, 10, 20, 0.55)',

    // Text
    textPrimary: '#0A0A14',
    textSecondary: '#3C3C4A',
    textMuted: '#5E5E6E',

    // Semantic
    success: '#2B2BFF',
    warning: '#C4007A',
    error: '#C4007A',
    info: '#006DA8',

    // Training zones — one Podium hue per kind of effort: cyan, ultramarine,
    // lime, magenta, then deep magenta and black at the top end.
    zone1: '#00C2FF', // Recovery — cyan
    zone2: '#2B2BFF', // Endurance — ultramarine
    zone3: '#94C700', // Tempo — lime
    zone4: '#FF3DB8', // Threshold — magenta
    zone5: '#C4007A', // VO2max — deep magenta
    zone6: '#0A0A14', // Anaerobic — black
    zone7: '#D6D6E0', // Rest/Neuromuscular — rule colour

    // Legacy aliases (backward compat)
    electricLime: '#0A0A14',
    electricLimeLight: '#2A2A36',
    electricLimeDark: '#000000',
  },

  shadows: {
    ...NO_SHADOWS,
    focus: '0 0 0 2px rgba(10, 10, 20, 0.28)',
  },
};

// Dark theme tokens — the page is the ink, text is paper
export const darkTokens = {
  colors: {
    // Roles
    ink: '#FFFFFF',
    signal: '#FF3DB8',
    signalText: '#FF6FCB',
    done: '#8C8CFF',
    easy: '#00C2FF',
    moment: '#B6F500',
    highlight: '#B6F500',
    stamp: '#FF6FCB',

    accent: '#FFFFFF',
    terracotta: '#FFFFFF',
    terracottaLight: '#FFFFFF',
    terracottaDark: '#C8C8D2',

    teal: '#FFFFFF',
    orange: '#FF3DB8',
    gold: '#8C8CFF',
    coral: '#FF6FCB',

    mauve: '#A0A0AE',
    sage: '#8C8CFF',
    dustyRose: '#FF3DB8',
    skyMuted: '#00C2FF',

    // Backgrounds — ink
    bgPrimary: '#0A0A14',
    bgSecondary: '#111118',
    bgTertiary: '#1A1A22',
    bgElevated: '#24242E',

    // Borders
    border: '#2C2C38',
    borderLight: '#111118',
    borderFocus: 'rgba(255, 255, 255, 0.5)',

    // Text — paper hierarchy
    textPrimary: '#FFFFFF',
    textSecondary: '#C8C8D2',
    textMuted: '#A0A0AE',
    textDim: '#5E5E6E',

    // Semantic
    success: '#8C8CFF',
    warning: '#FF6FCB',
    error: '#FF6FCB',
    info: '#00C2FF',

    // Training zones — same steps, lifted for the dark page
    zone1: '#00C2FF', // Recovery
    zone2: '#8C8CFF', // Endurance
    zone3: '#B6F500', // Tempo
    zone4: '#FF6FCB', // Threshold
    zone5: '#FF3DB8', // VO2max
    zone6: '#FFFFFF', // Anaerobic
    zone7: '#2C2C38', // Rest — rule colour

    // Legacy aliases
    electricLime: '#FFFFFF',
    electricLimeLight: '#FFFFFF',
    electricLimeDark: '#C8C8D2',
  },

  shadows: {
    ...NO_SHADOWS,
    focus: '0 0 0 2px rgba(255, 255, 255, 0.30)',
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

// Mantine colour ramps. Index 5 is the base shade; dark mode fills use
// shade 1 (pale) with dark text — see variantColorResolver.
const INK = [
  '#F3F3F6', '#E4E4EA', '#C9C9D3', '#9C9CAA', '#6A6A7A',
  '#0A0A14', '#1E1E2A', '#050509', '#030306', '#000000',
];
// Ultramarine — an accent only: the active tab, links, endurance, the tick.
const ACCENT = [
  '#EEEEFF', '#DCDCFF', '#B8B8FF', '#8C8CFF', '#5C5CFF',
  '#2B2BFF', '#2020D6', '#1818A8', '#10107A', '#08084D',
];
const SIGNAL = [
  '#FFEDF8', '#FFD1EE', '#FFA3DC', '#FF75CB', '#FF58C1',
  '#FF3DB8', '#C4007A', '#990060', '#700046', '#4A002E',
];
const MOSS = [
  '#F6FFE0', '#EBFFB8', '#DAFF80', '#C9FF4D', '#BFFF26',
  '#B6F500', '#94C700', '#739A00', '#526E00', '#324300',
];
const EASY = [
  '#E5F8FF', '#C2EFFF', '#8FE2FF', '#5CD5FF', '#2ECBFF',
  '#00C2FF', '#0098C9', '#006DA8', '#004F7A', '#00324D',
];
const MOMENT = [
  '#F6FFE0', '#EBFFB8', '#DAFF80', '#C9FF4D', '#BFFF26',
  '#B6F500', '#94C700', '#739A00', '#526E00', '#324300',
];

const FONT_DISPLAY = "'Tribos Display', 'Archivo', 'Arial Narrow', sans-serif";
const FONT_BODY = "'Archivo', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const FONT_MONO = "'Courier Prime', 'Courier New', ui-monospace, monospace";

// Labels, buttons, tabs and badges are sentence case in the body face —
// the old uppercase-mono treatment is what read as a template.
const LABEL = {
  fontFamily: FONT_BODY,
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: 0,
  textTransform: 'none',
  color: 'var(--tribos-text-300)',
};

// Text on a filled button/badge. Mantine's autoContrast judges lightness from
// the light-scheme shade, but dark mode fills with a pale shade (primaryShade
// dark: 1), which left white text on a pale fill. Each role's "on" colour is a
// CSS variable set per scheme in global.css, so text always matches its fill.
const FILLED_TEXT_ROLE = {
  ink: 'ink', teal: 'ink', terracotta: 'ink',
  signal: 'signal', orange: 'signal', coral: 'signal', red: 'signal', stamp: 'stamp',
  moss: 'done', green: 'done', gold: 'done',
  easy: 'easy', cyan: 'easy',
  accent: 'accent', blue: 'accent', indigo: 'accent',
  moment: 'highlight', highlight: 'highlight',
};

function variantColorResolver(input) {
  // The system has no gradients: a `variant="gradient"` button renders as a
  // flat fill of its first colour, with the same scheme-aware text.
  if (input.variant === 'gradient') {
    return variantColorResolver({
      ...input,
      variant: 'filled',
      color: input.gradient?.from || input.theme.primaryColor,
    });
  }
  const colors = defaultVariantColorsResolver(input);
  if (input.variant === 'filled') {
    const parsed = parseThemeColor({ color: input.color || input.theme.primaryColor, theme: input.theme });
    const role = parsed.isThemeColor && parsed.shade === undefined ? FILLED_TEXT_ROLE[parsed.color] : undefined;
    if (role) return { ...colors, color: `var(--tribos-on-${role})` };
  }
  return colors;
}

// Mantine theme configuration
export const theme = createTheme({
  primaryColor: 'ink',
  // Dark mode fills primary actions with the pale shade (1) and dark text.
  primaryShade: { light: 5, dark: 1 },
  autoContrast: true,
  luminanceThreshold: 0.35,
  variantColorResolver,
  black: '#0A0A14',
  white: '#FFFFFF',

  colors: {
    ink: INK,
    signal: SIGNAL,
    moss: MOSS,
    easy: EASY,
    moment: MOMENT,
    highlight: MOMENT,
    stamp: SIGNAL,
    // Legacy and Mantine palette names used as `color="…"` props across the app
    teal: INK,
    terracotta: INK,
    green: MOSS,
    gold: MOSS,
    orange: SIGNAL,
    coral: SIGNAL,
    red: SIGNAL,
    blue: ACCENT,
    indigo: ACCENT,
    accent: ACCENT,
    cyan: EASY,
    dark: [
      '#FFFFFF',  // 0 — primary text
      '#E2E2E8',  // 1 — secondary text
      '#C8C8D2',  // 2 — tertiary text
      '#A0A0AE',  // 3 — muted text
      '#2C2C38',  // 4 — borders
      '#24242E',  // 5 — elevated
      '#1A1A22',  // 6 — card
      '#111118',  // 7 — surface
      '#0A0A14',  // 8 — page
      '#050509',  // 9 — deep
    ],
    gray: [
      '#F8F8FA',  // 0 — tint
      '#FFFFFF',  // 1 — page
      '#F3F3F6',  // 2 — sheet
      '#D6D6E0',  // 3 — rule
      '#D6D6E0',  // 4 — rule
      '#5E5E6E',  // 5 — muted text
      '#3C3C4A',  // 6 — secondary text
      '#0A0A14',  // 7 — ink (ultramarine)
      '#1E1E2A',  // 8 — deep ink
      '#0A0A14',  // 9 — black
    ],
  },

  radius: {
    xs: '0px',
    sm: '0px',
    md: '0px',
    lg: '0px',
    xl: '0px',
  },

  fontFamily: FONT_BODY,
  fontFamilyMonospace: FONT_MONO,

  headings: {
    fontFamily: FONT_DISPLAY,
    fontWeight: '900',
    sizes: {
      h1: { fontSize: '56px', lineHeight: '0.9' },
      h2: { fontSize: '40px', lineHeight: '0.92' },
      h3: { fontSize: '26px', lineHeight: '1' },
      h4: { fontSize: '18px', lineHeight: '1.1' },
    },
  },

  defaultRadius: 0,

  shadows: {
    xs: 'none',
    sm: 'none',
    md: 'none',
    lg: 'none',
    xl: 'none',
  },

  other: {
    transitions: sharedTokens.transitions,
    depth,
    fontDisplay: FONT_DISPLAY,
    fontBody: FONT_BODY,
    fontMono: FONT_MONO,
    colorBg: '#FFFFFF',
    colorBgSecondary: '#F8F8FA',
    colorCard: '#F3F3F6',
    colorBorder: '#D6D6E0',
    colorNavBg: '#FFFFFF',
    colorInk: '#0A0A14',
    colorSignal: '#FF3DB8',
    colorDone: '#2B2BFF',
    colorAccent: '#2B2BFF',
    colorEasy: '#006DA8',
    colorHighlight: '#B6F500',
    colorStamp: '#C4007A',
    // Legacy names
    colorTeal: '#0A0A14',
    colorOrange: '#FF3DB8',
    colorGold: '#0A0A14',
    colorCoral: '#C4007A',
  },

  components: {
    Paper: {
      defaultProps: { radius: 0 },
      styles: () => ({
        root: {
          background: 'var(--tribos-card)',
          border: '1.5px solid var(--tribos-border-default)',
          borderRadius: 0,
          boxShadow: 'none',
          transition: 'border-color 0.15s ease',
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
          boxShadow: 'none',
          overflow: 'hidden',
          transition: 'border-color 0.15s ease',
          '&:hover': {
            borderColor: 'var(--tribos-border-hover)',
          },
        },
      }),
    },

    Button: {
      defaultProps: { radius: 0 },
      styles: () => ({
        root: {
          fontFamily: FONT_BODY,
          fontWeight: 500,
          letterSpacing: 0,
          textTransform: 'none',
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
            borderColor: 'var(--tribos-terracotta-border-strong)',
            boxShadow: '0 0 0 2px var(--color-ink-subtle)',
          },
          '&::placeholder': { color: 'var(--tribos-text-400)' },
        },
        label: LABEL,
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
            borderColor: 'var(--tribos-terracotta-border-strong)',
            boxShadow: '0 0 0 2px var(--color-ink-subtle)',
          },
        },
        label: LABEL,
      }),
    },

    PasswordInput: {
      defaultProps: { radius: 0 },
      styles: () => ({ label: LABEL }),
    },

    Select: {
      defaultProps: { radius: 0 },
      styles: () => ({
        input: {
          background: 'var(--tribos-input)',
          border: '1px solid var(--tribos-border-default)',
          color: 'var(--tribos-text-100)',
        },
        label: LABEL,
        dropdown: {
          background: 'var(--tribos-elevated)',
          border: '1.5px solid var(--tribos-border-hover)',
          borderRadius: 0,
          boxShadow: 'none',
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
            borderColor: 'var(--tribos-terracotta-border-strong)',
            boxShadow: '0 0 0 2px var(--color-ink-subtle)',
          },
          '&::placeholder': { color: 'var(--tribos-text-400)' },
        },
        label: LABEL,
        calendarHeader: {
          background: 'var(--tribos-elevated)',
        },
        day: {
          color: 'var(--tribos-text-100)',
          '&:hover': {
            background: 'var(--tribos-terracotta-surface)',
          },
          '&[data-selected]': {
            background: 'var(--color-ink)',
            color: 'var(--color-bg)',
          },
        },
      }),
    },

    Badge: {
      defaultProps: { radius: 0 },
      styles: () => ({
        root: {
          fontFamily: FONT_BODY,
          fontWeight: 600,
          letterSpacing: 0,
          textTransform: 'none',
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
          fontFamily: FONT_BODY,
          fontWeight: 500,
          fontSize: 15,
          letterSpacing: 0,
          textTransform: 'none',
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
          background: 'var(--color-ink)',
          border: 'none',
          borderRadius: 0,
          boxShadow: 'none',
        },
        label: {
          color: 'var(--tribos-text-300)',
          fontFamily: FONT_BODY,
          fontWeight: 600,
          fontSize: 13,
          letterSpacing: 0,
          textTransform: 'none',
          '&[data-active]': { color: 'var(--color-bg) !important' },
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
          background: 'var(--color-nav-bg)',
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
            color: 'var(--color-ink)',
            borderLeft: '2px solid var(--color-signal)',
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
          border: '1.5px solid var(--tribos-border-hover)',
          borderRadius: 0,
          boxShadow: 'none',
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
          border: '1.5px solid var(--tribos-border-hover)',
          borderRadius: 0,
          boxShadow: 'none',
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
          background: 'var(--color-ink)',
          border: 'none',
          color: 'var(--color-bg)',
          borderRadius: 0,
          boxShadow: 'none',
          fontFamily: FONT_BODY,
          fontSize: 13,
        },
      }),
    },

    Notification: {
      defaultProps: { radius: 0 },
      styles: () => ({
        root: {
          background: 'var(--tribos-elevated)',
          border: '1.5px solid var(--tribos-border-hover)',
          borderRadius: 0,
          boxShadow: 'none',
        },
      }),
    },
  },
});

export default theme;
