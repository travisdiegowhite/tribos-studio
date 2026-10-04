import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, Group, Loader, SegmentedControl, Select, SimpleGrid, Stack, Switch, Text, TextInput } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { ShopLayout } from '../components/ShopLayout';
import { ItemRow } from '../components/ItemRow';
import { useCatalog, usePhotoUrls } from '../data/useShopData';
import { listItems, primaryPhotoPaths } from '../data/shopApi';
import { locationName, treeOptions } from '../lib/catalog';
import type { ItemKind, ShopItem } from '../types';

/** /shop/items — everything, filterable. The search term lives in ?q= so it survives back/forward. */
export default function ItemsPage() {
  const [params, setParams] = useSearchParams();
  const { categories, locations } = useCatalog();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [debounced] = useDebouncedValue(search, 250);
  const [kind, setKind] = useState<ItemKind | 'all'>('all');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [items, setItems] = useState<ShopItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photoPaths, setPhotoPaths] = useState<Record<string, string>>({});

  useEffect(() => {
    setParams(debounced ? { q: debounced } : {}, { replace: true });
  }, [debounced, setParams]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    listItems({ search: debounced, kind: kind === 'all' ? null : kind, categoryId, locationId, includeArchived })
      .then(async (rows) => {
        if (cancelled) return;
        setItems(rows);
        const paths = await primaryPhotoPaths(rows.slice(0, 100).map((r) => r.id));
        if (!cancelled) setPhotoPaths(paths);
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [debounced, kind, categoryId, locationId, includeArchived]);

  const urls = usePhotoUrls(Object.values(photoPaths));
  const categoryOptions = useMemo(() => treeOptions(categories), [categories]);
  const locationOptions = useMemo(() => treeOptions(locations), [locations]);

  return (
    <ShopLayout title="Items">
      <Stack gap="sm">
        <TextInput
          leftSection={<MagnifyingGlass size={18} />}
          placeholder="Name, ID, brand, part number or barcode"
          aria-label="Search items"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
        <SegmentedControl
          fullWidth
          value={kind}
          onChange={(v) => setKind(v as ItemKind | 'all')}
          data={[
            { value: 'all', label: 'All' },
            { value: 'part', label: 'Parts' },
            { value: 'tool', label: 'Tools' },
            { value: 'consumable', label: 'Consumables' },
          ]}
        />
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Select placeholder="Any category" data={categoryOptions} value={categoryId} onChange={setCategoryId} clearable searchable aria-label="Category" />
          <Select placeholder="Any location" data={locationOptions} value={locationId} onChange={setLocationId} clearable searchable aria-label="Location" />
        </SimpleGrid>
        <Switch label="Show archived" checked={includeArchived} onChange={(e) => setIncludeArchived(e.currentTarget.checked)} />
      </Stack>

      {error && <Alert color="red" title="Couldn't load items">{error}</Alert>}
      {!items && !error && <Group justify="center" py="xl"><Loader /></Group>}
      {items && (
        <Stack gap={0}>
          <Text size="xs" c="dimmed" pb="xs">{items.length} {items.length === 1 ? 'item' : 'items'}</Text>
          {items.length === 0 && <Text c="dimmed" py="md">Nothing matches.</Text>}
          {items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              locationLabel={locationName(item.location_id, locations)}
              photoUrl={urls[photoPaths[item.id]]}
            />
          ))}
        </Stack>
      )}
    </ShopLayout>
  );
}
