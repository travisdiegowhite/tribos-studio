/**
 * RideMapCard — the ride map on /train.
 *
 * One card, two jobs: above the tab strip it is the "Latest ride" hero, and
 * once the athlete picks a row on HISTORY it is that ride. The page owns which
 * ride is shown; this card owns the chrome, the prev/next controls, the
 * "Full analysis" door into RideAnalysisModal and, on phones, whether the
 * (WebGL-heavy) map is mounted at all.
 *
 * The map itself is ColoredRouteMap, keyed by ride id: its colour mode and
 * camera are initialised once per mount, so switching rides remounts it.
 */

import { useEffect, useMemo, useState } from 'react';
import { ActionIcon, Box, Button, Group, Skeleton, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { CaretLeft, CaretRight, ChartBar } from '@phosphor-icons/react';
import ColoredRouteMap from '../ColoredRouteMap';
import { MetricCitation } from '../ui/MetricCitation';
import { rideRouteCoords, rideStreamsOf, sanitizedMaxHr } from '../../utils/rideGeo';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const OPEN_STORAGE_KEY = 'tribos-train-ride-map-open';
const MOBILE_MAP_HEIGHT = 260;
const DESKTOP_MAP_HEIGHT = 440;

const eyebrowStyle = {
  fontFamily: "'DM Mono', monospace",
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: '2px',
  textTransform: 'uppercase',
  color: 'var(--color-text-muted)',
};

const linkButtonStyle = {
  fontFamily: "'DM Mono', monospace",
  fontSize: 11,
  letterSpacing: '1.5px',
  textTransform: 'uppercase',
  color: 'var(--color-text-muted)',
  textDecoration: 'underline',
  textUnderlineOffset: 3,
};

function readStoredOpen() {
  try {
    return localStorage.getItem(OPEN_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeStoredOpen(open) {
  try {
    localStorage.setItem(OPEN_STORAGE_KEY, open ? '1' : '0');
  } catch {
    /* private mode — the preference just doesn't stick */
  }
}

// The same column fallbacks RideHistoryTable uses, so the card and the row
// beneath it never disagree about a ride's numbers.
const distanceKmOf = (r) => r.distance_km || (r.distance ? r.distance / 1000 : 0);
const elevationMOf = (r) => r.elevation_gain_m || r.total_elevation_gain || 0;
const durationSecOf = (r) => r.duration_seconds || r.moving_time || r.elapsed_time || 0;

function formatRideDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * @param {object} props
 * @param {object|null} props.ride            The activities row to draw.
 * @param {number|null} props.ftp
 * @param {(km: number) => string} props.formatDistance
 * @param {(m: number) => string} props.formatElevation
 * @param {(s: number) => string} props.formatTime
 * @param {() => void} props.onNewer         Step to the next-newer GPS ride.
 * @param {() => void} props.onOlder         Step to the next-older GPS ride.
 * @param {boolean} props.hasNewer
 * @param {boolean} props.hasOlder
 * @param {(ride: object) => void} props.onFullAnalysis  Opens RideAnalysisModal.
 * @param {string} [props.title]            Eyebrow: 'Latest ride' / 'Selected ride'.
 * @param {boolean} [props.loading]
 * @param {number} [props.openSignal]       Bump to expand the map on phones (a
 *                                          history row was tapped).
 */
function RideMapCard({
  ride,
  ftp,
  formatDistance,
  formatElevation,
  formatTime,
  onNewer,
  onOlder,
  hasNewer,
  hasOlder,
  onFullAnalysis,
  title = 'Latest ride',
  loading = false,
  openSignal = 0,
}) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  // Phones start collapsed so the map's WebGL cost is only paid on request;
  // desktop always shows it. The phone choice is remembered per browser.
  const [open, setOpen] = useState(readStoredOpen);

  useEffect(() => {
    if (openSignal > 0) {
      setOpen(true);
      writeStoredOpen(true);
    }
  }, [openSignal]);

  const toggleOpen = () => {
    setOpen((prev) => {
      writeStoredOpen(!prev);
      return !prev;
    });
  };

  const metrics = useMemo(() => {
    if (!ride) return [];
    const chips = [
      { label: 'DISTANCE', value: formatDistance(distanceKmOf(ride)) },
      { label: 'ELEVATION', value: formatElevation(elevationMOf(ride)) },
      { label: 'TIME', value: formatTime(durationSecOf(ride)) },
    ];
    if (ride.average_watts > 0) chips.push({ label: 'AVG', value: `${Math.round(ride.average_watts)}W` });
    if (ride.average_heartrate > 0) chips.push({ label: 'HR', value: `${Math.round(ride.average_heartrate)} bpm` });
    return chips;
  }, [ride, formatDistance, formatElevation, formatTime]);

  if (loading) {
    return <Skeleton height={isMobile ? 120 : DESKTOP_MAP_HEIGHT + 96} radius={0} />;
  }
  if (!ride) return null;

  const showMap = !isMobile || open;
  const mapHeight = isMobile ? MOBILE_MAP_HEIGHT : DESKTOP_MAP_HEIGHT;

  return (
    <Box
      id="train-ride-map"
      data-testid="ride-map-card"
      style={{
        border: '0.5px solid var(--color-border)',
        backgroundColor: 'var(--color-card)',
        scrollMarginTop: 72, // below the fixed main nav
      }}
    >
      <Box style={{ padding: '14px 16px 12px' }}>
        <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
          <Box style={{ minWidth: 0, flex: 1 }}>
            <Text style={eyebrowStyle} mb={6}>
              {title}
            </Text>
            <MetricCitation
              sentence={ride.name || 'Untitled ride'}
              color="var(--color-text-primary)"
              metrics={metrics}
              receipt={formatRideDate(ride.start_date || ride.recorded_at)}
              sentenceStyle={{
                fontSize: isMobile ? 16 : 18,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              chipStyle={{ fontFamily: "'DM Mono', monospace", color: 'var(--color-text-muted)', flexWrap: 'wrap' }}
            />
          </Box>

          <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
            <Tooltip label="Older ride">
              <ActionIcon
                variant="default"
                radius={0}
                size="md"
                aria-label="Older ride"
                disabled={!hasOlder}
                onClick={onOlder}
              >
                <CaretLeft size={14} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Newer ride">
              <ActionIcon
                variant="default"
                radius={0}
                size="md"
                aria-label="Newer ride"
                disabled={!hasNewer}
                onClick={onNewer}
              >
                <CaretRight size={14} />
              </ActionIcon>
            </Tooltip>
            <Button
              size="xs"
              variant="light"
              color="teal"
              radius={0}
              leftSection={<ChartBar size={14} />}
              onClick={() => onFullAnalysis?.(ride)}
            >
              Full analysis
            </Button>
          </Group>
        </Group>

        {isMobile && (
          <UnstyledButton
            onClick={toggleOpen}
            aria-expanded={open}
            style={{ ...linkButtonStyle, marginTop: 10 }}
          >
            {open ? 'Hide map' : 'Show map'}
          </UnstyledButton>
        )}
      </Box>

      {showMap && (
        MAPBOX_TOKEN ? (
          <ColoredRouteMap
            key={ride.id}
            activityStreams={rideStreamsOf(ride)}
            routeCoords={rideRouteCoords(ride)}
            ftp={ftp}
            maxHr={sanitizedMaxHr(ride)}
            frameless
            height={mapHeight}
            showStrip={!isMobile}
          />
        ) : (
          <Box p="md" style={{ borderTop: '0.5px solid var(--color-border)' }}>
            <Text style={eyebrowStyle}>Map requires configuration</Text>
          </Box>
        )
      )}
    </Box>
  );
}

export default RideMapCard;
