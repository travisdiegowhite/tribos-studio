/**
 * useSegmentNamer — give the athlete's segments names that mean something.
 *
 * `nameAll` walks every segment still carrying the detector's generic name
 * ("Rolling 14.7km"), most-ridden first, and asks the server to rebuild it
 * from the roads it runs along. The server names as many as fit in one
 * call and returns the rest, so the browser keeps sending until the list is
 * empty; the athlete can stop at any time. `rename` writes their own name.
 *
 * Every result is patched into the picker's rows as it lands, so names
 * change under the athlete's eyes rather than after a reload.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RepeatAnchorSegment, SegmentPatch } from './useRepeatAnchorSegments';
import { nameSegments, updateSegmentName } from '../utils/segmentApiClient';

/** Ids per request; the server caps at 40 and budgets its own time. */
const BATCH = 25;

export interface NamerProgress {
  running: boolean;
  done: number;
  total: number;
  named: number;
  error: string | null;
}

const IDLE: NamerProgress = { running: false, done: 0, total: 0, named: 0, error: null };

export interface SegmentNamer {
  progress: NamerProgress;
  /** How many segments still carry a generic name. */
  unnamedCount: number;
  nameAll: () => void;
  stop: () => void;
  rename: (id: string, name: string) => Promise<void>;
  renaming: string | null;
}

export function useSegmentNamer(
  segments: readonly RepeatAnchorSegment[],
  patch: (id: string, p: SegmentPatch) => void,
): SegmentNamer {
  const [progress, setProgress] = useState<NamerProgress>(IDLE);
  const [renaming, setRenaming] = useState<string | null>(null);
  const runRef = useRef(0);

  useEffect(() => () => {
    runRef.current += 1; // unmount stops a running pass
  }, []);

  const unnamedCount = segments.filter((s) => s.generic).length;

  const stop = useCallback(() => {
    runRef.current += 1;
    setProgress((p) => ({ ...p, running: false }));
  }, []);

  const nameAll = useCallback(() => {
    const ids = segments.filter((s) => s.generic).map((s) => s.id);
    if (ids.length === 0) return;
    const run = ++runRef.current;
    setProgress({ running: true, done: 0, total: ids.length, named: 0, error: null });

    (async () => {
      let queue = ids;
      let done = 0;
      let named = 0;
      while (queue.length > 0 && runRef.current === run) {
        const batch = queue.slice(0, BATCH);
        let out: Awaited<ReturnType<typeof nameSegments>>;
        try {
          out = await nameSegments(batch);
        } catch (err) {
          if (runRef.current !== run) return;
          setProgress((p) => ({ ...p, running: false, error: err instanceof Error ? err.message : String(err) }));
          return;
        }
        if (runRef.current !== run) return;
        for (const r of out.results) {
          if (r.source === 'roads' || r.source === 'place') {
            named += 1;
            patch(r.segmentId, { auto_name: r.auto_name });
          }
        }
        done += out.processed;
        // The server names what fits in its budget; the rest go round again.
        queue = [...out.remaining, ...queue.slice(batch.length)];
        setProgress({ running: true, done, total: ids.length, named, error: null });
        if (out.processed === 0) break; // nothing moved — don't spin
      }
      if (runRef.current === run) setProgress((p) => ({ ...p, running: false }));
    })();
  }, [segments, patch]);

  const rename = useCallback(
    async (id: string, name: string) => {
      const trimmed = name.trim();
      setRenaming(id);
      try {
        await updateSegmentName(id, trimmed || null);
        patch(id, { custom_name: trimmed || null });
      } finally {
        setRenaming(null);
      }
    },
    [patch],
  );

  return { progress, unnamedCount, nameAll, stop, rename, renaming };
}
