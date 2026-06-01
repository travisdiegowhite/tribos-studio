import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect, vi } from 'vitest';
import { WaypointListPanel } from '../WaypointListPanel';
import type { Coordinate } from '../../../../types/geo';

const threeWaypoints: Array<{ id: string; position: Coordinate; type?: string }> = [
  { id: 'wp-0', position: [-105, 40], type: 'start' },
  { id: 'wp-1', position: [-105.05, 40.05], type: 'waypoint' },
  { id: 'wp-2', position: [-105.1, 40.1], type: 'end' },
];

function renderPanel(props: Partial<React.ComponentProps<typeof WaypointListPanel>> = {}) {
  const onRemove = props.onRemove ?? vi.fn();
  render(
    <MantineProvider>
      <WaypointListPanel waypoints={threeWaypoints} onRemove={onRemove} {...props} />
    </MantineProvider>,
  );
  return { onRemove };
}

describe('WaypointListPanel', () => {
  it('renders nothing when there are no waypoints', () => {
    render(
      <MantineProvider>
        <WaypointListPanel waypoints={[]} onRemove={vi.fn()} />
      </MantineProvider>,
    );
    expect(screen.queryByTestId('rb2-waypoint-list')).not.toBeInTheDocument();
  });

  it('shows drag handles only when reorderable (>2 waypoints + onReorder)', () => {
    const { rerender } = render(
      <MantineProvider>
        <WaypointListPanel waypoints={threeWaypoints} onRemove={vi.fn()} />
      </MantineProvider>,
    );
    // No onReorder → no handles.
    expect(screen.queryByTestId('rb2-waypoint-drag-0')).not.toBeInTheDocument();

    rerender(
      <MantineProvider>
        <WaypointListPanel waypoints={threeWaypoints} onRemove={vi.fn()} onReorder={vi.fn()} />
      </MantineProvider>,
    );
    expect(screen.getByTestId('rb2-waypoint-drag-0')).toBeInTheDocument();
  });

  it('fires onReorder with from/to indices on drag + drop', () => {
    const onReorder = vi.fn();
    renderPanel({ onReorder });
    fireEvent.dragStart(screen.getByTestId('rb2-waypoint-row-2'));
    fireEvent.dragOver(screen.getByTestId('rb2-waypoint-row-0'));
    fireEvent.drop(screen.getByTestId('rb2-waypoint-row-0'));
    expect(onReorder).toHaveBeenCalledWith(2, 0);
  });

  it('does not fire onReorder when dropped on itself', () => {
    const onReorder = vi.fn();
    renderPanel({ onReorder });
    fireEvent.dragStart(screen.getByTestId('rb2-waypoint-row-1'));
    fireEvent.drop(screen.getByTestId('rb2-waypoint-row-1'));
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('fires onRemove with the row index', () => {
    const { onRemove } = renderPanel();
    fireEvent.click(screen.getByLabelText('Remove start'));
    expect(onRemove).toHaveBeenCalledWith(0);
  });
});
