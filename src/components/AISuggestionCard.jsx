import { Card, Stack, Group, Text, Badge, Button, Box, Loader } from '@mantine/core';
import { tokens } from '../theme';
import DifficultyBadge from './DifficultyBadge';
import { Clock, Mountains, Path, Ruler } from '@phosphor-icons/react';

/**
 * AISuggestionCard - Enhanced AI route suggestion card with metrics and visual appeal
 * Visual Hierarchy: Only selected/converting card gets color emphasis (Tier 1)
 * Unselected cards use neutral colors (Tier 3)
 *
 * @param {object} suggestion - Route suggestion object
 * @param {number} index - Index of the suggestion
 * @param {boolean} isConverting - Whether this suggestion is being converted
 * @param {boolean} isDisabled - Whether all cards are disabled (another is converting)
 * @param {function} onSelect - Callback when card is selected
 * @param {function} formatDistance - Function to format distance values
 * @param {function} formatElevation - Function to format elevation values
 */
function AISuggestionCard({
  suggestion,
  index,
  isConverting,
  isDisabled,
  onSelect,
  formatDistance,
  formatElevation,
}) {
  const handleClick = (e) => {
    e.stopPropagation();
    if (!isDisabled) {
      onSelect(suggestion, index);
    }
  };

  // Visual Hierarchy: Neutral colors for unselected, accent for selected/converting
  const metricColor = isConverting ? 'var(--color-teal)' : 'var(--color-text-muted)';
  const metricBg = isConverting ? `${'var(--color-teal)'}15` : `${'var(--color-text-muted)'}10`;

  return (
    <Card
      padding="md"
      style={{
        backgroundColor: isConverting
          ? `${'var(--color-teal)'}08`
          : 'var(--color-bg-secondary)',
        cursor: isDisabled ? 'wait' : 'pointer',
        border: isConverting
          ? `2px solid ${'var(--color-teal)'}`
          : '1px solid var(--mantine-color-dark-5)',
        transition: 'all 0.2s ease',
        opacity: isDisabled && !isConverting ? 0.5 : 1,
        transform: isConverting ? 'scale(1.01)' : 'scale(1)',
      }}
      onClick={handleClick}
      className={!isDisabled ? 'tribos-ai-suggestion-card' : undefined}
    >
      <Stack gap="sm">
        {/* Header with name and difficulty */}
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Text
            fw={700}
            size="md"
            lineClamp={2}
            style={{
              color: 'var(--color-text-primary)',
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
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {suggestion.description}
          </Text>
        )}

        {/* Metrics row - Neutral colors, only converting card gets accent */}
        <Group gap="xs" wrap="wrap">
          <Box
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: metricBg,
              padding: '4px 10px',
              borderRadius: tokens.radius.full,
            }}
          >
            <Ruler size={14} style={{ color: metricColor }} />
            <Text size="xs" fw={600} style={{ color: metricColor }}>
              {typeof suggestion.distance === 'number'
                ? (formatDistance ? formatDistance(suggestion.distance) : `${suggestion.distance.toFixed(1)} km`)
                : suggestion.distance}
            </Text>
          </Box>

          {suggestion.elevationGain > 0 && (
            <Box
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                backgroundColor: metricBg,
                padding: '4px 10px',
                borderRadius: tokens.radius.full,
              }}
            >
              <Mountains size={14} style={{ color: metricColor }} />
              <Text size="xs" fw={600} style={{ color: metricColor }}>
                {formatElevation ? formatElevation(suggestion.elevationGain) : `${suggestion.elevationGain}m`} ↗
              </Text>
            </Box>
          )}

          {suggestion.estimatedTime && (
            <Box
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                backgroundColor: metricBg,
                padding: '4px 10px',
                borderRadius: tokens.radius.full,
              }}
            >
              <Clock size={14} style={{ color: metricColor }} />
              <Text size="xs" fw={600} style={{ color: metricColor }}>
                {suggestion.estimatedTime}min
              </Text>
            </Box>
          )}
        </Group>

        {/* Action button - Only filled when converting (Tier 1), subtle otherwise */}
        <Button
          size="sm"
          variant={isConverting ? 'filled' : 'subtle'}
          color={isConverting ? 'terracotta' : 'gray'}
          leftSection={
            isConverting ? (
              <Loader size={14} color="dark" />
            ) : (
              <Path size={16} />
            )
          }
          fullWidth
          disabled={isDisabled && !isConverting}
          style={{
            marginTop: '4px',
            fontWeight: 600,
          }}
        >
          {isConverting ? 'Generating Route...' : 'Select This Route'}
        </Button>
      </Stack>
    </Card>
  );
}

export default AISuggestionCard;
