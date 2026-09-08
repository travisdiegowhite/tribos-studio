/**
 * Gear vision helpers — the extraction contract between the catalogue and
 * Claude, and the normaliser that turns a raw model reply into what the
 * confirm screen renders.
 *
 * Kept separate from api/gear-vision.js so it can be unit-tested without the
 * handler's auth/storage plumbing.
 */

import {
  CATALOG_PARTS,
  COMPONENT_TYPE_IDS,
  BIKE_CATEGORIES,
  partsForBikeType,
} from './gearCatalog.js';

export const PHOTO_BUCKET = 'gear-photos';
export const SIGNED_URL_TTL_S = 300;

/** Below this the confirm screen shows the row blank; above it, prefilled. */
export const PREFILL_CONFIDENCE = 0.7;
/** Below this we don't propose the part at all. */
export const PROPOSE_CONFIDENCE = 0.3;

const CATEGORY_IDS = BIKE_CATEGORIES.map((c) => c.value);

/**
 * JSON schema for `output_config.format`. Every field required (the API's
 * structured-output grammar needs it); "unknown" is expressed as null.
 */
export function buildExtractionSchema() {
  const nullableString = { type: ['string', 'null'] };
  const nullableNumber = { type: ['number', 'null'] };
  const nullableBool = { type: ['boolean', 'null'] };
  const confidence = { type: 'number', minimum: 0, maximum: 1 };

  return {
    type: 'object',
    additionalProperties: false,
    required: ['bike', 'groupset', 'components', 'unreadable'],
    properties: {
      bike: {
        type: 'object',
        additionalProperties: false,
        required: ['brand', 'model', 'category', 'frame_material', 'color', 'brake_type', 'confidence', 'evidence'],
        properties: {
          brand: nullableString,
          model: nullableString,
          category: { type: ['string', 'null'], enum: [...CATEGORY_IDS, null] },
          frame_material: { type: ['string', 'null'], enum: ['carbon', 'aluminium', 'steel', 'titanium', null] },
          color: nullableString,
          brake_type: { type: ['string', 'null'], enum: ['disc', 'rim', null] },
          confidence,
          evidence: { type: 'string' },
        },
      },
      groupset: {
        type: 'object',
        additionalProperties: false,
        required: ['brand', 'tier', 'speeds', 'electronic', 'confidence', 'evidence'],
        properties: {
          brand: nullableString,
          tier: nullableString,
          speeds: nullableNumber,
          electronic: nullableBool,
          confidence,
          evidence: { type: 'string' },
        },
      },
      components: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['component_type', 'brand', 'model', 'metadata', 'confidence', 'evidence', 'seen_in'],
          properties: {
            component_type: { type: 'string', enum: COMPONENT_TYPE_IDS },
            brand: nullableString,
            model: nullableString,
            metadata: {
              type: 'object',
              additionalProperties: false,
              required: ['width_mm', 'tubeless', 'max_pressure_psi', 'rim_width_mm', 'hookless', 'depth_mm',
                'material', 'speeds', 'range', 'teeth', 'setup', 'diameter_mm', 'mount', 'system', 'travel_mm', 'position'],
              properties: {
                width_mm: nullableNumber,
                tubeless: nullableBool,
                max_pressure_psi: nullableNumber,
                rim_width_mm: nullableNumber,
                hookless: nullableBool,
                depth_mm: nullableNumber,
                material: nullableString,
                speeds: nullableNumber,
                range: nullableString,
                teeth: nullableString,
                setup: nullableString,
                diameter_mm: nullableNumber,
                mount: nullableString,
                system: nullableString,
                travel_mm: nullableNumber,
                position: nullableString,
              },
            },
            confidence,
            evidence: { type: 'string' },
            seen_in: { type: 'array', items: { type: 'string', enum: ['whole_bike', 'drivetrain', 'front_wheel'] } },
          },
        },
      },
      unreadable: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['component_type', 'reason', 'better_shot'],
          properties: {
            component_type: { type: 'string', enum: COMPONENT_TYPE_IDS },
            reason: { type: 'string' },
            better_shot: { type: ['string', 'null'], enum: ['whole_bike', 'drivetrain', 'front_wheel', null] },
          },
        },
      },
    },
  };
}

/**
 * The extraction prompt. The catalogue is rendered into it so the model
 * knows exactly which parts exist, what each metadata field means, and what
 * is typically readable from which shot.
 */
