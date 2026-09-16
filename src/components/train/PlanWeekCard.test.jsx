import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router-dom';
import PlanWeekCard from './PlanWeekCard';

const PLAN = {
  name: 'The Rad',
  started_at: new Date(Date.now() - 21 * 86400000).toISOString(),
  duration_weeks: 6,
};

function renderCard(props = {}) {
  return render(
    <MemoryRouter>
      <MantineProvider>
        <PlanWeekCard
          activePlan={PLAN}
          plannedWorkouts={[]}
          actualWeeklyStats={{ totalTSS: 64, totalTime: 5220 }}
          formatTime={(s) => `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`}
          loading={false}
          {...props}
        />
      </MantineProvider>
    </MemoryRouter>,
  );
}

describe('PlanWeekCard', () => {
  it('puts the plan strip and the week summary in one frame', () => {
    const { container } = renderCard();
    expect(container.querySelectorAll('[data-testid="plan-week-card"]')).toHaveLength(1);
    expect(screen.getByText('The Rad')).toBeTruthy();
    expect(screen.getByText('WK 4/6')).toBeTruthy();
    expect(screen.getByText(/An unplanned week so far/)).toBeTruthy();
    // Neither child draws its own card border inside the frame.
    const bordered = [...container.querySelectorAll('[data-testid="plan-week-card"] *')].filter(
      (el) => el.style.border && el.style.border.includes('var(--color-border)'),
    );
    expect(bordered).toHaveLength(0);
  });

  it('sends CHANGE PLAN to the browse tab rather than back to the calendar', () => {
    renderCard();
    expect(screen.getByRole('link', { name: /CHANGE PLAN/ }).getAttribute('href')).toBe('/train?tab=browse');
  });

  it('still offers BROWSE PLANS and the week sentence without a plan', () => {
    renderCard({ activePlan: null, actualWeeklyStats: { totalTSS: 0, totalTime: 0 } });
    expect(screen.getByText('No active training plan')).toBeTruthy();
    expect(screen.getByRole('link', { name: /BROWSE PLANS/ })).toBeTruthy();
    expect(screen.getByText('Nothing logged yet this week.')).toBeTruthy();
  });
});
