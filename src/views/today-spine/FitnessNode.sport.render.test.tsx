import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { FitnessNode } from './FitnessNode';
import type { NodeVM } from './nodeView';

const vm = (over: Partial<NodeVM> = {}): NodeVM => ({
  headerLabel: 'Today · Sat 17 Oct',
  headerDate: 'Today · Sat 17 Oct',
  isToday: true,
  isFuture: false,
  activity: { tag: 'STEADY', name: 'River run', meta: '45m · 50 stress', tagColor: 'var(--color-bg)' },
  fs: 4,
  stateText: 'Fresh',
  stateColor: 'var(--color-text-muted)',
  ctl: 60,
  atl: 56,
  volLabel: '6.0h',
  ctlDelta: '+2',
  ctlDeltaColor: 'var(--color-text-muted)',
  atlDelta: '+1',
  atlDeltaColor: 'var(--color-text-muted)',
  ctlSpark: '',
  atlSpark: '',
  ...over,
});

const renderNode = (props: Partial<React.ComponentProps<typeof FitnessNode>>) =>
  render(
    <MantineProvider>
      <FitnessNode vm={vm()} flipped {...props} />
    </MantineProvider>,
  );

describe('FitnessNode fitness by sport (multisport phase 4)', () => {
  it('shows ride and run shares on today’s back face', () => {
    renderNode({ fitnessBySport: { ride: 40, run: 20 } });
    const block = screen.getByTestId('fitness-by-sport');
    expect(block.textContent).toContain('Ride');
    expect(block.textContent).toContain('40');
    expect(block.textContent).toContain('Run');
    expect(block.textContent).toContain('20');
  });

  it('hides them on a scrubbed day and for a single-sport athlete', () => {
    const { unmount } = renderNode({ vm: vm({ isToday: false }), fitnessBySport: { ride: 40, run: 20 } });
    expect(screen.queryByTestId('fitness-by-sport')).toBeNull();
    unmount();
    renderNode({ fitnessBySport: null });
    expect(screen.queryByTestId('fitness-by-sport')).toBeNull();
  });
});
