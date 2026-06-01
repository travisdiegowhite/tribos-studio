import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocationSearch } from '../LocationSearch';

vi.mock('../../../../utils/geocoding.js', () => ({
  geocodeWaypoint: vi.fn(),
}));

import { geocodeWaypoint } from '../../../../utils/geocoding.js';

const mockedGeocode = geocodeWaypoint as unknown as ReturnType<typeof vi.fn>;

function renderSearch(onFlyTo = vi.fn()) {
  render(
    <MantineProvider>
      <LocationSearch onFlyTo={onFlyTo} proximity={[-105.27, 40.01]} />
    </MantineProvider>,
  );
  return { onFlyTo };
}

beforeEach(() => mockedGeocode.mockReset());

describe('LocationSearch', () => {
  it('geocodes the query and flies to the result', async () => {
    mockedGeocode.mockResolvedValue({ coordinates: [-105.5, 40.5], name: 'Boulder, CO' });
    const { onFlyTo } = renderSearch();
    fireEvent.change(screen.getByTestId('rb2-location-search-input'), {
      target: { value: 'Boulder' },
    });
    fireEvent.click(screen.getByTestId('rb2-location-search-submit'));
    await waitFor(() => expect(onFlyTo).toHaveBeenCalledWith([-105.5, 40.5], 13));
    expect(mockedGeocode).toHaveBeenCalledWith('Boulder', [-105.27, 40.01]);
    expect(await screen.findByTestId('rb2-location-search-result')).toHaveTextContent(
      'Boulder, CO',
    );
  });

  it('submits on Enter', async () => {
    mockedGeocode.mockResolvedValue({ coordinates: [1, 2], name: 'X' });
    const { onFlyTo } = renderSearch();
    const input = screen.getByTestId('rb2-location-search-input');
    fireEvent.change(input, { target: { value: 'X' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(onFlyTo).toHaveBeenCalled());
  });

  it('shows an empty-state message when nothing matches', async () => {
    mockedGeocode.mockResolvedValue(null);
    const { onFlyTo } = renderSearch();
    fireEvent.change(screen.getByTestId('rb2-location-search-input'), {
      target: { value: 'asdfghjkl' },
    });
    fireEvent.click(screen.getByTestId('rb2-location-search-submit'));
    expect(await screen.findByTestId('rb2-location-search-empty')).toBeInTheDocument();
    expect(onFlyTo).not.toHaveBeenCalled();
  });
});
