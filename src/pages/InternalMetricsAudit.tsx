/**
 * Internal Metrics Audit Page — scoped to travisdiegowhite@gmail.com only.
 *
 * Diagnostic tool for the TFI=68 vs. felt-fitness ~162+ investigation.
 * Shows CTL, server-stored TFI, AFI, FS, raw daily RSS and their deltas
 * over the last 180 days, with a chart overlay and CSV export.
 *
 * Route: /internal/metrics-audit
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Container, Title, Text, Group, Badge, Stack, Table, ScrollArea,
  Button, SegmentedControl, Alert, Loader, Center, Box, ActionIcon,
  Tooltip as MantineTooltip,
} from '@mantine/core';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { ArrowsClockwise, DownloadSimple, Warning } from '@phosphor-icons/react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { supabase } from '../lib/supabase';
import AppShell from '../components/AppShell.jsx';

const AUDIT_EMAIL = 'travisdiegowhite@gmail.com';

interface DailyRow {
  date: string;
  rss: number;
  ctl: number;
  atl: number;
  tsb: number;
  tfi: number | null;
  afi: number | null;
  form_score: number | null;
  tfi_minus_ctl: number | null;
  rss_source: string | null;
  confidence: number | null;
  tfi_tau: number | null;
}

interface Activity {
  id: string;
  name: string;
  type: string;
  start_date: string;
  moving_time: number | null;
  rss: number | null;
  tss: number | null;
  effective_power: number | null;
  normalized_power: number | null;
  kilojoules: number | null;
  rss_source: string | null;
  estimated_tier: number;
}

interface AuditData {
  through_date: string;
  daily: DailyRow[];
  activities: Activity[];
}

type SortKey = keyof DailyRow;
type WindowOption = '30' | '60' | '90' | '180';

const TIER_COLOR: Record<number, string> = { 1: 'green', 2: 'teal', 3: 'blue', 4: 'orange', 5: 'red' };
const TIER_LABEL: Record<number, string> = {
  1: 'T1 (stored RSS/TSS)', 2: 'T2 (running)', 3: 'T3 (power)', 4: 'T4 (kJ)', 5: 'T5 (heuristic)',
};

export default function InternalMetricsAudit() {
  const { user } = useAuth();

  // Gate: redirect non-Travis users
  if (user && user.email?.toLowerCase() !== AUDIT_EMAIL.toLowerCase()) {
    return <Navigate to="/today" replace />;
  }

  const [data, setData] = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [window_, setWindow] = useState<WindowOption>('90');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortAsc, setSortAsc] = useState(false);
  const [activeTab, setActiveTab] = useState<'daily' | 'activities'>('daily');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');
      const res = await fetch('/api/internal/fitness-audit', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Filter to selected window
  const windowDays = parseInt(window_, 10);
  const filteredDaily = useMemo(() => {
    if (!data) return [];
    return data.daily.slice(-windowDays);
  }, [data, windowDays]);

  // Chart data — every 3rd day to avoid crowding
  const chartData = useMemo(() =>
    filteredDaily.filter((_, i) => filteredDaily.length <= 60 || i % 2 === 0),
    [filteredDaily]
  );

  // Sorted daily table
  const sortedDaily = useMemo(() => {
    const arr = [...filteredDaily];
    arr.sort((a, b) => {
      const av = a[sortKey] ?? -Infinity;
      const bv = b[sortKey] ?? -Infinity;
      if (av < bv) return sortAsc ? -1 : 1;
      if (av > bv) return sortAsc ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filteredDaily, sortKey, sortAsc]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortAsc(p => !p);
    else { setSortKey(key); setSortAsc(false); }
  };

  // Summary stats
  const summary = useMemo(() => {
    if (!filteredDaily.length) return null;
    const last = filteredDaily[filteredDaily.length - 1];
    const maxDelta = filteredDaily.reduce((m, r) =>
      r.tfi_minus_ctl != null && Math.abs(r.tfi_minus_ctl) > Math.abs(m) ? r.tfi_minus_ctl : m, 0);
    return { last, maxDelta };
  }, [filteredDaily]);

  // Activity tier breakdown
  const tierBreakdown = useMemo(() => {
    if (!data) return {};
    const counts: Record<number, number> = {};
    data.activities.forEach(a => { counts[a.estimated_tier] = (counts[a.estimated_tier] || 0) + 1; });
    return counts;
  }, [data]);

  // CSV export
  const exportCSV = useCallback(() => {
    if (!filteredDaily.length) return;
    const header = 'date,rss,ctl,atl,tsb,tfi,afi,form_score,tfi_minus_ctl,confidence';
    const rows = filteredDaily.map(r =>
      [r.date, r.rss, r.ctl, r.atl, r.tsb, r.tfi ?? '', r.afi ?? '', r.form_score ?? '', r.tfi_minus_ctl ?? '', r.confidence ?? ''].join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tribos-metric-audit-${filteredDaily[filteredDaily.length - 1]?.date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredDaily]);

  const fmt = (v: number | null | undefined, d = 1) =>
    v != null ? v.toFixed(d) : '—';

  const deltaColor = (v: number | null) => {
    if (v == null) return undefined;
    if (v > 20) return 'red';
    if (v > 5) return 'orange';
    if (v < -5) return 'blue';
    return undefined;
  };

  const sortIndicator = (key: SortKey) => sortKey === key ? (sortAsc ? ' ↑' : ' ↓') : '';

  if (loading) return (
    <AppShell>
      <Center h={300}><Loader color="teal" /></Center>
    </AppShell>
  );

  if (error) return (
    <AppShell>
      <Container size="xl" py="lg">
        <Alert icon={<Warning size={16} />} color="red" title="Error loading audit data">
          {error}
        </Alert>
        <Button mt="md" onClick={fetchData} leftSection={<ArrowsClockwise size={14} />}>Retry</Button>
      </Container>
    </AppShell>
  );

  return (
    <AppShell>
      <Container size="xl" py="lg" px={20}>
        <Stack gap={16}>

          {/* Header */}
          <Group justify="space-between" align="flex-end">
            <Stack gap={2}>
              <Title order={3} fw={700} style={{ fontFamily: 'monospace', letterSpacing: '-0.5px' }}>
                METRIC AUDIT — INTERNAL
              </Title>
              <Text size="xs" c="dimmed">
                Standard CTL (τ=42, canonical RSS reads) vs server-stored TFI.
                Through {data?.through_date}. Gate: {AUDIT_EMAIL}.
              </Text>
            </Stack>
            <Group gap={8}>
              <MantineTooltip label="Refresh data">
                <ActionIcon variant="subtle" onClick={fetchData}><ArrowsClockwise size={16} /></ActionIcon>
              </MantineTooltip>
              <Button size="xs" variant="outline" leftSection={<DownloadSimple size={14} />} onClick={exportCSV}>
                CSV
              </Button>
            </Group>
          </Group>

          {/* Summary badges */}
          {summary && (
            <Group gap={8}>
              <Badge color="teal" variant="light">CTL today: {fmt(summary.last.ctl)}</Badge>
              <Badge color="blue" variant="light">TFI today: {fmt(summary.last.tfi)}</Badge>
              {summary.last.tfi_minus_ctl != null && (
                <Badge color={deltaColor(summary.last.tfi_minus_ctl) || 'gray'} variant="filled">
                  Δ(TFI−CTL): {summary.last.tfi_minus_ctl > 0 ? '+' : ''}{fmt(summary.last.tfi_minus_ctl)}
                </Badge>
              )}
              <Badge color="orange" variant="light">Max Δ in window: {summary.maxDelta > 0 ? '+' : ''}{fmt(summary.maxDelta)}</Badge>
              {Object.entries(tierBreakdown).sort().map(([tier, count]) => (
                <Badge key={tier} color={TIER_COLOR[+tier]} variant="outline" size="sm">
                  {TIER_LABEL[+tier]}: {count}
                </Badge>
              ))}
            </Group>
          )}

          {/* Window selector */}
          <Group gap={12}>
            <Text size="sm" fw={600}>Window:</Text>
            <SegmentedControl
              size="xs"
              value={window_}
              onChange={v => setWindow(v as WindowOption)}
              data={[
                { label: '30d', value: '30' },
                { label: '60d', value: '60' },
                { label: '90d', value: '90' },
                { label: '180d', value: '180' },
              ]}
            />
            <SegmentedControl
              size="xs"
              value={activeTab}
              onChange={v => setActiveTab(v as 'daily' | 'activities')}
              data={[
                { label: 'Daily metrics', value: 'daily' },
                { label: 'Activities', value: 'activities' },
              ]}
            />
          </Group>

          {/* Chart */}
          <Box style={{ border: '1px solid var(--mantine-color-dark-4)' }} p={16}>
            <Text size="xs" fw={700} mb={12} style={{ fontFamily: 'monospace' }}>
              CTL (standard) vs TFI (server-stored)
            </Text>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData} margin={{ top: 4, right: 20, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickFormatter={d => d.slice(5)}
                  interval={windowDays <= 30 ? 3 : windowDays <= 90 ? 6 : 13}
                />
                <YAxis tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
                <ChartTooltip
                  contentStyle={{ fontSize: 11 }}
                  formatter={(v: number, name: string) => [v?.toFixed(1), name]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line
                  type="monotone" dataKey="ctl" name="CTL (standard)"
                  stroke="#4dabf7" strokeWidth={2} dot={false}
                />
                <Line
                  type="monotone" dataKey="tfi" name="TFI (server)"
                  stroke="#f03e3e" strokeWidth={2} dot={false} strokeDasharray="4 2"
                />
                <Line
                  type="monotone" dataKey="rss" name="Daily RSS"
                  stroke="#868e96" strokeWidth={1} dot={false} opacity={0.5}
                />
                {/* Boulder Roubaix Apr 26 */}
                <ReferenceLine x="2026-04-26" stroke="#fab005" strokeWidth={1.5} label={{ value: 'BR', fontSize: 9, fill: '#fab005' }} />
                {/* BWR May 3 */}
                <ReferenceLine x="2026-05-03" stroke="#fab005" strokeWidth={1.5} label={{ value: 'BWR', fontSize: 9, fill: '#fab005' }} />
              </LineChart>
            </ResponsiveContainer>
          </Box>

          {/* Daily table */}
          {activeTab === 'daily' && (
            <ScrollArea>
              <Table striped highlightOnHover withTableBorder withColumnBorders fz="xs">
                <Table.Thead>
                  <Table.Tr>
                    {(
                      [
                        ['date', 'Date'],
                        ['rss', 'RSS'],
                        ['ctl', 'CTL'],
                        ['atl', 'ATL'],
                        ['tsb', 'TSB'],
                        ['tfi', 'TFI (server)'],
                        ['afi', 'AFI (server)'],
                        ['form_score', 'FS'],
                        ['tfi_minus_ctl', 'Δ TFI−CTL'],
                        ['confidence', 'Conf'],
                      ] as [SortKey, string][]
                    ).map(([key, label]) => (
                      <Table.Th
                        key={key}
                        style={{ cursor: 'pointer', fontFamily: 'monospace', fontSize: 11, whiteSpace: 'nowrap' }}
                        onClick={() => handleSort(key)}
                      >
                        {label}{sortIndicator(key)}
                      </Table.Th>
                    ))}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {sortedDaily.map(r => (
                    <Table.Tr key={r.date}>
                      <Table.Td style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.date}</Table.Td>
                      <Table.Td style={{ fontFamily: 'monospace', fontSize: 11 }}>{fmt(r.rss)}</Table.Td>
                      <Table.Td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--mantine-color-teal-5)' }}>{fmt(r.ctl)}</Table.Td>
                      <Table.Td style={{ fontFamily: 'monospace', fontSize: 11 }}>{fmt(r.atl)}</Table.Td>
                      <Table.Td style={{ fontFamily: 'monospace', fontSize: 11 }}>{fmt(r.tsb)}</Table.Td>
                      <Table.Td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--mantine-color-red-5)' }}>{fmt(r.tfi)}</Table.Td>
                      <Table.Td style={{ fontFamily: 'monospace', fontSize: 11 }}>{fmt(r.afi)}</Table.Td>
                      <Table.Td style={{ fontFamily: 'monospace', fontSize: 11 }}>{fmt(r.form_score)}</Table.Td>
                      <Table.Td
                        style={{
                          fontFamily: 'monospace', fontSize: 11,
                          color: r.tfi_minus_ctl != null
                            ? (r.tfi_minus_ctl > 10 ? 'var(--mantine-color-red-5)' :
                              r.tfi_minus_ctl < -10 ? 'var(--mantine-color-blue-5)' : undefined)
                            : undefined,
                          fontWeight: Math.abs(r.tfi_minus_ctl ?? 0) > 20 ? 700 : undefined,
                        }}
                      >
                        {r.tfi_minus_ctl != null ? (r.tfi_minus_ctl > 0 ? '+' : '') + fmt(r.tfi_minus_ctl) : '—'}
                      </Table.Td>
                      <Table.Td style={{ fontFamily: 'monospace', fontSize: 11 }}>{fmt(r.confidence, 2)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          )}

          {/* Activities table */}
          {activeTab === 'activities' && (
            <ScrollArea>
              <Table striped highlightOnHover withTableBorder withColumnBorders fz="xs">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th style={{ fontFamily: 'monospace', fontSize: 11 }}>Date</Table.Th>
                    <Table.Th style={{ fontFamily: 'monospace', fontSize: 11 }}>Name</Table.Th>
                    <Table.Th style={{ fontFamily: 'monospace', fontSize: 11 }}>Type</Table.Th>
                    <Table.Th style={{ fontFamily: 'monospace', fontSize: 11 }}>Duration</Table.Th>
                    <Table.Th style={{ fontFamily: 'monospace', fontSize: 11 }}>RSS (stored)</Table.Th>
                    <Table.Th style={{ fontFamily: 'monospace', fontSize: 11 }}>TSS (legacy)</Table.Th>
                    <Table.Th style={{ fontFamily: 'monospace', fontSize: 11 }}>EP</Table.Th>
                    <Table.Th style={{ fontFamily: 'monospace', fontSize: 11 }}>NP (legacy)</Table.Th>
                    <Table.Th style={{ fontFamily: 'monospace', fontSize: 11 }}>kJ</Table.Th>
                    <Table.Th style={{ fontFamily: 'monospace', fontSize: 11 }}>Client Tier</Table.Th>
                    <Table.Th style={{ fontFamily: 'monospace', fontSize: 11 }}>Source</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {(data?.activities || []).slice(0, 200).map(a => {
                    const durMin = a.moving_time ? Math.round(a.moving_time / 60) : null;
                    return (
                      <Table.Tr key={a.id}>
                        <Table.Td style={{ fontFamily: 'monospace', fontSize: 11 }}>{a.start_date?.slice(0, 10)}</Table.Td>
                        <Table.Td style={{ fontSize: 11, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name || '—'}</Table.Td>
                        <Table.Td style={{ fontFamily: 'monospace', fontSize: 11 }}>{a.type}</Table.Td>
                        <Table.Td style={{ fontFamily: 'monospace', fontSize: 11 }}>{durMin != null ? `${durMin}m` : '—'}</Table.Td>
                        <Table.Td style={{ fontFamily: 'monospace', fontSize: 11, color: a.rss ? 'var(--mantine-color-teal-5)' : undefined }}>{a.rss ?? '—'}</Table.Td>
                        <Table.Td style={{ fontFamily: 'monospace', fontSize: 11 }}>{a.tss ?? '—'}</Table.Td>
                        <Table.Td style={{ fontFamily: 'monospace', fontSize: 11 }}>{a.effective_power ?? '—'}</Table.Td>
                        <Table.Td style={{ fontFamily: 'monospace', fontSize: 11 }}>{a.normalized_power ?? '—'}</Table.Td>
                        <Table.Td style={{ fontFamily: 'monospace', fontSize: 11 }}>{a.kilojoules ?? '—'}</Table.Td>
                        <Table.Td style={{ fontSize: 11 }}>
                          <Badge size="xs" color={TIER_COLOR[a.estimated_tier]} variant={a.estimated_tier >= 4 ? 'filled' : 'light'}>
                            T{a.estimated_tier}
                          </Badge>
                        </Table.Td>
                        <Table.Td style={{ fontFamily: 'monospace', fontSize: 10 }}>{a.rss_source ?? '—'}</Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          )}

        </Stack>
      </Container>
    </AppShell>
  );
}
