import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => true, default: () => true }));

import { WorkoutModal } from './WorkoutModal';

describe('WorkoutModal on a phone', () => {
  it('takes the whole screen and keeps the date whole', () => {
    render(
      <MantineProvider>
        <WorkoutModal
          workout={null}
          entry={{ id: 'e', scheduled_date: '2026-11-20', entry_type: 'workout', name: 'Sweet Spot Intervals with a Very Long Name', workout_type: 'sweet_spot', sport: 'cycling', target_duration: 60, target_rss: 55, status: 'planned' }}
          plannedWorkout={{ id: 'e', planId: '', sportType: null, planPriority: 'primary', scheduledDate: '2026-11-20', workoutId: null, workoutType: 'sweet_spot', targetTSS: 55, targetDuration: 60, notes: '', completed: false, completedAt: null, activityId: null, actualTSS: null, actualDuration: null }}
          opened
          onClose={() => {}}
          scheduledDate="2026-11-20"
        />
      </MantineProvider>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.closest('[data-full-screen]') ?? dialog.querySelector('[data-full-screen]') ?? dialog.getAttribute('data-full-screen')).toBeTruthy();
    expect(screen.getByText(/NOV 20/i)).toBeTruthy();
  });
});
