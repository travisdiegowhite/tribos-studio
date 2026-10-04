/**
 * The shop is owner-only. Data is protected by RLS (owner_id = auth.uid());
 * this check only hides the door, the same way Admin.jsx does.
 *
 * No imports, so AppShell can read it without pulling in the feature.
 */
export const SHOP_OWNER_EMAIL = 'travis@tribos.studio';

export function isShopOwner(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase() === SHOP_OWNER_EMAIL.toLowerCase();
}
