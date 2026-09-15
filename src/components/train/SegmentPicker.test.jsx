import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import SegmentPicker, { formatLastRidden } from './SegmentPicker';

const line = [
  [-105.25, 40.02],
  [-105.24, 40.03],
  [-105.23, 40.03],
];

function seg(id, name, rideCount, extra = {}) {
  return {
    id,
    display_name: name,
    auto_name: name,
    custom_name: null,
    generic: false,
    distance_meters: 1500,
    avg_gradient: 0.2,
    elevation_gain_meters: 10,
    ride_count: rideCount,
    terrain_type: 'flat',
    last_ridden_at: '2026-09-03T14:00:00Z',
    geojson: { type: 'LineString', coordinates: line },
    ...extra,
  };
}

function namer(over = {}) {
  return {
    progress: { running: false, done: 0, total: 0, named: 0, error: null },
    unnamedCount: 0,
    nameAll: vi.fn(),
    stop: vi.fn(),
    rename: vi.fn().mockResolvedValue(undefined),
    renaming: null,
    ...over,
  };
}

const fmt = (km) => `${km.toFixed(1)} km`;

function renderPicker(props = {}) {
  const all = {
    segments: [seg('a', 'Nelson Rd → 63rd St', 12), seg('b', 'Rolling 1.9km', 7, { generic: true }), seg('c', 'Lee Hill', 2, { terrain_type: 'climb', avg_gradient: 6.1 })],
    selectedId: 'a',
    onSelect: vi.fn(),
    formatDistance: fmt,
    loading: false,
    error: null,
    namer: namer(),
    ...props,
  };
  render(
    <MantineProvider>
      <SegmentPicker {...all} />
    </MantineProvider>,
  );
  return all;
}

beforeEach(() => vi.clearAllMocks());

