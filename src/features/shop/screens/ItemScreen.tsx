import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ActionIcon, Box, Button, Group, Modal, SimpleGrid, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Minus, PencilSimple, Plus, Trash } from '@phosphor-icons/react';
import { shopPath } from '../host';
import { useShop } from '../state/ShopProvider';
import { fetchItemEvents } from '../data/shopApi';
import { useSignedPhotoUrls } from '../data/photos';
import { isLowStock } from '../logic/search';
import { pathLabel, rootOf } from '../logic/tree';
import type { ShopItemEvent, ShopLocation } from '../types';
import { EmptyState, Eyebrow, ItemLabel, LowTag, MONO, ShopPage, Thumb, formatMoney } from '../ui/primitives';

export default function ItemScreen() {
  const { displayId = '' } = useParams();
  const { items, categories, locations, setQuantity, deleteItem } = useShop();
  const navigate = useNavigate();
  const item = items.find((i) => i.display_id.toLowerCase() === displayId.toLowerCase());
  const photo = useSignedPhotoUrls([item?.photo_path])[item?.photo_path || ''];
  const [events, setEvents] = useState<ShopItemEvent[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const itemId = item?.id;
  const quantity = item?.quantity;
  useEffect(() => {
    if (!itemId) return undefined;
    let cancelled = false;
    // Re-read after each quantity change so the history shows it.
    fetchItemEvents(itemId).then((rows) => { if (!cancelled) setEvents(rows); }).catch(() => {});
    return () => { cancelled = true; };
  }, [itemId, quantity]);

  if (!item) {
    return (
      <ShopPage title="Not found">
        <EmptyState title={`No item labelled ${displayId.toUpperCase()}`}>
          <Text size="sm">It may have been deleted. <Link to={shopPath()}>Back to the shop</Link></Text>
        </EmptyState>
      </ShopPage>
    );
  }

  const bump = async (delta: number) => {
    try {
      await setQuantity(item, item.quantity + delta);
    } catch (err) {
      notifications.show({ title: 'Quantity not saved', message: err instanceof Error ? err.message : 'Try again', color: 'red' });
    }
  };

  const onDelete = async () => {
    setDeleting(true);
    try {
      await deleteItem(item);
      notifications.show({ title: `${item.display_id} deleted`, message: item.name, color: 'green' });
      navigate(shopPath(), { replace: true });
    } catch (err) {
      notifications.show({ title: 'Could not delete', message: err instanceof Error ? err.message : 'Try again', color: 'red' });
      setDeleting(false);
    }
  };

  const category = pathLabel(item.category_id, categories);
  const location = pathLabel(item.location_id, locations);
  const isTool = rootOf(item.category_id, categories)?.prefix === 'TL';
  const low = isLowStock(item);

  return (
    <ShopPage
      title={item.name}
      subtitle={<ItemLabel id={item.display_id} size="md" />}
      actions={
        <Button component={Link} to={shopPath(`items/${item.display_id}/edit`)} variant="default" leftSection={<PencilSimple size={16} />}>
          Edit
        </Button>
      }
    >
      <Group align="flex-start" gap="lg" wrap="wrap">
        {photo ? (
          <Box style={{ width: 'min(100%, 320px)', border: '1px solid var(--color-border)' }}>
            <img src={photo} alt={item.name} style={{ width: '100%', display: 'block' }} />
          </Box>
        ) : (
          <Thumb size={120} tool={isTool} />
        )}

        <Stack gap="xs" style={{ flex: '1 1 240px' }}>
          <Eyebrow accent={low ? 'var(--color-signal)' : 'var(--color-ink)'} right={low ? <LowTag /> : null}>On hand</Eyebrow>
          <Group gap="md" align="center">
            <ActionIcon size="xl" variant="default" aria-label="One fewer" onClick={() => bump(-1)} disabled={item.quantity === 0}>
              <Minus size={20} />
            </ActionIcon>
            <Text style={{ fontFamily: MONO, fontSize: 40, fontWeight: 700, minWidth: 64, textAlign: 'center', lineHeight: 1 }}>
              {item.quantity}
            </Text>
            <ActionIcon size="xl" variant="default" aria-label="One more" onClick={() => bump(1)}>
              <Plus size={20} />
            </ActionIcon>
          </Group>
          <Text size="sm" style={{ color: 'var(--color-text-muted)' }}>
            {item.min_quantity == null ? 'No low-stock alert set.' : `Alert at ${item.min_quantity} or fewer.`}
          </Text>
        </Stack>
      </Group>

      <Box>
        <Eyebrow>Details</Eyebrow>
        <SimpleGrid cols={{ base: 1, xs: 2 }} spacing={0} style={{ borderTop: '1px solid var(--color-border)' }}>
          <Field label="Category" value={category} />
          <Field label="Location" value={location || 'Not placed'} />
          <Field label="Brand" value={item.brand} />
          <Field label="Model" value={item.model} />
          <Field label="Part number" value={item.mpn} mono />
          <Field label="UPC / EAN" value={item.upc} mono />
          <Field label="Condition" value={item.condition} />
          <Field label="Unit cost" value={item.unit_cost == null ? null : formatMoney(item.unit_cost, true)} mono />
          <Field label="Purchased" value={item.purchased_on} mono />
          <Field label="Fits" value={item.compatibility.join(', ')} />
          <Field label="Tags" value={item.tags.join(', ')} />
        </SimpleGrid>
      </Box>

      {item.notes && (
        <Box>
          <Eyebrow>Notes</Eyebrow>
          <Text style={{ whiteSpace: 'pre-wrap', color: 'var(--color-text-primary)' }}>{item.notes}</Text>
        </Box>
      )}

      {events.length > 0 && (
        <Box>
          <Eyebrow>History</Eyebrow>
          <Stack gap={4}>
            {events.map((e) => (
              <Group key={e.id} gap="sm" wrap="nowrap" align="baseline">
                <Text size="xs" style={{ fontFamily: MONO, color: 'var(--color-text-muted)', flex: '0 0 auto' }}>
                  {new Date(e.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
                <Text size="sm" style={{ color: 'var(--color-text-secondary)' }}>{describeEvent(e, locations)}</Text>
              </Group>
            ))}
          </Stack>
        </Box>
      )}

      <Group>
        <Button variant="subtle" color="gray" leftSection={<Trash size={16} />} onClick={() => setConfirmDelete(true)}>
          Delete item
        </Button>
      </Group>

      <Modal opened={confirmDelete} onClose={() => setConfirmDelete(false)} title={`Delete ${item.display_id}?`} centered>
        <Text size="sm" mb="md">
          {item.name} and its history will be removed. The label {item.display_id} will not be reused.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setConfirmDelete(false)}>Keep it</Button>
          <Button color="dark" loading={deleting} onClick={onDelete}>Delete</Button>
        </Group>
      </Modal>
    </ShopPage>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <Box style={{ padding: '8px 0', borderBottom: '1px solid var(--color-border)', paddingRight: 12 }}>
      <Text style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>{label}</Text>
      <Text size="sm" style={{ color: value ? 'var(--color-text-primary)' : 'var(--color-text-muted)', fontFamily: mono && value ? MONO : undefined, overflowWrap: 'anywhere' }}>
        {value || '—'}
      </Text>
    </Box>
  );
}

function describeEvent(e: ShopItemEvent, locations: ShopLocation[]): string {
  const d = e.details as Record<string, unknown>;
  const place = (id: unknown) => (typeof id === 'string' ? pathLabel(id, locations) || 'a deleted location' : 'nowhere');
  switch (e.kind) {
    case 'created':
      return `Added with ${d.quantity ?? '?'} on hand`;
    case 'moved':
      return `Moved from ${place(d.from)} to ${place(d.to)}`;
    case 'quantity': {
      const from = Number(d.from);
      const to = Number(d.to);
      return to > from ? `Restocked ${from} → ${to}` : `Used ${from - to} (${from} → ${to})`;
    }
    default:
      return e.kind;
  }
}

