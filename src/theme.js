import { createTheme } from '@mantine/core';

// Design tokens for tribos.studio
// Supports both dark (default) and light (Claude-inspired cream) themes

// Dark theme tokens - Linear-inspired
export const darkTokens = {
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
};

// Light theme tokens - Claude-inspired muted cream
export const lightTokens = {
  colors: {
    // Primary: Adjusted lime for light backgrounds
    electricLime: '#22A822',
    electricLimeLight: '#32CD32',
    electricLimeDark: '#1A8A1A',

    // Backgrounds - warm cream tones
    bgPrimary: '#FAF9F6',    // Warm off-white
    bgSecondary: '#FFFFFF',   // Pure white for cards
    bgTertiary: '#F5F0E8',    // Subtle cream
    bgElevated: '#FFFEFA',    // Elevated surfaces

    // Borders - subtle warm grays
    border: 'rgba(0, 0, 0, 0.08)',
    borderLight: 'rgba(0, 0, 0, 0.12)',
    borderFocus: 'rgba(34, 168, 34, 0.5)',

    // Text - warm dark tones for readability
    textPrimary: '#1a1a1a',
    textSecondary: '#5c5c5c',
    textMuted: '#8c8c8c',

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
  primaryColor: 'lime',
  primaryShade: { light: 6, dark: 5 },

  colors: {
    lime: [
      '#f0fdf0',
      '#dcfce7',
      '#bbf7c4',
      '#86efac',
      '#5FE35F',
      '#32CD32', // Primary dark - index 5
      '#22A822', // Primary light - index 6
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
    transitions: sharedTokens.transitions,
    // Note: shadows are now theme-dependent, use useThemeTokens()
  },

  components: {
    Button: {
      defaultProps: {
        radius: 'md',
      },
      styles: () => ({
        root: {
          fontWeight: 500,
          transition: 'all 150ms ease',
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
      styles: (theme) => ({
        root: {
          backgroundColor: 'var(--tribos-bg-secondary)',
          border: '1px solid var(--tribos-border)',
          boxShadow: 'var(--tribos-shadow-card)',
          transition: 'all 150ms ease',
          '&:hover': {
            boxShadow: 'var(--tribos-shadow-card-hover)',
            borderColor: 'var(--tribos-border-light)',
          },
        },
      }),
    },

    Paper: {
      defaultProps: {
        radius: 'md',
      },
      styles: (theme, props) => ({
        root: {
          backgroundColor: 'var(--tribos-bg-secondary)',
          ...(props.withBorder && {
            border: '1px solid var(--tribos-border)',
            boxShadow: 'var(--tribos-shadow-card)',
            transition: 'all 150ms ease',
            '&:hover': {
              boxShadow: 'var(--tribos-shadow-card-hover)',
              borderColor: 'var(--tribos-border-light)',
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
          backgroundColor: 'var(--tribos-bg-primary)',
          borderColor: 'var(--tribos-border)',
          transition: 'border-color 150ms ease, box-shadow 150ms ease',
          '&:focus': {
            borderColor: 'var(--tribos-lime)',
            boxShadow: 'var(--tribos-shadow-focus)',
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
          backgroundColor: 'var(--tribos-bg-primary)',
          borderColor: 'var(--tribos-border)',
        },
        dropdown: {
          backgroundColor: 'var(--tribos-bg-secondary)',
          border: '1px solid var(--tribos-border)',
          boxShadow: 'var(--tribos-shadow-lg)',
        },
      },
    },

    Menu: {
      styles: {
        dropdown: {
          backgroundColor: 'var(--tribos-bg-secondary)',
          border: '1px solid var(--tribos-border)',
          boxShadow: 'var(--tribos-shadow-lg)',
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
          backgroundColor: 'var(--tribos-bg-secondary)',
          boxShadow: 'var(--tribos-shadow-lg)',
        },
        header: {
          backgroundColor: 'var(--tribos-bg-secondary)',
        },
      },
    },

    Drawer: {
      styles: {
        content: {
          backgroundColor: 'var(--tribos-bg-secondary)',
        },
      },
    },

    Notification: {
      defaultProps: {
        radius: 'md',
      },
      styles: {
        root: {
          backgroundColor: 'var(--tribos-bg-secondary)',
          border: '1px solid var(--tribos-border)',
          boxShadow: 'var(--tribos-shadow-md)',
        },
      },
    },

    Tabs: {
      styles: {
        tab: {
          transition: 'all 150ms ease',
          '&[data-active]': {
            borderColor: 'var(--tribos-lime)',
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
          backgroundColor: 'var(--tribos-bg-elevated)',
          color: 'var(--tribos-text-primary)',
          boxShadow: 'var(--tribos-shadow-md)',
          border: '1px solid var(--tribos-border)',
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
