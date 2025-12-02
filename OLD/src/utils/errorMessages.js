/**
 * Error message utilities for user-friendly error handling
 * Maps technical errors to actionable user messages
 */

// Common error categories and their user-friendly messages
const ERROR_CATEGORIES = {
  // Network/Connection errors
  network: {
    message: 'Unable to connect to the server',
    suggestion: 'Check your internet connection and try again.',
    retryable: true,
  },
  timeout: {
    message: 'The request took too long',
    suggestion: 'The server is busy. Please try again in a moment.',
    retryable: true,
  },

  // Authentication errors
  auth_expired: {
    message: 'Your session has expired',
    suggestion: 'Please sign in again to continue.',
    retryable: false,
    action: 'sign_in',
  },
  auth_invalid: {
    message: 'Unable to verify your account',
    suggestion: 'Please sign out and sign in again.',
    retryable: false,
    action: 'sign_out',
  },

  // Third-party integration errors
  strava_disconnected: {
    message: 'Strava connection lost',
    suggestion: 'Reconnect your Strava account to continue syncing.',
    retryable: false,
    action: 'reconnect_strava',
  },
  strava_rate_limit: {
    message: 'Too many Strava requests',
    suggestion: 'Strava limits how often we can sync. Try again in 15 minutes.',
    retryable: true,
  },
  garmin_disconnected: {
    message: 'Garmin connection lost',
    suggestion: 'Reconnect your Garmin account to continue syncing.',
    retryable: false,
    action: 'reconnect_garmin',
  },

  // Route generation errors
  route_no_roads: {
    message: 'No suitable roads found',
    suggestion: 'Try a different starting location or expand your search area.',
    retryable: true,
  },
  route_too_short: {
    message: 'Route distance too short',
    suggestion: 'Increase the duration or adjust your preferences.',
    retryable: true,
  },
  route_api_limit: {
    message: 'Route service temporarily unavailable',
    suggestion: 'We\'ve hit our routing limit. Try again in a few minutes.',
    retryable: true,
  },

  // Data errors
  no_data: {
    message: 'No data available',
    suggestion: 'Import your rides to see this information.',
    retryable: false,
    action: 'import_rides',
  },
  invalid_data: {
    message: 'Unable to process this data',
    suggestion: 'The data format may be incorrect. Try a different file.',
    retryable: false,
  },

  // Generic fallback
  unknown: {
    message: 'Something went wrong',
    suggestion: 'Please try again. If the problem persists, contact support.',
    retryable: true,
  },
};

/**
 * Categorize an error based on its properties
 */
function categorizeError(error) {
  const message = error?.message?.toLowerCase() || '';
  const code = error?.code?.toLowerCase() || '';
  const status = error?.status || error?.statusCode;

  // Network errors
  if (message.includes('network') || message.includes('failed to fetch') || code === 'NETWORK_ERROR') {
    return 'network';
  }
  if (message.includes('timeout') || code === 'ECONNABORTED') {
    return 'timeout';
  }

  // Auth errors
  if (status === 401 || message.includes('unauthorized') || message.includes('jwt expired')) {
    return 'auth_expired';
  }
  if (status === 403 || message.includes('forbidden')) {
    return 'auth_invalid';
  }

  // Strava errors
  if (message.includes('strava') && (message.includes('disconnect') || message.includes('revoked'))) {
    return 'strava_disconnected';
  }
  if (message.includes('strava') && (status === 429 || message.includes('rate limit'))) {
    return 'strava_rate_limit';
  }

  // Garmin errors
  if (message.includes('garmin') && (message.includes('disconnect') || message.includes('revoked'))) {
    return 'garmin_disconnected';
  }

  // Route errors
  if (message.includes('no roads') || message.includes('no route')) {
    return 'route_no_roads';
  }
  if (status === 429 && message.includes('route')) {
    return 'route_api_limit';
  }

  // Data errors
  if (message.includes('no data') || message.includes('not found')) {
    return 'no_data';
  }
  if (message.includes('invalid') || message.includes('parse error')) {
    return 'invalid_data';
  }

  return 'unknown';
}

/**
 * Get a user-friendly error message object
 * @param {Error|string} error - The error to process
 * @returns {Object} - { message, suggestion, retryable, action? }
 */
export function getUserFriendlyError(error) {
  if (!error) {
    return ERROR_CATEGORIES.unknown;
  }

  // Handle string errors
  if (typeof error === 'string') {
    error = { message: error };
  }

  const category = categorizeError(error);
  const categoryInfo = ERROR_CATEGORIES[category] || ERROR_CATEGORIES.unknown;

  return {
    ...categoryInfo,
    originalMessage: error.message || 'Unknown error',
    category,
  };
}

/**
 * Format error for display in toast notifications
 * @param {Error|string} error - The error to format
 * @returns {string} - User-friendly message for toast
 */
export function formatErrorForToast(error) {
  const { message, suggestion } = getUserFriendlyError(error);
  return `${message}. ${suggestion}`;
}

/**
 * Format error for display in UI components
 * @param {Error|string} error - The error to format
 * @returns {Object} - { title, description, showRetry, action? }
 */
export function formatErrorForUI(error) {
  const { message, suggestion, retryable, action } = getUserFriendlyError(error);
  return {
    title: message,
    description: suggestion,
    showRetry: retryable,
    action,
  };
}

/**
 * Log error with context for debugging
 * Only logs detailed info in development
 */
export function logError(error, context = {}) {
  const isDev = process.env.NODE_ENV === 'development';

  if (isDev) {
    console.error('Error:', error);
    console.error('Context:', context);
    console.error('Stack:', error?.stack);
  } else {
    // In production, log minimal info
    console.error(`[${context.component || 'App'}] ${error?.message || 'Unknown error'}`);
  }
}

export default {
  getUserFriendlyError,
  formatErrorForToast,
  formatErrorForUI,
  logError,
};
