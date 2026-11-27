import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ComfortStrip } from '../ComfortStrip';
import { allComfortStripCopy, withinLine } from '../comfortStripCopy';
import type { ComfortValidation, ComfortSegment } from '../../../utils/comfortValidator';

const seg = (length_m: number, tone: ComfortSegment['tone']): ComfortSegment => ({
  length_m,
  tone,
  status: tone === 'flagged' ? 'flagged' : tone === 'unknown' ? 'unknown' : 'free',
  cls: null,
  confidence: 'high' as ComfortSegment['confidence'],
  reasons: [],
});

function validation(): ComfortValidation {
  const segments = [seg(8000, 'within'), seg(1200, 'flagged'), seg(5000, 'at'), seg(1800, 'unknown')];
  return {
    level: 2,
    total_m: 16000,
    within_m: 13000,
    flagged_m: 1200,
    blocked_m: 0,
    unknown_m: 1800,
    withinPct: 81.25,
    unknownPct: 11.25,
    segments,
    flaggedStretches: [{ start_m: 8000, end_m: 9200, length_m: 1200 } as never],
    blockedStretches: [],
    unknownStretches: [],
    longestFlagged_m: 1200,
    passes: false,
    failures: [],
    headsUps: [],
  };
}

describe('ComfortStrip', () => {
  it('says there is not enough road data rather than passing a null check', () => {
    render(<ComfortStrip validation={null} />);
    expect(screen.getByTestId('comfort-strip')).toHaveAttribute('data-state', 'no-data');
    expect(screen.getByText(/Not enough road data/)).toBeInTheDocument();
  });

  it('shows a checking state while loading', () => {
    render(<ComfortStrip validation={null} loading />);
    expect(screen.getByText(/Checking the roads/)).toBeInTheDocument();
  });

  it('summarises the route and draws one block per tone run', () => {
    render(<ComfortStrip validation={validation()} units="km" />);
    expect(screen.getByText(withinLine(81.25, 2))).toBeInTheDocument();
    expect(screen.getByText('One stretch above your comfort.')).toBeInTheDocument();
    expect(screen.getByText(/11% of the route/)).toBeInTheDocument();
    const strip = screen.getByRole('group');
    expect(strip.querySelectorAll('[data-tone]')).toHaveLength(4);
  });

  it('lets the rider pick a flagged stretch to see it on the map', () => {
    const onSelect = vi.fn();
    render(<ComfortStrip validation={validation()} onSelectStretch={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /Above your comfort/ }));
    expect(onSelect).toHaveBeenCalledWith(8000, 9200);
  });
});

describe('comfort strip copy', () => {
  it('has no absolutes (rider-facing comfort copy rule)', () => {
    for (const line of allComfortStripCopy()) {
      expect(line).not.toMatch(/\b(never|always|guarantee[sd]?|guaranteed)\b/i);
    }
  });
});
