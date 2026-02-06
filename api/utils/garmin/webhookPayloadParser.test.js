import { parseWebhookPayload, extractActivityFields } from './webhookPayloadParser.js';

describe('parseWebhookPayload', () => {
  it('parses CONNECT_ACTIVITY payloads', () => {
    const payload = {
      activities: [
        { userId: '123', activityId: '456', activityType: 'cycling' },
        { userId: '123', activityId: '789', activityType: 'running' }
      ]
    };

    const result = parseWebhookPayload(payload);
    expect(result.type).toBe('CONNECT_ACTIVITY');
    expect(result.items).toHaveLength(2);
    expect(result.isPush).toBe(true);
  });

  it('parses ACTIVITY_DETAIL payloads', () => {
    const payload = {
      activityDetails: [{ userId: '123', summaryId: '456' }]
    };

    const result = parseWebhookPayload(payload);
    expect(result.type).toBe('ACTIVITY_DETAIL');
    expect(result.items).toHaveLength(1);
    expect(result.isPush).toBe(true);
  });

  it('parses ACTIVITY_FILE_DATA payloads', () => {
    const payload = {
      activityFiles: [{
        userId: '123',
        activityId: '456',
        callbackURL: 'https://apis.garmin.com/wellness-api/rest/activityFile?token=abc'
      }]
    };

    const result = parseWebhookPayload(payload);
    expect(result.type).toBe('ACTIVITY_FILE_DATA');
    expect(result.items).toHaveLength(1);
    expect(result.isPush).toBe(false);
  });

  it('parses all health data types', () => {
    const healthTypes = ['dailies', 'epochs', 'sleeps', 'bodyComps', 'stressDetails', 'userMetrics', 'hrv'];

    for (const ht of healthTypes) {
      const payload = { [ht]: [{ userId: '123', calendarDate: '2025-01-15' }] };
      const result = parseWebhookPayload(payload);
      expect(result.type).toBe('HEALTH');
      expect(result.healthType).toBe(ht);
      expect(result.items).toHaveLength(1);
    }
  });

  it('returns ALL items in a batch (not just first)', () => {
    const payload = {
      activities: [
        { userId: '123', activityId: '1' },
        { userId: '123', activityId: '2' },
        { userId: '456', activityId: '3' }
      ]
    };

    const result = parseWebhookPayload(payload);
    expect(result.items).toHaveLength(3);
    expect(result.items[2].activityId).toBe('3');
  });

  it('returns UNKNOWN for empty/null/invalid payloads', () => {
    expect(parseWebhookPayload(null)).toEqual({ type: 'UNKNOWN', items: [] });
    expect(parseWebhookPayload(undefined)).toEqual({ type: 'UNKNOWN', items: [] });
    expect(parseWebhookPayload('string')).toEqual({ type: 'UNKNOWN', items: [] });
    expect(parseWebhookPayload({ activities: [] })).toEqual({ type: 'UNKNOWN', items: [] });
  });
});

describe('extractActivityFields', () => {
  it('extracts userId, activityId, fileUrl from item', () => {
    const item = {
      userId: '123',
      activityId: 456,
      callbackURL: 'https://example.com/file'
    };

    const result = extractActivityFields(item);
    expect(result.userId).toBe('123');
    expect(result.activityId).toBe('456');
    expect(result.fileUrl).toBe('https://example.com/file');
  });

  it('falls back to summaryId when activityId is missing', () => {
    const item = { userId: '123', summaryId: 789 };
    const result = extractActivityFields(item);
    expect(result.activityId).toBe('789');
  });

  it('uses top-level webhookData fallbacks', () => {
    const item = {};
    const webhookData = {
      userId: 'top-level-user',
      activityId: 'top-level-id',
      fileUrl: 'https://example.com/top-level'
    };

    const result = extractActivityFields(item, webhookData);
    expect(result.userId).toBe('top-level-user');
    expect(result.activityId).toBe('top-level-id');
    expect(result.fileUrl).toBe('https://example.com/top-level');
  });

  it('prefers item values over webhookData fallbacks', () => {
    const item = { userId: 'item-user', activityId: 111 };
    const webhookData = { userId: 'top-user', activityId: 999 };

    const result = extractActivityFields(item, webhookData);
    expect(result.userId).toBe('item-user');
    expect(result.activityId).toBe('111');
  });

  it('returns nulls when no data available', () => {
    const result = extractActivityFields({});
    expect(result.userId).toBeNull();
    expect(result.activityId).toBeNull();
    expect(result.fileUrl).toBeNull();
  });
});
