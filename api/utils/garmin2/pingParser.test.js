import { describe, it, expect } from 'vitest';
import {
  classifyPayload,
  validatePingItem,
  eventTypeFor,
  HANDLED_HEALTH_TYPES,
} from './pingParser.js';

const VALID_PING_ITEM = {
  userId: 'gu-1',
  summaryId: '12345-detail',
  uploadStartTimeInSeconds: 1700000000,
  uploadEndTimeInSeconds: 1700003000,
  callbackURL: 'https://apis.garmin.com/wellness-api/rest/activities?token=X',
};

describe('classifyPayload', () => {
  it('detects a §4 activity-detail ping (item carries callbackURL)', () => {
    const r = classifyPayload({ activityDetails: [VALID_PING_ITEM] });
    expect(r.kind).toBe('PING_ACTIVITY_DETAIL');
    expect(r.items).toHaveLength(1);
    expect(r.healthType).toBeNull();
  });

  it('classifies an activityDetails array WITHOUT callbackURL as an Activity Details PUSH', () => {
    // Activity Details PUSH inlines the summary + per-second samples[]; no
    // callbackURL. It must stay distinct from CONNECT_ACTIVITY so the samples
    // survive to the processor (the rebuild's primary full-data path).
    const r = classifyPayload({
      activityDetails: [{ userId: 'x', summaryId: 'y', summary: {}, samples: [{ startTimeInSeconds: 1 }] }],
    });
    expect(r.kind).toBe('PUSH_ACTIVITY_DETAIL');
    expect(eventTypeFor(r)).toBe('ACTIVITY_DETAIL_PUSH');
  });

  it('detects PUSH_ACTIVITY_FILE for activityFiles[]', () => {
    const r = classifyPayload({ activityFiles: [{ userId: 'x', activityId: '1', callbackURL: 'https://fit' }] });
    expect(r.kind).toBe('PUSH_ACTIVITY_FILE');
  });

  it('detects PUSH_CONNECT_ACTIVITY for the legacy activities[] envelope', () => {
    const r = classifyPayload({ activities: [{ userId: 'x', summaryId: 'y' }] });
    expect(r.kind).toBe('PUSH_CONNECT_ACTIVITY');
  });

  it('detects a health PING when items carry callbackURL', () => {
    const r = classifyPayload({
      dailies: [{ userId: 'gu-1', callbackURL: 'https://dailies', summaryId: 'd1',
        uploadStartTimeInSeconds: 1, uploadEndTimeInSeconds: 2 }],
    });
    expect(r.kind).toBe('PING_HEALTH');
    expect(r.healthType).toBe('dailies');
  });

  it('detects a health PUSH when items DO NOT carry callbackURL', () => {
    const r = classifyPayload({ sleeps: [{ userId: 'x', durationInSeconds: 28800 }] });
    expect(r.kind).toBe('PUSH_HEALTH');
    expect(r.healthType).toBe('sleeps');
  });

  it('returns UNKNOWN for unrecognized envelopes', () => {
    expect(classifyPayload({}).kind).toBe('UNKNOWN');
    expect(classifyPayload(null).kind).toBe('UNKNOWN');
    expect(classifyPayload('oops').kind).toBe('UNKNOWN');
  });

  it('returns UNKNOWN for unhandled health types even when present', () => {
    // `epochs` is not in HANDLED_HEALTH_TYPES — must NOT be classified as health.
    expect(HANDLED_HEALTH_TYPES.has('epochs')).toBe(false);
    expect(classifyPayload({ epochs: [{ userId: 'x' }] }).kind).toBe('UNKNOWN');
  });
});

describe('validatePingItem', () => {
  it('accepts a complete ping item', () => {
    expect(validatePingItem(VALID_PING_ITEM)).toEqual([]);
  });

  it('reports each missing required field', () => {
    const r = validatePingItem({ userId: 'x' });
    expect(r).toEqual(expect.arrayContaining(['summaryId', 'callbackURL']));
  });

  it('flags non-numeric upload window seconds', () => {
    const r = validatePingItem({ ...VALID_PING_ITEM, uploadStartTimeInSeconds: '1700000000' });
    expect(r).toContain('uploadStartTimeInSeconds');
  });

  it.each([null, undefined, 'oops', 42])('rejects %p as not-an-object', (bad) => {
    expect(validatePingItem(bad)).toEqual(['<not-an-object>']);
  });
});

describe('eventTypeFor', () => {
  it('maps each kind to the canonical event_type value', () => {
    expect(eventTypeFor({ kind: 'PING_ACTIVITY_DETAIL' })).toBe('ACTIVITY_DETAIL_PING');
    expect(eventTypeFor({ kind: 'PUSH_ACTIVITY_DETAIL' })).toBe('ACTIVITY_DETAIL_PUSH');
    expect(eventTypeFor({ kind: 'PING_HEALTH', healthType: 'dailies' })).toBe('HEALTH_DAILIES_PING');
    expect(eventTypeFor({ kind: 'PING_HEALTH', healthType: 'sleeps' })).toBe('HEALTH_SLEEPS_PING');
    expect(eventTypeFor({ kind: 'PUSH_ACTIVITY_FILE' })).toBe('ACTIVITY_FILE_DATA');
    expect(eventTypeFor({ kind: 'PUSH_CONNECT_ACTIVITY' })).toBe('CONNECT_ACTIVITY');
    expect(eventTypeFor({ kind: 'PUSH_HEALTH', healthType: 'dailies' })).toBe('HEALTH_dailies');
    expect(eventTypeFor({ kind: 'UNKNOWN' })).toBe('UNKNOWN');
  });
});
