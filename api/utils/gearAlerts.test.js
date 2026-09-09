import { describe, it, expect } from 'vitest';
import { computeGearAlerts } from './gearAlerts.js';
import { METERS_PER_MILE } from './gearCatalog.js';

/** Minimal chainable fake: the tables computeGearAlerts reads, canned. */
function fakeSupabase({ gearItems = [], components = [], dismissals = [] }) {
  const table = (rows) => {
    const q = {
      select: () => q,
      eq: () => q,
      then: (resolve) => resolve({ data: rows, error: null }),
    };
    return q;
  };
  return {
    from: (name) => {
      if (name === 'gear_items') return table(gearItems);
      if (name === 'gear_components') return table(components);
      if (name === 'gear_alert_dismissals') return table(dismissals);
      throw new Error(`unexpected table ${name}`);
    },
  };
}

const bike = { id: 'b1', name: 'Tarmac', gear_type: 'bike', status: 'active', total_distance_logged: 1600 * METERS_PER_MILE };
const chainAt1600 = (extra = {}) => ({
  id: 'c1', gear_item_id: 'b1', user_id: 'u', component_type: 'chain', status: 'active',
  distance_at_install: 0, warning_threshold_meters: null, replace_threshold_meters: null,
  installed_date: '2026-01-01', gear_items: { id: 'b1', total_distance_logged: bike.total_distance_logged, name: 'Tarmac' },
  ...extra,
});

describe('computeGearAlerts', () => {
  it('raises a replace alert for a chain past its default threshold', async () => {
    const alerts = await computeGearAlerts(fakeSupabase({ gearItems: [bike], components: [chainAt1600()] }), 'u');
    const chain = alerts.find((a) => a.componentType === 'chain');
    expect(chain).toBeTruthy();
    expect(chain.type).toBe('replace');
  });

  it('never alerts on a vision-proposed part the rider has not confirmed', async () => {
    const alerts = await computeGearAlerts(
      fakeSupabase({ gearItems: [bike], components: [chainAt1600({ source: 'vision', confirmed_at: null })] }),
      'u'
    );
    expect(alerts.find((a) => a.componentType === 'chain')).toBeUndefined();
    // and a confirmed one is back to normal
    const confirmed = await computeGearAlerts(
      fakeSupabase({ gearItems: [bike], components: [chainAt1600({ source: 'vision', confirmed_at: '2026-09-01T00:00:00Z' })] }),
      'u'
    );
    expect(confirmed.find((a) => a.componentType === 'chain')?.type).toBe('replace');
  });

  it('uses the catalogue for time-based parts beyond bar tape', async () => {
    const sealant = chainAt1600({ id: 'c2', component_type: 'sealant', installed_date: '2025-01-01' });
    const alerts = await computeGearAlerts(fakeSupabase({ gearItems: [bike], components: [sealant] }), 'u');
    const s = alerts.find((a) => a.componentType === 'sealant');
    expect(s?.timeBased).toBe(true);
    expect(s?.thresholdMonths).toBe(4);
  });
});
