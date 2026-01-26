/**
 * PageHeader - Consistent page header component
 * Provides a unified header pattern across all pages with:
 * - Title (h1 by default)
 * - Optional subtitle
 * - Optional action buttons
 * - Optional greeting pattern (for Dashboard)
 */

import { Title, Text, Group, Box } from '@mantine/core';
import { tokens } from '../theme';

/**
 * @param {Object} props
 * @param {string} props.title - The page title
 * @param {string} [props.subtitle] - Optional subtitle text
 * @param {string} [props.greeting] - Optional greeting text (displayed above title)
 * @param {React.ReactNode} [props.actions] - Optional action buttons or elements
 * @param {1|2|3} [props.titleOrder=1] - Title order (1 for main pages, 2 for personalized greeting)
 */
function PageHeader({ title, subtitle, greeting, actions, titleOrder = 1 }) {
  return (
    <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
      <Box>
        {greeting && (
          <Text size="sm" style={{ color: 'var(--tribos-text-muted)' }}>
            {greeting}
          </Text>
        )}
        <Title order={titleOrder} style={{ color: 'var(--tribos-text-primary)' }}>
          {title}
        </Title>
        {subtitle && (
          <Text style={{ color: 'var(--tribos-text-secondary)' }}>
            {subtitle}
          </Text>
        )}
      </Box>
      {actions && (
        <Group gap="sm" wrap="wrap">
          {actions}
        </Group>
      )}
    </Group>
  );
}

export default PageHeader;
