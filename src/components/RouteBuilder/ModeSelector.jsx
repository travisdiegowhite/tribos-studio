/**
 * ModeSelector - Progressive disclosure entry point for the route builder.
 *
 * Shown when builderMode === 'ready' (no active route).
 * Lets the user choose between AI-assisted and manual route creation,
 * or import an existing GPX file.
 */

import { Box, Text, Group, Stack, UnstyledButton } from '@mantine/core';
import { tokens } from '../../theme';
import { HandTap, Robot, UploadSimple } from '@phosphor-icons/react';

function ModeSelector({ onSelectMode, onImportGPX }) {
  return (
    <Stack gap="md">
      <Text size="xs" fw={600} style={{ color: 'var(--color-text-muted)', letterSpacing: '0.05em' }}>
        HOW DO YOU WANT TO BUILD?
      </Text>

      {/* AI Route Card */}
      <ModeCard
        icon={<Robot size={24} />}
        title="Describe a Route"
        description="Describe what you want and get route suggestions"
        accentColor="var(--color-teal)"
        onClick={() => onSelectMode('ai')}
        data-tour="rb-describe"
      />

      {/* Manual Route Card */}
      <ModeCard
        icon={<HandTap size={24} />}
        title="Draw on Map"
        description="Click to place waypoints and build a route manually"
        accentColor="#2A8C82"
        onClick={() => onSelectMode('manual')}
      />

      {/* Import GPX */}
      {onImportGPX && (
        <UnstyledButton
          onClick={onImportGPX}
          className="tribos-gpx-import-btn"
          style={{
            padding: `${tokens.spacing.sm} ${tokens.spacing.md}`,
            borderRadius: tokens.radius.md,
            border: '1px dashed var(--tribos-border)',
            transition: 'border-color 0.15s ease, background-color 0.15s ease',
          }}
        >
          <Group gap="sm">
            <UploadSimple size={16} style={{ color: 'var(--color-text-muted)' }} />
            <Text size="sm" style={{ color: 'var(--color-text-secondary)' }}>
              Import GPX / TCX file
            </Text>
          </Group>
        </UnstyledButton>
      )}
    </Stack>
  );
}

function ModeCard({ icon, title, description, accentColor, onClick, ...rest }) {
  return (
    <UnstyledButton
      onClick={onClick}
      className="tribos-mode-card"
      {...rest}
      style={{
        '--mode-accent': accentColor,
        padding: tokens.spacing.md,
        borderRadius: tokens.radius.md,
        border: `1px solid ${accentColor}25`,
        backgroundColor: `${accentColor}08`,
        transition: 'all 0.15s ease',
      }}
    >
      <Group gap="md" align="flex-start">
        <Box style={{ color: accentColor, marginTop: 2 }}>{icon}</Box>
        <Box style={{ flex: 1 }}>
          <Text size="sm" fw={600} style={{ color: 'var(--color-text-primary)' }}>
            {title}
          </Text>
          <Text size="xs" style={{ color: 'var(--color-text-secondary)', marginTop: 2 }}>
            {description}
          </Text>
        </Box>
      </Group>
    </UnstyledButton>
  );
}

export default ModeSelector;
