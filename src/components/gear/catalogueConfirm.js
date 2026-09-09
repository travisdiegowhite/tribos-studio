/**
 * Pure helpers for the photo-catalogue confirm screen.
 *
 * Vision proposes rows; the rider confirms them. These functions turn the
 * extraction into editable rows, and confirmed rows into api/gear.js
 * create_component params. Kept free of React so they can be unit-tested.
 */

import { getCatalogPart } from './gearConstants';

/** How old the rider says a part is, when vision can't know. */
export const AGE_CHOICES = [
  { value: 'new', label: 'New', months: 0 },
  { value: 'months', label: 'A few months', months: 4 },
  { value: 'year', label: 'About a year', months: 12 },
  { value: 'unknown', label: 'No idea', months: null },
];

/**
 * Extraction → confirm rows. Every proposed part becomes a row; rows the
 * model was confident about start checked, low-confidence rows start
 * unchecked so a wrong guess is a tap, not a wrong alert.
 */
export function extractionToRows(extraction) {
  const rows = [];
  for (const c of extraction?.components || []) {
    const part = getCatalogPart(c.component_type);
    if (!part) continue;
    rows.push({
      key: c.component_type,
      componentType: c.component_type,
      label: part.label,
      brand: c.brand || '',
      model: c.model || '',
      metadata: { ...(c.metadata || {}) },
      confidence: c.confidence ?? 0,
      evidence: c.evidence || '',
      included: Boolean(c.prefill),
      age: 'unknown',
      wearModel: part.wearModel,
    });
  }
  return rows;
}

/** Install date for a chosen age, as YYYY-MM-DD, or undefined for unknown. */
export function installedDateForAge(age, now = new Date()) {
  const choice = AGE_CHOICES.find((a) => a.value === age);
  if (!choice || choice.months === null) return undefined;
  const d = new Date(now);
  d.setMonth(d.getMonth() - choice.months);
  return d.toISOString().split('T')[0];
}

/** One confirmed row → create_component params. */
export function rowToComponentParams(row, gearItemId, now = new Date()) {
  const metadata = {};
  for (const [k, v] of Object.entries(row.metadata || {})) {
    if (v !== null && v !== undefined && v !== '') metadata[k] = v;
  }
  return {
    gearItemId,
    componentType: row.componentType,
    brand: row.brand?.trim() || undefined,
    model: row.model?.trim() || undefined,
    installedDate: installedDateForAge(row.age, now),
    ...(Object.keys(metadata).length ? { metadata } : {}),
    source: 'vision',
    confidence: row.confidence,
  };
}

/**
 * Fields on the bike itself that the extraction can fill in. Only blanks are
 * filled: a rider-entered brand or model is never overwritten by a guess.
 */
export function bikeUpdatesFromExtraction(gear, extraction) {
  const bike = extraction?.bike;
  if (!bike || (bike.confidence ?? 0) < 0.6) return {};
  const updates = {};
  if (!gear?.brand && bike.brand) updates.brand = bike.brand;
  if (!gear?.model && bike.model) updates.model = bike.model;
  if (!gear?.category && bike.category) updates.category = bike.category;
  return updates;
}

/** Which existing active component types would be duplicated by the rows. */
export function duplicateTypes(rows, existingComponents) {
  const active = new Set((existingComponents || []).filter((c) => c.status === 'active').map((c) => c.component_type));
  return rows.filter((r) => r.included && active.has(r.componentType)).map((r) => r.componentType);
}
