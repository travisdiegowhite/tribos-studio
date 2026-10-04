import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Button, Group, Loader, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core';
import { MagnifyingGlass, Plus } from '@phosphor-icons/react';
import { ShopLayout } from '../components/ShopLayout';
import { ItemRow, isLowStock } from '../components/ItemRow';
import { useCatalog, usePhotoUrls } from '../data/useShopData';
import { listItems, primaryPhotoPaths } from '../data/shopApi';
import { formatPrice, isDisplayId, locationName } from '../lib/catalog';
import type { ShopItem } from '../types';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Stack gap={0}>
      <Text ff="'Courier Prime', monospace" fw={700} fz={28}>{value}</Text>
      <Text size="xs" c="dimmed" tt="uppercase">{label}</Text>
    </Stack>
  );
}

/** /shop — find something, add something, see what's running low. */
export default function ShopHome() {
  const navigate = useNavigate();
  const { locations } = useCatalog();
  const [items, setItems] = useState<ShopItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [photoPaths, setPhotoPaths] = useState<Record<string, string>>({});

  useEffect(() => {
    listItems()
      .then(async (rows) => {
        setItems(rows);
        setPhotoPaths(await primaryPhotoPaths(rows.slice(0, 8).map((r) => r.id)));
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const urls = usePhotoUrls(Object.values(photoPaths));
  const low = useMemo(() => (items ?? []).filter(isLowStock), [items]);
  const recent = useMemo(() => (items ?? []).slice(0, 8), [items]);
  const stats = useMemo(() => {
    const rows = items ?? [];
    const pieces = rows.reduce((n, r) => n + r.quantity, 0);
    const valueCents = rows.reduce((n, r) => n + r.quantity * (r.purchase_price_cents ?? 0), 0);
    return { lines: rows.length, pieces, value: formatPrice(valueCents) || '$0.00' };
  }, [items]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = search.trim();
    if (!q) return;
    if (isDisplayId(q)) navigate(`/shop/items/${q.toUpperCase()}`);
    else navigate(`/shop/items?q=${encodeURIComponent(q)}`);
  };

  return (
    <ShopLayout>
      <form onSubmit={submitSearch}>
        <TextInput
          size="lg"
          leftSection={<MagnifyingGlass size={20} />}
          placeholder="Name, ID, brand, part number or barcode"
          aria-label="Search the shop"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
      </form>

      <SimpleGrid cols={2}>
        <Button size="lg" component={Link} to="/shop/add" leftSection={<Plus size={18} />}>Add item</Button>
        <Button size="lg" variant="default" component={Link} to="/shop/items">All items</Button>
      </SimpleGrid>

      {error && <Alert color="red" title="Couldn't load the shop">{error}</Alert>}
      {!items && !error && <Group justify="center" py="xl"><Loader /></Group>}

      {items && (
        <>
          <Group gap="xl">
            <Stat label="Items" value={String(stats.lines)} />
            <Stat label="Pieces" value={String(stats.pieces)} />
            <Stat label="Value" value={stats.value} />
          </Group>

          {low.length > 0 && (
            <Stack gap={0}>
              <Title order={3} style={{ color: 'var(--color-signal-text)' }}>Running low</Title>
              {low.map((item) => (
                <ItemRow key={item.id} item={item} locationLabel={locationName(item.location_id, locations)} />
              ))}
            </Stack>
          )}

          <Stack gap={0}>
            <Title order={3}>Recent</Title>
            {recent.length === 0 ? (
              <Text c="dimmed" py="md">Nothing here yet. Add the first thing on your bench.</Text>
            ) : (
              recent.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  locationLabel={locationName(item.location_id, locations)}
                  photoUrl={urls[photoPaths[item.id]]}
                />
              ))
            )}
          </Stack>
        </>
      )}
    </ShopLayout>
  );
}
