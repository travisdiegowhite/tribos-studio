import { useMemo, useState } from 'react';
import { Box, Group, SegmentedControl, Stack } from '@mantine/core';
import AerobicDecoupling from '../AerobicDecoupling.jsx';
import { PoweredByGarmin } from '../GarminBranding';
import HealthTrendsChart from '../HealthTrendsChart.jsx';
import HistoricalInsights from '../HistoricalInsights.jsx';
import PersonalRecordsCard from '../PersonalRecordsCard.jsx';
import { PoweredByStrava } from '../StravaBranding';
import PowerSection from './PowerSection.jsx';
import {
  KeyTrendsBlock,
  ProgressDataStatus,
  SegmentsBlock,
  YearBlock,
  ZonesBlock,
  useProgressSectionsData,
} from './ProgressSections.jsx';
import { ProgressSection } from './progressUi.jsx';
import TrendsSection from './TrendsSection.jsx';
import PaceSection from './PaceSection.jsx';
import { getActivitySport, isPowerSport } from '../../utils/sportType';

const SPORT_FILTER_KEY = 'tribos.progress.sport';
const SPORT_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'cycling', label: 'Ride' },
  { value: 'running', label: 'Run' },
];

function readStoredSport() {
  try {
    const v = window.localStorage.getItem(SPORT_FILTER_KEY);
    return v === 'cycling' || v === 'running' ? v : 'all';
  } catch {
    return 'all';
  }
}

/**
 * The Progress tab on /train, one ruled sheet in the ink-zine style:
 * fitness, this year, zones, power, health & durability, history, segments.
 * See trainTabs.ts and progressUi.jsx.
 */
export default function ProgressTab({
  dailyTSSData,
  trainingMetrics,
  activities,
  speedProfile,
  formatDist,
  formatElev,
  isImperial,
  ftp,
  weight,
  healthHistory,
  onOpenCheckIn,
  powerZones,
  navigate,
  userId,
}) {
  // All / Ride / Run (multisport phase 4). Offered only to athletes with
  // both sports; everyone else sees exactly what they saw before.
  const sportsPresent = useMemo(() => {
    const set = new Set((activities || []).map((a) => getActivitySport(a)));
    return { cycling: set.has('cycling'), running: set.has('running') };
  }, [activities]);
  const isHybrid = sportsPresent.cycling && sportsPresent.running;
  const [storedSport, setStoredSport] = useState(readStoredSport);
  const sport = isHybrid ? storedSport : sportsPresent.running && !sportsPresent.cycling ? 'running' : 'all';
  const changeSport = (v) => {
    setStoredSport(v);
    try {
      window.localStorage.setItem(SPORT_FILTER_KEY, v);
    } catch {
      /* per-viewer convenience only */
    }
  };

  const shown = useMemo(
    () => (sport === 'all' ? activities || [] : (activities || []).filter((a) => getActivitySport(a) === sport)),
    [activities, sport],
  );
  // Power analysis is for power sports only: a footpod's watts are not
  // comparable to cycling FTP.
  const powerActivities = useMemo(() => shown.filter((a) => isPowerSport(a)), [shown]);
  const rideRecords = useMemo(() => shown.filter((a) => getActivitySport(a) !== 'running'), [shown]);
  const runRecords = useMemo(() => shown.filter((a) => getActivitySport(a) === 'running'), [shown]);
  const showPower = sport !== 'running';
  const showPace = sport === 'running' || (sport === 'all' && sportsPresent.running);

  const sections = useProgressSectionsData(sport);
  const hasStrava = activities?.some((a) => a.provider === 'strava');
  const hasGarmin = activities?.some((a) => a.provider === 'garmin');

  return (
    <Stack gap={40}>
      {isHybrid && (
        <Group justify="flex-end" mb={-24}>
          <SegmentedControl
            data-testid="progress-sport-filter"
            size="xs"
            radius={0}
            value={sport}
            onChange={changeSport}
            data={SPORT_OPTIONS}
            styles={{ label: { fontFamily: 'var(--font-mono)' } }}
          />
        </Group>
      )}

      <ProgressSection title="Fitness">
        <TrendsSection
          dailyTSSData={dailyTSSData}
          trainingMetrics={trainingMetrics}
          activities={shown}
          speedProfile={speedProfile}
          formatElev={formatElev}
          isImperial={isImperial}
          sport={sport}
          loadSplit={sections.loadSplit}
        />
      </ProgressSection>

      <ProgressSection title="This year">
        <Stack gap="lg">
          <ProgressDataStatus data={sections} />
          <YearBlock data={sections} />
          {sport !== 'running' && (
            <PersonalRecordsCard rides={rideRecords} formatDistance={formatDist} formatElevation={formatElev} />
          )}
          {runRecords.length > 0 && (
            <PersonalRecordsCard rides={runRecords} formatDistance={formatDist} formatElevation={formatElev} noun="run" />
          )}
        </Stack>
      </ProgressSection>

      <ProgressSection title="Zones">
        <Stack gap="lg">
          <ZonesBlock data={sections} />
          <KeyTrendsBlock data={sections} />
        </Stack>
      </ProgressSection>

      {showPace && (
        <ProgressSection title="Pace">
          {!sections.loading && <PaceSection activities={sections.activities} isImperial={isImperial} />}
        </ProgressSection>
      )}

      {showPower && (
        <ProgressSection title="Power">
          <PowerSection ftp={ftp} powerZones={powerZones} navigate={navigate} activities={powerActivities} weight={weight} />
        </ProgressSection>
      )}

      <ProgressSection title="Health & durability">
        <Stack gap="xl">
          <HealthTrendsChart data={healthHistory} onOpenCheckIn={onOpenCheckIn} />
          {showPower && <AerobicDecoupling activities={powerActivities} timeRange={90} />}
        </Stack>
      </ProgressSection>

      <ProgressSection title="History">
        <HistoricalInsights userId={userId} activities={shown} ftp={ftp} />
      </ProgressSection>

      <ProgressSection title="Segments">
        <SegmentsBlock data={sections} />
      </ProgressSection>

      {(hasStrava || hasGarmin) && (
        <Box style={{ borderTop: '1px solid var(--color-border)', paddingTop: 12 }}>
          <Group gap="md">
            {hasStrava && <PoweredByStrava variant="light" size="sm" />}
            {hasGarmin && <PoweredByGarmin variant="light" size="sm" />}
          </Group>
        </Box>
      )}
    </Stack>
  );
}
