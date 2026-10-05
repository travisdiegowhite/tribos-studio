import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import {
  Box, Button, Checkbox, Group, NumberInput, SegmentedControl, Select, SimpleGrid, Stack, Text, TextInput,
} from '@mantine/core';
import { MagnifyingGlass, Printer } from '@phosphor-icons/react';
import QRCode from 'qrcode';
import { shopPublicUrl } from '../host';
import { useShop } from '../state/ShopProvider';
import { filterItems } from '../logic/search';
import { pathLabel, treeSelectData } from '../logic/tree';
import { LABEL_STOCKS, paginate, perPage, type LabelStock } from '../logic/labelSheets';
import { Eyebrow, MONO, ShopPage } from '../ui/primitives';

interface PrintLabel {
  key: string;
  url: string;
  title: string;
  subtitle: string;
}

const MAX_LABELS = 300;

export default function LabelsScreen() {
  const { items, categories, locations } = useShop();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<'items' | 'locations'>(params.get('locs') ? 'locations' : 'items');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(
    params.get('locs')?.split(',') ?? params.get('items')?.split(',').map((s) => s.toUpperCase()) ?? [],
  ));
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [stockId, setStockId] = useState(() => readPref('stock') || LABEL_STOCKS[0].id);
  const [startAt, setStartAt] = useState<number | string>(1);
  const [nudgeX, setNudgeX] = useState<number | string>(() => Number(readPref('nudgeX')) || 0);
  const [nudgeY, setNudgeY] = useState<number | string>(() => Number(readPref('nudgeY')) || 0);
  const stock = LABEL_STOCKS.find((s) => s.id === stockId) || LABEL_STOCKS[0];

  useEffect(() => { writePref('stock', stockId); }, [stockId]);
  useEffect(() => { writePref('nudgeX', String(nudgeX || 0)); writePref('nudgeY', String(nudgeY || 0)); }, [nudgeX, nudgeY]);

  const switchMode = (m: 'items' | 'locations') => { setMode(m); setSelected(new Set()); };

  // Candidates the checklist shows.
  const itemRows = useMemo(
    () => filterItems(items, { query, categoryId, sort: 'label' }, categories, locations),
    [items, query, categoryId, categories, locations],
  );
  const locationRows = useMemo(
    () => treeSelectData(locations).filter((l) => !query || l.label.toLowerCase().includes(query.toLowerCase())),
    [locations, query],
  );
  const visibleKeys = mode === 'items' ? itemRows.map((i) => i.display_id) : locationRows.map((l) => l.value);
  const allVisibleOn = visibleKeys.length > 0 && visibleKeys.every((k) => selected.has(k));

  const toggle = (key: string) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const toggleAll = () => setSelected((s) => {
    const next = new Set(s);
    for (const k of visibleKeys) { if (allVisibleOn) next.delete(k); else next.add(k); }
    return next;
  });

  // What gets printed, in a stable order.
  const labels: PrintLabel[] = useMemo(() => {
    if (mode === 'items') {
      return items
        .filter((i) => selected.has(i.display_id))
        .sort((a, b) => a.display_id.localeCompare(b.display_id, undefined, { numeric: true }))
        .map((i) => ({
          key: i.display_id,
          url: shopPublicUrl(`items/${i.display_id}`),
          title: i.display_id,
          subtitle: [i.name, i.brand].filter(Boolean).join(' · '),
        }));
    }
    return treeSelectData(locations)
      .filter((l) => selected.has(l.value))
      .map((l) => ({
        key: l.value,
        url: shopPublicUrl(`?loc=${l.value}`),
        title: locations.find((x) => x.id === l.value)?.name || l.label,
        subtitle: pathLabel(l.value, locations),
      }));
  }, [mode, items, locations, selected]);

  const qr = useQrSvgs(labels.slice(0, MAX_LABELS).map((l) => l.url));
  const pages = useMemo(
    () => paginate(labels.slice(0, MAX_LABELS), stock, Number(startAt) || 1),
    [labels, stock, startAt],
  );
  const nudge = { x: Number(nudgeX) || 0, y: Number(nudgeY) || 0 };

  return (
    <ShopPage title="Print labels" subtitle="QR labels that open the item (or shelf) from any phone camera.">
      <SegmentedControl value={mode} onChange={(v) => switchMode(v as 'items' | 'locations')}
        data={[{ value: 'items', label: 'Items' }, { value: 'locations', label: 'Locations' }]} />

      <Box>
        <Eyebrow right={<Text size="xs" style={{ fontFamily: MONO, color: 'var(--color-text-muted)' }}>{selected.size} selected</Text>}>
          Choose
        </Eyebrow>
        <Group gap="xs" mb="xs" wrap="wrap">
          <TextInput size="xs" placeholder="Filter…" leftSection={<MagnifyingGlass size={14} />} value={query}
            onChange={(e) => setQuery(e.currentTarget.value)} style={{ flex: '1 1 180px' }} />
          {mode === 'items' && (
            <Select size="xs" placeholder="All categories" clearable searchable data={treeSelectData(categories)}
              value={categoryId} onChange={setCategoryId} style={{ flex: '1 1 180px' }} />
          )}
          <Button size="xs" variant="default" onClick={toggleAll} disabled={!visibleKeys.length}>
            {allVisibleOn ? 'Clear these' : `Select ${visibleKeys.length}`}
          </Button>
        </Group>
        <Box style={{ maxHeight: 260, overflowY: 'auto', borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)' }}>
          {mode === 'items'
            ? itemRows.map((i) => (
                <Checkbox key={i.id} py={6} checked={selected.has(i.display_id)} onChange={() => toggle(i.display_id)}
                  label={<span><span style={{ fontFamily: MONO, fontWeight: 700 }}>{i.display_id}</span> {i.name}</span>} />
              ))
            : locationRows.map((l) => (
                <Checkbox key={l.value} py={6} checked={selected.has(l.value)} onChange={() => toggle(l.value)} label={l.label} />
              ))}
          {visibleKeys.length === 0 && <Text size="sm" c="dimmed" py="sm">Nothing matches.</Text>}
        </Box>
        {labels.length > MAX_LABELS && (
          <Text size="xs" mt={4} style={{ color: 'var(--color-signal-text)' }}>Printing the first {MAX_LABELS}; do the rest in another batch.</Text>
        )}
      </Box>

      <Box>
        <Eyebrow>Label stock</Eyebrow>
        <Stack gap="xs">
          <Select data={LABEL_STOCKS.map((s) => ({ value: s.id, label: s.name }))} value={stockId}
            onChange={(v) => v && setStockId(v)} allowDeselect={false} />
          <SimpleGrid cols={{ base: 1, xs: 3 }} spacing="xs">
            {perPage(stock) > 1 && (
              <NumberInput label="Start at position" description={`1–${perPage(stock)}, for a used sheet`}
                min={1} max={perPage(stock)} allowDecimal={false} value={startAt} onChange={setStartAt} />
            )}
            <NumberInput label="Nudge right (mm)" description="If labels print off-centre" step={0.5} decimalScale={1}
              value={nudgeX} onChange={setNudgeX} />
            <NumberInput label="Nudge down (mm)" description="Remembered for next time" step={0.5} decimalScale={1}
              value={nudgeY} onChange={setNudgeY} />
          </SimpleGrid>
          <Text size="xs" c="dimmed">
            Print at <b>100% / Actual size</b> with margins set to <b>None</b>. Try one sheet on plain paper and hold it against the
            label stock before using the real thing.
          </Text>
        </Stack>
      </Box>

      <Group justify="space-between" align="center">
        <Text size="sm" style={{ fontFamily: MONO }}>
          {labels.length} label{labels.length === 1 ? '' : 's'} · {pages.length} page{pages.length === 1 ? '' : 's'}
        </Text>
        <Button leftSection={<Printer size={16} />} disabled={!labels.length} onClick={() => window.print()}>Print</Button>
      </Group>

      {labels.length > 0 && (
        <Box>
          <Eyebrow>Preview</Eyebrow>
          <Stack gap="md" align="flex-start">
            {pages.slice(0, 3).map((page, i) => (
              <ScaledPage key={i} stock={stock}>
                <SheetPage stock={stock} slots={page} qr={qr} nudge={nudge} preview />
              </ScaledPage>
            ))}
            {pages.length > 3 && <Text size="xs" c="dimmed">…and {pages.length - 3} more page{pages.length - 3 === 1 ? '' : 's'}.</Text>}
          </Stack>
        </Box>
      )}

      <PrintPortal stock={stock}>
        {pages.map((page, i) => (
          <SheetPage key={i} stock={stock} slots={page} qr={qr} nudge={nudge} />
        ))}
      </PrintPortal>
    </ShopPage>
  );
}