export function buildExtractionPrompt(gear, shotIds) {
  const known = [gear?.brand, gear?.model].filter(Boolean).join(' ');
  const parts = partsForBikeType(gear?.category || null);

  const partLines = parts.map((p) => {
    const fields = Object.entries(p.metadataSchema)
      .map(([k, f]) => `${k}${f.options ? ` (${f.options.join('|')})` : ''}`)
      .join(', ');
    const readable = p.photoReadable.length ? p.photoReadable.join(', ') : 'nothing beyond presence';
    return `- ${p.type} — ${p.label}. Best shot: ${p.photoHint || 'none'}. Usually readable: ${readable}.${fields ? ` Metadata: ${fields}.` : ''}`;
  });

  return [
    'You are cataloguing the parts on a cyclist\'s bike from their own photos so a maintenance tracker can watch each part\'s wear.',
    known ? `The rider says this bike is: ${known}.` : 'The rider has not named the bike.',
    gear?.category ? `The rider says its category is: ${gear.category}.` : '',
    `Photos provided: ${shotIds.join(', ')}.`,
    '',
    'Report only what you can actually see. Give each finding a confidence from 0 to 1 and one line of evidence naming the visual cue (a hotpatch, a sidewall marking, sprocket count, caliper shape). When a detail is not visible, set it to null and, if a different shot would show it, list it under "unreadable" with the shot that would help.',
    'Never guess a brand or model from the bike\'s reputation; a Specialized frame does not imply Specialized tires. Sidewall text, hotpatches, and printed logos are evidence; silhouette alone is not.',
    'Tire width is printed on the sidewall as e.g. "28-622" (28 mm) or "700x32c" (32 mm) or "29x2.4" (2.4 in ≈ 61 mm); convert to millimetres. "TLR", "TR", "TLE", "Tubeless Ready" on the sidewall means tubeless-capable, which is not proof it is set up tubeless — report tubeless=true only with that caveat in the evidence, else null.',
    'Count sprockets on the cassette for speeds; the largest and smallest sprocket give the range as "smallest-largest".',
    'A rotor on the hub means brake_type=disc and implies brake_pads_disc and brake_rotors; caliper arms at the rim mean rim brakes and brake_pads_rim. A visible wire-free rear derailleur with a battery pack means electronic shifting.',
    'Always propose the consumables that every bike of this kind has even when the brand is unreadable (chain, cassette, tires, brake pads, bar tape on drop bars) — with brand/model null and a modest confidence — so the rider can confirm they exist.',
    '',
    'The catalogue of parts you may report (component_type must be one of these ids):',
    ...partLines,
    '',
    'Bike category ids: ' + BIKE_CATEGORIES.map((c) => `${c.value} (${c.label})`).join(', ') + '.',
  ].filter((l) => l !== '').join('\n');
}

/**
 * Normalise a raw extraction: drop unknown part types, drop rows below the
 * proposal floor, strip null metadata keys, dedupe by type (keep the most
 * confident), and sort into catalogue order so the confirm screen is stable.
 */
export function normalizeExtraction(raw) {
  const order = new Map(CATALOG_PARTS.map((p, i) => [p.type, i]));
  const byType = new Map();

  for (const c of raw?.components || []) {
    if (!c || !order.has(c.component_type)) continue;
    const confidence = clamp01(c.confidence);
    if (confidence < PROPOSE_CONFIDENCE) continue;
    const metadata = {};
    for (const [k, v] of Object.entries(c.metadata || {})) {
      if (v !== null && v !== undefined && v !== '') metadata[k] = v;
    }
    const row = {
      component_type: c.component_type,
      brand: c.brand || null,
      model: c.model || null,
      metadata,
      confidence,
      prefill: confidence >= PREFILL_CONFIDENCE,
      evidence: typeof c.evidence === 'string' ? c.evidence : '',
      seen_in: Array.isArray(c.seen_in) ? c.seen_in : [],
    };
    const existing = byType.get(row.component_type);
    if (!existing || existing.confidence < row.confidence) byType.set(row.component_type, row);
  }

  const components = [...byType.values()].sort(
    (a, b) => order.get(a.component_type) - order.get(b.component_type)
  );

  const bike = raw?.bike || {};
  const groupset = raw?.groupset || {};

  return {
    bike: {
      brand: bike.brand || null,
      model: bike.model || null,
      category: bike.category || null,
      frame_material: bike.frame_material || null,
      color: bike.color || null,
      brake_type: bike.brake_type || null,
      confidence: clamp01(bike.confidence),
      evidence: typeof bike.evidence === 'string' ? bike.evidence : '',
    },
    groupset: {
      brand: groupset.brand || null,
      tier: groupset.tier || null,
      speeds: Number.isFinite(groupset.speeds) ? groupset.speeds : null,
      electronic: typeof groupset.electronic === 'boolean' ? groupset.electronic : null,
      confidence: clamp01(groupset.confidence),
      evidence: typeof groupset.evidence === 'string' ? groupset.evidence : '',
    },
    components,
    unreadable: (raw?.unreadable || [])
      .filter((u) => u && order.has(u.component_type))
      .map((u) => ({
        component_type: u.component_type,
        reason: typeof u.reason === 'string' ? u.reason : '',
        better_shot: u.better_shot || null,
      })),
  };
}

function clamp01(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}
