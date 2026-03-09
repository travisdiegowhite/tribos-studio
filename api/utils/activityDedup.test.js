import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase before importing the module
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockGte = vi.fn();
const mockLte = vi.fn();
const mockIs = vi.fn();
const mockLimit = vi.fn();
const mockSingle = vi.fn();
const mockUpdate = vi.fn();
const mockOrder = vi.fn();

function createChain() {
  const chain = {
    select: mockSelect.mockReturnThis(),
    eq: mockEq.mockReturnThis(),
    gte: mockGte.mockReturnThis(),
    lte: mockLte.mockReturnThis(),
    is: mockIs.mockReturnThis(),
    limit: mockLimit,
    single: mockSingle,
    update: mockUpdate.mockReturnThis(),
    order: mockOrder.mockReturnThis(),
  };
  return chain;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => createChain()),
  })),
}));

let checkForDuplicate, getProviderPriority, PROVIDER_PRIORITY;

describe('activityDedup', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    const module = await import('./activityDedup.js');
    checkForDuplicate = module.checkForDuplicate;
    getProviderPriority = module.getProviderPriority;
    PROVIDER_PRIORITY = module.PROVIDER_PRIORITY;
  });

  describe('getProviderPriority', () => {
    it('returns correct priority for known providers', () => {
      expect(getProviderPriority('garmin')).toBe(100);
      expect(getProviderPriority('wahoo')).toBe(90);
      expect(getProviderPriority('coros')).toBe(85);
      expect(getProviderPriority('strava')).toBe(50);
      expect(getProviderPriority('manual')).toBe(10);
    });

    it('returns 0 for unknown providers', () => {
      expect(getProviderPriority('unknown')).toBe(0);
      expect(getProviderPriority(null)).toBe(0);
      expect(getProviderPriority(undefined)).toBe(0);
    });

    it('is case-insensitive', () => {
      expect(getProviderPriority('GARMIN')).toBe(100);
      expect(getProviderPriority('Strava')).toBe(50);
    });
  });

  describe('checkForDuplicate', () => {
    const userId = 'user-123';
    const startDate = '2026-03-09T10:00:00.000Z';
    const distance = 50000; // 50km

    it('returns isDuplicate: false when startDate is null', async () => {
      const result = await checkForDuplicate(userId, null, distance, 'garmin', 'act-1');
      expect(result.isDuplicate).toBe(false);
      expect(mockLimit).not.toHaveBeenCalled();
    });

    it('returns isDuplicate: false when startDate is undefined', async () => {
      const result = await checkForDuplicate(userId, undefined, distance, 'garmin', 'act-1');
      expect(result.isDuplicate).toBe(false);
    });

    it('still runs dedup when distance is null but startDate is present', async () => {
      mockLimit.mockResolvedValue({ data: [], error: null });

      const result = await checkForDuplicate(userId, startDate, null, 'garmin', 'act-1');

      // Should have queried (not bailed early)
      expect(mockLimit).toHaveBeenCalled();
      // No distance filters should have been applied (only time window)
      // gte/lte called for time window only (2 calls), not 4 (time + distance)
      expect(result.isDuplicate).toBe(false);
    });

    it('still runs dedup when distance is 0 but startDate is present', async () => {
      mockLimit.mockResolvedValue({ data: [], error: null });

      await checkForDuplicate(userId, startDate, 0, 'garmin', 'act-1');
      expect(mockLimit).toHaveBeenCalled();
    });

    it('returns isDuplicate: false when no matches found', async () => {
      mockLimit.mockResolvedValue({ data: [], error: null });

      const result = await checkForDuplicate(userId, startDate, distance, 'garmin', 'act-1');
      expect(result.isDuplicate).toBe(false);
      expect(result.existingActivity).toBeNull();
    });

    it('returns isDuplicate: true with shouldTakeover when Garmin finds Strava duplicate', async () => {
      mockLimit.mockResolvedValue({
        data: [{
          id: 'existing-1',
          provider: 'strava',
          provider_activity_id: 'strava-act-1',
          name: 'Morning Ride',
          start_date: startDate,
          distance: 50100,
        }],
        error: null,
      });

      const result = await checkForDuplicate(userId, startDate, distance, 'garmin', 'garmin-act-1');

      expect(result.isDuplicate).toBe(true);
      expect(result.shouldTakeover).toBe(true);
      expect(result.shouldMerge).toBe(false);
      expect(result.existingActivity.provider).toBe('strava');
    });

    it('returns shouldMerge when Strava finds Garmin duplicate', async () => {
      mockLimit.mockResolvedValue({
        data: [{
          id: 'existing-1',
          provider: 'garmin',
          provider_activity_id: 'garmin-act-1',
          name: 'Morning Ride',
          start_date: startDate,
          distance: 50100,
        }],
        error: null,
      });

      const result = await checkForDuplicate(userId, startDate, distance, 'strava', 'strava-act-1');

      expect(result.isDuplicate).toBe(true);
      expect(result.shouldTakeover).toBe(false);
      expect(result.shouldMerge).toBe(true);
    });

    it('filters out self-matches (same provider + same activity ID)', async () => {
      mockLimit.mockResolvedValue({
        data: [{
          id: 'existing-1',
          provider: 'garmin',
          provider_activity_id: '12345',
          name: 'Morning Ride',
          start_date: startDate,
          distance: 50100,
        }],
        error: null,
      });

      const result = await checkForDuplicate(userId, startDate, distance, 'garmin', '12345');

      // Same provider + same activity ID → should be filtered out
      expect(result.isDuplicate).toBe(false);
    });

    it('returns isDuplicate: false on Supabase query error (fail-open)', async () => {
      mockLimit.mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });

      const result = await checkForDuplicate(userId, startDate, distance, 'garmin', 'act-1');
      expect(result.isDuplicate).toBe(false);
    });

    it('detects duplicate with time-only match when distance is missing', async () => {
      mockLimit.mockResolvedValue({
        data: [{
          id: 'existing-1',
          provider: 'strava',
          provider_activity_id: 'strava-act-1',
          name: 'Morning Ride',
          start_date: startDate,
          distance: 50000,
        }],
        error: null,
      });

      const result = await checkForDuplicate(userId, startDate, null, 'garmin', 'garmin-act-1');

      expect(result.isDuplicate).toBe(true);
      expect(result.shouldTakeover).toBe(true);
      expect(result.reason).toContain('distance not available');
    });

    it('includes match type in reason for full match', async () => {
      mockLimit.mockResolvedValue({
        data: [{
          id: 'existing-1',
          provider: 'strava',
          provider_activity_id: 'strava-act-1',
          name: 'Morning Ride',
          start_date: startDate,
          distance: 50100,
        }],
        error: null,
      });

      const result = await checkForDuplicate(userId, startDate, distance, 'garmin', 'garmin-act-1');

      expect(result.reason).toContain('same time window and distance');
    });
  });

  describe('PROVIDER_PRIORITY', () => {
    it('Garmin has highest priority', () => {
      const providers = Object.entries(PROVIDER_PRIORITY);
      const maxEntry = providers.reduce((a, b) => a[1] > b[1] ? a : b);
      expect(maxEntry[0]).toBe('garmin');
    });

    it('Strava has lower priority than device providers', () => {
      expect(PROVIDER_PRIORITY.strava).toBeLessThan(PROVIDER_PRIORITY.garmin);
      expect(PROVIDER_PRIORITY.strava).toBeLessThan(PROVIDER_PRIORITY.wahoo);
      expect(PROVIDER_PRIORITY.strava).toBeLessThan(PROVIDER_PRIORITY.coros);
    });
  });
});
