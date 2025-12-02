// Centralized Error Handling Utilities
// Provides secure error logging and user-friendly error messages

/**
 * Error types for classification
 */
export const ErrorTypes = {
  NETWORK: 'NETWORK_ERROR',
  VALIDATION: 'VALIDATION_ERROR',
  AUTH: 'AUTH_ERROR',
  RATE_LIMIT: 'RATE_LIMIT_ERROR',
  API: 'API_ERROR',
  FILE: 'FILE_ERROR',
  UNKNOWN: 'UNKNOWN_ERROR'
};

/**
 * Error severity levels
 */
export const ErrorSeverity = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * Base error class for the application
 */
export class AppError extends Error {
  constructor(message, type = ErrorTypes.UNKNOWN, severity = ErrorSeverity.MEDIUM, details = null) {
    super(message);
    this.name = 'AppError';
    this.type = type;
    this.severity = severity;
    this.details = details;
    this.timestamp = new Date().toISOString();
    this.userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown';
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      type: this.type,
      severity: this.severity,
      timestamp: this.timestamp,
      stack: process.env.NODE_ENV === 'development' ? this.stack : undefined
    };
  }
}

/**
 * Specific error classes
 */
export class NetworkError extends AppError {
  constructor(message, details = null) {
    super(message, ErrorTypes.NETWORK, ErrorSeverity.MEDIUM, details);
    this.name = 'NetworkError';
  }
}

export class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, ErrorTypes.VALIDATION, ErrorSeverity.LOW, details);
    this.name = 'ValidationError';
  }
}

export class AuthError extends AppError {
  constructor(message, details = null) {
    super(message, ErrorTypes.AUTH, ErrorSeverity.HIGH, details);
    this.name = 'AuthError';
  }
}

export class RateLimitError extends AppError {
  constructor(message, details = null) {
    super(message, ErrorTypes.RATE_LIMIT, ErrorSeverity.MEDIUM, details);
    this.name = 'RateLimitError';
  }
}

/**
 * Error handler class
 */
export class ErrorHandler {
  constructor() {
    this.errorLog = [];
    this.maxLogSize = 100;
  }

  /**
   * Handle and log errors
   */
  handle(error, context = {}) {
    const processedError = this.processError(error);

    // Log error (but don't expose sensitive information)
    this.logError(processedError, context);

    // Return user-friendly error
    return this.formatUserError(processedError);
  }

  /**
   * Process raw errors into AppError instances
   */
  processError(error) {
    if (error instanceof AppError) {
      return error;
    }

    // Network errors
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      return new NetworkError('Network connection failed', {
        originalMessage: error.message
      });
    }

    // Rate limiting errors
    if (error.status === 429 || error.message.includes('rate limit')) {
      return new RateLimitError('Too many requests. Please try again later.', {
        originalMessage: error.message
      });
    }

    // Authentication errors
    if (error.status === 401 || error.status === 403) {
      return new AuthError('Authentication failed', {
        status: error.status,
        originalMessage: error.message
      });
    }

    // API errors
    if (error.status && error.status >= 400 && error.status < 500) {
      return new AppError(
        'Request failed due to client error',
        ErrorTypes.API,
        ErrorSeverity.MEDIUM,
        {
          status: error.status,
          originalMessage: error.message
        }
      );
    }

    if (error.status && error.status >= 500) {
      return new AppError(
        'Server error occurred',
        ErrorTypes.API,
        ErrorSeverity.HIGH,
        {
          status: error.status,
          originalMessage: error.message
        }
      );
    }

