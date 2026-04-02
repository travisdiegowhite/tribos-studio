import { useState, useMemo } from 'react';
import { Box, Paper, Stack, Text, Badge, Group, Divider, Tooltip, Collapse, UnstyledButton } from '@mantine/core';
import { CaretDown, CaretUp, Clock, Drop, Fire, Lightning, Mountains, Path, Timer, Trophy, Warning, Wind } from '@phosphor-icons/react';
import { tokens } from '../../theme';
import { calculateFuelPlan } from '../../utils/fueling';
import { RACE_TYPE_MAP } from '../../utils/raceTypes';

/**
 * Warmup protocols by race type (minutes and description)
 */
const WARMUP_PROTOCOLS = {
  criterium: { minutes: 25, description: 'Progressive warm-up with 2-3 hard efforts (30s at race pace). Criteriums start fast.' },
  time_trial: { minutes: 30, description: 'Extended warm-up with 2x 5-min tempo efforts and 2x 30s at threshold. Peak readiness at start.' },
  road_race: { minutes: 20, description: 'Easy spin with 3-4 short accelerations. Conserve energy for the race.' },
  gran_fondo: { minutes: 15, description: 'Easy 15-min spin. The first 30 min of the ride is your warm-up.' },
  century: { minutes: 10, description: 'Light spin. Pace yourself — it is a long day.' },
  gravel: { minutes: 15, description: 'Easy spin with a few accelerations. Gravel starts can be chaotic.' },
  cyclocross: { minutes: 30, description: 'Full warm-up with race-pace intervals. CX starts are maximal.' },
  mtb: { minutes: 20, description: 'Progressive warm-up with 2-3 punchy efforts to open the legs.' },
  triathlon: { minutes: 10, description: 'Light spin on trainer if possible. You are already warmed up from the swim.' },
  other: { minutes: 15, description: 'Easy 15-min progressive spin with a few accelerations.' },
};

/**
 * Pre-race meal guidance by race type
 */
const PRE_RACE_NOTES = {
  criterium: 'Lighter pre-race meal — criteriums are high-intensity. Avoid heavy fiber.',
  time_trial: 'Standard pre-race meal. Have a gel 10 min before start.',
  road_race: 'Full pre-race meal. Top off with a gel/bar 30 min before.',
  gran_fondo: 'Heavier carb loading — you need deep glycogen stores.',
  century: 'Heavier carb loading. Eat breakfast you have tested before.',
  gravel: 'Full pre-race meal. Pack extra food — aid stations may be sparse.',
  cyclocross: 'Light meal — CX races are short and intense.',
  mtb: 'Standard pre-race meal. Consider altitude if racing at elevation.',
  triathlon: 'Race-tested breakfast 3-4h before. Nothing new on race day.',
  other: 'Standard pre-race meal with familiar foods.',
};

/**
 * Classify a segment for pacing cues
 */
function classifySegment(grade, cumulativeKm, totalKm) {
  const progress = totalKm > 0 ? cumulativeKm / totalKm : 0;

  if (grade > 4) return { type: 'climb', label: 'Climb', color: tokens.colors.zone4, cue: progress < 0.3 ? 'Conserve — long way to go' : 'Steady effort' };
  if (grade > 2) return { type: 'rise', label: 'Rise', color: tokens.colors.zone3, cue: 'Controlled tempo' };
  if (grade < -3) return { type: 'descent', label: 'Descent', color: 'var(--color-teal)', cue: 'Recover & hydrate' };
  if (grade < -1) return { type: 'downhill', label: 'Gentle down', color: 'var(--color-teal)', cue: 'Easy spin, eat here' };
  if (progress > 0.75) return { type: 'flat', label: 'Flat', color: tokens.colors.zone2, cue: 'Push — finish is close' };
  return { type: 'flat', label: 'Flat', color: tokens.colors.zone1, cue: 'Steady pace' };
}

/**
 * Format seconds to "Xh Ym" or "Ym" string
 */