describe('SegmentPicker', () => {
  it('shows each segment as a card with its shape, numbers and selection state', () => {
    renderPicker();
    expect(screen.getAllByTestId('segment-glyph')).toHaveLength(3);
    const a = screen.getByTestId('segment-card-a');
    expect(a.getAttribute('data-selected')).toBe('true');
    expect(within(a).getByText('1.5 KM · FLAT')).toBeTruthy();
    expect(within(a).getByText('12 RIDES · LAST SEP 3, 26')).toBeTruthy();
    const c = screen.getByTestId('segment-card-c');
    expect(within(c).getByText('1.5 KM · CLIMB · +6.1%')).toBeTruthy();
    expect(within(c).getByText('2 RIDES · LAST SEP 3, 26')).toBeTruthy();
    expect(screen.getByText('3 segments')).toBeTruthy();
  });

  it('selects a segment when its card is clicked', () => {
    const { onSelect } = renderPicker();
    fireEvent.click(screen.getByRole('button', { name: 'Compare repeats of Lee Hill' }));
    expect(onSelect).toHaveBeenCalledWith('c');
  });

  it('filters by name', () => {
    renderPicker();
    fireEvent.change(screen.getByRole('textbox', { name: 'Find a segment' }), { target: { value: 'lee' } });
    expect(screen.queryByTestId('segment-card-a')).toBeNull();
    expect(screen.getByTestId('segment-card-c')).toBeTruthy();
    expect(screen.getByText('1 segment of 3')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Find a segment' }), { target: { value: 'zzz' } });
    expect(screen.getByText(/Nothing matches/)).toBeTruthy();
  });

  it('shows twelve cards, then the rest on request', () => {
    const many = Array.from({ length: 15 }, (_, i) => seg(`s${i}`, `Segment ${i}`, 15 - i));
    renderPicker({ segments: many, selectedId: 's0' });
    expect(screen.getAllByTestId(/segment-card-/)).toHaveLength(12);
    fireEvent.click(screen.getByRole('button', { name: 'Show all 15' }));
    expect(screen.getAllByTestId(/segment-card-/)).toHaveLength(15);
  });

  it('renames inline, saving on Enter and cancelling on Escape', async () => {
    const n = namer();
    renderPicker({ namer: n });
    fireEvent.click(screen.getByRole('button', { name: 'Rename Rolling 1.9km' }));
    const input = screen.getByRole('textbox', { name: 'New name for Rolling 1.9km' });
    // A generic name is not offered as the starting text; the athlete types fresh.
    expect(input.value).toBe('');
    fireEvent.change(input, { target: { value: 'Niwot rollers' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(n.rename).toHaveBeenCalledWith('b', 'Niwot rollers');
    await screen.findByRole('button', { name: 'Rename Rolling 1.9km' });

    fireEvent.click(screen.getByRole('button', { name: 'Rename Nelson Rd → 63rd St' }));
    const input2 = screen.getByRole('textbox', { name: 'New name for Nelson Rd → 63rd St' });
    expect(input2.value).toBe('Nelson Rd → 63rd St');
    fireEvent.keyDown(input2, { key: 'Escape' });
    expect(screen.queryByRole('textbox', { name: /New name for/ })).toBeNull();
    expect(n.rename).toHaveBeenCalledTimes(1);
  });

  it('offers to name the generic segments and reports progress', () => {
    const n = namer({ unnamedCount: 1 });
    renderPicker({ namer: n });
    fireEvent.click(screen.getByRole('button', { name: 'Name my segments (1)' }));
    expect(n.nameAll).toHaveBeenCalled();
  });

  it('shows the running pass with a stop control, then the outcome', () => {
    const running = namer({ unnamedCount: 5, progress: { running: true, done: 3, total: 20, named: 2, error: null } });
    const { unmount } = render(
      <MantineProvider>
        <SegmentPicker segments={[seg('a', 'A', 1)]} selectedId="a" onSelect={() => {}} formatDistance={fmt} loading={false} error={null} namer={running} />
      </MantineProvider>,
    );
    expect(screen.getByTestId('segment-naming-progress').textContent).toMatch(/Naming 4 of 20 · 2 named/);
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(running.stop).toHaveBeenCalled();
    unmount();

    const finished = namer({ unnamedCount: 0, progress: { running: false, done: 20, total: 20, named: 17, error: null } });
    render(
      <MantineProvider>
        <SegmentPicker segments={[seg('a', 'A', 1)]} selectedId="a" onSelect={() => {}} formatDistance={fmt} loading={false} error={null} namer={finished} />
      </MantineProvider>,
    );
    expect(screen.getByTestId('segment-naming-summary').textContent).toBe('17 of 20 named');
  });

  it('explains loading, errors and an empty library', () => {
    const { unmount } = render(
      <MantineProvider>
        <SegmentPicker segments={[]} selectedId={null} onSelect={() => {}} formatDistance={fmt} loading error={null} namer={namer()} />
      </MantineProvider>,
    );
    expect(screen.getByText(/Loading your segments/)).toBeTruthy();
    unmount();
    const r2 = render(
      <MantineProvider>
        <SegmentPicker segments={[]} selectedId={null} onSelect={() => {}} formatDistance={fmt} loading={false} error="nope" namer={namer()} />
      </MantineProvider>,
    );
    expect(screen.getByTestId('repeats-segments-error').textContent).toMatch(/nope/);
    r2.unmount();
    render(
      <MantineProvider>
        <SegmentPicker segments={[]} selectedId={null} onSelect={() => {}} formatDistance={fmt} loading={false} error={null} namer={namer()} />
      </MantineProvider>,
    );
    expect(screen.getByText(/No segments in your library yet/)).toBeTruthy();
  });

  it('formats the last-ridden date and tolerates junk', () => {
    expect(formatLastRidden('2026-09-03T14:00:00Z')).toMatch(/Sep 3, 26/);
    expect(formatLastRidden('junk')).toBeNull();
    expect(formatLastRidden(null)).toBeNull();
  });
});
