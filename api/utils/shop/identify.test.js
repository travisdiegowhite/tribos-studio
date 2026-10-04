import { describe, it, expect } from 'vitest';
import {
  buildIdentifyPrompt,
  buildIdentifySchema,
  normalizeIdentification,
  shopOwnerEmails,
  treePaths,
} from './identify.js';

const categories = [
  { id: 'tl', name: 'Tools', parent_id: null },
  { id: 'tl-d', name: 'Drivetrain tools', parent_id: 'tl' },
  { id: 'cp', name: 'Components', parent_id: null },
  { id: 'cp-d', name: 'Drivetrain', parent_id: 'cp' },
];
const locations = [
  { id: 'g', name: 'Garage', parent_id: null },
  { id: 'cab', name: 'Tool cabinet', parent_id: 'g' },
];

describe('treePaths', () => {
  it('builds root-first paths and survives cycles', () => {
    expect(treePaths(categories).find((p) => p.id === 'cp-d').path).toBe('Components > Drivetrain');
    const loop = [{ id: 'a', name: 'A', parent_id: 'b' }, { id: 'b', name: 'B', parent_id: 'a' }];
    expect(treePaths(loop).map((p) => p.path)).toEqual(['B > A', 'A > B']);
  });
});

describe('buildIdentifySchema', () => {
  it('limits category and location to the user’s paths plus ""', () => {
    const s = buildIdentifySchema(['Tools', 'Tools > Drivetrain tools'], ['Garage']);
    expect(s.additionalProperties).toBe(false);
    expect(s.required).toEqual(Object.keys(s.properties));
    expect(s.properties.category.enum).toEqual(['Tools', 'Tools > Drivetrain tools', '']);
    expect(s.properties.location.enum).toEqual(['Garage', '']);
  });
});

describe('buildIdentifyPrompt', () => {
  it('names the sources and quotes the description', () => {
    const p = buildIdentifyPrompt({ transcript: 'two XT chains', hasPhoto: true });
    expect(p).toMatch(/a photo and a description/);
    expect(p).toMatch(/"""two XT chains"""/);
    expect(buildIdentifyPrompt({ transcript: '', hasPhoto: true })).not.toMatch(/Owner's description/);
  });
});

describe('normalizeIdentification', () => {
  it('maps paths to ids, case-insensitively', () => {
    const d = normalizeIdentification({
      name: ' Chain whip ', brand: 'Park Tool', model: 'SR-12.2', mpn: 'SR-12.2', upc: '763477-005432',
      quantity: 2, condition: 'new', category: 'tools > drivetrain tools', location: 'Garage > Tool cabinet',
      compatibility: ['11-speed', '11-speed', ''], notes: '', confidence: 'high',
    }, categories, locations);
    expect(d).toEqual({
      name: 'Chain whip', brand: 'Park Tool', model: 'SR-12.2', mpn: 'SR-12.2', upc: '763477005432',
      quantity: 2, condition: 'new', category_id: 'tl-d', location_id: 'cab',
      compatibility: ['11-speed'], notes: null, confidence: 'high',
    });
  });

  it('turns blanks and junk into nulls and safe defaults', () => {
    const d = normalizeIdentification({
      name: '', category: 'Not a category', location: '', quantity: -3, condition: '', upc: '12', confidence: 'sure',
      compatibility: 'nope',
    }, categories, locations);
    expect(d).toMatchObject({
      name: null, category_id: null, location_id: null, quantity: 1, condition: null, upc: null,
      compatibility: [], confidence: 'low',
    });
    expect(normalizeIdentification(null, categories, locations).quantity).toBe(1);
  });
});

describe('shopOwnerEmails', () => {
  it('reads SHOP_OWNER_EMAILS, else the default pair', () => {
    expect(shopOwnerEmails({ SHOP_OWNER_EMAILS: ' A@x.com, b@y.com ' })).toEqual(['a@x.com', 'b@y.com']);
    expect(shopOwnerEmails({})).toHaveLength(2);
  });
});
