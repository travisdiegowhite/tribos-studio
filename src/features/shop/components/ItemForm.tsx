import { useEffect, useMemo, useState } from 'react';
import {
  Button, Group, NumberInput, SegmentedControl, Select, SimpleGrid, Stack, TagsInput, Text, TextInput, Textarea,
} from '@mantine/core';
import { Plus } from '@phosphor-icons/react';
import { DisplayId } from './DisplayId';
import { kindForPrefix, parsePriceToCents, prefixFor, treeOptions } from '../lib/catalog';
import type { ItemCondition, ItemInput, ItemKind, ShopCategory, ShopItem, ShopLocation } from '../types';

const CONDITIONS: { value: ItemCondition; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'worn', label: 'Worn' },
  { value: 'unknown', label: 'Unknown' },
];

const KINDS: { value: ItemKind; label: string }[] = [
  { value: 'part', label: 'Part' },
  { value: 'tool', label: 'Tool' },
  { value: 'consumable', label: 'Consumable' },
];

export const EMPTY_ITEM: ItemInput = {
  name: '', kind: 'part', description: null, category_id: null, location_id: null, quantity: 1,
  min_quantity: null, brand: null, model: null, mpn: null, upc: null, condition: 'good',
  compatibility: [], purchase_date: null, purchase_price_cents: null, notes: null,
};

export function itemToInput(item: ShopItem): ItemInput {
  const { name, kind, description, category_id, location_id, quantity, min_quantity, brand, model, mpn, upc,
    condition, compatibility, purchase_date, purchase_price_cents, notes } = item;
  return { name, kind, description, category_id, location_id, quantity, min_quantity, brand, model, mpn, upc,
    condition, compatibility, purchase_date, purchase_price_cents, notes };
}

/** Empty strings become null so the database never stores '' for "not set". */
function clean(input: ItemInput): ItemInput {
  const blank = (v: string | null) => (v && v.trim() ? v.trim() : null);
  return {
    ...input,
    name: input.name.trim(),
    description: blank(input.description),
    brand: blank(input.brand),
    model: blank(input.model),
    mpn: blank(input.mpn),
    upc: blank(input.upc),
    notes: blank(input.notes),
    purchase_date: blank(input.purchase_date),
  };
}

interface Props {
  categories: ShopCategory[];
  locations: ShopLocation[];
  initial?: ItemInput;
  /** Shown above the form on Add: the ID the item will get. */
  previewId?: (prefix: string) => Promise<string>;
  onAddLocation: (name: string) => Promise<ShopLocation>;
  onSubmit: (input: ItemInput, opts: { addAnother: boolean }) => Promise<void>;
  submitLabel: string;
  /** Offer "Save and add another" (Add only). */
  allowAddAnother?: boolean;
  onCancel?: () => void;
}

