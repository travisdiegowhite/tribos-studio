import { useState } from 'react';
import { Box, Text, Group, UnstyledButton, Collapse } from '@mantine/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { tokens } from '../theme';

/**
 * CollapsibleSection - A reusable collapsible section component for the Route Builder sidebar
 * @param {string} title - Section title
 * @param {React.ReactNode} icon - Optional icon to display before title
 * @param {React.ReactNode} children - Content to show when expanded
 * @param {boolean} defaultExpanded - Whether section is expanded by default
 * @param {string} badge - Optional badge text to show next to title
 * @param {string} accentColor - Optional accent color for the section
 */
function CollapsibleSection({
  title,
  icon,
  children,
  defaultExpanded = false,
  badge,
  accentColor,
  headerStyle,
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <Box
      style={{
        borderRadius: tokens.radius.md,
        backgroundColor: 'var(--tribos-bg-tertiary)',
        overflow: 'hidden',
        border: accentColor ? `1px solid ${accentColor}20` : 'none',
      }}
    >
      <UnstyledButton
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          width: '100%',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: accentColor ? `${accentColor}10` : 'transparent',
          transition: 'background-color 0.15s ease',
          ...headerStyle,
        }}
      >
        <Group gap="xs">
          {icon && (
            <Box style={{ color: accentColor || 'var(--tribos-terracotta-500)' }}>
              {icon}
            </Box>
          )}
          <Text size="sm" fw={600} style={{ color: 'var(--tribos-text-primary)' }}>
            {title}
          </Text>
          {badge && (
            <Box
              style={{
                backgroundColor: 'var(--tribos-terracotta-500)',
                color: 'var(--tribos-bg-primary)',
                padding: '2px 8px',
                borderRadius: tokens.radius.full,
                fontSize: '11px',
                fontWeight: 600,
              }}
            >
              {badge}
            </Box>
          )}
        </Group>
        <Box style={{ color: 'var(--tribos-text-muted)', transition: 'transform 0.2s ease' }}>
          {isExpanded ? <IconChevronDown size={18} /> : <IconChevronRight size={18} />}
        </Box>
      </UnstyledButton>

      <Collapse in={isExpanded} transitionDuration={200}>
        <Box style={{ padding: '0 16px 16px 16px' }}>
          {children}
        </Box>
      </Collapse>
    </Box>
  );
}

export default CollapsibleSection;
