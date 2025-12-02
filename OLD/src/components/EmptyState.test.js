import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import EmptyState from './EmptyState';

// Wrapper for tests that need routing and Mantine
const TestWrapper = ({ children }) => (
  <MantineProvider>
    <BrowserRouter>
      {children}
    </BrowserRouter>
  </MantineProvider>
);

describe('EmptyState Component', () => {
  it('renders with preset type "noRides"', () => {
    render(
      <TestWrapper>
        <EmptyState type="noRides" />
      </TestWrapper>
    );

    expect(screen.getByText('No Rides Yet')).toBeInTheDocument();
    expect(screen.getByText('Import Rides')).toBeInTheDocument();
  });

  it('renders with preset type "noRoutes"', () => {
    render(
      <TestWrapper>
        <EmptyState type="noRoutes" />
      </TestWrapper>
    );

    expect(screen.getByText('No Routes Yet')).toBeInTheDocument();
    expect(screen.getByText('Create a Route')).toBeInTheDocument();
    expect(screen.getByText('Import Rides')).toBeInTheDocument();
  });

  it('renders with preset type "noTrainingData"', () => {
    render(
      <TestWrapper>
        <EmptyState type="noTrainingData" />
      </TestWrapper>
    );

    expect(screen.getByText('Not Enough Data')).toBeInTheDocument();
  });

  it('renders with custom props overriding preset', () => {
    render(
      <TestWrapper>
        <EmptyState
          type="noRides"
          title="Custom Title"
          description="Custom description text"
        />
      </TestWrapper>
    );

    expect(screen.getByText('Custom Title')).toBeInTheDocument();
    expect(screen.getByText('Custom description text')).toBeInTheDocument();
  });

  it('renders with fully custom props', () => {
    const mockOnClick = jest.fn();

    render(
      <TestWrapper>
        <EmptyState
          title="Custom Empty State"
          description="This is a custom empty state"
          primaryAction={{
            label: 'Do Something',
            onClick: mockOnClick,
          }}
        />
      </TestWrapper>
    );

    expect(screen.getByText('Custom Empty State')).toBeInTheDocument();
    expect(screen.getByText('This is a custom empty state')).toBeInTheDocument();

    const button = screen.getByText('Do Something');
    fireEvent.click(button);
    expect(mockOnClick).toHaveBeenCalled();
  });

  it('renders secondary text when provided', () => {
    render(
      <TestWrapper>
        <EmptyState
          type="noRides"
          secondaryText="Additional info here"
        />
      </TestWrapper>
    );

    expect(screen.getByText('Additional info here')).toBeInTheDocument();
  });

  it('supports different sizes', () => {
    const { container: smContainer } = render(
      <TestWrapper>
        <EmptyState type="noRides" size="sm" />
      </TestWrapper>
    );

    const { container: lgContainer } = render(
      <TestWrapper>
        <EmptyState type="noRides" size="lg" />
      </TestWrapper>
    );

    // Both should render without errors
    expect(smContainer).toBeInTheDocument();
    expect(lgContainer).toBeInTheDocument();
  });

  it('renders generic type as fallback', () => {
    render(
      <TestWrapper>
        <EmptyState type="generic" />
      </TestWrapper>
    );

    expect(screen.getByText('Nothing Here Yet')).toBeInTheDocument();
  });
});
