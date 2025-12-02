import React from 'react';
import { render } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import {
  DashboardSkeleton,
  RouteListSkeleton,
  TrainingMetricsSkeleton,
  RouteGeneratorSkeleton,
  StatsCardSkeleton,
  InsightsSkeleton,
} from './LoadingSkeletons';

// Wrapper for Mantine components
const TestWrapper = ({ children }) => (
  <MantineProvider>
    {children}
  </MantineProvider>
);

describe('LoadingSkeletons', () => {
  it('renders DashboardSkeleton without crashing', () => {
    const { container } = render(
      <TestWrapper>
        <DashboardSkeleton />
      </TestWrapper>
    );
    expect(container).toBeInTheDocument();
  });

  it('renders RouteListSkeleton with default count', () => {
    const { container } = render(
      <TestWrapper>
        <RouteListSkeleton />
      </TestWrapper>
    );
    expect(container).toBeInTheDocument();
  });

  it('renders RouteListSkeleton with custom count', () => {
    const { container } = render(
      <TestWrapper>
        <RouteListSkeleton count={3} />
      </TestWrapper>
    );
    expect(container).toBeInTheDocument();
  });

  it('renders TrainingMetricsSkeleton without crashing', () => {
    const { container } = render(
      <TestWrapper>
        <TrainingMetricsSkeleton />
      </TestWrapper>
    );
    expect(container).toBeInTheDocument();
  });

  it('renders RouteGeneratorSkeleton without crashing', () => {
    const { container } = render(
      <TestWrapper>
        <RouteGeneratorSkeleton />
      </TestWrapper>
    );
    expect(container).toBeInTheDocument();
  });

  it('renders StatsCardSkeleton without crashing', () => {
    const { container } = render(
      <TestWrapper>
        <StatsCardSkeleton />
      </TestWrapper>
    );
    expect(container).toBeInTheDocument();
  });

  it('renders InsightsSkeleton without crashing', () => {
    const { container } = render(
      <TestWrapper>
        <InsightsSkeleton />
      </TestWrapper>
    );
    expect(container).toBeInTheDocument();
  });
});
