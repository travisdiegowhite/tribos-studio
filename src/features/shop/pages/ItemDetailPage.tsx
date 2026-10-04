import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Alert, Badge, Button, FileButton, Group, Image, Loader, Modal, ScrollArea, Select, SimpleGrid, Stack, Table, Text, Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Archive, ArrowCounterClockwise, Camera, PencilSimple } from '@phosphor-icons/react';
import { useAuth } from '../host';
import { ShopLayout } from '../components/ShopLayout';
import { DisplayId } from '../components/DisplayId';
import { QuantityStepper } from '../components/QuantityStepper';
import { ItemForm, itemToInput } from '../components/ItemForm';
import { isLowStock } from '../components/ItemRow';
import { useCatalog, usePhotoUrls } from '../data/useShopData';
import {
  addPhoto, adjustQuantity, getItemByDisplayId, listActivity, listPhotos, setArchived, updateItem,
} from '../data/shopApi';
import { formatPrice, locationName, pathLabel, treeOptions } from '../lib/catalog';
import type { ItemInput, ShopActivity, ShopItem, ShopItemPhoto, ShopLocation } from '../types';

const CONDITION_LABEL: Record<ShopItem['condition'], string> = {
  new: 'New', good: 'Good', fair: 'Fair', worn: 'Worn', unknown: 'Unknown',
};

function describe(a: ShopActivity, locations: ShopLocation[]): string {
  const d = a.details as Record<string, unknown>;
  switch (a.action) {
    case 'created': return `Added (${d.quantity ?? 1})`;
    case 'quantity': return `Count ${d.from} → ${d.to}`;
    case 'moved': return `Moved ${locationName((d.from as string) ?? null, locations)} → ${locationName((d.to as string) ?? null, locations)}`;
    case 'edited': return `Edited ${Array.isArray(d.fields) ? d.fields.join(', ').replace(/_/g, ' ') : ''}`.trim();
    case 'archived': return 'Archived';
    case 'restored': return 'Restored';
    case 'photo': return 'Photo added';
    default: return a.action;
  }
}

