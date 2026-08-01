/**
 * ShareCardModal — preview + export UI for the activity share card.
 *
 * Renders the card on a full-resolution canvas (scaled down via CSS for the
 * preview) and offers native share / PNG download / clipboard copy. All
 * rendering is client-side; see src/utils/shareCard/.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Group,
  LoadingOverlay,
  Modal,
  SegmentedControl,
  Slider,
  Stack,
  Switch,
  Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { CopySimple, DownloadSimple, ShareNetwork } from '@phosphor-icons/react';
import {
  CARD_DIMENSIONS,
  hasRoutePolyline,
  renderShareCard,
  type CardFormat,
  type ShareCardMetrics,
} from '../utils/shareCard/renderShareCard';
import type { CardTheme } from '../utils/shareCard/staticMap';
import {
  canvasToBlob,
  copyBlobToClipboard,
  downloadBlob,
  getShareCapabilities,
  shareCardBlob,
  shareCardFilename,
} from '../utils/shareCard/shareOrDownload';
import { trackFeature, EventType } from '../utils/activityTracking';

const RENDER_DEBOUNCE_MS = 300;
const DEFAULT_TRIM_M = 200;

interface ShareCardModalProps {
  opened: boolean;
  onClose: () => void;
  /** Raw activities row — shape is untyped upstream (src/types/database.ts is stale). */
  ride: Record<string, any> | null;
  /** The sanitized metrics memo from RideAnalysisModal — do not recompute. */
  metrics: ShareCardMetrics | null;
  formatDistance?: (km: number) => string;
  formatElevation?: (m: number) => string;
  formatSpeed?: (kmh: number) => string;
}

