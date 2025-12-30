/**
 * Visual Hierarchy UI Components
 *
 * These components enforce the visual hierarchy design system:
 * - Tier 1 (Primary): Bright, attention-grabbing - use sparingly (1-2 per screen)
 * - Tier 2 (Secondary): Supporting context - important but not dominant
 * - Tier 3 (Background): Reference info - neutral, doesn't compete
 *
 * @see /docs/visual-hierarchy-guide.md for full documentation
 */

// Buttons
export { default as PrimaryButton, SecondaryButton } from './PrimaryButton';

// Badges
export { default as StatusBadge, FormStatusBadge, PriorityBadge } from './StatusBadge';
export { default as MetricBadge, MetricText, MetricGroup } from './MetricBadge';
