import { useState } from 'react';
import { Box, Button, Collapse, Group, Stack, Text } from '@mantine/core';
import { Link } from 'react-router-dom';
import { CaretDown, CaretUp, Play } from '@phosphor-icons/react';

/**
 * ActionRow — spec §6.
 *
 * Left: compact metric-code strip (EFI · TCAS · TFI · AFI · FS) plus an
 * EXPAND ↓ toggle that opens an inline drawer with each metric's short
 * description (full StatusBar + ProprietaryMetricsBar for now).
 *
 * Right: two CTAs — outline VIEW PLAN, solid teal RIDE TODAY.
 *
 * Toggle state is local here; server-side persistence lives in spec §7
 * and will replace this when `today_view_preferences` lands.
 */

const DM_MONO = "'JetBrains Mono', 'DM Mono', monospace";

function Code({ label, value, tone }) {
  return (
    <Text
      span
      style={{
        fontFamily: DM_MONO,
        fontSize: 10,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: 'var(--color-text-muted, #7A7970)',
      }}
    >
      <span style={{ color: 'var(--color-text-muted, #7A7970)' }}>{label} </span>
      <span style={{ color: tone || 'var(--color-ink, #141410)', fontWeight: 600 }}>{value}</span>
    </Text>
  );
}

function formatSigned(n) {
  if (n == null || Number.isNaN(n)) return '—';
  const rounded = Math.round(n);
  if (rounded === 0) return '0';
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

function formatScore(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return String(Math.round(n));
}

function toneForForm(fs) {
  if (fs == null) return null;
  if (fs >= 5) return 'var(--color-teal, #2A8C82)';
  if (fs <= -5) return 'var(--color-coral, #C43C2A)';
  return null;
}

function toneForTrendDelta(deltaPct) {
  if (deltaPct == null) return null;
  if (deltaPct > 0) return 'var(--color-teal, #2A8C82)';
  if (deltaPct < 0) return 'var(--color-coral, #C43C2A)';
  return null;
}

export default function ActionRow({
  tfi,
  afi,
  fs,
  efi,
  tcas,
  tfiDeltaPct,
  rideTodayHref,
  viewPlanHref = '/train',
  children,
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Box
      style={{
        border: '1px solid var(--color-border, #DDDDD8)',
        backgroundColor: 'var(--color-card, #FFFFFF)',
      }}
    >
      <Group
        justify="space-between"
        wrap="wrap"
        style={{
          padding: '12px 16px',
          gap: 12,
        }}
      >
        {/* Left: compact metric codes */}
        <Group gap={14} wrap="wrap">
          <Code label="EFI" value={formatScore(efi)} />
          <Code label="TCAS" value={formatScore(tcas)} />
          <Code label="TFI" value={formatScore(tfi)} tone={toneForTrendDelta(tfiDeltaPct)} />
          <Code label="AFI" value={formatScore(afi)} />
          <Code label="FS" value={formatSigned(fs)} tone={toneForForm(fs)} />
          <Button
            variant="subtle"
            color="gray"
            size="compact-xs"
            onClick={() => setExpanded((v) => !v)}
            rightSection={expanded ? <CaretUp size={12} /> : <CaretDown size={12} />}
            style={{
              fontFamily: DM_MONO,
              fontSize: 10,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            {expanded ? 'Collapse' : 'Expand'}
          </Button>
        </Group>

        {/* Right: CTAs */}
        <Group gap={8} wrap="nowrap">
          <Button
            component={Link}
            to={viewPlanHref}
            variant="outline"
            color="dark"
            radius={0}
            style={{
              fontFamily: DM_MONO,
              fontSize: 11,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              fontWeight: 700,
              paddingLeft: 20,
              paddingRight: 20,
              paddingTop: 10,
              paddingBottom: 10,
              height: 'auto',
              minHeight: 0,
            }}
          >
            View plan
          </Button>
          <Button
            component={rideTodayHref ? Link : 'button'}
            to={rideTodayHref}
            disabled={!rideTodayHref}
            color="teal"
            radius={0}
            leftSection={<Play size={12} weight="fill" />}
            style={{
              fontFamily: DM_MONO,
              fontSize: 11,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              fontWeight: 700,
              paddingLeft: 20,
              paddingRight: 20,
              paddingTop: 10,
              paddingBottom: 10,
              height: 'auto',
              minHeight: 0,
            }}
          >
            Ride today
          </Button>
        </Group>
      </Group>
      <Collapse in={expanded}>
        <Stack gap={10} p={10} style={{ borderTop: '1px solid var(--color-border, #DDDDD8)' }}>
          {children}
        </Stack>
      </Collapse>
    </Box>
  );
}
