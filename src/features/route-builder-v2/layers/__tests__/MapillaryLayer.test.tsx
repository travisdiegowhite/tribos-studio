import { render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-map-gl', () => ({
  Source: ({ children }: { children?: React.ReactNode }) => <div data-testid="mly-source">{children}</div>,
  Layer: ({ id }: { id: string }) => <div data-testid={`layer-${id}`} />,
  Popup: ({ children }: { children?: React.ReactNode }) => <div data-testid="mly-popup">{children}</div>,
}));

import { MapillaryLayer, MAPILLARY_IMAGE_LAYER_ID } from '../MapillaryLayer';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function renderLayer(props: Partial<React.ComponentProps<typeof MapillaryLayer>> = {}) {
  return render(
    <MantineProvider>
      <MapillaryLayer visible selected={null} onClose={vi.fn()} {...props} />
    </MantineProvider>,
  );
}

describe('MapillaryLayer', () => {
  it('renders nothing when hidden', () => {
    renderLayer({ visible: false });
    expect(screen.queryByTestId('mly-source')).not.toBeInTheDocument();
  });

  it('draws coverage lines and image dots', () => {
    vi.stubEnv('VITE_MAPILLARY_TOKEN', 'MLY|abc');
    renderLayer();
    expect(screen.getByTestId('layer-rb2-mly-sequence')).toBeInTheDocument();
    expect(screen.getByTestId(`layer-${MAPILLARY_IMAGE_LAYER_ID}`)).toBeInTheDocument();
  });

  it('shows the fetched photo with credit and a link', async () => {
    vi.stubEnv('VITE_MAPILLARY_TOKEN', 'MLY|abc');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: '42', thumb_1024_url: 'https://img/42.jpg', captured_at: 1700000000000 }),
      }),
    );
    renderLayer({ selected: { imageId: '42', coord: [-105.2, 40.0] } });
    await waitFor(() => expect(screen.getByTestId('rb2-mapillary-photo')).toBeInTheDocument());
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://img/42.jpg');
    expect(screen.getByText(/© Mapillary/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute(
      'href',
      'https://www.mapillary.com/app/?pKey=42',
    );
  });

  it('says so when the photo cannot be loaded', async () => {
    vi.stubEnv('VITE_MAPILLARY_TOKEN', 'MLY|abc');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    renderLayer({ selected: { imageId: '42', coord: [-105.2, 40.0] } });
    await waitFor(() => expect(screen.getByText(/couldn’t be loaded/)).toBeInTheDocument());
  });
});
