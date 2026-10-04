/**
 * Shop inventory — the HOST seam.
 *
 * This is the ONLY file in src/features/shop/ allowed to import from the rest
 * of tribos (enforced by boundary.test.ts). Everything the shop needs from its
 * host app comes through here: the Supabase client, the signed-in user, the
 * page frame, where it is mounted, and who may see it.
 *
 * To spin the shop off as its own app, copy src/features/shop/ and rewrite
 * this one file against the new app's auth and layout. Nothing else changes.
 */
import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as tribosSupabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import AppShell from '../../components/AppShell.jsx';

export const supabase: SupabaseClient = tribosSupabase;

/** Where the shop is mounted. Every in-app link is built from this. */
export const SHOP_BASE_PATH = '/garage/shop';

export function shopPath(sub = ''): string {
  const clean = sub.replace(/^\/+/, '');
  return clean ? `${SHOP_BASE_PATH}/${clean}` : SHOP_BASE_PATH;
}

/**
 * Absolute URL for a shop page, as printed into QR labels. A phone's own
 * camera opens it straight to the item. Pin VITE_SHOP_PUBLIC_ORIGIN so labels
 * printed from a preview deploy still point at production; the in-app scanner
 * reads the label out of any origin, so a future domain change only affects
 * native-camera scans of old labels.
 */
export function shopPublicUrl(sub = ''): string {
  const origin = ((import.meta.env.VITE_SHOP_PUBLIC_ORIGIN as string | undefined) || window.location.origin).replace(/\/+$/, '');
  return `${origin}${shopPath(sub)}`;
}

/** Bearer header for the shop's server endpoints (/api/shop-*). */
export async function shopAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Where the shop's server endpoints live. */
export const SHOP_API_BASE = '/api';

/** Where a visitor without access, or the "back" arrow, lands. */
export const SHOP_EXIT_PATH = '/garage';

/**
 * Owner-only for now. The data is per-user under RLS regardless; this only
 * decides who sees the UI. Override with VITE_SHOP_OWNER_EMAILS (comma list).
 */
const OWNER_EMAILS = (
  (import.meta.env.VITE_SHOP_OWNER_EMAILS as string | undefined) ||
  'travis@tribos.studio,travisdiegowhite@gmail.com'
)
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function canUseShop(email: string | null | undefined): boolean {
  return !!email && OWNER_EMAILS.includes(email.toLowerCase());
}

export interface ShopUser {
  id: string;
  email: string | null;
}

export function useShopUser(): ShopUser | null {
  const { user } = useAuth();
  return user ? { id: user.id, email: user.email ?? null } : null;
}

/** Page chrome plus the access gate. The host route already requires sign-in. */
export function ShopFrame({ children }: { children: ReactNode }) {
  const user = useShopUser();
  if (!user || !canUseShop(user.email)) return <Navigate to={SHOP_EXIT_PATH} replace />;
  return <AppShell>{children}</AppShell>;
}
