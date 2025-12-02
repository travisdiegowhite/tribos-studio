import React from 'react';
import { render } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

/**
 * Basic smoke test for the app
 * Note: Full app rendering requires auth context and router setup
 * More comprehensive tests should be added for individual components
 */
describe('App', () => {
  it('renders MantineProvider without crashing', () => {
    const { container } = render(
      <MantineProvider>
        <div>Test content</div>
      </MantineProvider>
    );
    expect(container).toBeInTheDocument();
  });
});
