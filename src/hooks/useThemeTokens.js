import { useMantineColorScheme } from '@mantine/core';
import { darkTokens, lightTokens, getThemeTokens } from '../theme';

/**
 * Hook to get theme-aware design tokens
 * Returns the appropriate tokens (dark or light) based on current color scheme
 *
 * @example
 * const { tokens, colorScheme, toggleColorScheme } = useThemeTokens();
 *
 * // Use tokens in styles
 * <Box style={{ backgroundColor: tokens.colors.bgPrimary }}>
 *
 * // Toggle theme
 * <Button onClick={toggleColorScheme}>Switch Theme</Button>
 */
export function useThemeTokens() {
  const { colorScheme, setColorScheme, toggleColorScheme } = useMantineColorScheme();

  const tokens = getThemeTokens(colorScheme);

  return {
    tokens,
    colorScheme,
    setColorScheme,
    toggleColorScheme,
    isDark: colorScheme === 'dark',
    isLight: colorScheme === 'light',
  };
}

// Re-export token sets for direct access when needed
export { darkTokens, lightTokens, getThemeTokens };

export default useThemeTokens;
