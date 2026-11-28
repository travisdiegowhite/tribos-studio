import { describe, it, expect } from 'vitest';
import { collectionCounts, routeInCollection } from '../routeCollections';

const ROUTES = [
  { id: 1, tags: ['Gravel', 'Weekend'] },
  { id: 2, tags: ['gravel'] },
  { id: 3, tags: null },
  { id: 4, tags: ['Commute'] },
];

describe('collectionCounts', () => {
  it('counts tags case-insensitively, biggest first, then A–Z', () => {
    expect(collectionCounts(ROUTES)).toEqual([
      { tag: 'Gravel', count: 2 },
      { tag: 'Commute', count: 1 },
      { tag: 'Weekend', count: 1 },
    ]);
  });

  it('is empty when nothing is tagged', () => {
    expect(collectionCounts([{ id: 1 }, { id: 2, tags: [] }])).toEqual([]);
  });
});

describe('routeInCollection', () => {
  it('matches case-insensitively, and "all" matches everything', () => {
    expect(ROUTES.filter((r) => routeInCollection(r, 'GRAVEL')).map((r) => r.id)).toEqual([1, 2]);
    expect(ROUTES.filter((r) => routeInCollection(r, 'all'))).toHaveLength(4);
    expect(routeInCollection({ tags: null }, 'Gravel')).toBe(false);
  });
});
