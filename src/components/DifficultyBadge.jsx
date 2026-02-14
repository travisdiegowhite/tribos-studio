import { Badge } from '@mantine/core';

/**
 * DifficultyBadge - Standardized difficulty badge with consistent colors
 * @param {string} difficulty - easy, moderate, or hard
 * @param {string} size - Badge size (xs, sm, md)
 */
function DifficultyBadge({ difficulty, size = 'sm' }) {
  const colorMap = {
    easy: '#A8BFA8',      // Sage
    moderate: '#D4A843',  // Gold
    hard: '#C4785C',      // Terracotta
    recovery: '#7BA9A0',  // Teal
    intervals: '#C4A0B9', // Mauve
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
