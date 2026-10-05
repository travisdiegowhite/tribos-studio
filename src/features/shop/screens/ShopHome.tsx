import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Button, Chip, Group, Menu, Select, SimpleGrid, Stack, Text, TextInput, UnstyledButton } from '@mantine/core';
import { DotsThreeVertical, FileArrowUp, MagnifyingGlass, MapPin, Plus, Printer, Scan, X } from '@phosphor-icons/react';
import { shopPath } from '../host';
import { useShop } from '../state/ShopProvider';
import { filterItems, inventoryStats, isLowStock, type SortKey } from '../logic/search';
import { pathLabel, rootOf, treeSelectData } from '../logic/tree';
import { useSignedPhotoUrls } from '../data/photos';
import type { ShopCategory, ShopItem, ShopLocation } from '../types';
import { EmptyState, Eyebrow, ItemLabel, LowTag, MONO, ShopPage, StatTile, Thumb, formatMoney, shopHomeBack } from '../ui/primitives';

const PAGE = 100;

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'recent', label: 'Recently changed' },
  { value: 'label', label: 'Label' },
  { value: 'name', label: 'Name' },
  { value: 'quantity', label: 'Quantity (low first)' },
];

export default function ShopHome() {
  const { items, categories, locations } = useShop();
  const navigate = useNavigate();
  // Filters live in the URL so "back" from an item returns to the same list.
  const [params, setParams] = useSearchParams();
  const query = params.get('q') || '';
  const categoryId = params.get('cat');
  const locationId = params.get('loc');
  const lowOnly = params.get('low') === '1';
  const sort = (params.get('sort') as SortKey) || 'recent';
  const [shown, setShown] = useState(PAGE);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
    setShown(PAGE);
  };

  const filtering = !!(query || categoryId || locationId || lowOnly);
  const results = useMemo(
    () => filterItems(items, { query, categoryId, locationId, lowOnly, sort }, categories, locations),
    [items, query, categoryId, locationId, lowOnly, sort, categories, locations],
  );
  const stats = useMemo(() => inventoryStats(items), [items]);
  const low = useMemo(() => items.filter(isLowStock), [items]);
  const visible = results.slice(0, shown);
  const photoUrls = useSignedPhotoUrls(visible.map((i) => i.photo_path));

  const categoryOptions = useMemo(() => treeSelectData(categories), [categories]);
  const locationOptions = useMemo(
    () => [{ value: 'none', label: 'No location' }, ...treeSelectData(locations)],
    [locations],
  );

  // Enter on an exact label jumps straight to the item (a typed or scanned TL-0001).
  const onSearchKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    const exact = items.find((i) => i.display_id.toLowerCase() === query.trim().toLowerCase());
    if (exact) navigate(shopPath(`items/${exact.display_id}`));
    else if (results.length === 1) navigate(shopPath(`items/${results[0].display_id}`));
  };

  return (
    <ShopPage
      title="Shop"
      subtitle="Parts, spares and tools — what you have and where it is."
      back={shopHomeBack}
      actions={
        <>
          <Button component={Link} to={shopPath('scan')} variant="default" leftSection={<Scan size={16} />}>Scan</Button>
          <Button component={Link} to={shopPath('items/new')} leftSection={<Plus size={16} />}>Add item</Button>
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <Button variant="default" px="xs" aria-label="More"><DotsThreeVertical size={18} /></Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item component={Link} to={shopPath('setup')} leftSection={<MapPin size={16} />}>Locations &amp; categories</Menu.Item>
              <Menu.Item component={Link} to={shopPath('labels')} leftSection={<Printer size={16} />}>Print labels</Menu.Item>
              <Menu.Item component={Link} to={shopPath('transfer')} leftSection={<FileArrowUp size={16} />}>Import / export CSV</Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </>
      }
    >
      <SimpleGrid cols={{ base: 2, xs: 4 }} spacing="xs">
        <StatTile label="Items" value={stats.items} />
        <StatTile label="Units" value={stats.units} />
        <StatTile label="Value" value={formatMoney(stats.value)} />
        <StatTile label="Low stock" value={stats.low} tone={stats.low ? 'signal' : undefined} />
      </SimpleGrid>

      <Stack gap="xs">
        <TextInput
          size="md"
          placeholder="Search name, label, brand, part number…"
          leftSection={<MagnifyingGlass size={18} />}
          rightSection={query ? (
            <UnstyledButton aria-label="Clear search" onClick={() => setParam('q', null)}><X size={16} /></UnstyledButton>
          ) : null}
          value={query}
          onChange={(e) => setParam('q', e.currentTarget.value || null)}
          onKeyDown={onSearchKey}
          autoComplete="off"
        />
        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="xs" verticalSpacing="xs">
          <Select
            size="xs" placeholder="All categories" clearable searchable aria-label="Category"
            data={categoryOptions} value={categoryId} onChange={(v) => setParam('cat', v)}
          />
          <Select
            size="xs" placeholder="All locations" clearable searchable aria-label="Location"
            data={locationOptions} value={locationId} onChange={(v) => setParam('loc', v)}
          />
          <Select
            size="xs" data={SORTS} value={sort} allowDeselect={false} aria-label="Sort"
            onChange={(v) => setParam('sort', v === 'recent' ? null : v)}
          />
          <Group align="center">
            <Chip size="xs" checked={lowOnly} onChange={(c) => setParam('low', c ? '1' : null)}>Low stock only</Chip>
          </Group>
        </SimpleGrid>
      </Stack>

      {!filtering && low.length > 0 && (
        <Box>
          <Eyebrow accent="var(--color-signal)">Running low · {low.length}</Eyebrow>
          <Group gap="xs" wrap="wrap">
            {low.slice(0, 12).map((i) => (
              <UnstyledButton
                key={i.id}
                component={Link}
                to={shopPath(`items/${i.display_id}`)}
                style={{ border: '1px solid var(--color-signal-border)', padding: '4px 8px', borderRadius: 0 }}
              >
                <Text size="sm" style={{ color: 'var(--color-text-primary)' }}>
                  {i.name} <span style={{ fontFamily: MONO, color: 'var(--color-signal-text)', fontWeight: 700 }}>{i.quantity}/{i.min_quantity}</span>
                </Text>
              </UnstyledButton>
            ))}
            {low.length > 12 && (
              <Button size="compact-sm" variant="subtle" onClick={() => setParam('low', '1')}>All {low.length}</Button>
            )}
          </Group>
        </Box>
      )}

      <Box>
        <Eyebrow right={<Text size="xs" c="dimmed" style={{ fontFamily: MONO }}>{results.length} of {items.length}</Text>}>
          {filtering ? 'Results' : 'Inventory'}
        </Eyebrow>
        {items.length === 0 ? (
          <EmptyState title="Nothing on the shelves yet">
            <Text size="sm">Add your first part or tool, or bring a spreadsheet in with CSV import.</Text>
            <Group justify="center" mt="md" gap="xs">
              <Button component={Link} to={shopPath('items/new')} leftSection={<Plus size={16} />}>Add item</Button>
              <Button component={Link} to={shopPath('transfer')} variant="default">Import CSV</Button>
            </Group>
          </EmptyState>
        ) : results.length === 0 ? (
          <EmptyState title="No matches">
            <Text size="sm">Try fewer words, or clear the filters.</Text>
          </EmptyState>
        ) : (
          <Box style={{ borderTop: '1px solid var(--color-border)' }}>
            {visible.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                categories={categories}
                locations={locations}
                photoUrl={item.photo_path ? photoUrls[item.photo_path] : null}
              />
            ))}
            {results.length > shown && (
              <Group justify="center" py="md">
                <Button variant="default" onClick={() => setShown((n) => n + PAGE)}>
                  Show more ({results.length - shown} left)
                </Button>
              </Group>
            )}
          </Box>
        )}
      </Box>
    </ShopPage>
  );
}

