/**
 * Embed code for a shared route (Phase 2, docs/ROUTE-BUILDER-COMPETITIVE-PLAN.md
 * §3.6). The iframe points at /r/<id>/embed, the chrome-less share page; the
 * same HTML is what api/oembed.js returns.
 */
export const EMBED_WIDTH = 640;
export const EMBED_HEIGHT = 420;

function escapeAttr(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

/** The embed page URL for a share URL (…/r/<id> → …/r/<id>/embed). */
export function embedUrlFor(shareUrl: string): string {
  return `${shareUrl.replace(/\/+$/, '').replace(/\/embed$/, '')}/embed`;
}

export function embedCodeFor(shareUrl: string, title = 'Route'): string {
  return `<iframe src="${escapeAttr(embedUrlFor(shareUrl))}" width="${EMBED_WIDTH}" height="${EMBED_HEIGHT}" style="border:0;max-width:100%" loading="lazy" title="${escapeAttr(title)} on tribos.studio" allowfullscreen></iframe>`;
}

/** Copy text, falling back to a hidden textarea. Resolves false if both fail. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}
