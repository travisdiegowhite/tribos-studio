import {
  getUserFriendlyError,
  formatErrorForToast,
  formatErrorForUI,
} from './errorMessages';

describe('errorMessages utilities', () => {
  describe('getUserFriendlyError', () => {
    it('handles null/undefined errors', () => {
      expect(getUserFriendlyError(null)).toHaveProperty('message');
      expect(getUserFriendlyError(undefined)).toHaveProperty('message');
    });

    it('handles string errors', () => {
      const result = getUserFriendlyError('Something went wrong');
      expect(result).toHaveProperty('message');
      expect(result).toHaveProperty('suggestion');
      expect(result.originalMessage).toBe('Something went wrong');
    });

    it('categorizes network errors', () => {
      const error = { message: 'Failed to fetch' };
      const result = getUserFriendlyError(error);
      expect(result.category).toBe('network');
      expect(result.retryable).toBe(true);
    });

    it('categorizes auth errors by status', () => {
      const error = { message: 'Error', status: 401 };
      const result = getUserFriendlyError(error);
      expect(result.category).toBe('auth_expired');
      expect(result.action).toBe('sign_in');
    });

    it('categorizes timeout errors', () => {
      const error = { message: 'Request timeout' };
      const result = getUserFriendlyError(error);
      expect(result.category).toBe('timeout');
      expect(result.retryable).toBe(true);
    });

    it('categorizes Strava rate limit errors', () => {
      const error = { message: 'Strava rate limit exceeded', status: 429 };
      const result = getUserFriendlyError(error);
      expect(result.category).toBe('strava_rate_limit');
      expect(result.retryable).toBe(true);
    });

    it('returns unknown for unrecognized errors', () => {
      const error = { message: 'Some random error xyz' };
      const result = getUserFriendlyError(error);
      expect(result.category).toBe('unknown');
    });
  });

  describe('formatErrorForToast', () => {
    it('combines message and suggestion', () => {
      const result = formatErrorForToast({ message: 'Network error' });
      expect(result).toContain('Unable to connect');
      expect(result).toContain('Check your internet');
    });
  });

  describe('formatErrorForUI', () => {
    it('returns structured UI error object', () => {
      const result = formatErrorForUI({ message: 'Network error' });
      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('description');
      expect(result).toHaveProperty('showRetry');
      expect(result.showRetry).toBe(true);
    });

    it('includes action for actionable errors', () => {
      const result = formatErrorForUI({ status: 401 });
      expect(result.action).toBe('sign_in');
    });
  });
});
