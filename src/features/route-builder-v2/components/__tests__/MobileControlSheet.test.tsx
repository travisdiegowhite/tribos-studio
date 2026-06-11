import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { MobileControlSheet, type MobileSheetTab } from '../MobileControlSheet';

const tabs: MobileSheetTab[] = [
  { id: 'build', label: 'Build', icon: <span>b</span>, content: <div data-testid="content-build">BUILD</div> },
  { id: 'layers', label: 'Layers', icon: <span>l</span>, badge: 3, content: <div data-testid="content-layers">LAYERS</div> },
];

function Harness({ initial = null as string | null }: { initial?: string | null }) {
  const [active, setActive] = useState<string | null>(initial);
  return (
    <MantineProvider>
      <MobileControlSheet tabs={tabs} activeId={active} onActiveChange={setActive} />
    </MantineProvider>
  );
}

describe('MobileControlSheet', () => {
  it('collapses by default — tab strip visible, no panel content', () => {
    render(<Harness />);
    expect(screen.getByTestId('rb2-mobile-tab-build')).toBeInTheDocument();
    expect(screen.getByTestId('rb2-mobile-tab-layers')).toBeInTheDocument();
    expect(screen.queryByTestId('rb2-mobile-sheet-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('content-build')).not.toBeInTheDocument();
  });

  it('opens a tab on tap and shows its content', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('rb2-mobile-tab-build'));
    expect(screen.getByTestId('rb2-mobile-sheet-panel')).toBeInTheDocument();
    expect(screen.getByTestId('content-build')).toBeInTheDocument();
  });

  it('tapping the active tab collapses it again', () => {
    render(<Harness initial="build" />);
    expect(screen.getByTestId('content-build')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('rb2-mobile-tab-build'));
    expect(screen.queryByTestId('content-build')).not.toBeInTheDocument();
  });

  it('switches directly between tabs', () => {
    render(<Harness initial="build" />);
    fireEvent.click(screen.getByTestId('rb2-mobile-tab-layers'));
    expect(screen.queryByTestId('content-build')).not.toBeInTheDocument();
    expect(screen.getByTestId('content-layers')).toBeInTheDocument();
  });

  it('the close button collapses the sheet', () => {
    render(<Harness initial="layers" />);
    fireEvent.click(screen.getByTestId('rb2-mobile-sheet-close'));
    expect(screen.queryByTestId('rb2-mobile-sheet-panel')).not.toBeInTheDocument();
  });

  it('renders a badge count on a tab', () => {
    render(<Harness />);
    expect(screen.getByTestId('rb2-mobile-tab-layers')).toHaveTextContent('3');
  });
});
