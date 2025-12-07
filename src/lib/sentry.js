import * as Sentry from '@sentry/react';

/**
 * Initialize Sentry error tracking
 * Only initializes in production if DSN is configured
 */
export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;

  // Skip initialization if no DSN is configured
  if (!dsn) {
    if (import.meta.env.DEV) {
      console.log('Sentry: No DSN configured, skipping initialization');
    }
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,

    // Performance monitoring - adjust sample rate as needed
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,

    // Session replay for debugging (optional)
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: import.meta.env.PROD ? 0.1 : 0,

    // Only send errors in production
    enabled: import.meta.env.PROD,

    // Filter out known noise
    ignoreErrors: [
      // Browser extensions
      'ResizeObserver loop',
      'Non-Error promise rejection',
      // Network errors that are expected
      'Failed to fetch',
      'Load failed',
      'NetworkError',
      // User cancelled operations
      'AbortError',
    ],

    // Before sending, sanitize sensitive data
    beforeSend(event) {
      // Remove any potential PII from URLs
      if (event.request?.url) {
        const url = new URL(event.request.url);
        // Remove access tokens from URLs
        url.searchParams.delete('access_token');
        url.searchParams.delete('token');
        url.searchParams.delete('code');
        event.request.url = url.toString();
      }
      return event;
    },

    // Add app version info
    release: `tribos-studio@${import.meta.env.VITE_APP_VERSION || '0.1.0'}`,
  });

  // Expose Sentry globally for ErrorBoundary integration
  if (typeof window !== 'undefined') {
    window.Sentry = Sentry;
  }

  console.log('Sentry initialized');
}

export { Sentry };
