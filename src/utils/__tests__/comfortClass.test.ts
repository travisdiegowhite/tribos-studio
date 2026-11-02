import { describe, it, expect } from 'vitest';
import { comfortClassForTags, REASONS, COMFORT_CLASS_CONFIG } from '../comfortClass';

const cls = (tags: Record<string, string>) => comfortClassForTags(tags)?.cls;

describe('comfortClassForTags — spec §1 table', () => {
  it('returns null for things that are not ways you ride', () => {
    expect(comfortClassForTags(null)).toBeNull();
    expect(comfortClassForTags({ surface: 'asphalt' })).toBeNull();
  });

  describe('class 1: paths and quiet streets', () => {
    it.each([
      [{ highway: 'cycleway' }],
      [{ highway: 'path', bicycle: 'designated' }],
      [{ highway: 'secondary', cycleway: 'track', maxspeed: '45 mph' }],
      [{ highway: 'living_street' }],
      [{ highway: 'service' }],
      [{ highway: 'residential', maxspeed: '25 mph' }],
      [{ highway: 'residential' }],
      [{ highway: 'unclassified', maxspeed: '25 mph', lanes: '2' }],
    ])('%o → 1', (tags) => {
      expect(cls(tags)).toBe(1);
    });
  });

  describe('class 2: quiet connectors, bike lanes', () => {
    it.each([
      [{ highway: 'tertiary', maxspeed: '30 mph' }],
      [{ highway: 'residential', maxspeed: '30 mph' }],
      [{ highway: 'secondary', maxspeed: '35 mph', cycleway: 'lane' }],
      [{ highway: 'tertiary', maxspeed: '25 mph' }],
    ])('%o → 2', (tags) => {
      expect(cls(tags)).toBe(2);
    });
  });

  describe('class 3: busier roads with room for you', () => {
    it.each([
      [{ highway: 'secondary', maxspeed: '40 mph', cycleway: 'lane' }],
      [{ highway: 'secondary', maxspeed: '40 mph', shoulder: 'yes' }],
      [{ highway: 'tertiary', maxspeed: '35 mph' }],
      [{ highway: 'secondary', maxspeed: '45 mph', shoulder: 'both', lanes: '2' }],
    ])('%o → 3', (tags) => {
      expect(cls(tags)).toBe(3);
    });
  });

  describe('class 4: fast roads with a shoulder', () => {
    it.each([
      [{ highway: 'primary', maxspeed: '55 mph', shoulder: 'yes', lanes: '2' }],
      [{ highway: 'secondary', maxspeed: '50 mph', shoulder: 'yes' }],
      [{ highway: 'primary', maxspeed: '40 mph', lanes: '4', cycleway: 'lane' }],
      [{ highway: 'tertiary', maxspeed: '40 mph' }],
    ])('%o → 4', (tags) => {
      expect(cls(tags)).toBe(4);
    });
  });

  describe('class 5: fast roads with no space', () => {
    it.each([
      [{ highway: 'secondary', maxspeed: '45 mph' }],
      [{ highway: 'tertiary', maxspeed: '55 mph' }],
      [{ highway: 'secondary', maxspeed: '35 mph', lanes: '4' }],
      [{ highway: 'primary', maxspeed: '35 mph' }],
      [{ highway: 'trunk' }],
      [{ highway: 'motorway', bicycle: 'yes' }],
      [{ highway: 'primary', maxspeed: '65 mph', shoulder: 'yes' }],
    ])('%o → 5', (tags) => {
      expect(cls(tags)).toBe(5);
    });
  });

  describe('X: closed to bikes', () => {
    it.each([
      [{ highway: 'motorway' }],
      [{ highway: 'motorway_link' }],
      [{ highway: 'residential', bicycle: 'no' }],
      [{ highway: 'service', access: 'private' }],
      [{ highway: 'footway', bicycle: 'no' }],
      [{ highway: 'construction' }],
    ])('%o → X', (tags) => {
      expect(cls(tags)).toBe('X');
    });

    it('access=no with bicycle=yes is open', () => {
      expect(cls({ highway: 'service', access: 'no', bicycle: 'yes' })).toBe(1);
    });
  });
});

describe('side-specific shoulder tags', () => {
  it('shoulder:right counts as a shoulder', () => {
    expect(cls({ highway: 'secondary', maxspeed: '50 mph', 'shoulder:right': 'yes' })).toBe(4);
    expect(cls({ highway: 'secondary', maxspeed: '50 mph', 'shoulder:right': 'no' })).toBe(5);
  });

  it('cycleway=shoulder and bare cycleway=yes read as a shoulder, not a lane', () => {
    expect(cls({ highway: 'secondary', maxspeed: '50 mph', cycleway: 'shoulder' })).toBe(4);
    expect(cls({ highway: 'secondary', maxspeed: '35 mph', cycleway: 'yes' })).toBe(3);
    // US-36 Lyons–Boulder as BRouter reports it: 60–65 mph trunk is class 5 even with room.
    expect(cls({ highway: 'trunk', maxspeed: '100', lanes: '2', cycleway: 'yes' })).toBe(5);
  });
});

