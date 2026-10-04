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
