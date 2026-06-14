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

  it('omits the close-loop button unless onCloseLoop is provided', () => {
    renderToolbar();
    expect(screen.queryByTestId('rb2-close-loop-button')).not.toBeInTheDocument();
  });

  it('renders close-loop, disabled until canCloseLoop, and invokes it', () => {
    const onCloseLoop = vi.fn();
    const { rerender } = render(
      <MantineProvider>
        <EditToolbar canUndo canRedo onUndo={vi.fn()} onRedo={vi.fn()} onCloseLoop={onCloseLoop} canCloseLoop={false} />
      </MantineProvider>,
    );
    expect(screen.getByTestId('rb2-close-loop-button')).toBeDisabled();
    rerender(
      <MantineProvider>
        <EditToolbar canUndo canRedo onUndo={vi.fn()} onRedo={vi.fn()} onCloseLoop={onCloseLoop} canCloseLoop />
      </MantineProvider>,
    );
    fireEvent.click(screen.getByTestId('rb2-close-loop-button'));
    expect(onCloseLoop).toHaveBeenCalledTimes(1);
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

  it('omits clear / snap / profile controls unless their props are provided', () => {
    renderToolbar();
    expect(screen.queryByTestId('rb2-clear-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('rb2-snap-toggle')).not.toBeInTheDocument();
    expect(screen.queryByTestId('rb2-profile-menu')).not.toBeInTheDocument();
  });

  it('renders an always-visible clear button, enabled only when there is something to clear', () => {
    const onClear = vi.fn();
    const { rerender } = render(
      <MantineProvider>
        <EditToolbar canUndo={false} canRedo={false} onUndo={vi.fn()} onRedo={vi.fn()} onClear={onClear} canClear={false} />
      </MantineProvider>,
    );
    // Visible even with no history and nothing to clear, but disabled.
    expect(screen.getByTestId('rb2-clear-button')).toBeInTheDocument();
    expect(screen.getByTestId('rb2-clear-button')).toBeDisabled();

    rerender(
      <MantineProvider>
        <EditToolbar canUndo={false} canRedo={false} onUndo={vi.fn()} onRedo={vi.fn()} onClear={onClear} canClear />
      </MantineProvider>,
    );
    fireEvent.click(screen.getByTestId('rb2-clear-button'));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('omits the clip-tangent toggle unless onToggleClipMode is provided', () => {
    renderToolbar();
    expect(screen.queryByTestId('rb2-clip-toggle')).not.toBeInTheDocument();
  });

  it('renders the clip toggle, fires it, and shows active styling', () => {
    const onToggleClipMode = vi.fn();
    const { rerender } = render(
      <MantineProvider>
        <EditToolbar canUndo canRedo onUndo={vi.fn()} onRedo={vi.fn()} onToggleClipMode={onToggleClipMode} clipMode={false} />
      </MantineProvider>,
    );
    const btn = screen.getByTestId('rb2-clip-toggle');
    expect(btn).not.toBeDisabled();
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(btn);
    expect(onToggleClipMode).toHaveBeenCalledTimes(1);

    rerender(
      <MantineProvider>
        <EditToolbar canUndo canRedo onUndo={vi.fn()} onRedo={vi.fn()} onToggleClipMode={onToggleClipMode} clipMode />
      </MantineProvider>,
    );
    expect(screen.getByTestId('rb2-clip-toggle')).toHaveAttribute('aria-pressed', 'true');
  });

  it('toggles snap-to-roads ↔ freehand', () => {
    const onToggleSnap = vi.fn();
    render(
      <MantineProvider>
        <EditToolbar canUndo canRedo onUndo={vi.fn()} onRedo={vi.fn()} onToggleSnap={onToggleSnap} snapEnabled />
      </MantineProvider>,
    );
    fireEvent.click(screen.getByTestId('rb2-snap-toggle'));
    expect(onToggleSnap).toHaveBeenCalledTimes(1);
  });

  it('shows the profile menu only while snapping and reports a selection', async () => {
    const onChangeProfile = vi.fn();
    const { rerender } = render(
      <MantineProvider>
        <EditToolbar
          canUndo
          canRedo
          onUndo={vi.fn()}
          onRedo={vi.fn()}
          onChangeProfile={onChangeProfile}
          routeProfile="road"
          snapEnabled={false}
        />
      </MantineProvider>,
    );
    // Hidden in freehand mode (profile only matters when snapping).
    expect(screen.queryByTestId('rb2-profile-menu')).not.toBeInTheDocument();

    rerender(
      <MantineProvider>
        <EditToolbar
          canUndo
          canRedo
          onUndo={vi.fn()}
          onRedo={vi.fn()}
          onChangeProfile={onChangeProfile}
          routeProfile="road"
          snapEnabled
        />
      </MantineProvider>,
    );
    fireEvent.click(screen.getByTestId('rb2-profile-menu'));
    fireEvent.click(await screen.findByTestId('rb2-profile-gravel'));
    expect(onChangeProfile).toHaveBeenCalledWith('gravel');
  });
});
