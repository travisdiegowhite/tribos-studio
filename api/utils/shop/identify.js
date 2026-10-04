// Shop inventory — turn a spoken/typed description and/or one photo of a part
// or tool into draft item fields. Pure helpers (schema, prompt, normaliser);
// api/shop-identify.js does auth, storage and the Claude call.
//
// Spin-off note: this file and api/shop-identify.js are the shop's only
// server code. They read shop_* tables only and share nothing with the rest
// of api/ beyond the standard auth/cors/rate-limit utilities.

export const SHOP_PHOTO_BUCKET = 'shop-photos';
export const SIGNED_URL_TTL_S = 300;
export const MAX_TRANSCRIPT_CHARS = 1500;

const CONDITIONS = ['new', 'good', 'used', 'worn', 'broken'];
const NONE = '';

/** Root-first " > " path for every row of a parent/child table. */
export function treePaths(rows) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return rows.map((row) => {
    const names = [];
    const seen = new Set();
    let cur = row;
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      names.unshift(cur.name);
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
    }
    return { id: row.id, path: names.join(' > ') };
  });
}

/**
 * Structured-output contract. Category and location are enums of the user's
 * own paths, so the model can only pick something that exists; "" means
 * "not mentioned / can't tell". Every field is required so the shape is fixed.
 */
export function buildIdentifySchema(categoryPaths, locationPaths) {
  return {
    type: 'object',
    additionalProperties: false,
    required: [
      'name', 'brand', 'model', 'mpn', 'upc', 'quantity', 'condition', 'category', 'location',
      'compatibility', 'notes', 'confidence',
    ],
    properties: {
      name: { type: 'string', description: 'Short item name as a mechanic would label it, without the brand. "" if unidentifiable.' },
      brand: { type: 'string', description: 'Manufacturer, e.g. Shimano, SRAM, Park Tool. "" if unknown.' },
      model: { type: 'string', description: 'Model name or series, e.g. "Ultegra R8000", "SR-12.2". "" if unknown.' },
      mpn: { type: 'string', description: 'Manufacturer part number exactly as printed, e.g. "RD-R8000-SS". "" if not visible or said.' },
      upc: { type: 'string', description: 'UPC/EAN digits only, if clearly readable. "" otherwise.' },
      quantity: { type: 'integer', description: 'How many. 1 unless a count is stated or clearly visible.' },
      condition: { type: 'string', enum: [...CONDITIONS, NONE], description: '"" if not stated or not visible.' },
      category: { type: 'string', enum: [...categoryPaths, NONE], description: 'Best-fitting category path from the list.' },
      location: { type: 'string', enum: [...locationPaths, NONE], description: 'Only if a storage place was said. Never guess from a photo.' },
      compatibility: {
        type: 'array',
        items: { type: 'string' },
        description: 'Short compatibility tags, e.g. "11-speed", "Shimano Road", "160mm rotor", "BSA threaded".',
      },
      notes: { type: 'string', description: 'Anything else worth keeping that does not fit a field. "" if none.' },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'], description: 'How sure you are of name/brand/model overall.' },
    },
  };
}

export function buildIdentifyPrompt({ transcript, hasPhoto }) {
  const sources = [
    hasPhoto && 'a photo',
    transcript && 'a description the owner said or typed',
  ].filter(Boolean).join(' and ');
  return [
    `You are cataloguing a home bike workshop. From ${sources}, fill in one inventory record for a single part, consumable or tool.`,
    '',
    'Rules:',
    '- Only state what the photo shows or the owner said. Leave a field "" rather than guess; a wrong part number is worse than none.',
    '- Read part numbers, model codes and barcodes from packaging or the part exactly as printed.',
    '- If the owner and the photo disagree, the owner wins.',
    '- Choose the category from the enum; prefer the most specific sub-category that fits.',
    '- Set location only if the owner named one; match it to the closest path in the enum.',
    '- If several different items are shown, describe the most prominent one and mention the rest in notes.',
    transcript ? `\nOwner's description:\n"""${transcript}"""` : '',
  ].join('\n');
}

const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Model output → draft fields with ids resolved. Never trusts the enums blindly. */
export function normalizeIdentification(raw, categories, locations) {
  const catPaths = treePaths(categories);
  const locPaths = treePaths(locations);
  const pick = (paths, value) => {
    const want = str(value).toLowerCase();
    return want ? paths.find((p) => p.path.toLowerCase() === want)?.id ?? null : null;
  };
  const qty = Number.isInteger(raw?.quantity) && raw.quantity >= 0 && raw.quantity <= 10000 ? raw.quantity : 1;
  const condition = CONDITIONS.includes(raw?.condition) ? raw.condition : null;
  const upcDigits = str(raw?.upc).replace(/\D/g, '');
  return {
    name: str(raw?.name, 120) || null,
    brand: str(raw?.brand, 80) || null,
    model: str(raw?.model, 120) || null,
    mpn: str(raw?.mpn, 80) || null,
    upc: /^\d{8,14}$/.test(upcDigits) ? upcDigits : null,
    quantity: qty,
    condition,
    category_id: pick(catPaths, raw?.category),
    location_id: pick(locPaths, raw?.location),
    compatibility: Array.isArray(raw?.compatibility)
      ? [...new Set(raw.compatibility.map((c) => str(c, 40)).filter(Boolean))].slice(0, 12)
      : [],
    notes: str(raw?.notes, 1000) || null,
    confidence: ['high', 'medium', 'low'].includes(raw?.confidence) ? raw.confidence : 'low',
  };
}

/** Same default list as the browser (src/features/shop/host.tsx). */
export function shopOwnerEmails(env = process.env) {
  return (env.SHOP_OWNER_EMAILS || 'travis@tribos.studio,travisdiegowhite@gmail.com')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}
