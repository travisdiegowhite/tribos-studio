import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { GenerateBar } from '../GenerateBar';
import type { UseAIGenerationReturn } from '../../../../hooks/route-builder';
import type { Coordinate } from '../../../../types/geo';

vi.mock('../../../../utils/geocoding.js', () => ({
  geocodeWaypoint: vi.fn(),
}));

import { geocodeWaypoint } from '../../../../utils/geocoding.js';

const mockedGeocode = geocodeWaypoint as unknown as ReturnType<typeof vi.fn>;

function makeGen(overrides: Partial<UseAIGenerationReturn> = {}): UseAIGenerationReturn {
  return {
    isGenerating: false,
    lastError: null,
    guestCapHit: false,
    suggestions: [],
    generate: vi.fn().mockResolvedValue(undefined),
    selectSuggestion: vi.fn(),
    clearSuggestions: vi.fn(),
    ...overrides,
  };
}

function Harness({
  generation,
  defaultStart = [-105.27, 40.01] as Coordinate,
  initialExpanded = false,
  isImperial = false,
}: {
  generation: UseAIGenerationReturn;
  defaultStart?: Coordinate | null;
  initialExpanded?: boolean;
  isImperial?: boolean;
}) {
  const [expanded, setExpanded] = useState(initialExpanded);
  return (
    <MantineProvider>
      <GenerateBar
        generation={generation}
        defaultStart={defaultStart}
        expanded={expanded}
        onExpandedChange={setExpanded}
        isImperial={isImperial}
      />
    </MantineProvider>
  );
}

beforeEach(() => {
  mockedGeocode.mockReset();
});

describe('GenerateBar', () => {
  it('is collapsed by default, hiding the form controls', () => {
    render(<Harness generation={makeGen()} />);
    expect(screen.getByTestId('rb2-generate-bar-toggle')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByTestId('rb2-generate-bar-submit')).toBeNull();
  });

  it('expands on toggle click', () => {
    render(<Harness generation={makeGen()} />);
    fireEvent.click(screen.getByTestId('rb2-generate-bar-toggle'));
    expect(screen.getByTestId('rb2-generate-bar-submit')).toBeInTheDocument();
  });

  it('generates with defaultStart when no address is typed', async () => {
    const generation = makeGen();
    render(<Harness generation={generation} initialExpanded />);
    fireEvent.click(screen.getByTestId('rb2-generate-bar-submit'));
    await waitFor(() => expect(generation.generate).toHaveBeenCalledTimes(1));
    const [arg] = (generation.generate as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(arg.start_coord).toEqual([-105.27, 40.01]);
  });

  it('surfaces a generation error', () => {
    render(<Harness generation={makeGen({ lastError: 'Boom' })} initialExpanded />);
    expect(screen.getByTestId('rb2-generate-bar-error')).toHaveTextContent('Boom');
  });

  it('labels inputs in miles and stores a typed value as canonical km', async () => {
    const generation = makeGen();
    render(<Harness generation={generation} initialExpanded isImperial />);
    expect(screen.getByText('Distance (mi)')).toBeInTheDocument();
    expect(screen.getByText('Elevation (ft)')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('rb2-distance-input'), { target: { value: '30' } });
    fireEvent.click(screen.getByTestId('rb2-generate-bar-submit'));

    await waitFor(() => expect(generation.generate).toHaveBeenCalledTimes(1));
    const [arg] = (generation.generate as ReturnType<typeof vi.fn>).mock.calls[0];
    // 30 mi → ~48.3 km stored canonically.
    expect(arg.distance_km).toBeCloseTo(48.28, 1);
  });
});
