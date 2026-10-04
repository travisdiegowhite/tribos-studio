/**
 * Live camera scanner for QR labels and product barcodes (UPC/EAN/Code 128).
 * html5-qrcode is imported on demand so its ~300 KB only loads when a camera
 * actually opens. It uses the browser's native BarcodeDetector where there is
 * one and falls back to its bundled ZXing decoder elsewhere (iOS Safari).
 */
import { useEffect, useId, useRef, useState } from 'react';
import { Box, Button, Group, Text } from '@mantine/core';
import { Lightning } from '@phosphor-icons/react';

interface ScannerProps {
  onResult: (text: string) => void;
  /** Stop after the first read (default) or keep scanning. */
  once?: boolean;
  height?: number;
}

type Instance = {
  start: (...args: unknown[]) => Promise<unknown>;
  stop: () => Promise<void>;
  clear: () => void;
  isScanning: boolean;
  applyVideoConstraints?: (c: MediaTrackConstraints) => Promise<void>;
  getRunningTrackCapabilities?: () => MediaTrackCapabilities & { torch?: boolean };
};

export function Scanner({ onResult, once = true, height = 320 }: ScannerProps) {
  const id = `shop-scanner-${useId().replace(/:/g, '')}`;
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [torch, setTorch] = useState<boolean | null>(null); // null = not supported
  const inst = useRef<Instance | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    let cancelled = false;
    let done = false;
    let startPromise: Promise<unknown> | null = null;

    (async () => {
      try {
        const mod = await import('html5-qrcode');
        if (cancelled) return;
        const F = mod.Html5QrcodeSupportedFormats;
        const scanner = new mod.Html5Qrcode(id, {
          verbose: false,
          useBarCodeDetectorIfSupported: true,
          formatsToSupport: [
            F.QR_CODE, F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.ITF,
          ],
        }) as unknown as Instance;
        inst.current = scanner;
        startPromise = scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            // A wide box suits 1-D barcodes and still frames a QR.
            qrbox: (w: number, h: number) => ({ width: Math.floor(Math.min(w * 0.85, 420)), height: Math.floor(Math.min(h * 0.6, 240)) }),
          },
          (text: string) => {
            if (done) return;
            if (once) done = true;
            navigator.vibrate?.(40);
            onResultRef.current(text);
          },
          () => { /* per-frame "not found" — expected, ignore */ },
        );
        await startPromise;
        if (cancelled) return;
        setStarting(false);
        const caps = scanner.getRunningTrackCapabilities?.();
        if (caps && 'torch' in caps && caps.torch) setTorch(false);
      } catch (err) {
        if (cancelled) return;
        setStarting(false);
        const msg = err instanceof Error ? err.message : String(err);
        setError(/permission|notallowed/i.test(msg)
          ? 'Camera access was blocked. Allow it in the browser’s site settings and reopen this page.'
          : /notfound|no camera|requested device/i.test(msg)
            ? 'No camera found on this device.'
            : `Camera could not start: ${msg}`);
      }
    })();

    return () => {
      cancelled = true;
      const scanner = inst.current;
      inst.current = null;
      // Stopping before start() settles throws; wait for it first.
      (startPromise || Promise.resolve())
        .catch(() => {})
        .then(async () => {
          if (scanner?.isScanning) await scanner.stop().catch(() => {});
          try { scanner?.clear(); } catch { /* already cleared */ }
        });
    };
  }, [id, once]);

  const toggleTorch = async () => {
    const next = !torch;
    try {
      await inst.current?.applyVideoConstraints?.({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorch(next);
    } catch {
      setTorch(null);
    }
  };

  return (
    <Box>
      <Box
        id={id}
        style={{
          width: '100%', minHeight: height, background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)',
          overflow: 'hidden', borderRadius: 0,
        }}
      />
      <Group justify="space-between" mt={6} gap="xs" wrap="nowrap">
        <Text size="xs" style={{ color: error ? 'var(--color-signal-text)' : 'var(--color-text-muted)' }}>
          {error || (starting ? 'Starting camera…' : 'Point at a QR label or a barcode.')}
        </Text>
        {torch !== null && (
          <Button size="compact-xs" variant={torch ? 'filled' : 'default'} leftSection={<Lightning size={12} />} onClick={toggleTorch}>
            Light
          </Button>
        )}
      </Group>
    </Box>
  );
}