function errorText(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

/** /shop/items/:displayId — the item, its count, where it lives, what happened to it. */
export default function ItemDetailPage() {
  const { displayId = '' } = useParams();
  const { user } = useAuth();
  const { categories, locations, addLocation } = useCatalog();
  const [item, setItem] = useState<ShopItem | null | undefined>(undefined);
  const [photos, setPhotos] = useState<ShopItemPhoto[]>([]);
  const [activity, setActivity] = useState<ShopActivity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const loadExtras = useCallback(async (it: ShopItem) => {
    const [p, a] = await Promise.all([listPhotos(it.id), listActivity(it.id)]);
    setPhotos(p);
    setActivity(a);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setItem(undefined);
    setError(null);
    getItemByDisplayId(displayId)
      .then(async (it) => {
        if (cancelled) return;
        setItem(it);
        if (it) await loadExtras(it);
      })
      .catch((e) => { if (!cancelled) setError(errorText(e)); });
    return () => { cancelled = true; };
  }, [displayId, loadExtras]);

  const urls = usePhotoUrls(photos.map((p) => p.storage_path));
  const locationOptions = useMemo(() => treeOptions(locations), [locations]);
  const editInitial = useMemo(() => (item ? itemToInput(item) : null), [item]);

  /** Runs a write, swaps in the saved row, refreshes the log. Every failure is shown. */
  const run = async (what: string, write: () => Promise<ShopItem>) => {
    setBusy(true);
    try {
      const saved = await write();
      setItem(saved);
      await loadExtras(saved);
      return true;
    } catch (e) {
      notifications.show({ color: 'red', title: `Couldn't ${what}`, message: errorText(e) });
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ShopLayout title="Item"><Alert color="red" title="Couldn't load this item">{error}</Alert></ShopLayout>;
  if (item === undefined) return <ShopLayout title="Item"><Group justify="center" py="xl"><Loader /></Group></ShopLayout>;
  if (item === null) {
    return (
      <ShopLayout title="Item">
        <Text>No item labelled <DisplayId value={displayId.toUpperCase()} />.</Text>
        <Button component={Link} to="/shop/items" variant="default" w="fit-content">All items</Button>
      </ShopLayout>
    );
  }

  const low = isLowStock(item);
  const details: [string, string][] = [
    ['Category', pathLabel(item.category_id, categories)],
    ['Brand', item.brand ?? ''],
    ['Model', item.model ?? ''],
    ['Part number', item.mpn ?? ''],
    ['Barcode', item.upc ?? ''],
    ['Fits', item.compatibility.join(', ')],
    ['Warn below', item.min_quantity != null ? String(item.min_quantity) : ''],
    ['Bought', [item.purchase_date, formatPrice(item.purchase_price_cents)].filter(Boolean).join(' · ')],
  ].filter(([, v]) => v) as [string, string][];

  return (
    <ShopLayout title="Item">
      <Stack gap={4}>
        <Group gap="sm">
          <DisplayId value={item.display_id} fz="lg" />
          <Badge variant="outline" color="gray">{CONDITION_LABEL[item.condition]}</Badge>
          <Badge variant="light" color="gray">{item.kind}</Badge>
          {item.archived_at && <Badge color="gray">Archived</Badge>}
        </Group>
        <Title order={2}>{item.name}</Title>
      </Stack>

      {photos.length > 0 && (
        <ScrollArea type="auto" offsetScrollbars>
          <Group gap="sm" wrap="nowrap">
            {photos.map((p) => (
              <Image key={p.id} src={urls[p.storage_path]} h={180} w="auto" fit="contain" alt={item.name} />
            ))}
          </Group>
        </ScrollArea>
      )}

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
        <Stack gap="xs">
          <Text size="xs" c="dimmed" tt="uppercase">On hand{low ? ' · running low' : ''}</Text>
          <QuantityStepper
            value={item.quantity}
            low={low}
            busy={busy || !!item.archived_at}
            onChange={(delta) => run('change the count', () => adjustQuantity(item, delta))}
          />
        </Stack>
        <Stack gap="xs">
          <Text size="xs" c="dimmed" tt="uppercase">Lives in</Text>
          <Select
            aria-label="Location"
            data={locationOptions}
            value={item.location_id}
            placeholder="No location"
            clearable
            searchable
            disabled={busy}
            onChange={(v) => run('move it', () => updateItem(item, { location_id: v }))}
          />
        </Stack>
      </SimpleGrid>

      {details.length > 0 && (
        <Table withRowBorders verticalSpacing={6}>
          <Table.Tbody>
            {details.map(([k, v]) => (
              <Table.Tr key={k}>
                <Table.Td w={140}><Text size="sm" c="dimmed">{k}</Text></Table.Td>
                <Table.Td><Text size="sm">{v}</Text></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      {item.notes && <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{item.notes}</Text>}

      <Group gap="sm">
        <Button variant="default" leftSection={<PencilSimple size={16} />} onClick={() => setEditing(true)} disabled={busy}>Edit</Button>
        <FileButton
          accept="image/*"
          capture="environment"
          onChange={(file) => {
            if (file && user) run('add the photo', async () => { await addPhoto(item, user.id, file); return item; });
          }}
        >
          {(props) => <Button {...props} variant="default" leftSection={<Camera size={16} />} disabled={busy}>Add photo</Button>}
        </FileButton>
        {item.archived_at ? (
          <Button variant="default" leftSection={<ArrowCounterClockwise size={16} />} disabled={busy}
            onClick={() => run('restore it', () => setArchived(item, false))}>Restore</Button>
        ) : (
          <Button variant="subtle" color="gray" leftSection={<Archive size={16} />} disabled={busy}
            onClick={() => run('archive it', () => setArchived(item, true))}>Archive</Button>
        )}
      </Group>

      <Stack gap="xs">
        <Title order={3}>History</Title>
        {activity.length === 0 && <Text size="sm" c="dimmed">Nothing logged yet.</Text>}
        {activity.map((a) => (
          <Group key={a.id} gap="md" wrap="nowrap" align="baseline">
            <Text size="xs" ff="'Courier Prime', monospace" c="dimmed" w={96} style={{ flexShrink: 0 }}>
              {new Date(a.created_at).toLocaleDateString()}
            </Text>
            <Text size="sm">{describe(a, locations)}</Text>
          </Group>
        ))}
      </Stack>

      <Modal opened={editing} onClose={() => setEditing(false)} title={`Edit ${item.display_id}`} size="lg">
        {editInitial && (
          <ItemForm
            categories={categories}
            locations={locations}
            initial={editInitial}
            onAddLocation={(name) => addLocation(name)}
            submitLabel="Save changes"
            onCancel={() => setEditing(false)}
            onSubmit={async (input: ItemInput) => {
              if (await run('save changes', () => updateItem(item, input))) setEditing(false);
            }}
          />
        )}
      </Modal>
    </ShopLayout>
  );
}
