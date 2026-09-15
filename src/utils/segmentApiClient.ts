/**
 * segmentApi — the browser's call into /api/segment-analysis, as the
 * signed-in athlete. One place for the base URL and the bearer token so
 * every caller (segment library, REPEATS picker) posts the same way.
 */

import { supabase } from '../lib/supabase';

const getApiBaseUrl = () => {
  if (typeof window !== 'undefined' && (import.meta as { env?: { PROD?: boolean } }).env?.PROD) return '';
  return 'http://localhost:3000';
};

export async function segmentApi<T = unknown>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await fetch(`${getApiBaseUrl()}/api/segment-analysis`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ action, ...params }),
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      /* no body */
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

export interface SegmentNameResult {
  segmentId: string;
  auto_name: string | null;
  custom_name: string | null;
  display_name: string | null;
  roads: string[];
  source: 'roads' | 'place' | 'unchanged' | 'missing';
  error?: string;
}

/** Rename a segment; an empty name clears the athlete's override. */
export function updateSegmentName(segmentId: string, customName: string | null): Promise<{ success: boolean }> {
  return segmentApi('update_segment_name', { segmentId, customName: customName?.trim() || null });
}

/** Rebuild road names for a batch; `remaining` are the ids the call did not reach. */
export function nameSegments(
  segmentIds: string[],
): Promise<{ results: SegmentNameResult[]; processed: number; remaining: string[] }> {
  return segmentApi('name_segments', { segmentIds });
}

/**
 * The detector's own names ("Rolling 14.7km", "12 min Climb 5.4%", with or
 * without a place prefix). Mirrors isGenericSegmentName in
 * api/utils/segmentNaming.js so the picker and the server agree on what
 * still needs naming.
 */
const GENERIC_RE = /(^|\s)(\d+ min )?(Rolling|Flat|Descent|Climb)\s+[\d.]+\s?(km|%)/;

export function isGenericSegmentName(name: string | null | undefined): boolean {
  if (name == null) return true;
  const s = String(name).trim();
  if (!s) return true;
  if (s.includes('→')) return false;
  return GENERIC_RE.test(s);
}