const ShareCardModal = ({
  opened,
  onClose,
  ride,
  metrics,
  formatDistance,
  formatElevation,
  formatSpeed,
}: ShareCardModalProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hasGps = useMemo(() => hasRoutePolyline(ride), [ride]);

  const [format, setFormat] = useState<CardFormat>('portrait');
  const [theme, setTheme] = useState<CardTheme>('dark');
  const [showMap, setShowMap] = useState(true);
  const [trim_m, setTrim_m] = useState(DEFAULT_TRIM_M);
  const [rendering, setRendering] = useState(false);
  const [mapFellBack, setMapFellBack] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);

  const capabilities = useMemo(() => getShareCapabilities(), []);
  const filename = useMemo(
    () => shareCardFilename(ride?.name, ride?.start_date_local),
    [ride],
  );

  useEffect(() => {
    if (opened && ride?.id) {
      trackFeature(EventType.SHARE_CARD_OPEN, { activityId: ride.id });
    }
  }, [opened, ride?.id]);

  // Re-render the card (debounced — every option change with the map on is a
  // fresh Mapbox Static Images request; identical URLs hit the browser cache).
  useEffect(() => {
    if (!opened || !ride) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    let cancelled = false;
    setRendering(true);
    setExportError(null);
    setBlob(null);

    const timer = setTimeout(async () => {
      try {
        const result = await renderShareCard(canvas, {
          ride,
          metrics,
          formatDistance,
          formatElevation,
          formatSpeed,
          theme,
          format,
          showMap: showMap && hasGps,
          trim_m,
        });
        if (cancelled) return;
        setMapFellBack(result.mapFellBack);
        // Cache the blob now so Share runs inside the click's user gesture
        // with no async gap (iOS requirement).
        const nextBlob = await canvasToBlob(canvas);
        if (cancelled) return;
        setBlob(nextBlob);
      } catch (err) {
        if (cancelled) return;
        const isTainted = err instanceof DOMException && err.name === 'SecurityError';
        setExportError(
          isTainted
            ? 'The map image could not be exported securely. Try "Show map" off for a stats-only card.'
            : 'Could not generate the share image. Please try again.',
        );
      } finally {
        if (!cancelled) setRendering(false);
      }
    }, RENDER_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [opened, ride, metrics, formatDistance, formatElevation, formatSpeed, theme, format, showMap, hasGps, trim_m]);

  const handleShare = async () => {
    if (!blob) return;
    try {
      const result = await shareCardBlob(blob, filename);
      if (result === 'shared') {
        trackFeature(EventType.SHARE_CARD_SHARE, { activityId: ride?.id, format, theme });
      } else if (result === 'unsupported') {
        downloadBlob(blob, filename);
        trackFeature(EventType.SHARE_CARD_DOWNLOAD, { activityId: ride?.id, format, theme });
      }
    } catch {
      notifications.show({ color: 'red', title: 'Share failed', message: 'Downloading the image instead.' });
      downloadBlob(blob, filename);
    }
  };

  const handleDownload = () => {
    if (!blob) return;
    downloadBlob(blob, filename);
    trackFeature(EventType.SHARE_CARD_DOWNLOAD, { activityId: ride?.id, format, theme });
  };

  const handleCopy = async () => {
    if (!blob) return;
    try {
      await copyBlobToClipboard(blob);
      notifications.show({ color: 'teal', title: 'Copied', message: 'Share card copied to clipboard.' });
      trackFeature(EventType.SHARE_CARD_COPY, { activityId: ride?.id, format, theme });
    } catch {
      notifications.show({ color: 'red', title: 'Copy failed', message: 'Try Download instead.' });
    }
  };

  const dims = CARD_DIMENSIONS[format];

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={<Text fw={700}>Share this {ride?.sport_type?.toLowerCase?.().includes('run') ? 'run' : 'ride'}</Text>}
      size="lg"
      centered
    >
      <Stack gap="md">
        <Group gap="md" wrap="wrap">
          <SegmentedControl
            value={format}
            onChange={(v) => setFormat(v as CardFormat)}
            data={[
              { label: 'Post 4:5', value: 'portrait' },
              { label: 'Story 9:16', value: 'story' },
            ]}
          />
          <SegmentedControl
            value={theme}
            onChange={(v) => setTheme(v as CardTheme)}
            data={[
              { label: 'Dark', value: 'dark' },
              { label: 'Light', value: 'light' },
            ]}
          />
          <Switch
            label="Show map"
            checked={showMap && hasGps}
            onChange={(e) => setShowMap(e.currentTarget.checked)}
            disabled={!hasGps}
            description={hasGps ? undefined : 'No GPS data for this activity'}
          />
        </Group>

        {showMap && hasGps && (
          <Box>
            <Text size="sm" fw={500} mb={4}>
              Privacy trim
            </Text>
            <Text size="xs" c="dimmed" mb="xs">
              Hides this many meters at the start and end of the route.
            </Text>
            <Slider
              value={trim_m}
              onChange={setTrim_m}
              min={0}
              max={1000}
              step={50}
              label={(v) => `${v} m`}
              marks={[
                { value: 0, label: '0' },
                { value: 250, label: '250 m' },
                { value: 500, label: '500 m' },
                { value: 1000, label: '1 km' },
              ]}
              mb="lg"
            />
          </Box>
        )}

        {mapFellBack && showMap && hasGps && (
          <Alert color="yellow" variant="light" p="xs">
            <Text size="xs">The route map couldn&apos;t be loaded — showing a stats-only card.</Text>
          </Alert>
        )}
        {exportError && (
          <Alert color="red" variant="light" p="xs">
            <Text size="xs">{exportError}</Text>
          </Alert>
        )}

        <Box
          pos="relative"
          style={{
            border: '1px solid var(--color-border)',
            background: 'var(--color-bg)',
            // Keep the preview area stable across format switches.
            maxWidth: format === 'story' ? 360 : 480,
            margin: '0 auto',
            width: '100%',
          }}
        >
          <LoadingOverlay visible={rendering} zIndex={10} overlayProps={{ blur: 1 }} />
          <canvas
            ref={canvasRef}
            width={dims.width_px}
            height={dims.height_px}
            style={{ display: 'block', width: '100%', height: 'auto' }}
          />
        </Box>

        <Group justify="flex-end" gap="xs">
          {capabilities.canCopyImage && (
            <Button
              variant="light"
              color="gray"
              leftSection={<CopySimple size={16} />}
              onClick={handleCopy}
              disabled={!blob || rendering}
            >
              Copy image
            </Button>
          )}
          <Button
            variant="light"
            color="teal"
            leftSection={<DownloadSimple size={16} />}
            onClick={handleDownload}
            disabled={!blob || rendering}
          >
            Download PNG
          </Button>
          {capabilities.canShareFiles && (
            <Button
              color="teal"
              leftSection={<ShareNetwork size={16} />}
              onClick={handleShare}
              disabled={!blob || rendering}
            >
              Share
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
};

export default ShareCardModal;
