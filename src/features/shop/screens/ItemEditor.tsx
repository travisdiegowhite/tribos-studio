import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Autocomplete, Box, Button, FileButton, Group, Modal, NumberInput, SegmentedControl, Select, SimpleGrid, Stack, TagsInput, Text,
  TextInput, Textarea,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Camera, Plus, X } from '@phosphor-icons/react';
import { shopPath } from '../host';
import { useShop } from '../state/ShopProvider';
import { useSignedPhotoUrls } from '../data/photos';
import { treeSelectData } from '../logic/tree';
import { CONDITIONS, type Condition, type ItemDraft, type ShopItem } from '../types';
import { EmptyState, Eyebrow, ItemLabel, ShopPage, Thumb } from '../ui/primitives';

interface FormState {
  name: string;
  category_id: string | null;
  location_id: string | null;
  quantity: number | string;
  min_quantity: number | string;
  brand: string;
  model: string;
  mpn: string;
  upc: string;
  condition: Condition;
  compatibility: string[];
  tags: string[];
  unit_cost: number | string;
  purchased_on: string;
  notes: string;
}

const blank = (keep?: Partial<FormState>): FormState => ({
  name: '', category_id: null, location_id: null, quantity: 1, min_quantity: '', brand: '', model: '', mpn: '', upc: '',
  condition: 'new', compatibility: [], tags: [], unit_cost: '', purchased_on: '', notes: '', ...keep,
});

function fromItem(i: ShopItem): FormState {
  return {
    name: i.name, category_id: i.category_id, location_id: i.location_id, quantity: i.quantity,
    min_quantity: i.min_quantity ?? '', brand: i.brand || '', model: i.model || '', mpn: i.mpn || '', upc: i.upc || '',
    condition: i.condition, compatibility: i.compatibility, tags: i.tags, unit_cost: i.unit_cost ?? '',
    purchased_on: i.purchased_on || '', notes: i.notes || '',
  };
}

const num = (v: number | string): number | null => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));
const text = (v: string): string | null => (v.trim() ? v.trim() : null);

function toDraft(f: FormState): ItemDraft {
  return {
    name: f.name.trim(),
    category_id: f.category_id!,
    location_id: f.location_id,
    quantity: Math.max(0, Math.round(num(f.quantity) ?? 0)),
    min_quantity: num(f.min_quantity) == null ? null : Math.max(0, Math.round(num(f.min_quantity)!)),
    brand: text(f.brand), model: text(f.model), mpn: text(f.mpn), upc: text(f.upc),
    condition: f.condition,
    compatibility: f.compatibility, tags: f.tags,
    unit_cost: num(f.unit_cost),
    purchased_on: f.purchased_on || null,
    notes: text(f.notes),
  };
}

