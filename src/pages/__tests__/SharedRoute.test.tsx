import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('react-map-gl', () => ({
  default: ({ children }: { children?: React.ReactNode }) => <div data-testid="map">{children}</div>,
  Source: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  Layer: () => null,
  Marker: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock('mapbox-gl/dist/mapbox-gl.css', () => ({}));
vi.mock('../../components/RouteBuilder', () => ({ MAPBOX_TOKEN: 'test-token' }));

const authState: { user: { id: string } | null } = { user: null };
vi.mock('../../contexts/AuthContext.jsx', () => ({
  useAuth: () => authState,
}));

vi.mock('../../utils/routesService', () => ({
  getPublicRoute: vi.fn(),
}));
vi.mock('../../utils/routeExport', () => ({
  exportAndDownloadRoute: vi.fn(),
}));
vi.mock('../../hooks/route-builder/useRoutePersistence', () => ({
  withElevations: vi.fn(async (c: number[][]) => c.map(([lng, lat]) => [lng, lat, 1600])),
}));

import SharedRoute from '../SharedRoute';
import { getPublicRoute } from '../../utils/routesService';
import { exportAndDownloadRoute } from '../../utils/routeExport';

const ROUTE = {
  id: 'route-42',
  name: 'Lefthand Loop',
  distance_km: 52.4,
  elevation_gain_m: 610,
  estimated_duration_minutes: 125,
  geometry: {
    type: 'LineString',
    coordinates: [
      [-105.27, 40.01],
      [-105.3, 40.1],
    ],
  },
};

function renderPage() {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={['/r/route-42']}>
        <Routes>
          <Route path="/r/:routeId" element={<SharedRoute />} />
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  );
}

describe('SharedRoute', () => {
  beforeEach(() => {
    vi.mocked(getPublicRoute).mockResolvedValue(ROUTE as never);
    vi.mocked(exportAndDownloadRoute).mockClear();
    authState.user = null;
  });

  it('shows the route name and stats', async () => {
    renderPage();
    expect(await screen.findByText('Lefthand Loop')).toBeInTheDocument();
    expect(screen.getByText(/52\.4 km/)).toBeInTheDocument();
  });

  it('lets a guest download a GPX with elevation, no account needed', async () => {
    renderPage();
    fireEvent.click(await screen.findByTestId('shared-route-download-gpx'));
    await waitFor(() => expect(exportAndDownloadRoute).toHaveBeenCalledTimes(1));
    const [data, format] = vi.mocked(exportAndDownloadRoute).mock.calls[0];
    expect(format).toBe('gpx');
    expect(data.name).toBe('Lefthand Loop');
    expect(data.coordinates[0]).toEqual([-105.27, 40.01, 1600]);
  });

  it('sends guests and riders to the builder at /ride/:id', async () => {
    renderPage();
    const cta = await screen.findByTestId('shared-route-cta');
    expect(cta.getAttribute('href')).toBe('/ride/route-42');
    expect(cta.textContent).toBe('Open in Route Builder');
  });

  it('mentions sending to a device for a signed-in rider', async () => {
    authState.user = { id: 'u1' };
    renderPage();
    const cta = await screen.findByTestId('shared-route-cta');
    expect(cta.textContent).toMatch(/send to device/);
  });
});
