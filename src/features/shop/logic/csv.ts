/**
 * CSV import and export. Pure: parsing, mapping rows to item drafts and
 * resolving category/location names happen here; writing to the database is
 * shopApi.importItems' job.
 */
import { CONDITIONS, type Condition, type ItemDraft, type ShopCategory, type ShopItem, type ShopLocation } from '../types';
import { findByPath, flattenTree, pathLabel, splitPath, PATH_SEPARATOR } from './tree';

// ── Parsing ─────────────────────────────────────────────────────────────

/** RFC 4180: quoted fields, "" escapes, embedded commas and newlines, CRLF, BOM. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === '') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function escapeCell(value: string): string {
  return /[",\r\n]/.test(value) || /^\s|\s$/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((r) => r.map(escapeCell).join(',')).join('\r\n') + '\r\n';
}

// ── Columns ─────────────────────────────────────────────────────────────

export const CSV_COLUMNS = [
  'label', 'name', 'category', 'location', 'quantity', 'min_quantity', 'brand', 'model', 'mpn', 'upc',
  'condition', 'compatibility', 'tags', 'unit_cost', 'purchased_on', 'notes',
] as const;
type Column = (typeof CSV_COLUMNS)[number];

const ALIASES: Record<string, Column> = {
  label: 'label', id: 'label', display_id: 'label',
  name: 'name', item: 'name',
  category: 'category', type: 'category',
  location: 'location', where: 'location', bin: 'location',
  quantity: 'quantity', qty: 'quantity', count: 'quantity',
  min_quantity: 'min_quantity', min: 'min_quantity', min_qty: 'min_quantity', reorder_at: 'min_quantity',
  brand: 'brand', make: 'brand', manufacturer: 'brand',
  model: 'model',
  mpn: 'mpn', part_number: 'mpn', manufacturer_part_number: 'mpn', sku: 'mpn',
  upc: 'upc', ean: 'upc', barcode: 'upc',
  condition: 'condition',
  compatibility: 'compatibility', fits: 'compatibility',
  tags: 'tags',
  unit_cost: 'unit_cost', cost: 'unit_cost', price: 'unit_cost', purchase_price: 'unit_cost',
  purchased_on: 'purchased_on', purchase_date: 'purchased_on', bought: 'purchased_on',
  notes: 'notes', note: 'notes', comments: 'notes',
};

function headerKey(raw: string): Column | undefined {
  return ALIASES[raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')];
}

const LIST_SPLIT = /\s*[;|]\s*/;

// ── Export ──────────────────────────────────────────────────────────────

export function exportItemsCsv(
  items: readonly ShopItem[],
  categories: readonly ShopCategory[],
  locations: readonly ShopLocation[],
): string {
  const asPath = (id: string | null, rows: readonly ShopCategory[] | readonly ShopLocation[]) =>
    pathLabel(id, rows).split(PATH_SEPARATOR).join(' > ');
  const body = items.map((i) => [
    i.display_id, i.name, asPath(i.category_id, categories), asPath(i.location_id, locations),
    String(i.quantity), i.min_quantity == null ? '' : String(i.min_quantity),
    i.brand || '', i.model || '', i.mpn || '', i.upc || '', i.condition,
    i.compatibility.join('; '), i.tags.join('; '),
    i.unit_cost == null ? '' : i.unit_cost.toFixed(2), i.purchased_on || '', i.notes || '',
  ]);
  return toCsv([[...CSV_COLUMNS], ...body]);
}

// ── Import ──────────────────────────────────────────────────────────────

export interface ImportRow {
  /** 1-based line in the file, header = 1. */
  line: number;
  draft: ItemDraft | null;
  /** Location path to create before inserting, when it does not exist yet. */
  newLocationPath: string | null;
  errors: string[];
  warnings: string[];
}

export interface ImportPlan {
  rows: ImportRow[];
  /** Distinct location paths the import will create, parent-first. */
  newLocationPaths: string[];
  unknownColumns: string[];
  fatal: string | null;
}

/**
 * `draft.location_id` is left null for rows whose location must be created
 * first; the importer fills it in from `newLocationPath` once it exists.
 */