function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * Build consolidated race segments from raw ETA segments
 * Groups many small segments into ~8-15 meaningful chunks
 */
function buildRaceSegments(segments, totalDistanceKm, fuelIntervalMinutes) {
  if (!segments || segments.length === 0) return [];

  const TARGET_SEGMENTS = Math.max(6, Math.min(15, Math.round(totalDistanceKm / 5)));
  const chunkSize = Math.max(1, Math.floor(segments.length / TARGET_SEGMENTS));

  const raceSegments = [];
  let nextFuelTime = fuelIntervalMinutes * 60; // first fuel point

  for (let i = 0; i < segments.length; i += chunkSize) {
    const chunk = segments.slice(i, i + chunkSize);
    const totalDist = chunk.reduce((s, seg) => s + seg.segmentKm, 0);
    const totalSec = chunk.reduce((s, seg) => s + seg.seconds, 0);
    const avgGrade = chunk.reduce((s, seg) => s + seg.grade * seg.segmentKm, 0) / (totalDist || 1);
    const lastSeg = chunk[chunk.length - 1];
    const cumSeconds = lastSeg.cumulativeSeconds;
    const cumKm = lastSeg.distanceKm;

    const classification = classifySegment(avgGrade, cumKm, totalDistanceKm);

    // Check if this segment should have a fuel marker
    const shouldFuel = cumSeconds >= nextFuelTime;
    if (shouldFuel) {
      nextFuelTime = cumSeconds + fuelIntervalMinutes * 60;
    }

    raceSegments.push({
      distanceKm: Math.round(totalDist * 10) / 10,
      cumulativeKm: Math.round(cumKm * 10) / 10,
      avgGrade: Math.round(avgGrade * 10) / 10,
      avgSpeed: totalSec > 0 ? Math.round((totalDist / totalSec) * 3600 * 10) / 10 : 0,
      seconds: Math.round(totalSec),
      cumulativeSeconds: cumSeconds,
      ...classification,
      fuelHere: shouldFuel,
    });
  }

  return raceSegments;
}

/**
 * RaceDayGuide — comprehensive race-day planning panel
 */
