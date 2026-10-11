import { Stack } from '@mantine/core';
import HistoricalInsights from '../HistoricalInsights.jsx';
import PowerSection from './PowerSection.jsx';
import ProgressSections from './ProgressSections.jsx';
import TrendsSection from './TrendsSection.jsx';

/**
 * The Progress tab on /train: fitness, then the year (zones, key trends, year
 * to date, segments), then power, then insights. See trainTabs.ts.
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
  return (
    <Stack gap="xl">
      <TrendsSection
        dailyTSSData={dailyTSSData}
        trainingMetrics={trainingMetrics}
        activities={activities}
        speedProfile={speedProfile}
        formatDist={formatDist}
        formatElev={formatElev}
        isImperial={isImperial}
        ftp={ftp}
        weight={weight}
        healthHistory={healthHistory}
        onOpenCheckIn={onOpenCheckIn}
      />
      <ProgressSections />
      <PowerSection ftp={ftp} powerZones={powerZones} navigate={navigate} activities={activities} weight={weight} />
      <HistoricalInsights userId={userId} activities={activities} ftp={ftp} />
    </Stack>
  );
}
