import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect, vi } from 'vitest';
import { RouteActionsPanel } from '../RouteActionsPanel';
import type { UseRoutePersistenceReturn } from '../../../../hooks/route-builder';

const notifyShow = vi.fn();
vi.mock('@mantine/notifications', () => ({
  notifications: { show: (...args: unknown[]) => notifyShow(...args) },
}));

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
    deleteRoute: vi.fn().mockResolvedValue(true),
    exportRoute: vi.fn(),
    importGpx: vi.fn().mockResolvedValue([
      [-105.27, 40.01],
      [-105.28, 40.02],
    ]),
    isPushingToDevice: false,
    checkGarminConnection: vi.fn().mockResolvedValue(false),
    pushToGarmin: vi.fn().mockResolvedValue({ ok: true, message: 'Sent.' }),
    checkWahooConnection: vi.fn().mockResolvedValue(false),
    pushToWahoo: vi.fn().mockResolvedValue({ ok: true, message: 'Sent.' }),
    shareRoute: vi.fn().mockResolvedValue({ ok: true, url: 'http://x/routes/r-1' }),
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

  it('opens Save modal, calls persistence.save with the entered name + description, fires onSaved', async () => {
    const onSaved = vi.fn();
    const { persistence } = renderPanel({ defaultName: 'Test', onSaved });
    fireEvent.click(screen.getByTestId('rb2-save-route-button'));
    const input = await screen.findByTestId('rb2-save-name-input');
    fireEvent.change(input, { target: { value: 'My Loop' } });
    fireEvent.change(screen.getByTestId('rb2-save-description-input'), {
      target: { value: 'Quiet gravel out east' },
    });
    fireEvent.click(await screen.findByTestId('rb2-save-confirm'));
    await waitFor(() =>
      expect(persistence.save).toHaveBeenCalledWith('My Loop', 'Quiet gravel out east'),
    );
    expect(onSaved).toHaveBeenCalledWith('new-id');
  });

  it('pre-fills the description and shows "Update" when editing a saved route', async () => {
    renderPanel({
      defaultName: 'Existing',
      defaultDescription: 'Loaded notes',
      persistence: makePersistence({ savedRouteId: 'route-1' }),
    });
    fireEvent.click(screen.getByTestId('rb2-save-route-button'));
    expect(await screen.findByTestId('rb2-save-description-input')).toHaveValue('Loaded notes');
    expect(screen.getByTestId('rb2-save-confirm')).toHaveTextContent('Update');
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

  it('deletes a saved route on a two-click confirm', async () => {
    const { persistence } = renderPanel();
    fireEvent.click(screen.getByTestId('rb2-load-route-button'));
    const del = await screen.findByTestId('rb2-delete-route-r-1');
    fireEvent.click(del); // arm
    expect(persistence.deleteRoute).not.toHaveBeenCalled();
    fireEvent.click(del); // confirm
    await waitFor(() => expect(persistence.deleteRoute).toHaveBeenCalledWith('r-1'));
    await waitFor(() => expect(screen.queryByTestId('rb2-load-item-r-1')).not.toBeInTheDocument());
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

  it('hides "Send to Garmin" when the account is not connected', async () => {
    const { persistence } = renderPanel();
    await waitFor(() => expect(persistence.checkGarminConnection).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('rb2-export-route-button'));
    await screen.findByTestId('rb2-export-gpx');
    expect(screen.queryByTestId('rb2-send-to-garmin')).not.toBeInTheDocument();
  });

  it('shows "Send to Garmin" when connected and pushes on click', async () => {
    notifyShow.mockClear();
    const { persistence } = renderPanel({
      persistence: makePersistence({
        checkGarminConnection: vi.fn().mockResolvedValue(true),
        pushToGarmin: vi.fn().mockResolvedValue({ ok: true, message: 'On its way.' }),
      }),
    });
    fireEvent.click(screen.getByTestId('rb2-export-route-button'));
    const send = await screen.findByTestId('rb2-send-to-garmin');
    fireEvent.click(send);
    await waitFor(() => expect(persistence.pushToGarmin).toHaveBeenCalled());
    await waitFor(() =>
      expect(notifyShow).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Sent to Garmin!' }),
      ),
    );
  });

  it('falls back to a TCX download when the Courses API is unavailable', async () => {
    const { persistence } = renderPanel({
      persistence: makePersistence({
        checkGarminConnection: vi.fn().mockResolvedValue(true),
        pushToGarmin: vi
          .fn()
          .mockResolvedValue({ ok: false, reason: 'courses_unavailable', message: 'nope' }),
      }),
    });
    fireEvent.click(screen.getByTestId('rb2-export-route-button'));
    const send = await screen.findByTestId('rb2-send-to-garmin');
    fireEvent.click(send);
    await waitFor(() => expect(persistence.exportRoute).toHaveBeenCalledWith('tcx'));
  });

  it('copies a share link after confirming, when the route is saved', async () => {
    notifyShow.mockClear();
    const { persistence } = renderPanel({
      persistence: makePersistence({
        savedRouteId: 'r-1',
        shareRoute: vi.fn().mockResolvedValue({ ok: true, url: 'http://x/routes/r-1' }),
      }),
    });
    fireEvent.click(screen.getByTestId('rb2-share-route-button'));
    // Sharing makes the route public, so a confirm modal gates it.
    const confirm = await screen.findByTestId('rb2-share-confirm');
    fireEvent.click(confirm);
    await waitFor(() => expect(persistence.shareRoute).toHaveBeenCalled());
    await waitFor(() =>
      expect(notifyShow).toHaveBeenCalledWith(expect.objectContaining({ title: 'Link copied' })),
    );
  });

  it('shows an error and keeps the confirm open when sharing fails', async () => {
    notifyShow.mockClear();
    const { persistence } = renderPanel({
      persistence: makePersistence({
        savedRouteId: 'r-1',
        shareRoute: vi
          .fn()
          .mockResolvedValue({ ok: false, reason: 'error', message: 'Could not update route.' }),
      }),
    });
    fireEvent.click(screen.getByTestId('rb2-share-route-button'));
    fireEvent.click(await screen.findByTestId('rb2-share-confirm'));
    await waitFor(() => expect(persistence.shareRoute).toHaveBeenCalled());
    await waitFor(() =>
      expect(notifyShow).toHaveBeenCalledWith(expect.objectContaining({ title: 'Share failed' })),
    );
  });

  it('prompts a save when sharing an unsaved route', async () => {
    const { persistence } = renderPanel({
      persistence: makePersistence({ savedRouteId: null }),
    });
    fireEvent.click(screen.getByTestId('rb2-share-route-button'));
    // Save modal opens so the user can name + save before sharing; the
    // visibility change never fires for an unsaved route.
    expect(await screen.findByTestId('rb2-save-modal')).toBeInTheDocument();
    expect(persistence.shareRoute).not.toHaveBeenCalled();
  });

  it('disables Share when there is no route', () => {
    renderPanel({ hasRoute: false });
    expect(screen.getByTestId('rb2-share-route-button')).toBeDisabled();
  });
});
