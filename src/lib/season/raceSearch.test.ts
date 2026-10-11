import { describe, it, expect } from 'vitest';
import { toPrefill, type WebRace } from './raceSearch';

const WEB: WebRace = {
  name: 'Boulder Roubaix',
  race_date: '2027-04-25',
  date_status: 'estimated_from_last_year',
  location: 'Boulder, CO',
  race_type: 'road_race',
  distance_km: 97,
  elevation_gain_m: null,
  url: 'https://www.bikereg.com/boulder-roubaix',
  site: 'bikereg.com',
  note: 'Two distances offered.',
};

describe('toPrefill', () => {
  it('prefills a new race from a web result, noting the source and the estimated date', () => {
    const { prefill, source } = toPrefill({ kind: 'web', race: WEB });
    expect(prefill).toMatchObject({ name: 'Boulder Roubaix', race_date: '2027-04-25', race_type: 'road_race', distance_km: 97, priority: 'B' });
    expect(prefill).not.toHaveProperty('id');
    expect(prefill.notes).toBe(
      "Found on https://www.bikereg.com/boulder-roubaix\nDate estimated from last year's edition: check it once it's announced.\nTwo distances offered.",
    );
    expect(source).toEqual({ source: 'web', url: WEB.url });
  });

  it('prefills from the directory without the estimate note', () => {
    const { prefill, source } = toPrefill({
      kind: 'directory',
      race: { id: 'd1', name: 'Ned Gravel', race_date: '2027-07-11', race_type: null, distance_km: 113, elevation_gain_m: null, location: null, url: null, confirmed_count: 3 },
    });
    expect(prefill).toMatchObject({ race_type: 'other', location: '', notes: '' });
    expect(source).toEqual({ source: 'athlete', url: null });
  });
});
