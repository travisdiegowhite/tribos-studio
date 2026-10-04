export type ItemKind = 'tool' | 'part' | 'consumable';
export type ItemCondition = 'new' | 'good' | 'fair' | 'worn' | 'unknown';

export interface ShopCategory {
  id: string;
  name: string;
  prefix: string;
  parent_id: string | null;
  icon: string | null;
  sort_order: number;
}

export interface ShopLocation {
  id: string;
  name: string;
  parent_id: string | null;
  description: string | null;
  sort_order: number;
}

export interface ShopItem {
  id: string;
  display_id: string;
  name: string;
  kind: ItemKind;
  description: string | null;
  category_id: string | null;
  location_id: string | null;
  quantity: number;
  min_quantity: number | null;
  brand: string | null;
  model: string | null;
  mpn: string | null;
  upc: string | null;
  condition: ItemCondition;
  compatibility: string[];
  purchase_date: string | null;
  purchase_price_cents: number | null;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

/** The editable fields of an item; everything else is set by the database. */
export type ItemInput = Pick<
  ShopItem,
  | 'name' | 'kind' | 'description' | 'category_id' | 'location_id' | 'quantity'
  | 'min_quantity' | 'brand' | 'model' | 'mpn' | 'upc' | 'condition'
  | 'compatibility' | 'purchase_date' | 'purchase_price_cents' | 'notes'
>;

export interface ShopItemPhoto {
  id: string;
  item_id: string;
  storage_path: string;
  is_primary: boolean;
  created_at: string;
}

export type ActivityAction = 'created' | 'edited' | 'quantity' | 'moved' | 'archived' | 'restored' | 'photo';

export interface ShopActivity {
  id: string;
  item_id: string | null;
  display_id: string | null;
  action: ActivityAction;
  details: Record<string, unknown>;
  created_at: string;
}

export interface ItemFilters {
  search?: string;
  kind?: ItemKind | null;
  categoryId?: string | null;
  locationId?: string | null;
  includeArchived?: boolean;
}
