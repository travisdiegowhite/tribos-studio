import { useEffect, useState } from 'react';
import { Box, Button, Checkbox, Group, Stack, Text } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import type { BackfillPreview, BackfillResult } from '../../hooks/useGear';
import { describeSkipped, describeSummary, describeUnassigned, todayKey } from '../../lib/gear/backfillCopy';
import { FONT, monoLabel } from './garageTokens';

interface AssignFromDateFormProps {
  defaultFrom: string | null;
  useImperial: boolean;
  disabled?: boolean;
  preview: (opts: { from?: string | null; until?: string | null; includeAuto: boolean }) => Promise<BackfillPreview>;
  apply: (opts: { from: string; until?: string | null; includeAuto: boolean }) => Promise<BackfillResult>;
}

type DateValue = Date | string | null;
function toKey(v: DateValue): string | null {
  if (!v) return null;
  if (typeof v === 'string') return v.slice(0, 10);
  return todayKey(v);
}

/**
 * "All rides from a date" — pick a start (and optionally an end), see what
 * that adds up to, then link. The checkbox narrows the default: by default
 * rides the default bike guessed at ('auto') come along; rides the rider
 * placed by hand never do.
 */
export function AssignFromDateForm({ defaultFrom, useImperial, disabled, preview, apply }: AssignFromDateFormProps) {
  const [from, setFrom] = useState<string | null>(defaultFrom);
  const [until, setUntil] = useState<string | null>(null);
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const [opening, setOpening] = useState<BackfillPreview | null>(null);
  const [planned, setPlanned] = useState<BackfillPreview | null>(null);
  const [busy, setBusy] = useState<'preview' | 'apply' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The opening line: how many rides are on no bike, and how far back they go.
  useEffect(() => {
    let cancelled = false;
    preview({ includeAuto: false })
      .then((p) => {
        if (cancelled) return;
        setOpening(p);
        setFrom((cur) => cur ?? p.oldestUnassigned);
      })
      .catch(() => { /* the form still works without the opening line */ });
    return () => { cancelled = true; };
  }, [preview]);

  useEffect(() => { setPlanned(null); }, [from, until, onlyUnassigned]);

  const includeAuto = !onlyUnassigned;

  const showMe = async () => {
    if (!from) return;
    setBusy('preview'); setError(null);
    try {
      setPlanned(await preview({ from, until, includeAuto }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not count those rides');
    } finally {
      setBusy(null);
    }
  };

  const linkThem = async () => {
    if (!from) return;
    setBusy('apply'); setError(null);
    try {
      await apply({ from, until, includeAuto });
      setPlanned(null);
      const p = await preview({ includeAuto: false }).catch(() => null);
      if (p) setOpening(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not link those rides');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Stack gap={10}>
      {opening && (
        <Text style={{ fontFamily: FONT.body, fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)', textWrap: 'pretty' as never }}>
          {describeUnassigned(opening.unassignedCount, opening.oldestUnassigned)}
        </Text>
      )}
      <Group gap="sm" align="flex-end" wrap="wrap">
        <DateInput
          label={<span style={monoLabel}>From</span>}
          value={from}
          onChange={(v) => setFrom(toKey(v as DateValue))}
          maxDate={new Date()}
          valueFormat="MMM D, YYYY"
          placeholder="Pick a date"
          disabled={disabled}
          style={{ minWidth: 160 }}
        />
        <DateInput
          label={<span style={monoLabel}>Until (optional)</span>}
          value={until}
          onChange={(v) => setUntil(toKey(v as DateValue))}
          maxDate={new Date()}
          valueFormat="MMM D, YYYY"
          placeholder="Today"
          clearable
          disabled={disabled}
          style={{ minWidth: 160 }}
        />
        <Button variant="outline" onClick={showMe} loading={busy === 'preview'} disabled={disabled || !from || busy === 'apply'}>
          Show me
        </Button>
      </Group>
      <Checkbox
        size="xs"
        radius={0}
        checked={onlyUnassigned}
        onChange={(e) => setOnlyUnassigned(e.currentTarget.checked)}
        disabled={disabled}
        label={<span style={{ fontFamily: FONT.body, fontSize: 13, color: 'var(--color-text-secondary)' }}>Only rides not on any bike yet</span>}
      />
      {planned && (
        <Box style={{ padding: '10px 12px', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>
          <Text style={{ fontFamily: FONT.body, fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)', textWrap: 'pretty' as never }}>
            {describeSummary(planned.summary, useImperial)}
            {' '}
            <span style={{ color: 'var(--color-text-secondary)', fontWeight: 400 }}>{describeSkipped(planned.skipped, includeAuto)}</span>
          </Text>
          {planned.summary.rides > 0 && (
            <Button mt="sm" onClick={linkThem} loading={busy === 'apply'} disabled={disabled}>
              Link these rides
            </Button>
          )}
        </Box>
      )}
      {error && <Text size="sm" c="red">{error}</Text>}
    </Stack>
  );
}
