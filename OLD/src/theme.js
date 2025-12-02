import { createTheme } from '@mantine/core';

// Note: Design tokens are defined in src/styles/design-tokens.css
// This theme configuration maps Mantine's system to those tokens
export const theme = createTheme({
  fontFamily: 'var(--font-family-base)',
  primaryColor: 'electricLime',
  defaultRadius: 'lg',

  colors: {
    // Primary: Deep Ridge Green - premium outdoor tech
    ridgeGreen: [
      '#ecfdf5', // 50
      '#d1fae5', // 100
      '#a7f3d0', // 200
      '#6ee7b7', // 300
      '#34d399', // 400
      '#10b981', // 500 - Main brand (var(--color-primary-500))
      '#059669', // 600
      '#047857', // 700
      '#065f46', // 800
      '#064e3b'  // 900
    ],

    // Accent: Electric Cyan - high-tech glow
    electricCyan: [
      '#ecfeff', // 50
      '#cffafe', // 100
      '#a5f3fc', // 200
      '#67e8f9', // 300
      '#22d3ee', // 400
      '#06b6d4', // 500 - Electric accent (var(--color-accent-500))
      '#0891b2', // 600
      '#0e7490', // 700
      '#155e75', // 800
      '#164e63'  // 900
    ],

    // Warm accent: Sunset Gold
    sunsetGold: [
      '#fffbeb', // 50
      '#fef3c7', // 100
      '#fde68a', // 200
      '#fcd34d', // 300
      '#fbbf24', // 400
      '#f59e0b', // 500 - Gold accent
      '#d97706', // 600
      '#b45309', // 700
      '#92400e', // 800
      '#78350f'  // 900
    ],

    // Dark base: Midnight Slate
    midnightSlate: [
      '#f8fafc', // 50 - light content areas
      '#f1f5f9', // 100
      '#e2e8f0', // 200
      '#cbd5e1', // 300
      '#94a3b8', // 400
      '#64748b', // 500
      '#475569', // 600
      '#334155', // 700 - main dark
      '#1e293b', // 800 - deeper dark
      '#0f172a'  // 900 - darkest
    ],

    // Neon Trail: Dark base - aligned with design tokens
    neonDark: [
      '#F5F5F5', // 50 - var(--color-neutral-50)
      '#E8E8E8', // 100 - var(--color-neutral-100)
      '#D1D1D1', // 200 - var(--color-neutral-200)
      '#B8B8B8', // 300 - var(--color-neutral-300)
      '#cbd5e1', // 400 - var(--color-neutral-400)
      '#64748b', // 500 - var(--color-neutral-500)
      '#475569', // 600 - var(--color-neutral-600) / var(--bg-surface)
      '#3d4e5e', // 700 - var(--color-neutral-700) / var(--bg-app)
      '#2d3748', // 800 - var(--color-neutral-800)
      '#1a202c'  // 900 - var(--color-neutral-900)
    ],

    // Electric Lime - Main accent
    electricLime: [
      '#F0FFF4', // 50
      '#DCFCE7', // 100
      '#BBF7D0', // 200
      '#86EFAC', // 300
      '#4ADE80', // 400
      '#32CD32', // 500 - main electric lime (var(--color-lime-500))
      '#22C55E', // 600
      '#16A34A', // 700
      '#15803D', // 800
      '#14532D'  // 900
    ],

    // Hot Magenta - Secondary accent
    hotMagenta: [
      '#FDF4FF', // 50
      '#FAE8FF', // 100
      '#F5D0FE', // 200
      '#F0ABFC', // 300
      '#E879F9', // 400
      '#FF00FF', // 500 - main hot magenta
      '#D946EF', // 600
      '#C026D3', // 700
      '#A21CAF', // 800
      '#86198F'  // 900
    ],

    // Cyber Yellow - Tertiary accent
    cyberYellow: [
      '#FFFEF0', // 50
      '#FFFBEB', // 100
      '#FEF3C7', // 200
      '#FDE68A', // 300
      '#FCD34D', // 400
      '#FFD700', // 500 - main cyber yellow
      '#FBBF24', // 600
      '#F59E0B', // 700
      '#D97706', // 800
      '#B45309'  // 900
    ]
  },

  headings: {
    fontFamily: 'var(--font-family-base)',
    fontWeight: 'var(--font-weight-extrabold)',
    sizes: {
      h1: { fontSize: 'var(--font-size-5xl)', lineHeight: '1', letterSpacing: 'var(--letter-spacing-tight)' },
      h2: { fontSize: 'var(--font-size-4xl)', lineHeight: '2.5rem', letterSpacing: 'var(--letter-spacing-tight)' },
      h3: { fontSize: 'var(--font-size-3xl)', lineHeight: '2.25rem', letterSpacing: 'var(--letter-spacing-tight)' },
      h4: { fontSize: 'var(--font-size-2xl)', lineHeight: '2rem' },
      h5: { fontSize: 'var(--font-size-xl)', lineHeight: '1.75rem' },
      h6: { fontSize: 'var(--font-size-lg)', lineHeight: '1.75rem' },
    },
  },

  fontSizes: {
    xs: 'var(--font-size-xs)',
    sm: 'var(--font-size-sm)',
    md: 'var(--font-size-base)',
    lg: 'var(--font-size-lg)',
    xl: 'var(--font-size-xl)',
    '2xl': 'var(--font-size-2xl)',
  },

  radius: {
    xs: 'var(--radius-xs)',
    sm: 'var(--radius-sm)',
    md: 'var(--radius-md)',
    lg: 'var(--radius-lg)',
    xl: 'var(--radius-xl)',
  },

  shadows: {
    xs: 'var(--shadow-xs)',
    sm: 'var(--shadow-sm)',
    md: 'var(--shadow-md)',
    lg: 'var(--shadow-lg)',
    xl: 'var(--shadow-xl)',
  },


  other: {
    // Premium gradient system - using CSS variables from design-tokens.css
    gradients: {
      // Main brand gradients
      ridgeHero: 'var(--gradient-hero)',
      darkToGreen: 'var(--gradient-dark)',
      greenToCyan: 'var(--gradient-primary)',

      // Interactive states
      hoverGlow: 'var(--gradient-hover)',
      activeShine: 'var(--gradient-active)',

      // Card backgrounds
      glassDark: 'var(--gradient-glass-dark)',
      surface: 'var(--gradient-surface)',
    },

    monoFontFamily: 'var(--font-family-mono)',
    dimmed: 'var(--text-secondary)', // Medium-light gray - good contrast
  },

  // Component defaults - consistent dark mode using design tokens
  components: {
    AppShell: {
      defaultProps: {
        style: { backgroundColor: 'var(--bg-app)' }
      },
      styles: {
        header: {
          backgroundColor: 'var(--bg-surface-darker)',
          borderBottom: 'var(--border-width) solid var(--border-color)'
        },
        navbar: {
          backgroundColor: 'var(--bg-surface-darker)',
          borderRight: 'var(--border-width) solid var(--border-color)'
        }
      }
    },
    Card: {
      defaultProps: {
        style: {
          backgroundColor: 'var(--bg-surface)',
          color: 'var(--text-primary)'
        }
      }
    },
    Paper: {
      defaultProps: {
        style: {
          backgroundColor: 'var(--bg-surface)',
          color: 'var(--text-primary)'
        }
      }
    },
    Container: {
      defaultProps: {
        style: { backgroundColor: 'transparent' }
      }
    },
    Modal: {
      defaultProps: {
        styles: {
          content: {
            backgroundColor: 'var(--bg-surface)',
            color: 'var(--text-primary)'
          }
        }
      }
    },
    Tabs: {
      styles: {
        tab: {
          color: 'var(--text-primary)',
          border: 'var(--border-width) solid transparent',
          borderRadius: 'var(--radius-sm)',
          transition: `all var(--duration-fast) var(--ease-out)`,
          '&:hover': {
            backgroundColor: `rgba(50, 205, 50, var(--hover-opacity))`,
            borderColor: 'var(--border-color)',
          },
          '&[data-active]': {
            color: 'var(--color-lime-500)',
            borderColor: 'var(--color-lime-500)',
            borderWidth: 'var(--border-width-thick)',
            fontWeight: 'var(--font-weight-semibold)',
          },
        },
        tabLabel: {
          color: 'inherit',
        },
      },
    },
    Text: {
      defaultProps: {
        c: 'var(--text-primary)', // Pure white text for maximum contrast
      },
    },
    Title: {
      defaultProps: {
        c: 'var(--text-heading)', // Pure white for headings
      },
    },
    Button: {
      defaultProps: {
        c: 'var(--text-primary)', // White button text
      },
      styles: {
        root: {
          transition: `all var(--duration-normal) var(--ease-out)`,
          '&[data-variant="default"]': {
            backgroundColor: 'var(--bg-surface-dark)',
            color: 'var(--text-primary)',
            borderColor: 'var(--bg-surface)',
            '&:hover': {
              backgroundColor: 'var(--bg-app)',
            },
            '&:disabled': {
              backgroundColor: 'var(--bg-surface-darker)',
              color: 'var(--text-tertiary)',
              opacity: 'var(--disabled-opacity)',
            },
          },
          '&[data-variant="subtle"]': {
            color: 'var(--text-primary)',
            '&:hover': {
              backgroundColor: `rgba(50, 205, 50, var(--hover-opacity))`,
            },
          },
          '&[data-variant="light"]': {
            color: 'var(--text-on-primary)',
            backgroundColor: `rgba(50, 205, 50, var(--hover-opacity))`,
            '&:hover': {
              backgroundColor: `rgba(50, 205, 50, var(--active-opacity))`,
            },
          },
          '&[data-variant="filled"]': {
            color: 'var(--text-on-primary)', // Dark text on bright electric lime
          },
        },
      },
    },
    Menu: {
      defaultProps: {
        styles: {
          item: {
            color: 'var(--text-primary)',
            '&:hover': {
              backgroundColor: `rgba(50, 205, 50, var(--hover-opacity))`,
            },
            '&[data-disabled]': {
              color: 'var(--text-tertiary)',
              opacity: 'var(--disabled-opacity)',
            },
          },
          label: {
            color: 'var(--text-primary)',
          },
          dropdown: {
            backgroundColor: 'var(--bg-surface-darker)',
            border: 'var(--border-width) solid var(--bg-surface)',
          },
        },
      },
    },
    Select: {
      defaultProps: {
        styles: {
          input: {
            color: 'var(--text-primary)',
            backgroundColor: 'var(--bg-surface-dark)',
            borderColor: 'var(--bg-surface)',
            '&::placeholder': {
              color: 'var(--text-tertiary)',
            },
          },
          option: {
            color: 'var(--text-primary)',
            '&:hover': {
              backgroundColor: `rgba(50, 205, 50, var(--hover-opacity))`,
            },
            '&[data-selected]': {
              backgroundColor: `rgba(50, 205, 50, var(--active-opacity))`,
            },
            '&[data-disabled]': {
              color: 'var(--text-tertiary)',
              opacity: 'var(--disabled-opacity)',
            },
          },
          dropdown: {
            backgroundColor: 'var(--bg-surface-darker)',
            border: 'var(--border-width) solid var(--bg-surface)',
          },
        },
      },
    },
    Combobox: {
      defaultProps: {
        styles: {
          option: {
            color: 'var(--text-primary)',
            '&:hover': {
              backgroundColor: `rgba(50, 205, 50, var(--hover-opacity))`,
            },
            '&[data-selected]': {
              backgroundColor: `rgba(50, 205, 50, var(--active-opacity))`,
            },
          },
          dropdown: {
            backgroundColor: 'var(--bg-surface-darker)',
            border: 'var(--border-width) solid var(--bg-surface)',
          },
        },
      },
    },
    Badge: {
      defaultProps: {
        color: 'electricLime',
      },
    },
  },
});
