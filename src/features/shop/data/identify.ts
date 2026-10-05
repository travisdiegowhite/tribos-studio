/** Client for /api/shop-identify — photo and/or description → draft fields. */
import { SHOP_API_BASE, shopAuthHeaders } from '../host';
import type { Condition } from '../types';

export interface IdentifiedDraft {
  name: string | null;
  brand: string | null;
  model: string | null;
  mpn: string | null;
  upc: string | null;
  quantity: number;
  condition: Condition | null;
  category_id: string | null;
  location_id: string | null;
  compatibility: string[];
  notes: string | null;
  confidence: 'high' | 'medium' | 'low';
}

export async function identifyItem(input: { transcript?: string; photoPath?: string }): Promise<IdentifiedDraft> {
  const res = await fetch(`${SHOP_API_BASE}/shop-identify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await shopAuthHeaders()) },
    body: JSON.stringify(input),
  });
  let body: { draft?: IdentifiedDraft; error?: string } = {};
  try {
    body = await res.json();
  } catch {
    // A non-JSON body is a proxy page or a missing route.
  }
  if (!res.ok || !body.draft) throw new Error(body.error || `Identify failed (${res.status})`);
  return body.draft;
}
