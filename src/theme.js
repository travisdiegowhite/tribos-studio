import { createTheme } from '@mantine/core';

// Design tokens for tribos.studio
// Inspired by Linear's clean, minimal aesthetic
export const tokens = {
  colors: {
    // Primary: Electric Lime - use sparingly for CTAs and highlights
    electricLime: '#32CD32',
    electricLimeLight: '#5FE35F',
    electricLimeDark: '#28A428',

    // Backgrounds - subtle progression
    bgPrimary: '#0a0a0a',    // Darker base for more contrast
    bgSecondary: '#141414',  // Card backgrounds
    bgTertiary: '#1c1c1c',   // Elevated surfaces
    bgElevated: '#242424',   // Hover states, dropdowns

    // Borders - very subtle
    border: 'rgba(255, 255, 255, 0.08)',
    borderLight: 'rgba(255, 255, 255, 0.12)',
    borderFocus: 'rgba(50, 205, 50, 0.5)',

    // Text - high contrast for readability
    textPrimary: '#fafafa',
    textSecondary: '#a0a0a0',
    textMuted: '#666666',

    // Semantic
    success: '#32CD32',
    warning: '#FFB800',
    error: '#FF4444',
    info: '#00B4D8',

    // Training Zone Colors - FOR CHARTS/VISUALIZATION ONLY
    zone1: '#3B82F6', // Recovery - Blue
    zone2: '#22C55E', // Endurance - Green
    zone3: '#EAB308', // Tempo - Yellow
    zone4: '#F97316', // Threshold - Orange
    zone5: '#EF4444', // VO2max - Red
    zone6: '#A855F7', // Anaerobic - Purple
    zone7: '#EC4899', // Neuromuscular - Pink
  },

  // Shadows for elevation - Linear-style subtle glow
  shadows: {
    xs: '0 1px 2px rgba(0, 0, 0, 0.4)',
    sm: '0 2px 4px rgba(0, 0, 0, 0.4), 0 1px 2px rgba(0, 0, 0, 0.3)',
    md: '0 4px 12px rgba(0, 0, 0, 0.5), 0 2px 4px rgba(0, 0, 0, 0.3)',
    lg: '0 8px 24px rgba(0, 0, 0, 0.6), 0 4px 8px rgba(0, 0, 0, 0.4)',
    // Card shadow with subtle top highlight (Linear effect)
    card: '0 0 0 1px rgba(255, 255, 255, 0.06), 0 2px 8px rgba(0, 0, 0, 0.4)',
    cardHover: '0 0 0 1px rgba(255, 255, 255, 0.1), 0 4px 16px rgba(0, 0, 0, 0.5)',
    // Lime glow for focus states
    focus: '0 0 0 2px rgba(50, 205, 50, 0.3)',
  },

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
};

