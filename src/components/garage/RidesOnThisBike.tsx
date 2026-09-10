import { useCallback, useEffect, useState } from 'react';
import { Box, Button, Group, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import type { BackfillResult, GearItem, ProviderGearItem, ProviderGearList, useGear } from '../../hooks/useGear';
import { describeLinked } from '../../lib/gear/backfillCopy';
import { AssignFromDateForm } from './AssignFromDateForm';
import { LinkStravaBikeList } from './LinkStravaBikeList';
import { FONT, monoLabel } from './garageTokens';

type GearHook = ReturnType<typeof useGear>;

interface RidesOnThisBikeProps {
  bike: GearItem;
  useImperial: boolean;
  gearHook: Pick<GearHook, 'previewAssignRange' | 'assignRange' | 'undoAssignBatch' | 'listProviderGear' | 'linkProviderGear'>;
  /** Re-read the bike's history and alerts after any write. */
  onChanged: () => Promise<void> | void;
}

const UNDO_TOAST_MS = 20_000;

/**
 * The "Rides on this bike" card: two ways to backload a bike that was added
 * after the rides happened. Every write toasts with an Undo that hands the
 * server back exactly what it displaced.
 */
export function RidesOnThisBike({ bike, useImperial, gearHook, onChanged }: RidesOnThisBikeProps) {
  const { previewAssignRange, assignRange, undoAssignBatch, listProviderGear, linkProviderGear } = gearHook;
  const [providerList, setProviderList] = useState<ProviderGearList | null>(null);
  const [providerLoading, setProviderLoading] = useState(true);
  const [writing, setWriting] = useState(false);

  const loadProviderList = useCallback(async () => {
    setProviderLoading(true);
    try {
      setProviderList(await listProviderGear());
    } catch {
      setProviderList({ stravaConnected: false, enrichmentSkipped: false, items: [] });
    } finally {
      setProviderLoading(false);
    }
  }, [listProviderGear]);

  useEffect(() => { loadProviderList(); }, [loadProviderList]);

  const preview = useCallback(
    (opts: { from?: string | null; until?: string | null; includeAuto: boolean }) => previewAssignRange(bike.id, opts),
    [previewAssignRange, bike.id],
  );

  const toastWithUndo = (result: BackfillResult) => {
    const id = `gear-backfill-${Date.now()}`;
    const undo = async () => {
      notifications.update({ id, loading: true, message: 'Putting them back…', autoClose: false, withCloseButton: false });
      try {
        const r = await undoAssignBatch(bike.id, result.linkedIds, result.previous);
        await onChanged();
        notifications.update({ id, loading: false, color: 'green', title: 'Undone', message: `${r.unlinked + r.restored} rides put back where they were.`, autoClose: 5000, withCloseButton: true });
      } catch (err) {
        notifications.update({ id, loading: false, color: 'red', title: 'Could not undo', message: err instanceof Error ? err.message : 'Try again', autoClose: 8000, withCloseButton: true });
      }
    };
    notifications.show({
      id,
      color: result.linked ? 'green' : 'gray',
      title: describeLinked(result.linked, result.distanceM, useImperial),
      autoClose: result.linked ? UNDO_TOAST_MS : 5000,
      message: result.linked ? (
        <Group gap="xs" mt={4}>
          <Text size="sm" c="dimmed">Wrong bike?</Text>
          <Button size="compact-xs" variant="outline" onClick={undo}>Undo</Button>
        </Group>
      ) : undefined,
    });
  };

  const apply = async (opts: { from: string; until?: string | null; includeAuto: boolean }) => {
    setWriting(true);
    try {
      const result = await assignRange(bike.id, opts);
      await onChanged();
      toastWithUndo(result);
      return result;
    } finally {
      setWriting(false);
    }
  };

  const linkProvider = async (item: ProviderGearItem) => {
    setWriting(true);
    try {
      const result = await linkProviderGear(bike.id, item.providerGearId, true);
      await Promise.all([onChanged(), loadProviderList()]);
      toastWithUndo(result);
    } finally {
      setWriting(false);
    }
  };

  return (
    <Stack gap={18}>
      <Box>
        <Text style={{ ...monoLabel, marginBottom: 8 }}>All rides from a date</Text>
        <AssignFromDateForm
          defaultFrom={bike.purchase_date}
          useImperial={useImperial}
          disabled={writing}
          preview={preview}
          apply={apply}
        />
      </Box>
      <Box>
        <Text style={{ ...monoLabel, marginBottom: 8 }}>Bikes Strava knows about</Text>
        <LinkStravaBikeList
          bikeId={bike.id}
          bikeName={bike.name}
          list={providerList}
          loading={providerLoading}
          useImperial={useImperial}
          disabled={writing}
          onLink={linkProvider}
        />
      </Box>
      <Text style={{ fontFamily: FONT.body, fontSize: 13, color: 'var(--color-text-muted)' }}>
        One ride at a time: open your history on the Train tab and pick the bike from the ride&rsquo;s menu.
      </Text>
    </Stack>
  );
}
