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
});