// ── Rendering ───────────────────────────────────────────────────────────

function SheetPage({ stock, slots, qr, nudge, preview = false }: {
  stock: LabelStock;
  slots: ReturnType<typeof paginate<PrintLabel>>[number];
  qr: Record<string, string>;
  nudge: { x: number; y: number };
  preview?: boolean;
}) {
  return (
    <div
      className="shop-print-page"
      style={{
        position: 'relative', width: `${stock.pageW}mm`, height: `${stock.pageH}mm`, overflow: 'hidden',
        background: '#fff', color: '#000', boxSizing: 'border-box',
      }}
    >
      {slots.map((slot, i) => (
        <div
          key={i}
          style={{
            position: 'absolute', left: `${slot.x + nudge.x}mm`, top: `${slot.y + nudge.y}mm`,
            width: `${stock.labelW}mm`, height: `${stock.labelH}mm`, boxSizing: 'border-box',
            outline: preview || stock.cutLines ? `0.2mm ${stock.cutLines ? 'dashed' : 'solid'} #bbb` : undefined,
          }}
        >
          {slot.label && <LabelFace stock={stock} label={slot.label} svg={qr[slot.label.url]} />}
        </div>
      ))}
    </div>
  );
}

/** QR on the left, label text on the right; squares stack QR over text. */
function LabelFace({ stock, label, svg }: { stock: LabelStock; label: PrintLabel; svg?: string }) {
  const square = stock.labelW / stock.labelH < 1.4;
  const pad = Math.min(stock.labelW, stock.labelH) * 0.07;
  const qrSize = square ? stock.labelH * 0.62 : stock.labelH - pad * 2;
  const titleMm = Math.min(stock.labelH * (square ? 0.13 : 0.3), 9);
  return (
    <div style={{
      display: 'flex', flexDirection: square ? 'column' : 'row', alignItems: 'center', gap: `${pad}mm`,
      padding: `${pad}mm`, width: '100%', height: '100%', boxSizing: 'border-box', overflow: 'hidden',
    }}>
      <div
        className="shop-qr"
        style={{ width: `${qrSize}mm`, height: `${qrSize}mm`, flex: '0 0 auto' }}
        // SVG markup generated locally by the qrcode library from our own URL.
        dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
      />
      <div style={{ minWidth: 0, flex: 1, textAlign: square ? 'center' : 'left', width: square ? '100%' : undefined }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: `${titleMm}mm`, lineHeight: 1.05, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {label.title}
        </div>
        <div style={{
          fontFamily: 'var(--font-body)', fontSize: `${Math.max(titleMm * 0.42, 2.2)}mm`, lineHeight: 1.2, marginTop: '0.6mm',
          display: '-webkit-box', WebkitLineClamp: square ? 2 : 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {label.subtitle}
        </div>
      </div>
    </div>
  );
}

/** Fits a real-size page into the column for the on-screen preview. */
function ScaledPage({ stock, children }: { stock: LabelStock; children: React.ReactNode }) {
  const pxPerMm = 96 / 25.4;
  const maxW = Math.min(typeof window === 'undefined' ? 600 : window.innerWidth - 40, 640);
  const scale = Math.min(1, maxW / (stock.pageW * pxPerMm));
  return (
    <div style={{ width: stock.pageW * pxPerMm * scale, height: stock.pageH * pxPerMm * scale, border: '1px solid var(--color-border)', overflow: 'hidden' }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>{children}</div>
    </div>
  );
}

/**
 * The printed copy lives outside the app root so print CSS can hide the whole
 * app (nav, page chrome) with one rule and let the pages flow one per sheet.
 */
function PrintPortal({ stock, children }: { stock: LabelStock; children: React.ReactNode }) {
  const css = `
    .shop-print-portal { display: none; }
    .shop-qr svg { width: 100%; height: 100%; display: block; }
    @media print {
      @page { size: ${stock.pageW}mm ${stock.pageH}mm; margin: 0; }
      html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
      body > *:not(.shop-print-portal) { display: none !important; }
      .shop-print-portal { display: block !important; }
      .shop-print-page { break-after: page; page-break-after: always; }
      .shop-print-page:last-child { break-after: auto; page-break-after: auto; }
      .shop-print-portal * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }`;
  return createPortal(
    <div className="shop-print-portal">
      <style>{css}</style>
      {children}
    </div>,
    document.body,
  );
}

// ── QR + prefs ──────────────────────────────────────────────────────────

const qrCache = new Map<string, string>();

function useQrSvgs(urls: string[]): Record<string, string> {
  const key = urls.join('\n');
  const [svgs, setSvgs] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    const list = key ? key.split('\n') : [];
    Promise.all(list.map(async (u) => {
      if (!qrCache.has(u)) {
        // Quiet zone is the label's own white margin; M recovers from a scuffed sticker.
        qrCache.set(u, await QRCode.toString(u, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }));
      }
      return [u, qrCache.get(u)!] as const;
    })).then((pairs) => { if (!cancelled) setSvgs(Object.fromEntries(pairs)); });
    return () => { cancelled = true; };
  }, [key]);
  return svgs;
}

function readPref(k: string): string | null {
  try { return localStorage.getItem(`shop-labels-${k}`); } catch { return null; }
}
function writePref(k: string, v: string): void {
  try { localStorage.setItem(`shop-labels-${k}`, v); } catch { /* private mode */ }
}
