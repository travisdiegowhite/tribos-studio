// Shared request authentication for API routes.
//
// Every user-facing endpoint MUST authenticate the caller with requireAuth()
// and use the returned user's id — never a userId from the request body or
// query string. This module exists because auth checks were previously
// copy-pasted per endpoint, and endpoints that skipped the copy (fuel-plan,
// review-week) shipped as unauthenticated Claude proxies.

import { getSupabaseAdmin } from './supabaseAdmin.js';

/**
 * Validate the Bearer token on a request and return the authenticated user.
 *
 * On failure this sends the 401 response itself and returns null — callers
 * should bail out: `const user = await requireAuth(req, res); if (!user) return;`
 */
export async function requireAuth(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }

  const token = authHeader.substring(7);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data?.user) {
    res.status(401).json({ error: 'Invalid or expired authentication token' });
    return null;
  }

  return data.user;
}