export default function RaceDayGuide({
  routeStats,
  personalizedETA,
  raceType,
  raceDate,
  targetFinishMinutes,
  weatherData,
  useImperial = false,
}) {
  const [expandedSection, setExpandedSection] = useState('segments');

  const fuelPlan = useMemo(() => {
    if (!routeStats?.duration) return null;
    return calculateFuelPlan({
      durationMinutes: routeStats.duration,
      intensity: 'race',
      weather: weatherData ? {
        temperatureCelsius: weatherData.temperature,
        humidity: weatherData.humidity,
      } : undefined,
      elevationGainMeters: routeStats.elevation || 0,
      isRaceDay: true,
    });
  }, [routeStats?.duration, routeStats?.elevation, weatherData]);

  const raceSegments = useMemo(() => {
    if (!personalizedETA?.segments?.length || !routeStats?.distance) return [];
    const fuelInterval = fuelPlan?.frequency?.intervalMinutes?.min || 20;
    return buildRaceSegments(personalizedETA.segments, routeStats.distance, fuelInterval);
  }, [personalizedETA?.segments, routeStats?.distance, fuelPlan]);

  if (!routeStats?.distance || !routeStats?.duration) return null;

  const raceLabel = RACE_TYPE_MAP[raceType] || 'Race';
  const warmup = WARMUP_PROTOCOLS[raceType] || WARMUP_PROTOCOLS.other;
  const preRaceNote = PRE_RACE_NOTES[raceType] || PRE_RACE_NOTES.other;

  const distLabel = useImperial
    ? `${(routeStats.distance * 0.621371).toFixed(1)} mi`
    : `${routeStats.distance.toFixed(1)} km`;
  const elevLabel = useImperial
    ? `${Math.round(routeStats.elevation * 3.28084)} ft`
    : `${routeStats.elevation}m`;

  const etaFormatted = personalizedETA?.formattedTime || `${Math.floor(routeStats.duration / 60)}h ${routeStats.duration % 60}m`;
  const targetFormatted = targetFinishMinutes
    ? `${Math.floor(targetFinishMinutes / 60)}h ${targetFinishMinutes % 60}m`
    : null;

  const toggleSection = (section) => {
    setExpandedSection(prev => prev === section ? null : section);
  };

  return (
    <Paper
      p="md"
      style={{
        backgroundColor: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-border)',
        borderRadius: 0,
      }}
    >
      <Stack gap="sm">
        {/* Header */}
        <Group justify="space-between" align="center">
          <Group gap="xs">
            <Trophy size={18} weight="bold" style={{ color: tokens.colors.terracotta }} />
            <Text size="sm" fw={700} style={{ color: 'var(--color-text-primary)', fontFamily: "'Barlow Condensed', sans-serif", textTransform: 'uppercase', letterSpacing: '1px' }}>
              Race Day Guide
            </Text>
          </Group>
          <Badge size="xs" variant="filled" color="terracotta">
            {raceLabel}
          </Badge>
        </Group>

        {/* Race Summary */}
        <Box
          style={{
            backgroundColor: 'var(--tribos-bg-elevated)',
            padding: '10px 12px',
            border: '1px solid var(--color-border)',
          }}
        >
          <Group justify="space-between">
            <Group gap="lg">
              <Box style={{ textAlign: 'center' }}>
                <Text size="xs" c="dimmed">Distance</Text>
                <Text size="sm" fw={700} style={{ fontFamily: "'DM Mono', monospace" }}>{distLabel}</Text>
              </Box>
              <Box style={{ textAlign: 'center' }}>
                <Text size="xs" c="dimmed">Elevation</Text>
                <Text size="sm" fw={700} style={{ fontFamily: "'DM Mono', monospace" }}>{elevLabel} ↗</Text>
              </Box>
              <Box style={{ textAlign: 'center' }}>
                <Text size="xs" c="dimmed">Race ETA</Text>
                <Text size="sm" fw={700} style={{ fontFamily: "'DM Mono', monospace", color: tokens.colors.terracotta }}>{etaFormatted}</Text>
              </Box>
              {targetFormatted && (
                <Box style={{ textAlign: 'center' }}>
                  <Text size="xs" c="dimmed">Target</Text>
                  <Text size="sm" fw={700} style={{ fontFamily: "'DM Mono', monospace", color: 'var(--color-teal)' }}>{targetFormatted}</Text>
                </Box>
              )}
            </Group>
          </Group>
        </Box>

        <Divider color="var(--color-border)" />

        {/* Section: Segment Breakdown */}
        <SectionHeader
          icon={<Path size={16} />}
          title="Segment Breakdown"
          expanded={expandedSection === 'segments'}
          onClick={() => toggleSection('segments')}
        />
        <Collapse in={expandedSection === 'segments'}>
          {raceSegments.length > 0 ? (
            <Stack gap={4}>
              {raceSegments.map((seg, i) => (
                <Box
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 8px',
                    backgroundColor: i % 2 === 0 ? 'var(--tribos-bg-elevated)' : 'transparent',
                    borderLeft: `3px solid ${seg.color}`,
                  }}
                >
                  <Text size="xs" fw={600} style={{ fontFamily: "'DM Mono', monospace", minWidth: 45, color: seg.color }}>
                    {seg.cumulativeKm}{useImperial ? 'mi' : 'km'}
                  </Text>
                  <Badge size="xs" variant="light" color={seg.type === 'climb' || seg.type === 'rise' ? 'orange' : seg.type === 'descent' || seg.type === 'downhill' ? 'teal' : 'gray'}>
                    {seg.avgGrade > 0 ? '+' : ''}{seg.avgGrade}%
                  </Badge>
                  <Text size="xs" c="dimmed" style={{ flex: 1 }}>
                    {seg.cue}
                  </Text>
                  <Text size="xs" style={{ fontFamily: "'DM Mono', monospace", color: 'var(--color-text-secondary)' }}>
                    {formatTime(seg.cumulativeSeconds)}
                  </Text>
                  {seg.fuelHere && (
                    <Tooltip label="Fuel zone — eat/drink here">
                      <Badge size="xs" variant="filled" color="yellow" style={{ cursor: 'help' }}>
                        FUEL
                      </Badge>
                    </Tooltip>
                  )}
                </Box>
              ))}
            </Stack>
          ) : (
            <Text size="xs" c="dimmed">Segment data available after route elevation is loaded.</Text>
          )}
        </Collapse>

        <Divider color="var(--color-border)" />

        {/* Section: Pre-Race Nutrition */}
        <SectionHeader
          icon={<Fire size={16} />}
          title="Pre-Race Nutrition"
          expanded={expandedSection === 'nutrition'}
          onClick={() => toggleSection('nutrition')}
        />
        <Collapse in={expandedSection === 'nutrition'}>
          {fuelPlan ? (
            <Stack gap="xs">
              <NutritionTimelineItem
                time={`${fuelPlan.preRide.timingHours}h before`}
                description={`${fuelPlan.preRide.carbsGramsMin}-${fuelPlan.preRide.carbsGramsMax}g carbs — oatmeal, rice, toast, banana`}
                icon={<Clock size={14} />}
              />
              <NutritionTimelineItem
                time="2h before"
                description="Light snack if needed — banana, energy bar, or white bread with jam"
                icon={<Clock size={14} />}
              />
              <NutritionTimelineItem
                time="30 min before"
                description="1 gel + small sips of water. Top off glycogen stores."
                icon={<Clock size={14} />}
              />
              <NutritionTimelineItem
                time="10 min before"
                description="Final sip of sports drink. Deep breaths."
                icon={<Timer size={14} />}
              />
              <Box
                mt={4}
                p="xs"
                style={{
                  backgroundColor: 'var(--tribos-bg-elevated)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <Text size="xs" c="dimmed" fs="italic">{preRaceNote}</Text>
              </Box>
            </Stack>
          ) : (
            <Text size="xs" c="dimmed">Calculating...</Text>
          )}
        </Collapse>

        <Divider color="var(--color-border)" />

        {/* Section: Race Day Logistics */}
        <SectionHeader
          icon={<Lightning size={16} />}
          title="Race Day Logistics"
          expanded={expandedSection === 'logistics'}
          onClick={() => toggleSection('logistics')}
        />
        <Collapse in={expandedSection === 'logistics'}>
          <Stack gap="xs">
            {/* Warmup */}
            <LogisticsItem
              label="Warm-up"
              value={`${warmup.minutes} min`}
              detail={warmup.description}
            />

            {/* Bottles & Gels */}
            {fuelPlan && (
              <>
                <LogisticsItem
                  label="Bottles needed"
                  value={`${fuelPlan.bottlesNeeded} x 750ml`}
                  detail={fuelPlan.bottlesNeeded > 2
                    ? `You will need to refill. Plan for ${Math.ceil(fuelPlan.bottlesNeeded / 2)} refill stops.`
                    : 'Should be sufficient without refills.'}
                />
                <LogisticsItem
                  label="Gels / food"
                  value={`${fuelPlan.gelsEquivalent.min}-${fuelPlan.gelsEquivalent.max} gels equiv.`}
                  detail={`${fuelPlan.carbs.gramsPerHourMin}-${fuelPlan.carbs.gramsPerHourMax}g carbs/hr. Start fueling at ${fuelPlan.frequency.startEatingMinutes} min. Every ${fuelPlan.frequency.intervalMinutes.min}-${fuelPlan.frequency.intervalMinutes.max} min.`}
                />
                <LogisticsItem
                  label="Hydration"
                  value={useImperial ? `${fuelPlan.hydration.ozPerHour} oz/hr` : `${fuelPlan.hydration.mlPerHour} ml/hr`}
                  detail={fuelPlan.hydration.includeElectrolytes ? 'Include electrolyte mix in at least one bottle.' : 'Plain water or light mix is fine.'}
                />
              </>
            )}

            {/* Weather */}
            {weatherData && (
              <LogisticsItem
                label="Weather"
                value={useImperial ? `${Math.round(weatherData.temperature * 9/5 + 32)}°F` : `${Math.round(weatherData.temperature)}°C`}
                detail={getWeatherGear(weatherData)}
              />
            )}

            {/* Warnings */}
            {fuelPlan?.warnings?.length > 0 && (
              <Box
                p="xs"
                style={{
                  backgroundColor: 'rgba(255, 152, 0, 0.08)',
                  border: '1px solid rgba(255, 152, 0, 0.3)',
                }}
              >
                <Group gap={4} mb={4}>
                  <Warning size={14} style={{ color: '#FF9800' }} />
                  <Text size="xs" fw={600} style={{ color: '#FF9800' }}>Warnings</Text>
                </Group>
                {fuelPlan.warnings.map((w, i) => (
                  <Text key={i} size="xs" c="dimmed">• {w}</Text>
                ))}
              </Box>
            )}
          </Stack>
        </Collapse>

        {/* Disclaimer */}
        <Text size="xs" c="dimmed" ta="center" mt="xs" fs="italic">
          General guidelines — not medical advice. Test your race-day nutrition in training.
        </Text>
      </Stack>
    </Paper>
  );
}

