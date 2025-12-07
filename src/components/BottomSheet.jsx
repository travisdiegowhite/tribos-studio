import { useState, useRef, useEffect } from 'react';
import { Box, Paper, UnstyledButton, Text } from '@mantine/core';
import { IconChevronUp, IconChevronDown } from '@tabler/icons-react';
import { tokens } from '../theme';

/**
 * BottomSheet - A mobile-friendly bottom sheet component
 * Slides up from the bottom with drag-to-expand/collapse
 */
function BottomSheet({
  children,
  peekContent,
  peekHeight = 120,
  expandedHeight = '70vh',
  defaultExpanded = false,
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(0);
  const [currentTranslate, setCurrentTranslate] = useState(0);
  const sheetRef = useRef(null);

  const toggleExpanded = () => setIsExpanded(!isExpanded);

  // Handle touch start
  const handleTouchStart = (e) => {
    setIsDragging(true);
    setDragStart(e.touches[0].clientY);
    setCurrentTranslate(0);
  };

  // Handle touch move
  const handleTouchMove = (e) => {
    if (!isDragging) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - dragStart;
    setCurrentTranslate(diff);
  };

  // Handle touch end
  const handleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);

    // If dragged down more than 50px, collapse
    // If dragged up more than 50px, expand
    if (currentTranslate > 50 && isExpanded) {
      setIsExpanded(false);
    } else if (currentTranslate < -50 && !isExpanded) {
      setIsExpanded(true);
    }

    setCurrentTranslate(0);
  };

  // Calculate actual height based on state and drag
  const getHeight = () => {
    if (isDragging) {
      const baseHeight = isExpanded ? expandedHeight : peekHeight;
      // Clamp translate to prevent over-dragging
      const clampedTranslate = Math.max(-100, Math.min(100, currentTranslate));
      return `calc(${baseHeight} - ${clampedTranslate}px)`;
    }
    return isExpanded ? expandedHeight : peekHeight;
  };

  return (
    <Paper
      ref={sheetRef}
      shadow="xl"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: getHeight(),
        maxHeight: '85vh',
        backgroundColor: tokens.colors.bgSecondary,
        borderRadius: '16px 16px 0 0',
        zIndex: 200,
        transition: isDragging ? 'none' : 'height 0.3s ease-out',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Drag Handle */}
      <UnstyledButton
        onClick={toggleExpanded}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          width: '100%',
          padding: '12px 16px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          cursor: 'grab',
          touchAction: 'none',
        }}
      >
        {/* Visual Handle Bar */}
        <Box
          style={{
            width: 36,
            height: 4,
            backgroundColor: tokens.colors.bgTertiary,
            borderRadius: 2,
          }}
        />

        {/* Peek Content - always visible */}
        {peekContent && (
          <Box style={{ width: '100%' }}>
            {peekContent}
          </Box>
        )}

        {/* Expand/Collapse Indicator */}
        <Box
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            color: tokens.colors.textMuted,
          }}
        >
          {isExpanded ? (
            <>
              <IconChevronDown size={16} />
              <Text size="xs">Tap to collapse</Text>
            </>
          ) : (
            <>
              <IconChevronUp size={16} />
              <Text size="xs">Tap for more options</Text>
            </>
          )}
        </Box>
      </UnstyledButton>

      {/* Expanded Content */}
      <Box
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '0 16px 16px',
          opacity: isExpanded ? 1 : 0,
          visibility: isExpanded ? 'visible' : 'hidden',
          transition: 'opacity 0.2s ease-out',
        }}
      >
        {children}
      </Box>
    </Paper>
  );
}

export default BottomSheet;
