import { Badge, Tooltip } from '@mantine/core';

/**
 * StatusBadge - Tier-aware status badge component
 *
 * Visual Hierarchy:
 * - tier="primary" (Tier 1): Bright, filled badge for the main status
 * - tier="secondary" (Tier 2): Light variant, less prominent
 * - tier="muted" (Tier 3): Outline or very subtle, for reference info
 *
 * Use cases:
 * - Training status (OPTIMAL, FRESH, etc.) - use tier="primary"
 * - Priority badges (A, B, C races) - use tier based on context
 * - Completion status - use tier="secondary"
 *
 * @param {string} tier - "primary", "secondary", or "muted"
 * @param {string} color - Mantine color (terracotta, sage, gold, etc.)
 * @param {string} size - Badge size
 * @param {ReactNode} leftSection - Icon or content for left section
 * @param {string} tooltip - Optional tooltip text
 * @param {ReactNode} children - Badge content
 */
function StatusBadge({
  tier = 'secondary',
  color = 'gray',
  size = 'sm',
  leftSection,
  tooltip,
  children,
  ...props
}) {
  // Map tier to Mantine variant
  const variantMap = {
    primary: 'filled',
    secondary: 'light',
    muted: 'outline',
  };

  // For muted tier, force gray color
  const effectiveColor = tier === 'muted' ? 'gray' : color;
  const variant = variantMap[tier] || 'light';

  const badge = (
    <Badge
      color={effectiveColor}
      variant={variant}
      size={size}
      leftSection={leftSection}
      {...props}
    >
      {children}
    </Badge>
  );

  if (tooltip) {
    return (
      <Tooltip label={tooltip} position="bottom">
        {badge}
      </Tooltip>
    );
  }

  return badge;
}

/**
 * FormStatusBadge - Pre-configured badge for training form status
 *
 * Always Tier 1 - this is THE primary indicator on training pages
 */
export function FormStatusBadge({ status, icon: Icon, tooltip }) {
  const statusConfig = {
    FRESH: { color: 'teal', tooltip: 'Ready for hard training' },
    READY: { color: 'green', tooltip: 'Quality session day' },
    OPTIMAL: { color: 'terracotta', tooltip: 'Sweet spot training' },
    TIRED: { color: 'yellow', tooltip: 'Consider recovery' },
    FATIGUED: { color: 'red', tooltip: 'Recovery needed' },
  };

  const config = statusConfig[status] || { color: 'gray', tooltip: 'Unknown status' };

  return (
    <StatusBadge
      tier="primary"
      color={config.color}
      size="sm"
      leftSection={Icon && <Icon size={14} />}
      tooltip={tooltip || config.tooltip}
    >
      {status}
    </StatusBadge>
  );
}

/**
 * PriorityBadge - For race/goal priorities with context-aware prominence
 *
 * @param {string} priority - A, B, or C
 * @param {number} daysUntil - Days until the event (affects tier)
 */
export function PriorityBadge({ priority, daysUntil = 999 }) {
  // Progressive disclosure: closer events get more prominence
  const getTier = () => {
    if (priority === 'A') return 'primary';
    if (priority === 'B' && daysUntil <= 14) return 'secondary';
    return 'muted';
  };

  const colorMap = {
    A: 'red',
    B: 'orange',
    C: 'gray',
  };

  return (
    <StatusBadge
      tier={getTier()}
      color={colorMap[priority] || 'gray'}
      size="sm"
    >
      {priority}
    </StatusBadge>
  );
}

export default StatusBadge;
