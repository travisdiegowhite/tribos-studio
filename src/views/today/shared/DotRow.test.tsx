import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { DotRow } from './DotRow';

function dots(container: HTMLElement) {
  return Array.from(container.querySelectorAll('span')) as HTMLSpanElement[];
}

describe('DotRow', () => {
  it('renders one dot per planned slot', () => {
    const { container } = render(<DotRow total={5} completed={2} />);
    expect(dots(container)).toHaveLength(5);
  });

  it('falls back to 5 outlined dots when total is zero', () => {
    const { container } = render(<DotRow total={0} completed={0} />);
    expect(dots(container)).toHaveLength(5);
  });

  it('fills the first N dots based on completion', () => {
    const { container } = render(<DotRow total={4} completed={3} />);
    const ds = dots(container);
    // Filled dots have the teal background; remaining are transparent.
    expect(ds[0].style.background).toContain('color-teal');
    expect(ds[2].style.background).toContain('color-teal');
    expect(ds[3].style.background).toBe('transparent');
  });
});
