import { describe, it, expect } from 'vitest';
import {
  buildExtractionSchema,
  buildExtractionPrompt,
  normalizeExtraction,
  PREFILL_CONFIDENCE,
  PROPOSE_CONFIDENCE,
} from './gearVision.js';
import { COMPONENT_TYPE_IDS } from './gearCatalog.js';

describe('gearVision: schema', () => {
  it('is a closed object whose component enum is the catalogue', () => {
    const s = buildExtractionSchema();
    expect(s.additionalProperties).toBe(false);
    expect(s.required).toEqual(['bike', 'groupset', 'components', 'unreadable']);
    expect(s.properties.components.items.properties.component_type.enum).toEqual(COMPONENT_TYPE_IDS);
    // Every metadata field is required (nullable) so the grammar is fixed.
    const meta = s.properties.components.items.properties.metadata;
    expect(meta.required.sort()).toEqual(Object.keys(meta.properties).sort());
  });
});

describe('gearVision: prompt', () => {
  it('names the bike, lists the shots, and only the parts for its category', () => {
    const p = buildExtractionPrompt({ brand: 'Cervélo', model: 'Áspero', category: 'gravel' }, ['whole_bike', 'front_wheel']);
    expect(p).toContain('Cervélo Áspero');
    expect(p).toContain('Photos provided: whole_bike, front_wheel');
    expect(p).toContain('- tires_gravel');
    expect(p).not.toContain('- tires_road');
    expect(p).toContain('28-622');
  });

  it('lists everything when the category is unknown', () => {
    const p = buildExtractionPrompt({}, ['whole_bike']);
    expect(p).toContain('- tires_road');
    expect(p).toContain('- tires_gravel');
    expect(p).toContain('- fork_service');
    expect(p).toContain('has not named the bike');
  });
});

describe('gearVision: normalise', () => {
  const raw = {
    bike: { brand: 'Specialized', model: 'Tarmac SL7', category: 'road', frame_material: 'carbon', color: 'black', brake_type: 'disc', confidence: 0.85, evidence: 'downtube logo' },
    groupset: { brand: 'Shimano', tier: 'Ultegra Di2', speeds: 12, electronic: true, confidence: 0.7, evidence: 'battery on RD' },
    components: [
      { component_type: 'tires_road', brand: 'Continental', model: 'GP5000 S TR', metadata: { width_mm: 28, tubeless: true, max_pressure_psi: null, rim_width_mm: null, hookless: null, depth_mm: null, material: null, speeds: null, range: null, teeth: null, setup: null, diameter_mm: null, mount: null, system: null, travel_mm: null, position: 'front' }, confidence: 0.92, evidence: '28-622 on sidewall', seen_in: ['front_wheel'] },
      { component_type: 'tires_road', brand: null, model: null, metadata: {}, confidence: 0.5, evidence: 'rear tire, unreadable', seen_in: ['whole_bike'] },
      { component_type: 'chain', brand: null, model: null, metadata: { speeds: 12 }, confidence: 0.45, evidence: '12 sprockets', seen_in: ['drivetrain'] },
      { component_type: 'cassette', brand: 'Shimano', model: '11-34', metadata: { speeds: 12, range: '11-34' }, confidence: 0.2, evidence: 'guess', seen_in: [] },
      { component_type: 'flux_capacitor', brand: 'Doc', model: null, metadata: {}, confidence: 1, evidence: '', seen_in: [] },
      { component_type: 'brake_pads_disc', brand: null, model: null, metadata: {}, confidence: 1.7, evidence: 'rotors visible', seen_in: ['front_wheel'] },
    ],
    unreadable: [
      { component_type: 'chain', reason: 'too small', better_shot: 'drivetrain' },
      { component_type: 'warp_core', reason: 'x', better_shot: null },
    ],
  };

  it('keeps the most confident row per type, drops unknown and low-confidence rows, strips null metadata', () => {
    const out = normalizeExtraction(raw);
    const types = out.components.map((c) => c.component_type);
    expect(types).toEqual(['chain', 'tires_road', 'brake_pads_disc']); // catalogue order
    const tires = out.components.find((c) => c.component_type === 'tires_road');
    expect(tires.brand).toBe('Continental');
    expect(tires.metadata).toEqual({ width_mm: 28, tubeless: true, position: 'front' });
    expect(tires.prefill).toBe(true);
    const chain = out.components.find((c) => c.component_type === 'chain');
    expect(chain.prefill).toBe(false);
    expect(chain.confidence).toBeLessThan(PREFILL_CONFIDENCE);
    expect(chain.confidence).toBeGreaterThanOrEqual(PROPOSE_CONFIDENCE);
    const pads = out.components.find((c) => c.component_type === 'brake_pads_disc');
    expect(pads.confidence).toBe(1);
  });

  it('passes bike and groupset through with clamped confidence, filters unreadable', () => {
    const out = normalizeExtraction(raw);
    expect(out.bike.model).toBe('Tarmac SL7');
    expect(out.groupset.electronic).toBe(true);
    expect(out.unreadable).toEqual([{ component_type: 'chain', reason: 'too small', better_shot: 'drivetrain' }]);
  });

  it('survives an empty or malformed reply', () => {
    expect(normalizeExtraction(null).components).toEqual([]);
    expect(normalizeExtraction({}).bike.confidence).toBe(0);
    expect(normalizeExtraction({ components: 'nope' }).components).toEqual([]);
  });
});
