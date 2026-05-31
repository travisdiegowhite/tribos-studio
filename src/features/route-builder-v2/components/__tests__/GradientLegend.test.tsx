import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect } from 'vitest';
import { GradientLegend } from '../GradientLegend';
import { GRADE_COLORS } from '../../../../utils/routeGradient.js';

describe('GradientLegend', () => {
  it('renders a swatch row for every grade band', () => {
    render(
      <MantineProvider>
        <GradientLegend />
      </MantineProvider>,
    );
    const legend = screen.getByTestId('rb2-gradient-legend');
    expect(legend).toBeInTheDocument();
    // Every band label from the single source of truth must appear.
    for (const band of GRADE_COLORS as Array<{ label: string }>) {
      expect(legend).toHaveTextContent(band.label);
    }
  });
});
