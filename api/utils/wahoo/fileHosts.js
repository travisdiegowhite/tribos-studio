// Which hosts the Wahoo importer may download a FIT file from.
//
// The file URL comes from the webhook body. Even with the webhook token
// checked, downloading an arbitrary URL from a request body is an SSRF
// foothold, so production only fetches from Wahoo's own domains (plus any
// extra hosts in WAHOO_FILE_HOSTS, comma-separated, should Wahoo move its CDN).
//
// Outside production any https host is allowed, so
// scripts/wahoo-webhook-replay.mjs can point a preview deploy at a real FIT.
// A URL that is refused is not an error: the workout still imports from its
// summary, just without streams.

const BUILT_IN_SUFFIXES = ['wahooligan.com', 'wahoofitness.com'];

export function isProductionRuntime(env = process.env) {
  return env.VERCEL_ENV === 'production' || (!env.VERCEL_ENV && env.NODE_ENV === 'production');
}

function hostMatches(host, suffix) {
  return host === suffix || host.endsWith(`.${suffix}`);
}

/**
 * @param {string} url
 * @param {object} [env]
 * @returns {{ allowed: boolean, host: string|null, reason?: string }}
 */
export function checkWahooFileUrl(url, env = process.env) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { allowed: false, host: null, reason: 'invalid URL' };
  }
  if (parsed.protocol !== 'https:') {
    return { allowed: false, host: parsed.hostname, reason: 'not https' };
  }
  const host = parsed.hostname.toLowerCase();
  if (!isProductionRuntime(env)) return { allowed: true, host };

  const extra = String(env.WAHOO_FILE_HOSTS || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  const allowed = [...BUILT_IN_SUFFIXES, ...extra].some((suffix) => hostMatches(host, suffix));
  return allowed ? { allowed, host } : { allowed, host, reason: `host ${host} not in Wahoo allowlist` };
}