export function planImport(
  text: string,
  categories: readonly ShopCategory[],
  locations: readonly ShopLocation[],
): ImportPlan {
  const table = parseCsv(text);
  if (table.length < 2) {
    return { rows: [], newLocationPaths: [], unknownColumns: [], fatal: 'The file needs a header row and at least one item.' };
  }
  const header = table[0].map(headerKey);
  const unknownColumns = table[0].filter((_, i) => !header[i]).map((h) => h.trim()).filter(Boolean);
  if (!header.includes('name')) {
    return { rows: [], newLocationPaths: [], unknownColumns, fatal: 'No "name" column found. It is the only required one.' };
  }
  const fallback = flattenTree(categories).find(({ node }) => !node.parent_id && node.prefix === 'OT')?.node
    ?? flattenTree(categories).find(({ depth }) => depth === 0)?.node;

  const newPaths = new Map<string, string>(); // lower-cased → as written
  const rows: ImportRow[] = table.slice(1).map((cells, idx) => {
    const get = (col: Column) => {
      const at = header.indexOf(col);
      return at >= 0 ? (cells[at] ?? '').trim() : '';
    };
    const errors: string[] = [];
    const warnings: string[] = [];

    const name = get('name');
    if (!name) errors.push('Missing name');

    // Category: full path, else a unique leaf name, else Other.
    const catRaw = get('category');
    let category = catRaw ? findByPath(catRaw, categories) : undefined;
    if (catRaw && !category) {
      const leaf = splitPath(catRaw).pop()?.toLowerCase();
      const hits = categories.filter((c) => c.name.toLowerCase() === leaf);
      if (hits.length === 1) category = hits[0];
    }
    if (!category) {
      category = fallback;
      if (catRaw) warnings.push(`Unknown category "${catRaw}" — filed under ${fallback?.name ?? 'the first category'}`);
    }
    if (!category) errors.push('No categories exist yet');

    // Location: existing path, else created on import.
    const locRaw = get('location');
    let locationId: string | null = null;
    let newLocationPath: string | null = null;
    if (locRaw) {
      const found = findByPath(locRaw, locations);
      if (found) locationId = found.id;
      else {
        newLocationPath = splitPath(locRaw).join(' > ');
        const parts = splitPath(locRaw);
        for (let i = 1; i <= parts.length; i++) {
          const p = parts.slice(0, i).join(' > ');
          if (!findByPath(p, locations) && !newPaths.has(p.toLowerCase())) newPaths.set(p.toLowerCase(), p);
        }
      }
    }

    const quantity = parseCount(get('quantity'), 1, 'quantity', errors);
    const minRaw = get('min_quantity');
    const min_quantity = minRaw ? parseCount(minRaw, 0, 'min_quantity', errors) : null;

    const condRaw = get('condition').toLowerCase();
    let condition: Condition = 'good';
    if (condRaw) {
      if ((CONDITIONS as readonly string[]).includes(condRaw)) condition = condRaw as Condition;
      else if (condRaw === 'fair') condition = 'used';
      else warnings.push(`Unknown condition "${condRaw}" — set to good`);
    }

    const costRaw = get('unit_cost').replace(/[$,\s]/g, '');
    let unit_cost: number | null = null;
    if (costRaw) {
      const n = Number(costRaw);
      if (Number.isFinite(n) && n >= 0) unit_cost = Math.round(n * 100) / 100;
      else errors.push(`unit_cost "${get('unit_cost')}" is not a price`);
    }

    const dateRaw = get('purchased_on');
    let purchased_on: string | null = null;
    if (dateRaw) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateRaw) && !Number.isNaN(Date.parse(dateRaw))) purchased_on = dateRaw;
      else warnings.push(`purchased_on "${dateRaw}" is not YYYY-MM-DD — skipped`);
    }

    const list = (col: Column) => get(col).split(LIST_SPLIT).map((s) => s.trim()).filter(Boolean);

    const draft: ItemDraft | null = errors.length || !category
      ? null
      : {
          name,
          category_id: category.id,
          location_id: locationId,
          quantity,
          min_quantity,
          brand: get('brand') || null,
          model: get('model') || null,
          mpn: get('mpn') || null,
          upc: get('upc') || null,
          condition,
          compatibility: list('compatibility'),
          tags: list('tags'),
          unit_cost,
          purchased_on,
          notes: get('notes') || null,
        };

    return { line: idx + 2, draft, newLocationPath, errors, warnings };
  });

  return {
    rows,
    // Shorter paths first, so parents exist before their children.
    newLocationPaths: [...newPaths.values()].sort((a, b) => splitPath(a).length - splitPath(b).length),
    unknownColumns,
    fatal: null,
  };
}

function parseCount(raw: string, fallback: number, col: string, errors: string[]): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (Number.isInteger(n) && n >= 0) return n;
  errors.push(`${col} "${raw}" is not a whole number`);
  return fallback;
}
