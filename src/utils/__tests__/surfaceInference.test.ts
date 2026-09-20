import { describe, it, expect } from 'vitest';
import { inferSurface, summarizeSurface, type SurfaceInference } from '../surfaceInference';
import type { Coordinate } from '../../types/geo';

describe('inferSurface — the ladder', () => {
  it.each([
    [{ surface: 'gravel', highway: 'primary' }, 'gravel', 0.95, 'surface', 'surface=gravel'],
    [{ surface: 'asphalt', tracktype: 'grade4' }, 'paved', 0.95, 'surface', 'surface=asphalt'],
    [{ surface: 'dirt' }, 'unpaved', 0.95, 'surface', 'surface=dirt'],
    [{ tracktype: 'grade1', highway: 'track' }, 'paved', 0.7, 'tracktype', 'tracktype=grade1'],
    [{ tracktype: 'grade2', highway: 'track' }, 'gravel', 0.8, 'tracktype', 'tracktype=grade2'],
    [{ tracktype: 'grade3' }, 'unpaved', 0.8, 'tracktype', 'tracktype=grade3'],
    [{ tracktype: 'grade5', highway: 'primary' }, 'unpaved', 0.8, 'tracktype', 'tracktype=grade5'],
    [{ smoothness: 'very_bad', highway: 'unclassified' }, 'unpaved', 0.7, 'smoothness', 'smoothness=very_bad'],
    [{ highway: 'track' }, 'unpaved', 0.6, 'highway', 'highway=track'],
    [{ highway: 'path' }, 'unpaved', 0.5, 'highway', 'highway=path'],
    [{ highway: 'bridleway' }, 'unpaved', 0.5, 'highway', 'highway=bridleway'],
    [{ highway: 'primary' }, 'paved', 0.85, 'highway', 'highway=primary'],
    [{ highway: 'tertiary_link', lanes: '2' }, 'paved', 0.85, 'highway', 'highway=tertiary_link'],
  ] as const)('%o → %s (%s, %s)', (tags, category, confidence, evidence, detail) => {
    expect(inferSurface({ ...tags })).toEqual({ category, confidence, evidence, detail });
  });

  it.each([
    [{ highway: 'residential' }],
    [{ highway: 'unclassified', 'tiger:reviewed': 'no' }],
    [{ highway: 'service' }],
    [{ highway: 'cycleway' }],
    [{ highway: 'footway' }],
    [{ smoothness: 'good', highway: 'unclassified' }],
    [{ surface: 'weird_value', highway: 'residential' }],
    [{}],
  ])('never guesses: %o → unknown', (tags) => {
    expect(inferSurface(tags)).toEqual({ category: 'unknown', confidence: 0, evidence: 'none', detail: '' });
  });

  it('is unknown for missing tags', () => {
    expect(inferSurface(null).category).toBe('unknown');
    expect(inferSurface(undefined).category).toBe('unknown');
  });
});

describe('summarizeSurface', () => {
  // 5 vertices east along 40°N, ~85 m apart → 4 equal segments.
  const LINE: Coordinate[] = Array.from({ length: 5 }, (_, i) => [-105 + i * 0.001, 40]);
  const inf = (category: SurfaceInference['category'], evidence: SurfaceInference['evidence'], detail = ''): SurfaceInference =>
    ({ category, confidence: evidence === 'none' ? 0 : 0.8, evidence, detail });

  it('splits distance into tagged / inferred / unknown and rolls up the categories', () => {
    const s = summarizeSurface(
      [inf('gravel', 'surface', 'surface=gravel'), inf('unpaved', 'highway', 'highway=track'), inf('paved', 'surface', 'surface=asphalt'), inf('unknown', 'none')],
      LINE,
    );
    expect(s.totalKm).toBeCloseTo(0.341, 2);
    expect(s.knownKm).toBeCloseTo(0.256, 2);
    expect(s.gravelPct).toBe(50);
    expect(s.taggedPct).toBe(50);
    expect(s.inferredPct).toBe(25);
    expect(s.unknownPct).toBe(25);
    expect(s.distribution).toEqual({ paved: 25, gravel: 25, unpaved: 25 });
    expect(s.evidenceKm.unpaved['highway=track']).toBeCloseTo(0.085, 2);
    expect(s.evidenceKm.gravel['surface=gravel']).toBeCloseTo(0.085, 2);
    expect(s.evidenceKm.unknown).toEqual({});
  });

  it('weights segments equally when the geometry does not line up', () => {
    const s = summarizeSurface([inf('gravel', 'surface', 'surface=gravel'), inf('paved', 'surface', 'surface=paved')], null);
    expect(s.gravelPct).toBe(50);
    expect(s.distribution).toEqual({ paved: 50, gravel: 50 });
  });

  it('is all-unknown for no segments', () => {
    const s = summarizeSurface([], LINE);
    expect(s.unknownPct).toBe(100);
    expect(s.distribution).toEqual({});
  });
});
