import { Badge } from '@mantine/core';

/**
 * DifficultyBadge - Standardized difficulty badge with consistent colors
 * @param {string} difficulty - easy, moderate, or hard
 * @param {string} size - Badge size (xs, sm, md)
 */
function DifficultyBadge({ difficulty, size = 'sm' }) {
  const colorMap = {
    easy: '#6B8C72',      // Sage
    moderate: '#B89040',  // Gold
    hard: '#9E5A3C',      // Terracotta
    recovery: '#5C7A5E',  // Teal
    intervals: '#6B7F94', // Mauve
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
