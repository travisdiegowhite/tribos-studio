import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { SessionProfile } from '../SessionProfile';
import { EffortLegend } from '../ZoneLegend';
import { resolveSession, effortTone } from '../../../../lib/training/session';

const TODAY = '2026-11-21';

const sst = resolveSession(
  {
    name: 'Sweet Spot',
    workout_type: 'sweet_spot',
    sport: 'cycling',
    target_duration: 60,
    details: {
      prescription: {
        version: 1, source: 'designer', predicted_load: 55, warmup_min: 10, cooldown_min: 6,
        intervals: [{ repeats: 3, duration_min: 12, recovery_min: 4, target_pct_ftp_min: 88, target_pct_ftp_max: 92 }],
      },
    },
  },
  { today: TODAY },
);
const endurance = resolveSession({ name: 'Long', workout_id: 'long_endurance_ride', sport: 'cycling', target_duration: 180 }, { today: TODAY });
const run = resolveSession(
  {
    name: 'Threshold Run', workout_type: 'threshold', sport: 'running', target_duration: 50,
    details: { prescription: { version: 1, source: 'coach', basis: 'pace', intervals: [{ repeats: 4, duration_min: 5, recovery_min: 2, target_pct_threshold_pace_min: 98, target_pct_threshold_pace_max: 102 }] } },
  },
  { today: TODAY },
);

function draw(session: typeof sst, compact = false) {
  return render(
    <MantineProvider>
      <SessionProfile steps={session.steps} sport={session.sport} compact={compact} />
    </MantineProvider>,
  );
}

describe('effortTone', () => {
  it('groups zones the way the calendar cards do', () => {
    expect(effortTone(1)).toBe('easy');
    expect(effortTone(2)).toBe('endurance');
    expect(effortTone(3)).toBe('tempo');
    expect(effortTone(3.5)).toBe('tempo');
    expect(effortTone(4)).toBe('hard');
    expect(effortTone(6)).toBe('hard');
    expect(effortTone(null)).toBe('easy');
  });
});

describe('SessionProfile — ink trace', () => {
  it('inks in only the efforts: three sweet-spot reps, warmup and cooldown stay paper', () => {
    draw(sst);
    const fills = screen.getByTestId('session-profile').querySelectorAll('rect[data-tone]');
    expect(fills).toHaveLength(3);
    fills.forEach((r) => expect(r.getAttribute('data-tone')).toBe('tempo'));
  });

  it('draws one ink trace with the stroke in style (var() survives)', () => {
    draw(sst);
    const trace = screen.getByTestId('ink-trace');
    expect((trace as unknown as SVGElement).style.stroke).toBe('var(--color-ink)');
    // A pure step-line: starts at the warmup's height, not the baseline.
    expect(trace.getAttribute('d')).toMatch(/^M0 \d+(\.\d+)? L/);
    expect(trace.getAttribute('d')).not.toMatch(/^M0 100 /);
  });

  it('washes an all-endurance day so it is not blank', () => {
    draw(endurance);
    const fills = [...screen.getByTestId('session-profile').querySelectorAll('rect[data-tone]')];
    expect(fills.length).toBeGreaterThan(0);
    expect(fills.every((r) => r.getAttribute('data-tone') === 'endurance')).toBe(true);
  });

  it('marks the threshold and the sets in Courier, FTP for a ride and THR for a run', () => {
    draw(sst);
    expect(screen.getByTestId('threshold-label').textContent).toBe('FTP');
    expect(screen.getByTestId('rep-mark').textContent).toBe('3×12′');
  });

  it('labels a run\'s threshold THR', () => {
    draw(run);
    expect(screen.getByTestId('threshold-label').textContent).toBe('THR');
    expect(screen.getAllByTestId('rep-mark')[0].textContent).toBe('4×5′');
  });

  it('draws trace and fills only when compact', () => {
    draw(sst, true);
    expect(screen.queryByTestId('threshold-label')).toBeNull();
    expect(screen.queryByTestId('rep-mark')).toBeNull();
    expect(screen.getByTestId('ink-trace')).toBeTruthy();
  });
});

describe('EffortLegend', () => {
  it('names only the tones the session inks in', () => {
    render(
      <MantineProvider>
        <EffortLegend steps={sst.steps} sport="cycling" />
      </MantineProvider>,
    );
    const legend = screen.getByTestId('zone-legend');
    expect(legend.textContent).toMatch(/Effort/);
    expect(legend.textContent).toMatch(/FTP/);
    expect(legend.textContent).toMatch(/Tempo/);
    expect(legend.textContent).not.toMatch(/Hard/);
  });
});
