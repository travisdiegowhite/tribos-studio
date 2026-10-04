/** Row shapes for the shop_* tables (database/migrations/127_shop_inventory.sql). */

export const CONDITIONS = ['new', 'good', 'used', 'worn', 'broken'] as const;
export type Condition = (typeof CONDITIONS)[number];

export interface ShopCategory {
  id: string;
  user_id: string;
  name: string;
  parent_id: string | null;
  /** Set on roots only; children inherit their root's. */
  prefix: string | null;
  next_sequence: number;
  sort_order: number;
  created_at: string;
}

export interface ShopLocation {
  id: string;
  user_id: string;
  name: string;
  parent_id: string | null;
  description: string | null;
  sort_order: number;
  created_at: string;
}

export interface ShopItem {
  id: string;
  user_id: string;
  /** Printed label, e.g. TL-0001. Assigned by the database; never changes. */
  display_id: string;
  name: string;
  category_id: string;
  location_id: string | null;
  quantity: number;
  min_quantity: number | null;
  brand: string | null;
  model: string | null;
  mpn: string | null;
  upc: string | null;
  condition: Condition;
  compatibility: string[];
  tags: string[];
  unit_cost: number | null;
  purchased_on: string | null;
  notes: string | null;
  photo_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShopItemEvent {
  id: string;
  item_id: string;
  kind: 'created' | 'moved' | 'quantity';
  details: Record<string, unknown>;
  created_at: string;
}

/** The writable part of an item — what the editor and the CSV importer produce. */
export type ItemDraft = Pick<
  ShopItem,
  | 'name'
  | 'category_id'
  | 'location_id'
  | 'quantity'
  | 'min_quantity'
  | 'brand'
  | 'model'
  | 'mpn'
  | 'upc'
  | 'condition'
  | 'compatibility'
  | 'tags'
  | 'unit_cost'
  | 'purchased_on'
  | 'notes'
>;
