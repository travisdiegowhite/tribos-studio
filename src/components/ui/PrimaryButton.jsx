import { Button } from '@mantine/core';
import { forwardRef } from 'react';

/**
 * PrimaryButton - Tier 1 button component
 *
 * Visual Hierarchy: This button is meant for PRIMARY actions only.
 * Limit to 1-2 per screen to maintain visual hierarchy.
 *
 * Use cases:
 * - "Ask AI Coach" on Training Dashboard
 * - "Generate Route" on Route Builder
 * - Primary CTA in modals
 *
 * DO NOT use for:
 * - Secondary actions (use variant="subtle" or "light" with color="gray")
 * - Destructive actions (use color="red" with variant="outline")
 * - Navigation links (use variant="subtle")
 *
 * @example
 * <PrimaryButton leftSection={<IconMessageCircle size={16} />}>
 *   Ask AI Coach
 * </PrimaryButton>
 */
const PrimaryButton = forwardRef(({
  children,
  size = 'sm',
  ...props
}, ref) => {
  return (
    <Button
      ref={ref}
      variant="filled"
      color="terracotta"
      size={size}
      {...props}
    >
      {children}
    </Button>
  );
});

PrimaryButton.displayName = 'PrimaryButton';

/**
 * SecondaryButton - Tier 2/3 button component
 *
 * Visual Hierarchy: For secondary actions that support the primary action.
 *
 * Use cases:
 * - "Suggested Workout" next to "Ask AI Coach"
 * - "Cancel" in modals
 * - Alternative actions
 */
export const SecondaryButton = forwardRef(({
  children,
  size = 'sm',
  ...props
}, ref) => {
  return (
    <Button
      ref={ref}
      variant="subtle"
      color="gray"
      size={size}
      {...props}
    >
      {children}
    </Button>
  );
});

SecondaryButton.displayName = 'SecondaryButton';

export default PrimaryButton;
