import { Box, Group, Stack } from '@mantine/core';
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
  const sections = useProgressSectionsData();
  const hasStrava = activities?.some((a) => a.provider === 'strava');
  const hasGarmin = activities?.some((a) => a.provider === 'garmin');

  return (
    <Stack gap={40}>
      <ProgressSection title="Fitness">
        <TrendsSection
          dailyTSSData={dailyTSSData}
          trainingMetrics={trainingMetrics}
          activities={activities}
          speedProfile={speedProfile}
          formatElev={formatElev}
          isImperial={isImperial}
        />
      </ProgressSection>

      <ProgressSection title="This year">
        <Stack gap="lg">
          <ProgressDataStatus data={sections} />
          <YearBlock data={sections} />
          <PersonalRecordsCard rides={activities} formatDistance={formatDist} formatElevation={formatElev} />
        </Stack>
      </ProgressSection>

      <ProgressSection title="Zones">
        <Stack gap="lg">
          <ZonesBlock data={sections} />
          <KeyTrendsBlock data={sections} />
        </Stack>
      </ProgressSection>

      <ProgressSection title="Power">
        <PowerSection ftp={ftp} powerZones={powerZones} navigate={navigate} activities={activities} weight={weight} />
      </ProgressSection>

      <ProgressSection title="Health & durability">
        <Stack gap="xl">
          <HealthTrendsChart data={healthHistory} onOpenCheckIn={onOpenCheckIn} />
          <AerobicDecoupling activities={activities} timeRange={90} />
        </Stack>
      </ProgressSection>

      <ProgressSection title="History">
        <HistoricalInsights userId={userId} activities={activities} ftp={ftp} />
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
