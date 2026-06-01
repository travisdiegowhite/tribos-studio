import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect, vi } from 'vitest';
import { EditToolbar } from '../EditToolbar';

function renderToolbar(props: Partial<React.ComponentProps<typeof EditToolbar>> = {}) {
  const onUndo = props.onUndo ?? vi.fn();
  const onRedo = props.onRedo ?? vi.fn();
  render(
    <MantineProvider>
      <EditToolbar
        canUndo={props.canUndo ?? true}
        canRedo={props.canRedo ?? true}
        onUndo={onUndo}
        onRedo={onRedo}
      />
    </MantineProvider>,
  );
  return { onUndo, onRedo };
}

describe('EditToolbar', () => {
  it('invokes undo / redo on click when enabled', () => {
    const { onUndo, onRedo } = renderToolbar();
    fireEvent.click(screen.getByTestId('rb2-undo-button'));
    fireEvent.click(screen.getByTestId('rb2-redo-button'));
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onRedo).toHaveBeenCalledTimes(1);
  });

  it('disables buttons at the ends of the history', () => {
    renderToolbar({ canUndo: false, canRedo: false });
    expect(screen.getByTestId('rb2-undo-button')).toBeDisabled();
    expect(screen.getByTestId('rb2-redo-button')).toBeDisabled();
  });

  it('omits the reverse button unless onReverse is provided', () => {
    renderToolbar();
    expect(screen.queryByTestId('rb2-reverse-button')).not.toBeInTheDocument();
  });

  it('renders and invokes reverse when onReverse is provided', () => {
    const onReverse = vi.fn();
    render(
      <MantineProvider>
        <EditToolbar
          canUndo
          canRedo
          onUndo={vi.fn()}
          onRedo={vi.fn()}
          onReverse={onReverse}
          canReverse
        />
      </MantineProvider>,
    );
    fireEvent.click(screen.getByTestId('rb2-reverse-button'));
    expect(onReverse).toHaveBeenCalledTimes(1);
  });

  it('omits the units toggle unless onToggleUnits is provided', () => {
    renderToolbar();
    expect(screen.queryByTestId('rb2-units-toggle')).not.toBeInTheDocument();
  });

  it('shows the active unit and flips it on click', () => {
    const onToggleUnits = vi.fn();
    const { rerender } = render(
      <MantineProvider>
        <EditToolbar
          canUndo
          canRedo
          onUndo={vi.fn()}
          onRedo={vi.fn()}
          onToggleUnits={onToggleUnits}
          unitsImperial
        />
      </MantineProvider>,
    );
    expect(screen.getByTestId('rb2-units-toggle')).toHaveTextContent('MI');
    fireEvent.click(screen.getByTestId('rb2-units-toggle'));
    expect(onToggleUnits).toHaveBeenCalledTimes(1);

    rerender(
      <MantineProvider>
        <EditToolbar
          canUndo
          canRedo
          onUndo={vi.fn()}
          onRedo={vi.fn()}
          onToggleUnits={onToggleUnits}
          unitsImperial={false}
        />
      </MantineProvider>,
    );
    expect(screen.getByTestId('rb2-units-toggle')).toHaveTextContent('KM');
  });
});
