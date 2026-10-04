import { describe, it, expect } from 'vitest';
import { parseScan, sameBarcode } from './scan';
import { LABEL_STOCKS, paginate, perPage } from './labelSheets';
import { applyIdentified, blank } from './itemForm';
import type { IdentifiedDraft } from '../data/identify';

describe('parseScan', () => {
  it('reads item labels out of printed URLs on any origin', () => {
    expect(parseScan('https://www.tribos.studio/garage/shop/items/TL-0001')).toEqual({ kind: 'item', label: 'TL-0001' });
    expect(parseScan('https://new-domain.app/shop/items/cp-0042?x=1')).toEqual({ kind: 'item', label: 'CP-0042' });
    expect(parseScan('https://x.y/garage/shop/items/OT-12345')).toEqual({ kind: 'item', label: 'OT-12345' });
  });

  it('reads location ids out of ?loc=', () => {
    const id = '0b7a9a52-2f1c-4c1e-9d8a-1234567890ab';
    expect(parseScan(`https://www.tribos.studio/garage/shop/?loc=${id}`)).toEqual({ kind: 'location', id });
    expect(parseScan('https://x/garage/shop/?loc=not-a-uuid').kind).toBe('text');
  });

  it('accepts a bare label, a barcode, or falls back to text', () => {
    expect(parseScan(' tl-0007 ')).toEqual({ kind: 'item', label: 'TL-0007' });
    expect(parseScan('0 12345 67890 5')).toEqual({ kind: 'barcode', code: '012345678905' });
    expect(parseScan('4006381333931')).toEqual({ kind: 'barcode', code: '4006381333931' });
    expect(parseScan('1234567')).toEqual({ kind: 'text', text: '1234567' });
    expect(parseScan('chain whip')).toEqual({ kind: 'text', text: 'chain whip' });
  });

  it('treats UPC-A and its EAN-13 form as the same product', () => {
    expect(sameBarcode('012345678905', '0012345678905')).toBe(true);
    expect(sameBarcode('012345678905', '012345678912')).toBe(false);
    expect(sameBarcode(null, '012345678905')).toBe(false);
    expect(sameBarcode('000', '0')).toBe(false);
  });
});

describe('label sheets', () => {
  it('keeps every sheet stock inside its page', () => {
    for (const s of LABEL_STOCKS) {
      const right = s.marginLeft + (s.cols - 1) * s.pitchX + s.labelW;
      const bottom = s.marginTop + (s.rows - 1) * s.pitchY + s.labelH;
      expect(right, s.id).toBeLessThanOrEqual(s.pageW + 0.01);
      expect(bottom, s.id).toBeLessThanOrEqual(s.pageH + 0.01);
      expect(s.pitchX, s.id).toBeGreaterThanOrEqual(s.labelW - 0.01);
      expect(s.pitchY, s.id).toBeGreaterThanOrEqual(s.labelH - 0.01);
    }
  });

  const avery = LABEL_STOCKS.find((s) => s.id === 'avery-5160')!;
  const roll = LABEL_STOCKS.find((s) => s.id === 'roll-62x29')!;

  it('fills row by row and starts a new page when full', () => {
    const labels = Array.from({ length: 31 }, (_, i) => i);
    const pages = paginate(labels, avery);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toHaveLength(perPage(avery));
    expect(pages[0][1].label).toBe(1);
    expect(pages[0][1].x).toBeCloseTo(avery.marginLeft + avery.pitchX);
    expect(pages[0][3].y).toBeCloseTo(avery.marginTop + avery.pitchY);
    expect(pages[1][0].label).toBe(30);
    expect(pages[1][1].label).toBeNull();
  });

  it('skips used positions on the first sheet', () => {
    const pages = paginate(['a', 'b'], avery, 29);
    expect(pages).toHaveLength(1); // positions 29 and 30 are the last two
    expect(paginate(['a', 'b', 'c'], avery, 29)).toHaveLength(2);
    expect(pages[0].slice(0, 28).every((s) => s.label === null)).toBe(true);
    expect(pages[0][28].label).toBe('a');
    expect(pages[0][29].label).toBe('b');
    expect(paginate(['a'], avery, 999)[0][29].label).toBe('a'); // clamped to the last slot
  });

  it('puts one label per page on a roll and nothing for no labels', () => {
    expect(paginate(['a', 'b', 'c'], roll)).toHaveLength(3);
    expect(paginate([], avery)).toEqual([]);
  });
});

describe('applyIdentified', () => {
  const draft: IdentifiedDraft = {
    name: 'Chain', brand: 'Shimano', model: 'CN-HG701', mpn: 'CN-HG701-11', upc: null, quantity: 2, condition: 'new',
    category_id: 'cp-d', location_id: 'd2', compatibility: ['11-speed'], notes: null, confidence: 'high',
  };

  it('fills empty fields only', () => {
    const f = applyIdentified(blank({ name: 'My chain', category_id: 'cs' }), draft, { quantity: true, condition: true });
    expect(f).toMatchObject({
      name: 'My chain', category_id: 'cs', brand: 'Shimano', mpn: 'CN-HG701-11', location_id: 'd2', quantity: 2,
      compatibility: ['11-speed'], upc: '', notes: '',
    });
  });

  it('leaves quantity and condition alone once the owner set them', () => {
    const f = applyIdentified(blank({ quantity: 5, condition: 'used' }), draft, { quantity: false, condition: false });
    expect(f.quantity).toBe(5);
    expect(f.condition).toBe('used');
  });
});
