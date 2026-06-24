import { describe, it, expect } from 'vitest';
import {
  valhallaTripUsesFerry,
  brouterUsesFerry,
  wayTagsContainFerry,
  VALHALLA_FERRY_MANEUVER_TYPES,
} from '../ferryGuard';

describe('valhallaTripUsesFerry', () => {
  const leg = (types: number[]) => ({
    maneuvers: types.map((type) => ({ type, instruction: `m${type}` })),
  });

  it('detects a ferry-enter maneuver (type 28)', () => {
    const trip = { legs: [leg([1, 10, 28, 29, 4])] };
    expect(valhallaTripUsesFerry(trip)).toBe(true);
  });

  it('detects a ferry on any leg of a multi-leg trip', () => {
    const trip = { legs: [leg([1, 10, 4]), leg([1, 29, 4])] };
    expect(valhallaTripUsesFerry(trip)).toBe(true);
  });

  it('returns false for an ordinary land route', () => {
    const trip = { legs: [leg([1, 7, 8, 10, 15, 26, 27, 4])] };
    expect(valhallaTripUsesFerry(trip)).toBe(false);
  });

  it('is safe on missing / malformed trips', () => {
    expect(valhallaTripUsesFerry(undefined)).toBe(false);
    expect(valhallaTripUsesFerry({})).toBe(false);
    expect(valhallaTripUsesFerry({ legs: [] })).toBe(false);
    expect(valhallaTripUsesFerry({ legs: [{}] })).toBe(false);
    expect(valhallaTripUsesFerry({ legs: [{ maneuvers: null }] })).toBe(false);
  });

  it('exposes the ferry maneuver type constant', () => {
    expect(VALHALLA_FERRY_MANEUVER_TYPES.has(28)).toBe(true);
    expect(VALHALLA_FERRY_MANEUVER_TYPES.has(29)).toBe(true);
    expect(VALHALLA_FERRY_MANEUVER_TYPES.has(10)).toBe(false);
  });
});

describe('brouterUsesFerry', () => {
  const header = [
    'Longitude', 'Latitude', 'Elevation', 'Distance', 'CostPerKm',
    'ElevCost', 'TurnCost', 'NodeCost', 'InitialCost', 'WayTags',
    'NodeTags', 'Time', 'Energy',
  ];
  const row = (wayTags: string) =>
    [0, 0, 0, 100, 0, 0, 0, 0, 0, wayTags, '', 0, 0];

  it('detects a route=ferry segment', () => {
    const properties = {
      messages: [header, row('highway=residential surface=asphalt'), row('route=ferry')],
    };
    expect(brouterUsesFerry(properties)).toBe(true);
  });

  it('detects a ferry=yes tag', () => {
    const properties = { messages: [header, row('ferry=yes motor_vehicle=no')] };
    expect(brouterUsesFerry(properties)).toBe(true);
  });

  it('returns false for an all-land route', () => {
    const properties = {
      messages: [
        header,
        row('highway=primary surface=asphalt'),
        row('highway=cycleway surface=paved'),
      ],
    };
    expect(brouterUsesFerry(properties)).toBe(false);
  });

  it('does not false-positive on substrings (e.g. ferryterminal road names)', () => {
    const properties = { messages: [header, row('highway=service name=Ferryway')] };
    expect(brouterUsesFerry(properties)).toBe(false);
  });

  it('is safe when messages are absent or malformed', () => {
    expect(brouterUsesFerry(undefined)).toBe(false);
    expect(brouterUsesFerry({})).toBe(false);
    expect(brouterUsesFerry({ messages: [] })).toBe(false);
    expect(brouterUsesFerry({ messages: [header] })).toBe(false);
    // header without a WayTags column → can't detect → false (best-effort)
    expect(brouterUsesFerry({ messages: [['Longitude', 'Latitude'], [0, 0]] })).toBe(false);
  });
});

describe('wayTagsContainFerry', () => {
  it.each([
    ['route=ferry', true],
    ['highway=primary route=ferry duration=00:30', true],
    ['ferry=yes', true],
    ['ferry=primary', true],
    ['highway=residential surface=asphalt', false],
    ['name=Ferry Road highway=service', false],
    ['route=bicycle', false],
  ])('wayTagsContainFerry(%s) === %s', (tags, expected) => {
    expect(wayTagsContainFerry(tags as string)).toBe(expected);
  });
});
