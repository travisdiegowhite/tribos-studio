import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FormPanel } from '../FormPanel';
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

function renderPanel(props: Partial<React.ComponentProps<typeof FormPanel>> = {}) {
  const generation = props.generation ?? makeGen();
  const utils = render(
    <MantineProvider>
      <FormPanel
        generation={generation}
        defaultStart={props.defaultStart ?? ([-105.27, 40.01] as Coordinate)}
        {...props}
      />
    </MantineProvider>,
  );
  return { generation, ...utils };
}

beforeEach(() => {
  mockedGeocode.mockReset();
});

describe('FormPanel', () => {
  it('renders collapsed by default', () => {
    renderPanel();
    const toggle = screen.getByTestId('rb2-form-panel-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('rb2-form-submit')).toBeNull();
  });

  it('expands on toggle click', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('rb2-form-panel-toggle'));
    expect(screen.getByTestId('rb2-form-submit')).toBeInTheDocument();
  });

  it('calls generate.generate with defaultStart when no address is typed', async () => {
    const { generation } = renderPanel({ defaultStart: [-105.27, 40.01] as Coordinate });
    fireEvent.click(screen.getByTestId('rb2-form-panel-toggle'));
    fireEvent.click(screen.getByTestId('rb2-form-submit'));
    await waitFor(() => expect(generation.generate).toHaveBeenCalledTimes(1));
    const [arg] = (generation.generate as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(arg.start_coord).toEqual([-105.27, 40.01]);
  });

  it('renders an error banner when lastError is set', () => {
    renderPanel({ generation: makeGen({ lastError: 'Boom' }) });
    fireEvent.click(screen.getByTestId('rb2-form-panel-toggle'));
    expect(screen.getByTestId('rb2-form-error')).toHaveTextContent('Boom');
  });

  it('geocodes a typed address when geolocation is denied', async () => {
    mockedGeocode.mockResolvedValue({
      coordinates: [-105.5, 40.5],
      name: 'Boulder, CO',
    });
    const { generation } = renderPanel({
      defaultStart: null,
      locationStatus: 'denied',
      viewportCenter: null,
    });
    fireEvent.click(screen.getByTestId('rb2-form-panel-toggle'));
    const input = screen.getByPlaceholderText(/Address or place/i);
    fireEvent.change(input, { target: { value: 'Boulder, CO' } });
    fireEvent.click(screen.getByTestId('rb2-form-submit'));
    await waitFor(() => expect(generation.generate).toHaveBeenCalledTimes(1));
    expect(mockedGeocode).toHaveBeenCalledWith('Boulder, CO', null);
    const [arg] = (generation.generate as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(arg.start_coord).toEqual([-105.5, 40.5]);
  });

  it('falls back to viewportCenter when no address and no geolocation', async () => {
    const { generation } = renderPanel({
      defaultStart: null,
      locationStatus: 'denied',
      viewportCenter: [-122.0, 37.5] as Coordinate,
    });
    fireEvent.click(screen.getByTestId('rb2-form-panel-toggle'));
    fireEvent.click(screen.getByTestId('rb2-form-submit'));
    await waitFor(() => expect(generation.generate).toHaveBeenCalledTimes(1));
    const [arg] = (generation.generate as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(arg.start_coord).toEqual([-122.0, 37.5]);
  });

  it('shows a local error when geolocation is denied, no address, no viewport', async () => {
    const { generation } = renderPanel({
      defaultStart: null,
      locationStatus: 'denied',
      viewportCenter: null,
    });
    fireEvent.click(screen.getByTestId('rb2-form-panel-toggle'));
    fireEvent.click(screen.getByTestId('rb2-form-submit'));
    await waitFor(() =>
      expect(screen.getByTestId('rb2-form-local-error')).toBeInTheDocument(),
    );
    expect(generation.generate).not.toHaveBeenCalled();
  });

  it('shows a hint when geolocation is denied and defaultStart is null', () => {
    renderPanel({ defaultStart: null, locationStatus: 'denied' });
    fireEvent.click(screen.getByTestId('rb2-form-panel-toggle'));
    expect(screen.getByTestId('rb2-form-location-hint')).toBeInTheDocument();
  });
});
