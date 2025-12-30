import { createTheme } from '@mantine/core';

// Design tokens for tribos.studio
export const tokens = {
  colors: {
    // Primary: Electric Lime
    electricLime: '#32CD32',
    electricLimeLight: '#5FE35F',
    electricLimeDark: '#28A428',

    // Backgrounds
    bgPrimary: '#121212',
    bgSecondary: '#1a1a1a',
    bgTertiary: '#222222',
    bgElevated: '#2a2a2a',

    // Text
    textPrimary: '#ffffff',
    textSecondary: '#B8B8B8',
    textMuted: '#999999',

    // Semantic
    success: '#32CD32',
    warning: '#FFB800',
    error: '#FF4444',
    info: '#00B4D8',

    // Training Zone Colors - FOR CHARTS/VISUALIZATION ONLY
    // Do NOT use for buttons, badges, or interactive elements
    // See: src/components/ui/zoneColors.js for helper utilities
    // See: docs/visual-hierarchy-guide.md for guidelines
    zone1: '#3B82F6', // Recovery - Blue
    zone2: '#22C55E', // Endurance - Green
    zone3: '#EAB308', // Tempo - Yellow
    zone4: '#F97316', // Threshold - Orange
    zone5: '#EF4444', // VO2max - Red
    zone6: '#A855F7', // Anaerobic - Purple
    zone7: '#EC4899', // Neuromuscular - Pink
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
    sm: '4px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    full: '9999px',
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
      '#E0E0E0', // Brighter for better readability
      '#C8C8C8', // Brighter secondary text
      '#B0B0B0', // Brighter muted text
      '#909090', // Improved dimmed text
      '#373A40',
      '#2a2a2a', // bg elevated
      '#1a1a1a', // bg secondary (cards)
      '#121212', // bg primary (body) - Mantine uses dark[7] for body
      '#0d0d0d',
      '#080808',
    ],
  },

  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  fontFamilyMonospace: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',

  headings: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontWeight: '600',
  },

  defaultRadius: 'md',

  components: {
    Button: {
      defaultProps: {
        radius: 'md',
      },
      styles: {
        root: {
          fontWeight: 500,
        },
      },
    },

    Card: {
      defaultProps: {
        radius: 'lg',
        padding: 'lg',
      },
      styles: {
        root: {
          backgroundColor: tokens.colors.bgSecondary,
          border: `1px solid ${tokens.colors.bgTertiary}`,
        },
      },
    },

    Paper: {
      defaultProps: {
        radius: 'md',
      },
      styles: {
        root: {
          backgroundColor: tokens.colors.bgSecondary,
        },
      },
    },

    TextInput: {
      defaultProps: {
        radius: 'md',
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
    },

    Modal: {
      defaultProps: {
        radius: 'lg',
        centered: true,
      },
      styles: {
        content: {
          backgroundColor: tokens.colors.bgSecondary,
        },
        header: {
          backgroundColor: tokens.colors.bgSecondary,
        },
      },
    },

    Notification: {
      defaultProps: {
        radius: 'md',
      },
    },
  },
});

export default theme;
