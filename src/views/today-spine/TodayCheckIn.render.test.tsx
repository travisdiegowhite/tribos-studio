import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { TodayCheckIn } from './TodayCheckIn';

vi.mock('../../lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } },
}));

const row = {
  date: '2026-09-01',
  sleep: 4,
  leg_feel: 4,
  motivation: 4,
  illness: false,
};

function draw(props: Partial<Parameters<typeof TodayCheckIn>[0]> = {}) {
  return render(
    <MantineProvider>
      <TodayCheckIn checkin={null} loading={false} onComplete={() => {}} {...props} />
    </MantineProvider>
  );
}

describe('TodayCheckIn', () => {
  it('asks for the check-in when there is none for today', () => {
    draw();
    expect(screen.getByText(/Morning Readiness/i)).toBeInTheDocument();
  });

  it('asks all four items plus the illness question', () => {
    // These are the fields the readiness rules read. Sleep in particular:
    // wellness is null without it, and null wellness fires nothing.
    draw();
    for (const label of [/Sleep/i, /Leg Feel/i, /Energy/i, /Motivation/i, /Feeling ill today/i]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('goes away once the athlete has answered', () => {
    draw({ checkin: row });
    expect(screen.queryByText(/Morning Readiness/i)).not.toBeInTheDocument();
  });

  it('renders nothing while the answer is still unknown', () => {
    // Flashing a survey at someone who already did it is worse than a beat's
    // delay before showing it.
    draw({ loading: true });
    expect(screen.queryByText(/Morning Readiness/i)).not.toBeInTheDocument();
  });

  it('stays hidden while loading even if a stale row is in hand', () => {
    draw({ loading: true, checkin: row });
    expect(screen.queryByText(/Morning Readiness/i)).not.toBeInTheDocument();
  });
});
