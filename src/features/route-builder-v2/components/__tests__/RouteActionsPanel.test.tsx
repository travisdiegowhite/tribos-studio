import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect, vi } from 'vitest';
import { RouteActionsPanel } from '../RouteActionsPanel';
import type { UseRoutePersistenceReturn } from '../../../../hooks/route-builder';

function makePersistence(
  overrides: Partial<UseRoutePersistenceReturn> = {},
): UseRoutePersistenceReturn {
  return {
    isSaving: false,
    isLoading: false,
    lastError: null,
    savedRouteId: null,
    save: vi.fn().mockResolvedValue({ id: 'new-id', name: 'A' }),
    loadRoute: vi.fn().mockResolvedValue(true),
    listSavedRoutes: vi.fn().mockResolvedValue([
      { id: 'r-1', name: 'Morning Loop', distance_km: 30, elevation_gain_m: 500 },
      { id: 'r-2', name: 'Hill Repeats', distance_km: 15, elevation_gain_m: 800 },
    ]),
    exportRoute: vi.fn(),
    importGpx: vi.fn().mockResolvedValue([
      [-105.27, 40.01],
      [-105.28, 40.02],
    ]),
    ...overrides,
  };
}

function renderPanel(props: Partial<React.ComponentProps<typeof RouteActionsPanel>> = {}) {
  const persistence = props.persistence ?? makePersistence();
  return {
    persistence,
    ...render(
      <MantineProvider>
        <RouteActionsPanel persistence={persistence} {...props} />
      </MantineProvider>,
    ),
  };
}

describe('RouteActionsPanel', () => {
  it('renders Save / Load / Export buttons', () => {
    renderPanel();
    expect(screen.getByTestId('rb2-save-route-button')).toBeInTheDocument();
    expect(screen.getByTestId('rb2-load-route-button')).toBeInTheDocument();
    expect(screen.getByTestId('rb2-export-route-button')).toBeInTheDocument();
  });

  it('opens Save modal, calls persistence.save with the entered name, fires onSaved', async () => {
    const onSaved = vi.fn();
    const { persistence } = renderPanel({ defaultName: 'Test', onSaved });
    fireEvent.click(screen.getByTestId('rb2-save-route-button'));
    const input = await screen.findByTestId('rb2-save-name-input');
    fireEvent.change(input, { target: { value: 'My Loop' } });
    fireEvent.click(await screen.findByTestId('rb2-save-confirm'));
    await waitFor(() => expect(persistence.save).toHaveBeenCalledWith('My Loop'));
    expect(onSaved).toHaveBeenCalledWith('new-id');
  });

  it('opens Load modal, fetches list, and calls loadRoute on selection', async () => {
    const onLoaded = vi.fn();
    const { persistence } = renderPanel({ onLoaded });
    fireEvent.click(screen.getByTestId('rb2-load-route-button'));
    await waitFor(() => expect(persistence.listSavedRoutes).toHaveBeenCalled());
    const item = await screen.findByTestId('rb2-load-item-r-1');
    fireEvent.click(item);
    await waitFor(() => expect(persistence.loadRoute).toHaveBeenCalledWith('r-1'));
    expect(onLoaded).toHaveBeenCalledWith('r-1');
  });

  it('calls exportRoute with the chosen format', async () => {
    const { persistence } = renderPanel();
    fireEvent.click(screen.getByTestId('rb2-export-route-button'));
    const gpx = await screen.findByTestId('rb2-export-gpx');
    fireEvent.click(gpx);
    expect(persistence.exportRoute).toHaveBeenCalledWith('gpx');
  });

  it('imports a GPX file and fires onImported with the track coords', async () => {
    const onImported = vi.fn();
    const { persistence } = renderPanel({ onImported });
    const input = screen.getByTestId('rb2-import-gpx-input');
    const file = new File(['<gpx></gpx>'], 'ride.gpx', { type: 'application/gpx+xml' });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(persistence.importGpx).toHaveBeenCalledWith(file));
    await waitFor(() =>
      expect(onImported).toHaveBeenCalledWith([
        [-105.27, 40.01],
        [-105.28, 40.02],
      ]),
    );
  });

  it('disables Save and Export when there is no route', () => {
    renderPanel({ hasRoute: false });
    expect(screen.getByTestId('rb2-save-route-button')).toBeDisabled();
    expect(screen.getByTestId('rb2-export-route-button')).toBeDisabled();
    // Load and Import remain available as entry points.
    expect(screen.getByTestId('rb2-load-route-button')).not.toBeDisabled();
    expect(screen.getByTestId('rb2-import-gpx-button')).not.toBeDisabled();
  });
});