export default function ItemEditor() {
  const { displayId } = useParams();
  const { items, categories, locations, saveItem, addLocation } = useShop();
  const navigate = useNavigate();
  const editing = displayId ? items.find((i) => i.display_id.toLowerCase() === displayId.toLowerCase()) : undefined;

  const [form, setForm] = useState<FormState>(() => (editing ? fromItem(editing) : blank()));
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [dropPhoto, setDropPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newLocOpen, setNewLocOpen] = useState(false);
  const existingPhoto = useSignedPhotoUrls([editing?.photo_path])[editing?.photo_path || ''];

  // The item can arrive after first render (deep link while loading); fill once.
  const editingId = editing?.id;
  useEffect(() => {
    if (editing) setForm(fromItem(editing));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  useEffect(() => {
    if (!photo) { setPhotoPreview(null); return undefined; }
    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const categoryOptions = useMemo(() => treeSelectData(categories), [categories]);
  const locationOptions = useMemo(() => treeSelectData(locations), [locations]);
  const knownTags = useMemo(() => [...new Set(items.flatMap((i) => i.tags))].sort(), [items]);
  const knownFits = useMemo(() => [...new Set(items.flatMap((i) => i.compatibility))].sort(), [items]);
  const knownBrands = useMemo(() => [...new Set(items.map((i) => i.brand).filter(Boolean) as string[])].sort(), [items]);

  if (displayId && !editing) {
    return (
      <ShopPage title="Not found">
        <EmptyState title={`No item labelled ${displayId.toUpperCase()}`} />
      </ShopPage>
    );
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const canSave = form.name.trim() !== '' && !!form.category_id && !saving;

  const submit = async (another: boolean) => {
    if (!canSave) return;
    setSaving(true);
    try {
      const saved = await saveItem(toDraft(form), { id: editing?.id, photo, removePhoto: dropPhoto && !photo });
      notifications.show({
        title: editing ? `${saved.display_id} saved` : `Labelled ${saved.display_id}`,
        message: saved.name,
        color: 'green',
      });
      if (another) {
        // Batch entry: same shelf, same category, fresh everything else.
        setForm(blank({ category_id: form.category_id, location_id: form.location_id, condition: form.condition }));
        setPhoto(null);
        setSaving(false);
        window.scrollTo({ top: 0 });
      } else {
        navigate(shopPath(`items/${saved.display_id}`), { replace: true });
      }
    } catch (err) {
      notifications.show({ title: 'Not saved', message: err instanceof Error ? err.message : 'Try again', color: 'red' });
      setSaving(false);
    }
  };

  const shownPhoto = photoPreview || (dropPhoto ? null : existingPhoto);

  return (
    <ShopPage
      title={editing ? 'Edit item' : 'Add item'}
      subtitle={editing ? <ItemLabel id={editing.display_id} size="md" /> : 'The label is assigned from the category when you save.'}
      back={editing ? { to: shopPath(`items/${editing.display_id}`), label: editing.display_id } : undefined}
    >
      <form onSubmit={(e) => { e.preventDefault(); submit(false); }}>
        <Stack gap="lg">
          <Group gap="md" align="center" wrap="nowrap">
            {shownPhoto
              ? <Box style={{ width: 96, height: 96, border: '1px solid var(--color-border)', overflow: 'hidden', flex: '0 0 auto' }}>
                  <img src={shownPhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </Box>
              : <Thumb size={96} />}
            <Stack gap={6}>
              <FileButton onChange={(f) => { setPhoto(f); setDropPhoto(false); }} accept="image/jpeg,image/png,image/webp,image/*" capture="environment">
                {(props) => <Button {...props} variant="default" leftSection={<Camera size={16} />}>{shownPhoto ? 'Replace photo' : 'Add photo'}</Button>}
              </FileButton>
              {shownPhoto && (
                <Button variant="subtle" color="gray" size="compact-sm" leftSection={<X size={14} />}
                  onClick={() => { setPhoto(null); setDropPhoto(true); }}>
                  Remove photo
                </Button>
              )}
            </Stack>
          </Group>

          <Box>
            <Eyebrow>What it is</Eyebrow>
            <Stack gap="sm">
              <TextInput label="Name" required placeholder="Chain whip, 11-speed chain, 160mm rotor…" value={form.name}
                onChange={(e) => set('name', e.currentTarget.value)} autoFocus={!editing} />
              <Select label="Category" required searchable data={categoryOptions} value={form.category_id}
                onChange={(v) => set('category_id', v)} placeholder="Pick one"
                description={editing ? 'Changing it does not change the label.' : undefined} />
              <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
                <Autocomplete label="Brand" data={knownBrands} value={form.brand} onChange={(v) => set('brand', v)}
                  placeholder="Shimano, Park Tool…" />
                <TextInput label="Model" value={form.model} onChange={(e) => set('model', e.currentTarget.value)} />
                <TextInput label="Part number (MPN)" value={form.mpn} onChange={(e) => set('mpn', e.currentTarget.value)}
                  styles={{ input: { fontFamily: 'var(--font-mono)' } }} />
                <TextInput label="UPC / EAN" inputMode="numeric" value={form.upc} onChange={(e) => set('upc', e.currentTarget.value)}
                  styles={{ input: { fontFamily: 'var(--font-mono)' } }} />
              </SimpleGrid>
              <Box>
                <Text size="sm" fw={500} mb={4}>Condition</Text>
                <SegmentedControl fullWidth value={form.condition} onChange={(v) => set('condition', v as Condition)}
                  data={CONDITIONS.map((c) => ({ value: c, label: c[0].toUpperCase() + c.slice(1) }))} />
              </Box>
            </Stack>
          </Box>

          <Box>
            <Eyebrow>Where and how many</Eyebrow>
            <Stack gap="sm">
              <Group gap="xs" align="flex-end" wrap="nowrap">
                <Select label="Location" searchable clearable data={locationOptions} value={form.location_id}
                  onChange={(v) => set('location_id', v)} placeholder={locations.length ? 'Pick a shelf, bin, drawer…' : 'No locations yet'}
                  style={{ flex: 1 }} />
                <Button variant="default" leftSection={<Plus size={14} />} onClick={() => setNewLocOpen(true)}>New</Button>
              </Group>
              <SimpleGrid cols={2} spacing="sm">
                <NumberInput label="Quantity" min={0} allowDecimal={false} value={form.quantity} onChange={(v) => set('quantity', v)} />
                <NumberInput label="Alert at or below" min={0} allowDecimal={false} placeholder="No alert"
                  value={form.min_quantity} onChange={(v) => set('min_quantity', v)} />
              </SimpleGrid>
            </Stack>
          </Box>

          <Box>
            <Eyebrow>More</Eyebrow>
            <Stack gap="sm">
              <TagsInput label="Fits" placeholder="11-speed, Shimano Road, 12mm thru-axle… (Enter to add)" data={knownFits}
                value={form.compatibility} onChange={(v) => set('compatibility', v)} clearable />
              <TagsInput label="Tags" placeholder="Lent out, project bike…" data={knownTags} value={form.tags}
                onChange={(v) => set('tags', v)} clearable />
              <SimpleGrid cols={2} spacing="sm">
                <NumberInput label="Unit cost" prefix="$" min={0} decimalScale={2} value={form.unit_cost}
                  onChange={(v) => set('unit_cost', v)} />
                <TextInput label="Purchased" type="date" value={form.purchased_on}
                  onChange={(e) => set('purchased_on', e.currentTarget.value)} />
              </SimpleGrid>
              <Textarea label="Notes" autosize minRows={2} value={form.notes} onChange={(e) => set('notes', e.currentTarget.value)} />
            </Stack>
          </Box>

          <Group justify="space-between" wrap="wrap" gap="xs">
            <Button component={Link} to={editing ? shopPath(`items/${editing.display_id}`) : shopPath()} variant="subtle" color="gray">
              Cancel
            </Button>
            <Group gap="xs">
              {!editing && (
                <Button variant="default" disabled={!canSave} onClick={() => submit(true)}>Save &amp; add another</Button>
              )}
              <Button type="submit" disabled={!canSave} loading={saving}>Save</Button>
            </Group>
          </Group>
        </Stack>
      </form>

      <NewLocationModal
        opened={newLocOpen}
        onClose={() => setNewLocOpen(false)}
        parentOptions={locationOptions}
        defaultParent={form.location_id}
        onCreate={async (name, parentId) => {
          const loc = await addLocation(name, parentId);
          set('location_id', loc.id);
        }}
      />
    </ShopPage>
  );
}

export function NewLocationModal({ opened, onClose, parentOptions, defaultParent, onCreate }: {
  opened: boolean;
  onClose: () => void;
  parentOptions: { value: string; label: string }[];
  defaultParent: string | null;
  onCreate: (name: string, parentId: string | null) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [parent, setParent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (opened) { setName(''); setParent(defaultParent); } }, [opened, defaultParent]);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onCreate(name, parent);
      onClose();
    } catch (err) {
      notifications.show({ title: 'Location not added', message: err instanceof Error ? err.message : 'Try again', color: 'red' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="New location" centered>
      <form onSubmit={(e) => { e.preventDefault(); create(); }}>
        <Stack gap="sm">
          <TextInput label="Name" placeholder="Drawer 2, Pegboard, Blue bin…" value={name} onChange={(e) => setName(e.currentTarget.value)} data-autofocus />
          <Select label="Inside" placeholder="Top level" clearable searchable data={parentOptions} value={parent} onChange={setParent} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={busy} disabled={!name.trim()}>Add</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
