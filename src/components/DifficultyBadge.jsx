import { Badge } from '@mantine/core';

/**
 * DifficultyBadge - Standardized difficulty badge with consistent colors
 * @param {string} difficulty - easy, moderate, or hard
 * @param {string} size - Badge size (xs, sm, md)
 */
function DifficultyBadge({ difficulty, size = 'sm' }) {
  const colorMap = {
    easy: '#2A8C82',      // Teal
    moderate: '#D4600A',  // Orange
    hard: '#C43C2A',      // Coral
    recovery: '#2A8C82',  // Teal
    intervals: '#7A7970', // Muted
  };

  const backgroundColor = colorMap[difficulty?.toLowerCase()] || colorMap.moderate;

  return (
    <Badge
      size={size}
      style={{
        backgroundColor,
        color: 'white',
        fontWeight: 600,
        textTransform: 'capitalize',
        height: size === 'xs' ? '22px' : '28px',
        padding: '4px 12px',
        borderRadius: '16px',
      }}
    >
      {difficulty || 'moderate'}
    </Badge>
  );
}

export default DifficultyBadge;
