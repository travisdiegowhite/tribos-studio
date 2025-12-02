import React from 'react';
import { Container, Title, Text, Button, Stack, Paper, Group, ThemeIcon } from '@mantine/core';
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react';

/**
 * ErrorBoundary component that catches JavaScript errors in child components
 * Provides a user-friendly fallback UI with recovery options
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log error details for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    this.setState(prevState => ({
      errorInfo,
      errorCount: prevState.errorCount + 1
    }));

    // In production, you could send this to an error reporting service
    if (process.env.NODE_ENV === 'production') {
      // Example: sendToErrorReporting(error, errorInfo);
    }
  }

  handleRetry = () => {
    // Clear the error state and try again
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleGoHome = () => {
    // Navigate to home and clear error
    window.location.href = '/';
  };

  handleReload = () => {
    // Full page reload
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const { fallback, minimal } = this.props;

      // Allow custom fallback UI
      if (fallback) {
        return fallback(this.state.error, this.handleRetry);
      }

      // Minimal error display for smaller components
      if (minimal) {
        return (
          <Paper p="md" withBorder style={{ backgroundColor: 'var(--mantine-color-red-light)' }}>
            <Group>
              <ThemeIcon color="red" size="lg" variant="light">
                <AlertTriangle size={20} />
              </ThemeIcon>
              <div>
                <Text fw={500} size="sm">Something went wrong</Text>
                <Text size="xs" c="dimmed">
                  <Button
                    variant="subtle"
                    size="xs"
                    onClick={this.handleRetry}
                    leftSection={<RefreshCw size={12} />}
                  >
                    Try again
                  </Button>
                </Text>
              </div>
            </Group>
          </Paper>
        );
      }

      // Full error display
      return (
        <Container size="sm" py="xl">
          <Paper p="xl" radius="md" withBorder>
            <Stack align="center" gap="lg">
              <ThemeIcon
                size={80}
                radius="xl"
                variant="light"
                color="red"
              >
                <AlertTriangle size={40} />
              </ThemeIcon>

              <div style={{ textAlign: 'center' }}>
                <Title order={2} mb="xs">
                  Oops! Something went wrong
                </Title>
                <Text c="dimmed" size="lg" maw={400}>
                  We encountered an unexpected error. This has been logged and we're working on it.
                </Text>
              </div>

              <Group>
                <Button
                  variant="filled"
                  onClick={this.handleRetry}
                  leftSection={<RefreshCw size={16} />}
                >
                  Try Again
                </Button>
                <Button
                  variant="light"
                  onClick={this.handleGoHome}
                  leftSection={<Home size={16} />}
                >
                  Go to Dashboard
                </Button>
              </Group>

              {/* Show error details in development */}
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <Paper
                  p="md"
                  withBorder
                  style={{
                    backgroundColor: 'var(--mantine-color-dark-7)',
                    width: '100%',
                    overflow: 'auto'
                  }}
                >
                  <Group mb="xs">
                    <Bug size={16} />
                    <Text size="sm" fw={500}>Developer Details</Text>
                  </Group>
                  <Text
                    size="xs"
                    style={{
                      fontFamily: 'monospace',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word'
                    }}
                  >
                    {this.state.error.toString()}
                    {this.state.errorInfo?.componentStack && (
                      <>
                        {'\n\nComponent Stack:'}
                        {this.state.errorInfo.componentStack}
                      </>
                    )}
                  </Text>
                </Paper>
              )}

              {/* Offer full reload if retry has been attempted multiple times */}
              {this.state.errorCount > 1 && (
                <Text size="sm" c="dimmed">
                  Still having issues?{' '}
                  <Button
                    variant="subtle"
                    size="xs"
                    onClick={this.handleReload}
                  >
                    Reload the page
                  </Button>
                </Text>
              )}
            </Stack>
          </Paper>
        </Container>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