function ItemRow({ item, categories, locations, photoUrl }: {
  item: ShopItem;
  categories: ShopCategory[];
  locations: ShopLocation[];
  photoUrl: string | null;
}) {
  const where = pathLabel(item.location_id, locations);
  const make = [item.brand, item.model].filter(Boolean).join(' ');
  const isTool = rootOf(item.category_id, categories)?.prefix === 'TL';
  return (
    <UnstyledButton
      component={Link}
      to={shopPath(`items/${item.display_id}`)}
      style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 2px', borderBottom: '1px solid var(--color-border)', width: '100%' }}
    >
      <Thumb url={photoUrl} tool={isTool} />
      <Box style={{ flex: 1, minWidth: 0 }}>
        <Group gap={8} wrap="nowrap">
          <ItemLabel id={item.display_id} size="xs" />
          <Text size="sm" fw={600} truncate style={{ color: 'var(--color-text-primary)' }}>{item.name}</Text>
        </Group>
        <Text size="xs" truncate style={{ color: 'var(--color-text-muted)' }}>
          {[make, where || 'No location'].filter(Boolean).join(' · ')}
        </Text>
      </Box>
      <Stack gap={2} align="flex-end" style={{ flex: '0 0 auto' }}>
        <Text style={{ fontFamily: MONO, fontWeight: 700, fontSize: 16, color: 'var(--color-text-primary)' }}>×{item.quantity}</Text>
        {isLowStock(item) && <LowTag />}
      </Stack>
    </UnstyledButton>
  );
}
