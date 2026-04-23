/**
 * CorrectionProposalCard
 *
 * Displays an AI-generated correction proposal: coach voice prose,
 * a list of proposed workout modifications, and TFI projection outcome.
 * Supports accept-all, decline, and partial-accept (per modification).
 */

import { useState } from 'react';
import {
  Paper, Text, Group, Button, Stack, Badge, Box, Divider,
  Checkbox, Collapse,
} from '@mantine/core';
import {
  ArrowRight, ArrowUp, ArrowDown, Check, Swap, Plus, X, Warning,
} from '@phosphor-icons/react';
import type { CorrectionProposal, CorrectionModification, CorrectionOp } from '../../types/checkIn';

interface Props {
  proposal: CorrectionProposal;
  onDecision: (
    proposalId: string,
    decision: 'accepted' | 'declined' | 'partial',
    acceptedSessionIds: string[]
  ) => Promise<void>;
}

type CardState = 'idle' | 'confirming' | 'decided';

const OP_LABELS: Record<CorrectionOp, string> = {
  extend: 'Extend',
  reduce: 'Reduce',
  swap: 'Swap',
  add: 'Add',
  skip: 'Skip',
};

const OP_ICONS: Record<CorrectionOp, React.ReactNode> = {
  extend: <ArrowUp size={13} />,
  reduce: <ArrowDown size={13} />,
  swap: <Swap size={13} />,
  add: <Plus size={13} />,
  skip: <X size={13} />,
};

function ModRow({ mod, selected, onToggle }: {
  mod: CorrectionModification;
  selected: boolean;
  onToggle: () => void;
}) {
  const durationNote = mod.delta_minutes != null
    ? (mod.delta_minutes > 0 ? `+${mod.delta_minutes}m` : `${mod.delta_minutes}m`)
    : null;

  return (
    <Box
      style={{
        borderLeft: '2px solid var(--tribos-border-default)',
        paddingLeft: 12,
        paddingTop: 6,
        paddingBottom: 6,
        opacity: selected ? 1 : 0.5,
        transition: 'opacity 150ms ease',
      }}
    >
      <Group gap="xs" wrap="nowrap" align="flex-start">
        <Checkbox
          size="xs"
          checked={selected}
          onChange={onToggle}
          mt={2}
          style={{ flexShrink: 0 }}
        />
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Group gap={6} wrap="nowrap">
            <Badge
              size="xs"
              variant="dot"
              color="teal"
              leftSection={OP_ICONS[mod.op]}
              style={{ borderRadius: 0, fontFamily: 'monospace' }}
            >
              {OP_LABELS[mod.op]}
              {durationNote && ` ${durationNote}`}
              {mod.new_type && ` → ${mod.new_type}`}
            </Badge>
            {mod.new_rss != null && (
              <Text size="xs" c="dimmed" ff="monospace">
                {mod.new_rss} RSS
              </Text>
            )}
          </Group>
          <Text size="xs" c="dimmed" mt={2} style={{ lineHeight: 1.4 }}>
            {mod.reason}
          </Text>
        </Box>
      </Group>
    </Box>
  );
}

