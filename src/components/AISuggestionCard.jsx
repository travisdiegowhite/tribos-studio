import { Card, Stack, Group, Text, Badge, Button, Box, Loader } from '@mantine/core';
import { IconRoute, IconRuler, IconMountain, IconClock } from '@tabler/icons-react';
import { tokens } from '../theme';
import DifficultyBadge from './DifficultyBadge';

/**
 * AISuggestionCard - Enhanced AI route suggestion card with metrics and visual appeal
 * @param {object} suggestion - Route suggestion object
 * @param {number} index - Index of the suggestion
 * @param {boolean} isConverting - Whether this suggestion is being converted
 * @param {boolean} isDisabled - Whether all cards are disabled (another is converting)
 * @param {function} onSelect - Callback when card is selected
 */
function AISuggestionCard({
  suggestion,
  index,
  isConverting,
  isDisabled,
  onSelect,
}) {
  const handleClick = (e) => {
    e.stopPropagation();
    if (!isDisabled) {
      onSelect(suggestion, index);
    }
  };

  return (
    <Card
      padding="md"
      style={{
        backgroundColor: isConverting
          ? `${tokens.colors.electricLime}10`
          : tokens.colors.bgTertiary,
        cursor: isDisabled ? 'wait' : 'pointer',
        border: `2px solid ${
          isConverting ? tokens.colors.electricLime : tokens.colors.bgElevated
        }`,
        transition: 'all 0.2s ease',
        opacity: isDisabled && !isConverting ? 0.5 : 1,
        transform: isConverting ? 'scale(1.01)' : 'scale(1)',
      }}
      onClick={handleClick}
      onMouseEnter={(e) => {
        if (!isDisabled) {
          e.currentTarget.style.transform = 'scale(1.02)';
          e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)';
          e.currentTarget.style.borderColor = tokens.colors.electricLime;
        }
      }}
      onMouseLeave={(e) => {
        if (!isConverting) {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = 'none';
          e.currentTarget.style.borderColor = tokens.colors.bgElevated;
        }
      }}
    >
      <Stack gap="sm">
        {/* Header with name and difficulty */}
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Text
            fw={700}
            size="md"
            lineClamp={2}
            style={{
              color: tokens.colors.textPrimary,
              flex: 1,
              lineHeight: 1.3,
            }}
          >
            {suggestion.name}
          </Text>
          <DifficultyBadge difficulty={suggestion.difficulty} size="xs" />
        </Group>

        {/* Description */}
        {suggestion.description && (
          <Text
            size="xs"
            lineClamp={2}
            style={{ color: tokens.colors.textSecondary }}
          >
            {suggestion.description}
          </Text>
        )}

        {/* Metrics row */}
        <Group gap="xs" wrap="wrap">
          <Box
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: `${tokens.colors.electricLime}15`,
              padding: '4px 10px',
              borderRadius: tokens.radius.full,
            }}
          >
            <IconRuler size={14} style={{ color: tokens.colors.electricLime }} />
            <Text size="xs" fw={600} style={{ color: tokens.colors.electricLime }}>
              {typeof suggestion.distance === 'number'
                ? `${suggestion.distance.toFixed(1)} km`
                : suggestion.distance}
            </Text>
          </Box>

          {suggestion.elevationGain > 0 && (
            <Box
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                backgroundColor: `${tokens.colors.zone4}15`,
                padding: '4px 10px',
                borderRadius: tokens.radius.full,
              }}
            >
              <IconMountain size={14} style={{ color: tokens.colors.zone4 }} />
              <Text size="xs" fw={600} style={{ color: tokens.colors.zone4 }}>
                {suggestion.elevationGain}m ↗
              </Text>
            </Box>
          )}

          {suggestion.estimatedTime && (
            <Box
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                backgroundColor: `${tokens.colors.zone1}15`,
                padding: '4px 10px',
                borderRadius: tokens.radius.full,
              }}
            >
              <IconClock size={14} style={{ color: tokens.colors.zone1 }} />
              <Text size="xs" fw={600} style={{ color: tokens.colors.zone1 }}>
                {suggestion.estimatedTime}min
              </Text>
            </Box>
          )}
        </Group>

        {/* Action button */}
        <Button
          size="sm"
          variant={isConverting ? 'filled' : 'light'}
          color="lime"
          leftSection={
            isConverting ? (
              <Loader size={14} color="dark" />
            ) : (
              <IconRoute size={16} />
            )
          }
          fullWidth
          disabled={isDisabled && !isConverting}
          style={{
            marginTop: '4px',
            fontWeight: 600,
          }}
        >
          {isConverting ? 'Generating Route...' : 'Select & Generate Route'}
        </Button>
      </Stack>
    </Card>
  );
}

export default AISuggestionCard;
