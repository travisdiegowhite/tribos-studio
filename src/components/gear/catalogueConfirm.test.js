import { describe, it, expect } from 'vitest';
import {
  extractionToRows,
  installedDateForAge,
  rowToComponentParams,
  bikeUpdatesFromExtraction,
  duplicateTypes,
} from './catalogueConfirm';

const extraction = {
  bike: { brand: 'Specialized', model: 'Tarmac SL7', category: 'road', confidence: 0.8 },
  components: [
    { component_type: 'tires_road', brand: 'Continental', model: 'GP5000', metadata: { width_mm: 28, tubeless: true }, confidence: 0.9, prefill: true, evidence: '28-622' },
    { component_type: 'chain', brand: null, model: null, metadata: {}, confidence: 0.4, prefill: false, evidence: 'present' },
    { component_type: 'made_up', brand: null, model: null, metadata: {}, confidence: 0.9, prefill: true, evidence: '' },
  ],
};

describe('catalogueConfirm', () => {
  it('turns the extraction into rows, checked only when prefilled, dropping unknown parts', () => {
    const rows = extractionToRows(extraction);
    expect(rows.map((r) => r.componentType)).toEqual(['tires_road', 'chain']);
    expect(rows[0].included).toBe(true);
    expect(rows[0].label).toBe('Tires (road)');
    expect(rows[1].included).toBe(false);
    expect(rows[1].age).toBe('unknown');
  });

  it('maps age to an install date', () => {
    const now = new Date('2026-09-08T12:00:00Z');
    expect(installedDateForAge('new', now)).toBe('2026-09-08');
    expect(installedDateForAge('months', now)).toBe('2026-05-08');
    expect(installedDateForAge('year', now)).toBe('2025-09-08');
    expect(installedDateForAge('unknown', now)).toBeUndefined();
  });

  it('builds create_component params with vision provenance and clean metadata', () => {
    const [tires] = extractionToRows(extraction);
    tires.metadata.max_pressure_psi = '';
    const params = rowToComponentParams({ ...tires, age: 'new' }, 'g1', new Date('2026-09-08T12:00:00Z'));
    expect(params).toEqual({
      gearItemId: 'g1',
      componentType: 'tires_road',
      brand: 'Continental',
      model: 'GP5000',
      installedDate: '2026-09-08',
      metadata: { width_mm: 28, tubeless: true },
      source: 'vision',
      confidence: 0.9,
    });
  });

  it('fills only blank bike fields, and only when confident', () => {
    expect(bikeUpdatesFromExtraction({ brand: 'Trek', model: null, category: null }, extraction))
      .toEqual({ model: 'Tarmac SL7', category: 'road' });
    expect(bikeUpdatesFromExtraction({}, { bike: { ...extraction.bike, confidence: 0.3 } })).toEqual({});
  });

  it('flags rows that would duplicate an active component', () => {
    const rows = extractionToRows(extraction);
    const existing = [{ component_type: 'tires_road', status: 'active' }, { component_type: 'chain', status: 'replaced' }];
    expect(duplicateTypes(rows, existing)).toEqual(['tires_road']);
  });
});
