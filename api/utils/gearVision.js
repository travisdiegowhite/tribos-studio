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
const UNKNOWN = 'unknown';

/**
 * JSON schema for `output_config.format`. Every field required (the API's
 * structured-output grammar needs it).
 *
 * The API also caps a schema at 16 union-typed parameters (`type: [x, 'null']`
 * or anyOf) — this one had 29 and every request failed with a 400. So
 * "unknown" is a sentinel, not null: "" for text, 0 for measurements (none can
 * truly be zero), "unknown" for choices. Only the three yes/no fields stay
 * nullable, because there "unknown" and "no" differ. normalizeExtraction maps
 * every sentinel back to null, so nothing downstream sees them.
 */
export function buildExtractionSchema() {
  const text = { type: 'string', description: 'Empty string when not visible' };
  const measure = { type: 'number', description: '0 when not visible' };
  const nullableBool = { type: ['boolean', 'null'] };
  const choice = (values) => ({ type: 'string', enum: [...values, UNKNOWN] });
  // Structured outputs also reject numeric constraints (minimum/maximum) with a
  // 400 on every request; the 0–1 range lives in the description and
  // normalizeExtraction clamps it.
  const confidence = { type: 'number', description: 'Confidence from 0 to 1' };

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
          brand: text,
          model: text,
          category: choice(CATEGORY_IDS),
          frame_material: choice(['carbon', 'aluminium', 'steel', 'titanium']),
          color: text,
          brake_type: choice(['disc', 'rim']),
          confidence,
          evidence: { type: 'string' },
        },
      },
      groupset: {
        type: 'object',
        additionalProperties: false,
        required: ['brand', 'tier', 'speeds', 'electronic', 'confidence', 'evidence'],
        properties: {
          brand: text,
          tier: text,
          speeds: measure,
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
            brand: text,
            model: text,
            metadata: {
              type: 'object',
              additionalProperties: false,
              required: ['width_mm', 'tubeless', 'max_pressure_psi', 'rim_width_mm', 'hookless', 'depth_mm',
                'material', 'speeds', 'range', 'teeth', 'setup', 'diameter_mm', 'mount', 'system', 'travel_mm', 'position'],
              properties: {
                width_mm: measure,
                tubeless: nullableBool,
                max_pressure_psi: measure,
                rim_width_mm: measure,
                hookless: nullableBool,
                depth_mm: measure,
                material: text,
                speeds: measure,
                range: text,
                teeth: text,
                setup: text,
                diameter_mm: measure,
                mount: text,
                system: text,
                travel_mm: measure,
                position: text,
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
            better_shot: choice(['whole_bike', 'drivetrain', 'front_wheel']),
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
    'Report only what you can actually see. Give each finding a confidence from 0 to 1 and one line of evidence naming the visual cue (a hotpatch, a sidewall marking, sprocket count, caliper shape). When a detail is not visible, leave it unknown — an empty string for text, 0 for a number, "unknown" for a choice, null for a yes/no — and, if a different shot would show it, list it under "unreadable" with the shot that would help.',
    'Never guess a brand or model from the bike\'s reputation; a Specialized frame does not imply Specialized tires. Sidewall text, hotpatches, and printed logos are evidence; silhouette alone is not.',
    'Tire width is printed on the sidewall as e.g. "28-622" (28 mm) or "700x32c" (32 mm) or "29x2.4" (2.4 in ≈ 61 mm); convert to millimetres. "TLR", "TR", "TLE", "Tubeless Ready" on the sidewall means tubeless-capable, which is not proof it is set up tubeless — report tubeless=true only with that caveat in the evidence, else null.',
    'Count sprockets on the cassette for speeds; the largest and smallest sprocket give the range as "smallest-largest".',
    'A rotor on the hub means brake_type=disc and implies brake_pads_disc and brake_rotors; caliper arms at the rim mean rim brakes and brake_pads_rim. A visible wire-free rear derailleur with a battery pack means electronic shifting.',
    'Always propose the consumables that every bike of this kind has even when the brand is unreadable (chain, cassette, tires, brake pads, bar tape on drop bars) — with brand/model empty and a modest confidence — so the rider can confirm they exist.',
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
      const known = typeof v === 'number' ? positiveOrNull(v) : textOrNull(v) ?? (typeof v === 'boolean' ? v : null);
      if (known !== null) metadata[k] = known;
    }
    const row = {
      component_type: c.component_type,
      brand: textOrNull(c.brand),
      model: textOrNull(c.model),
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
      brand: textOrNull(bike.brand),
      model: textOrNull(bike.model),
      category: textOrNull(bike.category),
      frame_material: textOrNull(bike.frame_material),
      color: textOrNull(bike.color),
      brake_type: textOrNull(bike.brake_type),
      confidence: clamp01(bike.confidence),
      evidence: typeof bike.evidence === 'string' ? bike.evidence : '',
    },
    groupset: {
      brand: textOrNull(groupset.brand),
      tier: textOrNull(groupset.tier),
      speeds: positiveOrNull(groupset.speeds),
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
        better_shot: textOrNull(u.better_shot),
      })),
  };
}

/** A text or choice field, with the "" / "unknown" sentinels read as null. */
function textOrNull(v) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' || t.toLowerCase() === UNKNOWN ? null : t;
}

/** A measurement, with the 0 sentinel (and anything non-positive) read as null. */
function positiveOrNull(v) {
  return Number.isFinite(v) && v > 0 ? v : null;
}

function clamp01(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}
