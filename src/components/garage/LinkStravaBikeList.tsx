import { useState } from 'react';
import { Box, Button, Group, Loader, Stack, Text } from '@mantine/core';
import type { ProviderGearItem, ProviderGearList } from '../../hooks/useGear';
import { BIKE_CATEGORIES } from '../gear/gearConstants';
import { describeProviderGear, providerGearName } from '../../lib/gear/backfillCopy';
import { FactChip } from './StatusChip';
import { FONT } from './garageTokens';

interface LinkStravaBikeListProps {
  bikeId: string;
  bikeName: string;
  list: ProviderGearList | null;
  loading: boolean;
  useImperial: boolean;
  disabled?: boolean;
  onLink: (item: ProviderGearItem) => Promise<void>;
}

const NOTHING_HERE = 'Garmin, Wahoo and FIT rides don’t say which bike they were on, so this list only shows Strava rides. Use the date above, or pick rides one by one in your history.';

/**
 * "Bikes Strava knows about" — one row per Strava gear id seen on the
 * rider's rides. Match only: a row links its id to THIS bike and pulls the
 * rides over; it never creates a bike.
 */
export function LinkStravaBikeList({ bikeId, bikeName, list, loading, useImperial, disabled, onLink }: LinkStravaBikeListProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (loading && !list) return <Group gap="xs"><Loader size="xs" /><Text size="sm" c="dimmed">Looking at your Strava rides…</Text></Group>;
  if (!list || list.items.length === 0) {
    return <Text style={{ fontFamily: FONT.body, fontSize: 14, color: 'var(--color-text-secondary)', textWrap: 'pretty' as never }}>{NOTHING_HERE}</Text>;
  }

  const link = async (item: ProviderGearItem) => {
    setBusyId(item.providerGearId); setError(null);
    try {
      await onLink(item);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not link that bike');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Stack gap={8}>
      {list.items.map((item) => {
        const mine = item.claimedByGearId === bikeId;
        const claimedElsewhere = Boolean(item.claimedByGearId) && !mine;
        const categoryLabel = BIKE_CATEGORIES.find((c) => c.value === item.suggestedCategory)?.label;
        return (
          <Box
            key={item.providerGearId}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap',
              padding: '10px 12px', border: '1px solid var(--color-border)', background: mine ? 'var(--color-teal-subtle)' : 'var(--color-bg-secondary)',
              opacity: claimedElsewhere && item.claimedByStatus === 'active' ? 0.75 : 1,
            }}
          >
            <Stack gap={4} style={{ minWidth: 0 }}>
              <Text style={{ fontFamily: FONT.display, fontSize: 18, fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', color: 'var(--color-text-primary)' }}>
                {providerGearName(item)}
              </Text>
              <Text style={{ fontFamily: FONT.mono, fontSize: 11, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
                {describeProviderGear(item, useImperial)}
              </Text>
              <Group gap={6} wrap="wrap">
                {categoryLabel && <FactChip>{`Looks like ${categoryLabel}`}</FactChip>}
                {item.retired && <FactChip>Retired on Strava</FactChip>}
                {mine && <FactChip>{`This is ${bikeName}`}</FactChip>}
                {claimedElsewhere && item.claimedByName && <FactChip>{`On ${item.claimedByName}`}</FactChip>}
              </Group>
            </Stack>
            {!mine && (
              <Button
                size="xs"
                variant={claimedElsewhere ? 'subtle' : 'filled'}
                onClick={() => link(item)}
                loading={busyId === item.providerGearId}
                disabled={disabled || (busyId !== null && busyId !== item.providerGearId) || (claimedElsewhere && item.claimedByStatus === 'active')}
                title={claimedElsewhere && item.claimedByStatus === 'active' ? `Already on ${item.claimedByName}. Clear it there first.` : undefined}
              >
                This is it
              </Button>
            )}
          </Box>
        );
      })}
      {list.enrichmentSkipped && (
        <Text size="xs" c="dimmed">Some names couldn’t be fetched from Strava just now. The rides are still counted.</Text>
      )}
      {error && <Text size="sm" c="red">{error}</Text>}
    </Stack>
  );
}
