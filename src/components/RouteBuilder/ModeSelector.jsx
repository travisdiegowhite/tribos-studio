/**
 * ModeSelector - Progressive disclosure entry point for the route builder.
 *
 * Shown when builderMode === 'ready' (no active route).
 * Lets the user choose between AI-assisted and manual route creation,
 * or import an existing GPX file.
 */

import { Box, Text, Group, Stack, UnstyledButton } from '@mantine/core';
import { IconRobot, IconHandClick, IconUpload } from '@tabler/icons-react';
import { tokens } from '../../theme';

function ModeSelector({ onSelectMode, onImportGPX }) {
  return (
    <Stack gap="md">
      <Text size="xs" fw={600} style={{ color: 'var(--tribos-text-muted)', letterSpacing: '0.05em' }}>
        HOW DO YOU WANT TO BUILD?
      </Text>

      {/* AI Route Card */}
      <ModeCard
        icon={<IconRobot size={24} />}
        title="Describe a Route"
        description="Tell the AI what you want and get route suggestions"
        accentColor="var(--tribos-lime)"
        onClick={() => onSelectMode('ai')}
      />

      {/* Manual Route Card */}
      <ModeCard
        icon={<IconHandClick size={24} />}
        title="Draw on Map"
        description="Click to place waypoints and build a route manually"
        accentColor="#3b82f6"
        onClick={() => onSelectMode('manual')}
      />

      {/* Import GPX */}
      {onImportGPX && (
        <UnstyledButton
          onClick={onImportGPX}
          style={{
            padding: `${tokens.spacing.sm} ${tokens.spacing.md}`,
            borderRadius: tokens.radius.md,
            border: '1px dashed var(--tribos-border)',
            transition: 'border-color 0.15s ease, background-color 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--tribos-text-muted)';
            e.currentTarget.style.backgroundColor = 'var(--tribos-bg-tertiary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--tribos-border)';
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <Group gap="sm">
            <IconUpload size={16} style={{ color: 'var(--tribos-text-muted)' }} />
            <Text size="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
              Import GPX / TCX file
            </Text>
          </Group>
        </UnstyledButton>
      )}
    </Stack>
  );
}

function ModeCard({ icon, title, description, accentColor, onClick }) {
  return (
    <UnstyledButton
      onClick={onClick}
      style={{
        padding: tokens.spacing.md,
        borderRadius: tokens.radius.md,
        border: `1px solid ${accentColor}25`,
        backgroundColor: `${accentColor}08`,
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = `${accentColor}15`;
        e.currentTarget.style.borderColor = `${accentColor}50`;
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = `${accentColor}08`;
        e.currentTarget.style.borderColor = `${accentColor}25`;
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      <Group gap="md" align="flex-start">
        <Box style={{ color: accentColor, marginTop: 2 }}>{icon}</Box>
        <Box style={{ flex: 1 }}>
          <Text size="sm" fw={600} style={{ color: 'var(--tribos-text-primary)' }}>
            {title}
          </Text>
          <Text size="xs" style={{ color: 'var(--tribos-text-secondary)', marginTop: 2 }}>
            {description}
          </Text>
        </Box>
      </Group>
    </UnstyledButton>
  );
}

export default ModeSelector;
