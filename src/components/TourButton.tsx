/**
 * TourButton — persistent "?" re-trigger for Shepherd tours.
 *
 * Always visible on surfaces that have a tour attached. Calling `onStart`
 * (bound to `useTour().startTour`) replays the tour regardless of whether
 * the user has already completed or dismissed it.
 */

import { ActionIcon, Tooltip } from '@mantine/core';

interface TourButtonProps {
  onStart: () => void;
  /** Optional aria-label override (defaults to "Replay tour") */
  label?: string;
}

export function TourButton({ onStart, label = 'Replay tour' }: TourButtonProps) {
  return (
    <Tooltip label={label} position="left" withArrow>
      <ActionIcon
        onClick={onStart}
        variant="outline"
        size="lg"
        radius={0}
        aria-label={label}
        styles={{
          root: {
            background: '#141410',
            borderColor: '#2A8C82',
            color: '#F4F4F2',
            fontFamily: "'Barlow Condensed', 'Barlow', system-ui, sans-serif",
            fontSize: '18px',
            fontWeight: 600,
            letterSpacing: '0.02em',
            transition: 'background 150ms ease, border-color 150ms ease',
          },
        }}
      >
        ?
      </ActionIcon>
    </Tooltip>
  );
}

export default TourButton;
