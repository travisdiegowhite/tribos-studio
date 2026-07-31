/**
 * Export helpers for the activity share card: native share sheet, PNG
 * download, and clipboard copy — all feature-detected.
 */

export interface ShareCapabilities {
  /** navigator.share with file payloads (mobile share sheet → IG/X/Messages). */
  canShareFiles: boolean;
  /** ClipboardItem image write (Chromium desktop). */
  canCopyImage: boolean;
}

export function getShareCapabilities(): ShareCapabilities {
  let canShareFiles = false;
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.canShare === 'function') {
      const probe = new File([''], 'probe.png', { type: 'image/png' });
      canShareFiles = navigator.canShare({ files: [probe] });
    }
  } catch {
    canShareFiles = false;
  }

  let canCopyImage = false;
  try {
    canCopyImage =
      typeof navigator !== 'undefined' &&
      !!navigator.clipboard &&
      typeof navigator.clipboard.write === 'function' &&
      typeof ClipboardItem !== 'undefined' &&
      // ClipboardItem.supports is newer; absence means assume PNG works.
      (typeof ClipboardItem.supports !== 'function' || ClipboardItem.supports('image/png'));
  } catch {
    canCopyImage = false;
  }

  return { canShareFiles, canCopyImage };
}

/**
 * canvas.toBlob as a promise. Throws SecurityError if the canvas is tainted
 * (CORS failure on the map image) — callers surface that as a UI alert.
 */
export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas export produced no image'));
      }, 'image/png');
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Open the native share sheet with the card image.
 * Returns 'shared' | 'cancelled' | 'unsupported'.
 * The blob must already exist — no async gap before share() (iOS
 * user-activation requirement).
 */
export async function shareCardBlob(blob: Blob, filename: string): Promise<'shared' | 'cancelled' | 'unsupported'> {
  const file = new File([blob], filename, { type: 'image/png' });
  if (typeof navigator.canShare !== 'function' || !navigator.canShare({ files: [file] })) {
    return 'unsupported';
  }
  try {
    await navigator.share({ files: [file] });
    return 'shared';
  } catch (err) {
    // User dismissing the sheet is not an error.
    if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
    throw err;
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Delay revoke so the click has time to consume the URL.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function copyBlobToClipboard(blob: Blob): Promise<void> {
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

/** "tribos-2026-07-26-morning-ride.png" */
export function shareCardFilename(name: unknown, startDateLocal: unknown): string {
  const date = typeof startDateLocal === 'string' ? startDateLocal.slice(0, 10) : '';
  const slug = (typeof name === 'string' ? name : '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return ['tribos', date, slug].filter(Boolean).join('-') + '.png';
}