    // Generic error
    return new AppError(
      'An unexpected error occurred',
      ErrorTypes.UNKNOWN,
      ErrorSeverity.MEDIUM,
      {
        originalMessage: error.message,
        originalName: error.name
      }
    );
  }

  /**
   * Log errors securely
   */
  logError(error, context = {}) {
    const logEntry = {
      error: {
        type: error.type,
        message: error.message,
        severity: error.severity,
        timestamp: error.timestamp
      },
      context: {
        url: typeof window !== 'undefined' ? window.location.href : 'Unknown',
        userAgent: error.userAgent,
        ...context
      }
    };

    // Add to in-memory log (production should use proper logging service)
    this.errorLog.push(logEntry);

    // Keep log size manageable
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog = this.errorLog.slice(-this.maxLogSize);
    }

    // Console log in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Application Error:', logEntry);
      if (error.stack) {
        console.error('Stack trace:', error.stack);
      }
    }

    // In production, send to logging service
    // this.sendToLoggingService(logEntry);
  }

  /**
   * Format user-friendly error messages
   */
  formatUserError(error) {
    const userMessages = {
      [ErrorTypes.NETWORK]: 'Connection failed. Please check your internet connection and try again.',
      [ErrorTypes.VALIDATION]: error.message, // Validation messages are already user-friendly
      [ErrorTypes.AUTH]: 'Authentication failed. Please sign in again.',
      [ErrorTypes.RATE_LIMIT]: 'Too many requests. Please wait a moment before trying again.',
      [ErrorTypes.API]: 'Service temporarily unavailable. Please try again later.',
      [ErrorTypes.FILE]: 'File processing failed. Please check the file and try again.',
      [ErrorTypes.UNKNOWN]: 'Something went wrong. Please try again later.'
    };

    return {
      message: userMessages[error.type] || userMessages[ErrorTypes.UNKNOWN],
      type: error.type,
      severity: error.severity,
      canRetry: this.canRetry(error)
    };
  }

  /**
   * Determine if an error is retryable
   */
  canRetry(error) {
    const retryableTypes = [
      ErrorTypes.NETWORK,
      ErrorTypes.RATE_LIMIT,
      ErrorTypes.API
    ];

    return retryableTypes.includes(error.type) &&
           error.severity !== ErrorSeverity.CRITICAL;
  }

  /**
   * Get recent errors for debugging
   */
  getRecentErrors(count = 10) {
    return this.errorLog.slice(-count);
  }

  /**
   * Clear error log
   */
  clearErrors() {
    this.errorLog = [];
  }
}

// Global error handler instance
export const errorHandler = new ErrorHandler();

/**
 * Async error wrapper for promises
 */
export const handleAsyncError = async (asyncFunction, context = {}) => {
  try {
    return await asyncFunction();
  } catch (error) {
    throw errorHandler.handle(error, context);
  }
};

/**
 * Error boundary helper for React components
 */
export const withErrorHandling = (Component) => {
  return function ErrorWrappedComponent(props) {
    try {
      return Component(props);
    } catch (error) {
      const handledError = errorHandler.handle(error, {
        component: Component.name || 'Unknown Component'
      });

      console.error('Component Error:', handledError);

      // Return error fallback UI
      return (
        <div className="error-fallback" role="alert">
          <h2>Something went wrong</h2>
          <p>{handledError.message}</p>
          {handledError.canRetry && (
            <button onClick={() => window.location.reload()}>
              Try Again
            </button>
          )}
        </div>
      );
    }
  };
};

/**
 * Custom hook for error handling in React components
 */
export const useErrorHandler = () => {
  const handleError = (error, context = {}) => {
    const handledError = errorHandler.handle(error, context);

    // You can integrate with a toast notification system here
    // toast.error(handledError.message);

    return handledError;
  };

  return { handleError };
};

/**
 * Global error event handler for unhandled promise rejections
 */
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const error = errorHandler.handle(event.reason, {
      context: 'unhandledPromiseRejection'
    });

    console.error('Unhandled Promise Rejection:', error);

    // Prevent the default browser console error
    event.preventDefault();
  });

  window.addEventListener('error', (event) => {
    const error = errorHandler.handle(event.error, {
      context: 'uncaughtException',
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno
    });

    console.error('Uncaught Exception:', error);
  });
}

export default {
  ErrorTypes,
  ErrorSeverity,
  AppError,
  NetworkError,
  ValidationError,
  AuthError,
  RateLimitError,
  errorHandler,
  handleAsyncError,
  withErrorHandling,
  useErrorHandler
};