/**
 * Collapsible section header
 */
function SectionHeader({ icon, title, expanded, onClick }) {
  return (
    <UnstyledButton onClick={onClick} style={{ width: '100%' }}>
      <Group justify="space-between" align="center">
        <Group gap={6}>
          <Box style={{ color: tokens.colors.terracotta }}>{icon}</Box>
          <Text size="xs" fw={700} style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            textTransform: 'uppercase',
            letterSpacing: '1px',
            color: 'var(--color-text-primary)',
          }}>
            {title}
          </Text>
        </Group>
        {expanded ? <CaretUp size={14} /> : <CaretDown size={14} />}
      </Group>
    </UnstyledButton>
  );
}

/**
 * Pre-race nutrition timeline item
 */
function NutritionTimelineItem({ time, description, icon }) {
  return (
    <Group gap="sm" align="flex-start" wrap="nowrap">
      <Box style={{ color: tokens.colors.terracotta, marginTop: 2 }}>{icon}</Box>
      <Box>
        <Text size="xs" fw={700} style={{ fontFamily: "'DM Mono', monospace", color: tokens.colors.terracotta }}>
          {time}
        </Text>
        <Text size="xs" c="dimmed">{description}</Text>
      </Box>
    </Group>
  );
}

/**
 * Logistics item (label + value + detail)
 */