describe('BRouter maxspeed buckets (km/h numbers, mph folded in)', () => {
  it('reads 70 as ~45 mph, 60 as ~35–40 mph, 40 as ~25 mph', () => {
    expect(cls({ highway: 'secondary', maxspeed: '70' })).toBe(5);
    expect(cls({ highway: 'secondary', maxspeed: '70', shoulder: 'yes', lanes: '2' })).toBe(3);
    expect(cls({ highway: 'tertiary', maxspeed: '60' })).toBe(4);
    expect(cls({ highway: 'residential', maxspeed: '40' })).toBe(1);
  });
});

describe('unpaved roads are light traffic (decision 2026-11-02)', () => {
  it('caps gravel/dirt roads at class 2 whatever the speed', () => {
    const r = comfortClassForTags({ highway: 'unclassified', surface: 'gravel' })!;
    expect(r.cls).toBe(2);
    expect(r.confidence).toBe('assumed');
    expect(r.reasons).toEqual([REASONS.gravelRoad]);
    expect(cls({ highway: 'tertiary', surface: 'dirt', maxspeed: '55 mph' })).toBe(2);
    expect(cls({ highway: 'unclassified', tracktype: 'grade3' })).toBe(2);
  });

  it('keeps a quiet unpaved street at 1', () => {
    expect(cls({ highway: 'residential', surface: 'compacted' })).toBe(1);
  });

  it('tracks are class 1', () => {
    expect(cls({ highway: 'track' })).toBe(1);
  });

  it('does not soften an unpaved primary', () => {
    expect(cls({ highway: 'primary', surface: 'gravel' })).toBe(5);
  });

  it('cap is one config value', () => {
    expect(COMFORT_CLASS_CONFIG.unpavedMaxClass).toBe(2);
  });
});

describe('unknown speed is flagged, not assumed safe (decision 2026-11-02)', () => {
  it.each(['unclassified', 'tertiary', 'secondary'])('paved %s with no maxspeed is unknown', (highway) => {
    const r = comfortClassForTags({ highway, surface: 'asphalt' })!;
    expect(r.confidence).toBe('unknown');
    expect(r.reasons[0]).toBe(REASONS.speedNotMapped);
    expect(r.worstCaseCls).toBe(5);
  });

  it('keeps what is known (shoulder) in the worst case', () => {
    const r = comfortClassForTags({ highway: 'tertiary', shoulder: 'yes', lanes: '2' })!;
    expect(r.confidence).toBe('unknown');
    expect(r.worstCaseCls).toBe(4);
    expect(r.reasons).toContain(REASONS.shoulder);
  });

  it('residential with no maxspeed is assumed, not unknown', () => {
    expect(comfortClassForTags({ highway: 'residential' })!.confidence).toBe('assumed');
  });

  it('a shouldered primary with no maxspeed reads as fast', () => {
    expect(cls({ highway: 'primary', shoulder: 'yes', lanes: '2' })).toBe(4);
  });

  it('a tagged speed is tagged confidence', () => {
    expect(comfortClassForTags({ highway: 'tertiary', maxspeed: '30 mph' })!.confidence).toBe('tagged');
  });
});

describe('extras (conflated data) override tags', () => {
  it('a verified speed resolves an unknown', () => {
    const r = comfortClassForTags({ highway: 'unclassified' }, { maxspeed_mph: 25 })!;
    expect(r.confidence).toBe('tagged');
    expect(r.cls).toBe(1);
  });

  it('a wide shoulder from survey data counts as a shoulder', () => {
    expect(comfortClassForTags({ highway: 'secondary', maxspeed: '50 mph' }, { shoulder_ft: 6 })!.cls).toBe(4);
    expect(comfortClassForTags({ highway: 'secondary', maxspeed: '50 mph' }, { shoulder_ft: 1 })!.cls).toBe(5);
  });
});

describe('reasons read like a rider talks', () => {
  it('names speed and what is missing', () => {
    expect(comfortClassForTags({ highway: 'secondary', maxspeed: '45 mph' })!.reasons).toEqual(['45 mph', REASONS.noShoulder]);
    expect(comfortClassForTags({ highway: 'secondary', maxspeed: '40 mph', cycleway: 'lane' })!.reasons).toEqual([
      '40 mph',
      REASONS.bikeLane,
    ]);
  });
});