export default function CorrectionProposalCard({ proposal, onDecision }: Props) {
  const [state, setState] = useState<CardState>(
    proposal.outcome !== 'pending' ? 'decided' : 'idle'
  );
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(proposal.modifications.map(m => m.session_id))
  );

  const isDecided = state === 'decided' || proposal.outcome !== 'pending';
  const mods = proposal.modifications || [];
  const allSelected = selectedIds.size === mods.length;
  const noneSelected = selectedIds.size === 0;

  const tfiDelta = proposal.projected_tfi_with != null && proposal.projected_tfi_without != null
    ? proposal.projected_tfi_with - proposal.projected_tfi_without
    : null;

  const toggleMod = (sessionId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  };

  const handleDecline = async () => {
    setSubmitting(true);
    try {
      await onDecision(proposal.id, 'declined', []);
      setState('decided');
    } catch {
      // leave state as-is
    } finally {
      setSubmitting(false);
    }
  };

  const handleAccept = async () => {
    setSubmitting(true);
    try {
      const acceptedIds = [...selectedIds];
      const decision = allSelected ? 'accepted' : 'partial';
      await onDecision(proposal.id, decision, acceptedIds);
      setState('decided');
    } catch {
      // leave state as-is
    } finally {
      setSubmitting(false);
    }
  };

  // ── Decided state ──
  if (isDecided) {
    const outcomeLabel = proposal.outcome === 'accepted' ? 'Accepted'
      : proposal.outcome === 'partial' ? 'Partially accepted'
      : 'Declined';
    const outcomeColor = proposal.outcome === 'declined' ? 'var(--tribos-border-default)' : 'var(--color-teal)';

    return (
      <Paper p="md" withBorder style={{ borderRadius: 0, borderLeft: `3px solid ${outcomeColor}` }}>
        <Group gap="xs" mb="xs">
          {proposal.outcome === 'declined'
            ? <X size={14} color="var(--color-text-muted)" />
            : <Check size={14} color="var(--color-teal)" />}
          <Text size="xs" fw={700} tt="uppercase" ff="monospace" c="dimmed">
            {outcomeLabel}
          </Text>
        </Group>
        {proposal.opener_text && (
          <Text size="sm" c="dimmed">{proposal.opener_text}</Text>
        )}
      </Paper>
    );
  }

  // ── Active proposal ──
  return (
    <Paper
      p="md"
      withBorder
      style={{ borderRadius: 0, borderLeft: '3px solid var(--color-ochre, #d4a855)' }}
    >
      {/* Header badge */}
      <Group gap="xs" mb="sm">
        <Warning size={14} color="var(--color-ochre, #d4a855)" />
        <Text size="xs" fw={700} tt="uppercase" ff="monospace" c="dimmed">
          Training Correction
        </Text>
        {proposal.current_tfi != null && proposal.target_tfi_min != null && (
          <Badge size="xs" variant="outline" color="orange" style={{ borderRadius: 0, marginLeft: 'auto' }}>
            TFI {proposal.current_tfi < proposal.target_tfi_min ? 'below' : 'above'} target
          </Badge>
        )}
      </Group>

      {/* Coach opener */}
      {proposal.opener_text && (
        <Text size="sm" mb="sm" style={{ lineHeight: 1.6 }}>
          {proposal.opener_text}
        </Text>
      )}

      {/* Modification list */}
      {mods.length > 0 && (
        <Stack gap={4} mb="sm">
          {mods.map((mod) => (
            <ModRow
              key={mod.session_id}
              mod={mod}
              selected={selectedIds.has(mod.session_id)}
              onToggle={() => toggleMod(mod.session_id)}
            />
          ))}
        </Stack>
      )}

      {/* TFI projection */}
      <Box
        p="xs"
        mb="sm"
        style={{
          background: 'var(--tribos-bg-surface, rgba(0,0,0,0.04))',
          borderRadius: 0,
          cursor: 'pointer',
        }}
        onClick={() => setExpanded(v => !v)}
      >
        <Group gap="xs" justify="space-between">
          <Text size="xs" fw={600} tt="uppercase" ff="monospace" c="dimmed">
            Projected outcome
          </Text>
          <Text size="xs" c="dimmed">{expanded ? '▲' : '▼'}</Text>
        </Group>
        <Collapse in={expanded}>
          <Stack gap={2} mt="xs">
            <Group gap="xs" justify="space-between">
              <Text size="xs" c="dimmed">Current TFI</Text>
              <Text size="xs" fw={600} ff="monospace">{proposal.current_tfi ?? '—'}</Text>
            </Group>
            <Group gap="xs" justify="space-between">
              <Text size="xs" c="dimmed">Without changes</Text>
              <Text size="xs" ff="monospace">{proposal.projected_tfi_without ?? '—'}</Text>
            </Group>
            <Group gap="xs" justify="space-between">
              <Text size="xs" c="dimmed">With changes</Text>
              <Text size="xs" fw={600} ff="monospace" c="teal">
                {proposal.projected_tfi_with ?? '—'}
                {tfiDelta != null && (
                  <span style={{ color: tfiDelta > 0 ? 'var(--color-teal)' : 'inherit' }}>
                    {' '}({tfiDelta > 0 ? '+' : ''}{tfiDelta})
                  </span>
                )}
              </Text>
            </Group>
            {proposal.target_tfi_min != null && proposal.target_tfi_max != null && (
              <Group gap="xs" justify="space-between">
                <Text size="xs" c="dimmed">Target band</Text>
                <Text size="xs" ff="monospace">
                  {proposal.target_tfi_min}–{proposal.target_tfi_max}
                </Text>
              </Group>
            )}
          </Stack>
        </Collapse>
      </Box>

      {/* Coach closer */}
      {proposal.closer_text && (
        <>
          <Divider mb="sm" />
          <Text size="xs" c="dimmed" fs="italic" mb="sm">
            {proposal.closer_text}
          </Text>
        </>
      )}

      {/* Partial-accept note */}
      {!allSelected && !noneSelected && (
        <Text size="xs" c="dimmed" mb="xs">
          {selectedIds.size} of {mods.length} modifications selected
        </Text>
      )}

      {/* Action buttons */}
      <Group gap="xs">
        <Button
          size="xs"
          variant="light"
          color="teal"
          style={{ borderRadius: 0 }}
          leftSection={<Check size={13} />}
          rightSection={<ArrowRight size={13} />}
          onClick={handleAccept}
          loading={submitting}
          disabled={noneSelected}
        >
          {allSelected ? 'Accept all' : `Accept ${selectedIds.size}`}
        </Button>
        <Button
          size="xs"
          variant="subtle"
          color="gray"
          style={{ borderRadius: 0 }}
          leftSection={<X size={13} />}
          onClick={handleDecline}
          disabled={submitting}
        >
          Decline
        </Button>
      </Group>
    </Paper>
  );
}