// Mantine theme configuration
export const theme = createTheme({
  primaryColor: 'lime',
  primaryShade: 6,

  colors: {
    lime: [
      '#f0fdf0',
      '#dcfce7',
      '#bbf7c4',
      '#86efac',
      '#5FE35F',
      '#32CD32', // Primary - index 5
      '#28A428',
      '#1f8a1f',
      '#166d16',
      '#0d520d',
    ],
    dark: [
      '#fafafa', // Brighter text
      '#a0a0a0', // Secondary text
      '#666666', // Muted text
      '#444444', // Dimmed
      '#2a2a2a',
      '#242424', // bg elevated
      '#141414', // bg secondary (cards)
      '#0a0a0a', // bg primary (body)
      '#050505',
      '#000000',
    ],
  },

  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  fontFamilyMonospace: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',

  headings: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontWeight: '600',
    sizes: {
      h1: { fontSize: '1.75rem', lineHeight: '1.3', fontWeight: '600' },
      h2: { fontSize: '1.375rem', lineHeight: '1.35', fontWeight: '600' },
      h3: { fontSize: '1.125rem', lineHeight: '1.4', fontWeight: '600' },
      h4: { fontSize: '1rem', lineHeight: '1.4', fontWeight: '600' },
    },
  },

  defaultRadius: 'md',

  other: {
    // Expose tokens to components via theme.other
    transitions: tokens.transitions,
    shadows: tokens.shadows,
  },

  components: {
    Button: {
      defaultProps: {
        radius: 'md',
      },
      styles: (theme, props) => ({
        root: {
          fontWeight: 500,
          transition: 'all 150ms ease',
          // Subtle shadow on filled buttons
          ...(props.variant === 'filled' && {
            boxShadow: tokens.shadows.sm,
          }),
          '&:hover': {
            transform: 'translateY(-1px)',
          },
          '&:active': {
            transform: 'translateY(0)',
          },
        },
      }),
    },

    Card: {
      defaultProps: {
        radius: 'lg',
        padding: 'lg',
      },
      styles: {
        root: {
          backgroundColor: tokens.colors.bgSecondary,
          border: `1px solid ${tokens.colors.border}`,
          boxShadow: tokens.shadows.card,
          transition: 'all 150ms ease',
          '&:hover': {
            boxShadow: tokens.shadows.cardHover,
            borderColor: tokens.colors.borderLight,
          },
        },
      },
    },

    Paper: {
      defaultProps: {
        radius: 'md',
      },
      styles: (theme, props) => ({
        root: {
          backgroundColor: tokens.colors.bgSecondary,
          ...(props.withBorder && {
            border: `1px solid ${tokens.colors.border}`,
            boxShadow: tokens.shadows.card,
            transition: 'all 150ms ease',
            '&:hover': {
              boxShadow: tokens.shadows.cardHover,
              borderColor: tokens.colors.borderLight,
            },
          }),
        },
      }),
    },

    TextInput: {
      defaultProps: {
        radius: 'md',
      },
      styles: {
        input: {
          backgroundColor: tokens.colors.bgPrimary,
          borderColor: tokens.colors.border,
          transition: 'border-color 150ms ease, box-shadow 150ms ease',
          '&:focus': {
            borderColor: tokens.colors.electricLime,
            boxShadow: tokens.shadows.focus,
          },
        },
      },
    },

    PasswordInput: {
      defaultProps: {
        radius: 'md',
      },
    },

    Select: {
      defaultProps: {
        radius: 'md',
      },
      styles: {
        input: {
          backgroundColor: tokens.colors.bgPrimary,
          borderColor: tokens.colors.border,
        },
        dropdown: {
          backgroundColor: tokens.colors.bgSecondary,
          border: `1px solid ${tokens.colors.border}`,
          boxShadow: tokens.shadows.lg,
        },
      },
    },

    Menu: {
      styles: {
        dropdown: {
          backgroundColor: tokens.colors.bgSecondary,
          border: `1px solid ${tokens.colors.border}`,
          boxShadow: tokens.shadows.lg,
        },
        item: {
          transition: 'background-color 100ms ease',
        },
      },
    },

    Modal: {
      defaultProps: {
        radius: 'lg',
        centered: true,
      },
      styles: {
        content: {
          backgroundColor: tokens.colors.bgSecondary,
          boxShadow: tokens.shadows.lg,
        },
        header: {
          backgroundColor: tokens.colors.bgSecondary,
        },
      },
    },

    Drawer: {
      styles: {
        content: {
          backgroundColor: tokens.colors.bgSecondary,
        },
      },
    },

    Notification: {
      defaultProps: {
        radius: 'md',
      },
      styles: {
        root: {
          backgroundColor: tokens.colors.bgSecondary,
          border: `1px solid ${tokens.colors.border}`,
          boxShadow: tokens.shadows.md,
        },
      },
    },

    Tabs: {
      styles: {
        tab: {
          transition: 'all 150ms ease',
          '&[data-active]': {
            borderColor: tokens.colors.electricLime,
          },
        },
      },
    },

    Badge: {
      styles: {
        root: {
          fontWeight: 500,
          textTransform: 'none',
        },
      },
    },

    Tooltip: {
      styles: {
        tooltip: {
          backgroundColor: tokens.colors.bgElevated,
          color: tokens.colors.textPrimary,
          boxShadow: tokens.shadows.md,
          border: `1px solid ${tokens.colors.border}`,
        },
      },
    },

    ActionIcon: {
      styles: {
        root: {
          transition: 'all 150ms ease',
        },
      },
    },
  },
});

export default theme;
