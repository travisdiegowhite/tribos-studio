import { Box, Stack, Text } from '@mantine/core';
import { Link } from 'react-router-dom';
import type { GearAlert, GearItem } from '../../hooks/useGear';
import { BIKE_CATEGORIES, RUNNING_SHOE_THRESHOLDS, getComponentLabel } from '../gear/gearConstants';
import { formatWhole } from '../../lib/gear/wearSeries';
import type { WearLevel } from '../../lib/gear/wearSeries';
import { BikePhoto } from './BikePhoto';
import { StatusChip, FactChip } from './StatusChip';
import { FONT } from './garageTokens';

interface BikeCardProps {
  gear: GearItem;
  alerts: GearAlert[];
  useImperial: boolean;
}

/**
 * What the card says comes from the alert engine (api/utils/gearAlerts.js),
 * which is what the bell shows too — so the garage and the bell never
 * disagree. Worst part first; a bike with nothing due is "fresh".
 */
export function summarizeAlerts(gear: GearItem, alerts: GearAlert[], useImperial: boolean): { sentence: string; chipWord: string; level: WearLevel } {
  const mine = alerts.filter((a) => a.gearItemId === gear.id);
  const replace = mine.find((a) => a.type === 'replace' && a.componentType);
  const warning = mine.find((a) => a.type === 'warning' && a.componentType);
  const unit = useImperial ? 'miles' : 'km';
  if (replace) {
    const label = getComponentLabel(replace.componentType!);
    const s = replace.timeBased
      ? `${label} is past due — installed ${replace.installedDate ? new Date(replace.installedDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'a while ago'}.`
      : `${label} is past due — ${formatWhole(replace.currentDistance, useImperial)} of ${formatWhole(replace.threshold || 0, useImperial)} ${unit}.`;
    return { sentence: s, chipWord: `${label} past due`, level: 'replace' };
  }
  if (warning) {
    const label = getComponentLabel(warning.componentType!);
    return {
      sentence: `${label} is nearly done — ${formatWhole(warning.currentDistance, useImperial)} of ${formatWhole(warning.threshold || 0, useImperial)} ${unit}.`,
      chipWord: `${label} nearly done`,
      level: 'warning',
    };
  }
  if (gear.gear_type === 'shoes') {
    const pct = (gear.total_distance_logged || 0) / RUNNING_SHOE_THRESHOLDS.replace;
    if (pct >= 1) return { sentence: `Past due — ${formatWhole(gear.total_distance_logged, useImperial)} of ${formatWhole(RUNNING_SHOE_THRESHOLDS.replace, useImperial)} ${unit}.`, chipWord: 'past due', level: 'replace' };
    if (pct >= 0.875) return { sentence: `Nearly done — ${formatWhole(gear.total_distance_logged, useImperial)} of ${formatWhole(RUNNING_SHOE_THRESHOLDS.replace, useImperial)} ${unit}.`, chipWord: 'nearly done', level: 'warning' };
    return { sentence: `${formatWhole(gear.total_distance_logged, useImperial)} of ${formatWhole(RUNNING_SHOE_THRESHOLDS.replace, useImperial)} ${unit}.`, chipWord: pct >= 0.5 ? 'wearing in' : 'fresh', level: 'ok' };
  }
  const hasParts = (gear.gear_components || []).some((c) => c.status === 'active');
  if (!hasParts) return { sentence: 'No parts listed yet. Show me a photo and I’ll list them.', chipWord: 'no parts yet', level: 'unknown' };
  return { sentence: 'Everything is fresh. Nothing needs doing.', chipWord: 'fresh', level: 'ok' };
}

export function BikeCard({ gear, alerts, useImperial }: BikeCardProps) {
  const isShoes = gear.gear_type === 'shoes';
  const { sentence, chipWord, level } = summarizeAlerts(gear, alerts, useImperial);
  const retired = gear.status === 'retired';
  const category = isShoes ? 'Shoes' : (BIKE_CATEGORIES.find((c) => c.value === gear.category)?.label || 'Bike');
  const unit = useImperial ? 'mi' : 'km';

  return (
    <Box
      component={Link}
      to={`/garage/${gear.id}`}
      style={{
        textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column',
        background: 'var(--color-card)', border: '1.5px solid var(--color-border)', boxShadow: 'var(--shadow-sm)',
        opacity: retired ? 0.6 : 1, borderRadius: 0,
      }}
      className="tribos-gear-card"
    >
      <BikePhoto path={gear.photo_paths?.whole_bike} alt={gear.name} width="100%" height={150} shoes={isShoes} iconSize={64} />
      <Stack gap={8} style={{ padding: '14px 16px 16px' }}>
        <Box style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
          <span style={{ fontFamily: FONT.display, fontSize: 20, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--color-text-primary)' }}>{gear.name}</span>
          <span style={{ fontFamily: FONT.mono, fontSize: 11, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
            {category} · {formatWhole(gear.total_distance_logged || 0, useImperial)} {unit}
          </span>
        </Box>
        <Text style={{ fontFamily: FONT.body, fontSize: 15, fontWeight: 500, lineHeight: 1.4, color: 'var(--color-text-primary)', textWrap: 'pretty' as never }}>
          {sentence}
        </Text>
        <Box style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
          <StatusChip level={level} word={chipWord.toUpperCase()} />
          {gear.is_default && <FactChip>Default</FactChip>}
          {gear.is_trainer_bike && <FactChip>Indoor</FactChip>}
          {retired && <FactChip>Retired</FactChip>}
        </Box>
      </Stack>
    </Box>
  );
}

