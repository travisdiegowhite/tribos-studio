import { useMediaQuery } from '@mantine/hooks';

/**
 * Phone layout: below Mantine's `sm` breakpoint (48em = 768px), the same line
 * every `hiddenFrom="sm"` / `cols={{ base, sm }}` in the app uses. One hook so
 * new mobile code can't drift onto a different width (the Season tab's 900px
 * query is the one deliberate exception: its two-column layout needs it).
 */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 48em)') ?? false;
}

export default useIsMobile;
