/**
 * The shop's ONE seam into tribos.
 *
 * Everything under src/features/shop/ imports tribos through this file and
 * nowhere else, so spinning the shop off into its own app means rewriting
 * this file, not the feature. `npm run test` enforces it (see
 * __tests__/boundary.test.ts).
 */
export { supabase } from '../../lib/supabase';
export { useAuth } from '../../contexts/AuthContext';
export { default as AppShell } from '../../components/AppShell.jsx';
export { resizeImageFile } from '../../utils/imageResize';

export { SHOP_OWNER_EMAIL, isShopOwner } from './owner';