/** Holds its own state from `initial` on mount; remount it (key) to reset. */
export function ItemForm({
  categories, locations, initial = EMPTY_ITEM, previewId, onAddLocation, onSubmit, submitLabel, allowAddAnother, onCancel,
}: Props) {
  const [values, setValues] = useState<ItemInput>(initial);
  const [price, setPrice] = useState<string>(
    initial.purchase_price_cents != null ? (initial.purchase_price_cents / 100).toFixed(2) : '',
  );
  const [saving, setSaving] = useState(false);
  const [nextId, setNextId] = useState<string | null>(null);
  const [newLocation, setNewLocation] = useState<string | null>(null);
  const [touchedName, setTouchedName] = useState(false);

  const set = <K extends keyof ItemInput>(key: K, value: ItemInput[K]) => setValues((v) => ({ ...v, [key]: value }));

  const categoryOptions = useMemo(() => treeOptions(categories), [categories]);
  const locationOptions = useMemo(() => treeOptions(locations), [locations]);
  const prefix = prefixFor(values.category_id, categories);

  useEffect(() => {
    if (!previewId) return undefined;
    let cancelled = false;
    previewId(prefix).then((id) => { if (!cancelled) setNextId(id); }).catch(() => { if (!cancelled) setNextId(null); });
    return () => { cancelled = true; };
  }, [prefix, previewId]);

  const chooseCategory = (id: string | null) => {
    setValues((v) => ({ ...v, category_id: id, kind: kindForPrefix(prefixFor(id, categories)) }));
  };

  const saveLocation = async () => {
    if (!newLocation?.trim()) return;
    const loc = await onAddLocation(newLocation);
    set('location_id', loc.id);
    setNewLocation(null);
  };

  const submit = async (addAnother: boolean) => {
    setTouchedName(true);
    if (!values.name.trim()) return;
    setSaving(true);
    try {
      await onSubmit(clean({ ...values, purchase_price_cents: parsePriceToCents(price) }), { addAnother });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(false); }}>
      <Stack gap="md">
        {previewId && nextId && (
          <Text size="sm" c="dimmed">
            Will be labelled <DisplayId value={nextId} c="var(--color-ink)" />
          </Text>
        )}

        <TextInput
          label="Name"
          required
          data-autofocus
          value={values.name}
          onChange={(e) => set('name', e.currentTarget.value)}
          onBlur={() => setTouchedName(true)}
          error={touchedName && !values.name.trim() ? 'Give it a name' : null}
          placeholder="Park Tool chain whip"
        />

        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Select
            label="Category"
            data={categoryOptions}
            value={values.category_id}
            onChange={chooseCategory}
            searchable
            clearable
            placeholder="Pick a category"
          />
          <Stack gap={4}>
            <Select
              label="Location"
              data={locationOptions}
              value={values.location_id}
              onChange={(v) => set('location_id', v)}
              searchable
              clearable
              placeholder={locations.length ? 'Where it lives' : 'No locations yet'}
            />
            {newLocation === null ? (
              <Button variant="subtle" size="compact-xs" leftSection={<Plus size={12} />} onClick={() => setNewLocation('')} w="fit-content">
                New location
              </Button>
            ) : (
              <Group gap="xs" wrap="nowrap">
                <TextInput
                  size="xs"
                  aria-label="New location name"
                  placeholder="Pegboard"
                  value={newLocation}
                  onChange={(e) => setNewLocation(e.currentTarget.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveLocation(); } }}
                  style={{ flex: 1 }}
                />
                <Button size="xs" onClick={saveLocation} disabled={!newLocation.trim()}>Add</Button>
                <Button size="xs" variant="subtle" onClick={() => setNewLocation(null)}>Cancel</Button>
              </Group>
            )}
          </Stack>
        </SimpleGrid>

        <div>
          <Text size="sm" fw={500} mb={4}>Kind</Text>
          <SegmentedControl
            fullWidth
            data={KINDS}
            value={values.kind}
            onChange={(v) => set('kind', v as ItemKind)}
          />
        </div>

        <SimpleGrid cols={{ base: 2, sm: 3 }}>
          <NumberInput label="Quantity" min={0} allowDecimal={false} value={values.quantity}
            onChange={(v) => set('quantity', typeof v === 'number' ? v : 0)} />
          <NumberInput label="Warn below" description="Low-stock alert" min={0} allowDecimal={false}
            value={values.min_quantity ?? ''}
            onChange={(v) => set('min_quantity', typeof v === 'number' ? v : null)} />
          <Select label="Condition" data={CONDITIONS} value={values.condition} allowDeselect={false}
            onChange={(v) => set('condition', (v ?? 'good') as ItemCondition)} />
        </SimpleGrid>

        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput label="Brand" value={values.brand ?? ''} onChange={(e) => set('brand', e.currentTarget.value)} placeholder="Shimano" />
          <TextInput label="Model" value={values.model ?? ''} onChange={(e) => set('model', e.currentTarget.value)} placeholder="XT M8100" />
          <TextInput label="Part number (MPN)" value={values.mpn ?? ''} onChange={(e) => set('mpn', e.currentTarget.value)} placeholder="RD-M8100-SGS" />
          <TextInput label="Barcode (UPC/EAN)" inputMode="numeric" value={values.upc ?? ''} onChange={(e) => set('upc', e.currentTarget.value)} />
        </SimpleGrid>

        <TagsInput
          label="Fits"
          description="Standards or bikes it's compatible with; press Enter after each"
          value={values.compatibility}
          onChange={(v) => set('compatibility', v)}
          placeholder="12-speed, BSA 68"
        />

        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput label="Bought on" type="date" value={values.purchase_date ?? ''} onChange={(e) => set('purchase_date', e.currentTarget.value)} />
          <TextInput label="Paid" inputMode="decimal" leftSection="$" value={price} onChange={(e) => setPrice(e.currentTarget.value)}
            error={price && parsePriceToCents(price) == null ? 'Not a price' : null} />
        </SimpleGrid>

        <Textarea label="Notes" autosize minRows={2} value={values.notes ?? ''} onChange={(e) => set('notes', e.currentTarget.value)} />

        <Group justify="flex-end" gap="sm">
          {onCancel && <Button variant="subtle" onClick={onCancel} disabled={saving}>Cancel</Button>}
          {allowAddAnother && (
            <Button variant="default" onClick={() => submit(true)} loading={saving}>Save and add another</Button>
          )}
          <Button type="submit" loading={saving}>{submitLabel}</Button>
        </Group>
      </Stack>
    </form>
  );
}