function LogisticsItem({ label, value, detail }) {
  return (
    <Box
      p="xs"
      style={{
        backgroundColor: 'var(--tribos-bg-elevated)',
        border: '1px solid var(--color-border)',
      }}
    >
      <Group justify="space-between" mb={2}>
        <Text size="xs" fw={600} style={{ color: 'var(--color-text-primary)' }}>{label}</Text>
        <Text size="xs" fw={700} style={{ fontFamily: "'DM Mono', monospace", color: tokens.colors.terracotta }}>{value}</Text>
      </Group>
      <Text size="xs" c="dimmed">{detail}</Text>
    </Box>
  );
}

/**
 * Get weather-based gear suggestion
 */
function getWeatherGear(weather) {
  const temp = weather.temperature;
  if (temp < 5) return 'Full winter kit: thermal jersey, leg warmers, shoe covers, full-finger gloves.';
  if (temp < 12) return 'Arm warmers, knee warmers, gilet. Pack in pocket if warming up.';
  if (temp < 18) return 'Light arm warmers or gilet. Comfortable racing temps.';
  if (temp < 25) return 'Standard kit. Good racing conditions.';
  if (temp < 32) return 'Light kit, sunscreen, extra hydration. Consider ice socks.';
  return 'Extreme heat: white kit, ice vest for warmup, pre-cool, extra electrolytes.';
}
