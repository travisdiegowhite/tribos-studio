import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Box, Button, Code, FileButton, Group, Progress, Stack, Table, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { DownloadSimple, FileCsv, UploadSimple } from '@phosphor-icons/react';
import { shopPath } from '../host';
import { useShop } from '../state/ShopProvider';
import { CSV_COLUMNS, exportItemsCsv, planImport, toCsv, type ImportPlan } from '../logic/csv';
import { pathLabel } from '../logic/tree';
import { Eyebrow, MONO, ShopPage } from '../ui/primitives';

const PREVIEW_ROWS = 25;

function download(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function TransferScreen() {
  const { items, categories, locations, runImport } = useShop();
  const [fileName, setFileName] = useState<string | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [imported, setImported] = useState<number | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  const onFile = async (file: File | null) => {
    setImported(null);
    setProgress(null);
    if (!file) { setPlan(null); setFileName(null); return; }
    setFileName(file.name);
    setPlan(planImport(await file.text(), categories, locations));
  };

  const ready = plan?.rows.filter((r) => r.draft) ?? [];
  const broken = plan?.rows.filter((r) => !r.draft) ?? [];
  const warned = plan?.rows.filter((r) => r.warnings.length) ?? [];

  const doImport = async () => {
    if (!plan || !ready.length) return;
    setProgress({ done: 0, total: ready.length });
    try {
      const n = await runImport(plan, (done, total) => setProgress({ done, total }));
      setImported(n);
      setPlan(null);
      notifications.show({ title: `Imported ${n} item${n === 1 ? '' : 's'}`, message: fileName || '', color: 'green' });
    } catch (err) {
      notifications.show({ title: 'Import stopped', message: err instanceof Error ? err.message : 'Try again', color: 'red' });
    } finally {
      setProgress(null);
    }
  };

  const template = toCsv([
    [...CSV_COLUMNS],
    ['', 'Chain whip', 'Tools > Drivetrain tools', 'Garage > Pegboard', '1', '', 'Park Tool', 'SR-12.2', 'SR-12.2', '', 'good', '', '', '45.00', '', ''],
    ['', '11-speed chain', 'Components > Drivetrain', 'Garage > Tool cabinet > Drawer 2', '3', '1', 'Shimano', 'CN-HG701', 'CN-HG701-11', '', 'new', '11-speed; Shimano', '', '32.99', '2026-03-14', 'Quick link included'],
  ]);

  return (
    <ShopPage title="Import / export" subtitle="Move the inventory in and out as CSV (opens in any spreadsheet).">
      <Box>
        <Eyebrow>Export</Eyebrow>
        <Group gap="xs">
          <Button leftSection={<DownloadSimple size={16} />} disabled={!items.length}
            onClick={() => download(`shop-inventory-${today}.csv`, exportItemsCsv(items, categories, locations))}>
            Download {items.length} item{items.length === 1 ? '' : 's'}
          </Button>
          <Button variant="default" leftSection={<FileCsv size={16} />} onClick={() => download('shop-import-template.csv', template)}>
            Template
          </Button>
        </Group>
      </Box>

      <Box>
        <Eyebrow>Import</Eyebrow>
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Only <b>name</b> is required. Categories and locations use paths like{' '}
            <Code>Garage &gt; Tool cabinet</Code>. Locations that don&rsquo;t exist yet are created; an unknown
            category files the item under Other. Lists (fits, tags) are separated with <Code>;</Code>. Labels are
            always assigned fresh, so an exported file imports as new items.
          </Text>
          <Group gap="xs">
            <FileButton onChange={onFile} accept=".csv,text/csv">
              {(props) => <Button {...props} variant="default" leftSection={<UploadSimple size={16} />}>{fileName ? 'Choose another file' : 'Choose CSV file'}</Button>}
            </FileButton>
            {fileName && <Text size="sm" style={{ fontFamily: MONO }}>{fileName}</Text>}
          </Group>

          {imported != null && (
            <Text size="sm">
              Done — {imported} item{imported === 1 ? '' : 's'} added. <Link to={shopPath('?sort=label')}>See the inventory</Link>
            </Text>
          )}

          {plan?.fatal && <Text size="sm" style={{ color: 'var(--color-signal-text)' }}>{plan.fatal}</Text>}

          {plan && !plan.fatal && (
            <Stack gap="sm">
              <Text size="sm" style={{ fontFamily: MONO }}>
                {ready.length} ready · {broken.length} skipped · {warned.length} with warnings
                {plan.newLocationPaths.length > 0 && ` · ${plan.newLocationPaths.length} new location${plan.newLocationPaths.length === 1 ? '' : 's'}`}
              </Text>
              {plan.unknownColumns.length > 0 && (
                <Text size="xs" c="dimmed">Ignored columns: {plan.unknownColumns.join(', ')}</Text>
              )}
              {plan.newLocationPaths.length > 0 && (
                <Text size="xs" c="dimmed">Will create: {plan.newLocationPaths.join(' · ')}</Text>
              )}

              <Box style={{ overflowX: 'auto', border: '1px solid var(--color-border)' }}>
                <Table fz="xs" striped={false} withRowBorders verticalSpacing={4} miw={560}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Line</Table.Th><Table.Th>Name</Table.Th><Table.Th>Category</Table.Th>
                      <Table.Th>Location</Table.Th><Table.Th>Qty</Table.Th><Table.Th>Notes</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {plan.rows.slice(0, PREVIEW_ROWS).map((r) => (
                      <Table.Tr key={r.line} style={{ opacity: r.draft ? 1 : 0.55 }}>
                        <Table.Td style={{ fontFamily: MONO }}>{r.line}</Table.Td>
                        <Table.Td>{r.draft?.name || '—'}</Table.Td>
                        <Table.Td>{r.draft ? pathLabel(r.draft.category_id, categories) : '—'}</Table.Td>
                        <Table.Td>{r.draft ? (r.newLocationPath ? `${r.newLocationPath} (new)` : pathLabel(r.draft.location_id, locations) || '—') : '—'}</Table.Td>
                        <Table.Td style={{ fontFamily: MONO }}>{r.draft?.quantity ?? '—'}</Table.Td>
                        <Table.Td style={{ color: r.errors.length ? 'var(--color-signal-text)' : 'var(--color-text-muted)' }}>
                          {[...r.errors, ...r.warnings].join('; ')}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Box>
              {plan.rows.length > PREVIEW_ROWS && (
                <Text size="xs" c="dimmed">Showing the first {PREVIEW_ROWS} of {plan.rows.length} rows.</Text>
              )}

              {progress && <Progress value={(progress.done / Math.max(1, progress.total)) * 100} />}
              <Group>
                <Button onClick={doImport} disabled={!ready.length || !!progress} loading={!!progress}>
                  Import {ready.length} item{ready.length === 1 ? '' : 's'}
                </Button>
              </Group>
            </Stack>
          )}
        </Stack>
      </Box>
    </ShopPage>
  );
}
