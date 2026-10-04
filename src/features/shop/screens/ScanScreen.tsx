import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Box, Button, Group, Stack, Text, TextInput, UnstyledButton } from '@mantine/core';
import { Plus } from '@phosphor-icons/react';
import { shopPath } from '../host';
import { useShop } from '../state/ShopProvider';
import { parseScan, sameBarcode } from '../logic/scan';
import { Scanner } from '../ui/Scanner';
import { EmptyState, Eyebrow, ItemLabel, MONO, ShopPage } from '../ui/primitives';
import type { ShopItem } from '../types';

/**
 * One screen for every code in the shop: a printed QR label opens its item
 * or location, a product barcode finds the item carrying that UPC — or
 * offers to add it.
 */
export default function ScanScreen() {
  const { items, locations } = useShop();
  const navigate = useNavigate();
  const [miss, setMiss] = useState<{ code: string; kind: 'barcode' | 'label' | 'text' } | null>(null);
  const [matches, setMatches] = useState<ShopItem[] | null>(null);
  const [typed, setTyped] = useState('');
  const [scanKey, setScanKey] = useState(0); // remount = scan again

  const handle = (raw: string) => {
    setMiss(null);
    setMatches(null);
    const r = parseScan(raw);
    if (r.kind === 'item') {
      if (items.some((i) => i.display_id === r.label)) navigate(shopPath(`items/${r.label}`));
      else setMiss({ code: r.label, kind: 'label' });
      return;
    }
    if (r.kind === 'location') {
      if (locations.some((l) => l.id === r.id)) navigate(shopPath(`?loc=${r.id}`));
      else setMiss({ code: r.id, kind: 'label' });
      return;
    }
    if (r.kind === 'barcode') {
      const hits = items.filter((i) => sameBarcode(i.upc, r.code));
      if (hits.length === 1) navigate(shopPath(`items/${hits[0].display_id}`));
      else if (hits.length > 1) setMatches(hits);
      else setMiss({ code: r.code, kind: 'barcode' });
      return;
    }
    navigate(shopPath(`?q=${encodeURIComponent(r.text)}`));
  };

  const again = () => { setMiss(null); setMatches(null); setScanKey((k) => k + 1); };

  return (
    <ShopPage title="Scan" subtitle="A label opens its item or shelf; a product barcode finds it or adds it.">
      {!miss && !matches && <Scanner key={scanKey} onResult={handle} />}

      {miss?.kind === 'barcode' && (
        <EmptyState title="Not in the shop yet">
          <Text size="sm">Barcode <span style={{ fontFamily: MONO }}>{miss.code}</span> isn&rsquo;t on any item.</Text>
          <Group justify="center" mt="md" gap="xs">
            <Button component={Link} to={shopPath(`items/new?upc=${miss.code}`)} leftSection={<Plus size={16} />}>Add it</Button>
            <Button variant="default" onClick={again}>Scan again</Button>
          </Group>
        </EmptyState>
      )}
      {miss?.kind === 'label' && (
        <EmptyState title="Unknown label">
          <Text size="sm">That label isn&rsquo;t in this shop — it may have been deleted.</Text>
          <Group justify="center" mt="md"><Button variant="default" onClick={again}>Scan again</Button></Group>
        </EmptyState>
      )}
      {matches && (
        <Box>
          <Eyebrow>{matches.length} items share that barcode</Eyebrow>
          <Stack gap={0} style={{ borderTop: '1px solid var(--color-border)' }}>
            {matches.map((i) => (
              <UnstyledButton key={i.id} component={Link} to={shopPath(`items/${i.display_id}`)}
                style={{ padding: '10px 0', borderBottom: '1px solid var(--color-border)' }}>
                <Group gap="sm" wrap="nowrap">
                  <ItemLabel id={i.display_id} size="xs" />
                  <Text size="sm" style={{ flex: 1 }}>{i.name}</Text>
                  <Text style={{ fontFamily: MONO, fontWeight: 700 }}>×{i.quantity}</Text>
                </Group>
              </UnstyledButton>
            ))}
          </Stack>
          <Group mt="md"><Button variant="default" onClick={again}>Scan again</Button></Group>
        </Box>
      )}

      <Box>
        <Eyebrow>Or type it</Eyebrow>
        <form onSubmit={(e) => { e.preventDefault(); if (typed.trim()) handle(typed); }}>
          <Group gap="xs" wrap="nowrap">
            <TextInput style={{ flex: 1 }} placeholder="TL-0001, a barcode number, or a name" value={typed}
              onChange={(e) => setTyped(e.currentTarget.value)} styles={{ input: { fontFamily: MONO } }} />
            <Button type="submit" variant="default">Go</Button>
          </Group>
        </form>
      </Box>
    </ShopPage>
  );
}
