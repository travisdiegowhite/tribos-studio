/** The item editor's form state and the identify merge (kept pure for tests). */
import type { Condition } from '../types';
import type { IdentifiedDraft } from '../data/identify';

export interface FormState {
  name: string;
  category_id: string | null;
  location_id: string | null;
  quantity: number | string;
  min_quantity: number | string;
  brand: string;
  model: string;
  mpn: string;
  upc: string;
  condition: Condition;
  compatibility: string[];
  tags: string[];
  unit_cost: number | string;
  purchased_on: string;
  notes: string;
}

export const blank = (keep?: Partial<FormState>): FormState => ({
  name: '', category_id: null, location_id: null, quantity: 1, min_quantity: '', brand: '', model: '', mpn: '', upc: '',
  condition: 'new', compatibility: [], tags: [], unit_cost: '', purchased_on: '', notes: '', ...keep,
});

/**
 * Merge an identification into the form. Only empty fields are filled, so
 * nothing the owner already typed is overwritten; quantity and condition
 * count as empty while they still hold their defaults.
 */
export function applyIdentified(f: FormState, d: IdentifiedDraft, pristine: { quantity: boolean; condition: boolean }): FormState {
  const fill = (cur: string, next: string | null) => (cur.trim() ? cur : next || '');
  return {
    ...f,
    name: fill(f.name, d.name),
    brand: fill(f.brand, d.brand),
    model: fill(f.model, d.model),
    mpn: fill(f.mpn, d.mpn),
    upc: fill(f.upc, d.upc),
    category_id: f.category_id || d.category_id,
    location_id: f.location_id || d.location_id,
    quantity: pristine.quantity && d.quantity ? d.quantity : f.quantity,
    condition: pristine.condition && d.condition ? d.condition : f.condition,
    compatibility: f.compatibility.length ? f.compatibility : d.compatibility,
    notes: fill(f.notes, d.notes),
  };
}

