import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ActionIcon, Autocomplete, Box, Button, FileButton, Group, Loader, Modal, NumberInput, SegmentedControl, Select, SimpleGrid, Stack,
  TagsInput, Text, TextInput, Textarea,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Barcode, Camera, Microphone, MicrophoneSlash, Plus, Sparkle, X } from '@phosphor-icons/react';
import { shopPath, useShopUser } from '../host';
import { useShop } from '../state/ShopProvider';
import { useDictation } from '../state/useDictation';
import { uploadPendingPhoto, useSignedPhotoUrls } from '../data/photos';
import { identifyItem } from '../data/identify';
import { parseScan } from '../logic/scan';
import { treeSelectData } from '../logic/tree';
import { Scanner } from '../ui/Scanner';
import { CONDITIONS, type Condition, type ItemDraft, type ShopItem } from '../types';
import { applyIdentified, blank, type FormState } from '../logic/itemForm';
import { EmptyState, Eyebrow, ItemLabel, ShopPage, Thumb } from '../ui/primitives';

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
  const [params] = useSearchParams();
  const { items, categories, locations, saveItem, addLocation } = useShop();
  const user = useShopUser();
  const navigate = useNavigate();
  const editing = displayId ? items.find((i) => i.display_id.toLowerCase() === displayId.toLowerCase()) : undefined;

  // ?upc= arrives from the scanner's "Add it".
  const [form, setForm] = useState<FormState>(() => (editing ? fromItem(editing) : blank({ upc: params.get('upc') || '' })));
  // A photo already uploaded for identification; attached on save.
  const [pendingPhoto, setPendingPhoto] = useState<{ path: string; file: File } | null>(null);
  const [describe, setDescribe] = useState('');
  const [identifying, setIdentifying] = useState(false);
  const [identified, setIdentified] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [touched, setTouched] = useState({ quantity: false, condition: false });
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

  const previewFile = photo || pendingPhoto?.file || null;
  useEffect(() => {
    if (!previewFile) { setPhotoPreview(null); return undefined; }
    const url = URL.createObjectURL(previewFile);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [previewFile]);

  const runIdentify = async (input: { transcript?: string; photoPath?: string }) => {
    if (!input.transcript && !input.photoPath) return;
    setIdentifying(true);
    setIdentified(null);
    try {
      const draft = await identifyItem(input);
      setForm((f) => applyIdentified(f, draft, {
        quantity: !touched.quantity && !editing,
        condition: !touched.condition && !editing,
      }));
      const filledFrom = input.photoPath && input.transcript ? 'photo and description' : input.photoPath ? 'photo' : 'description';
      setIdentified(draft.name || draft.brand
        ? `Filled from your ${filledFrom} (${draft.confidence} confidence) — check before saving.`
        : `Couldn't tell what that is from the ${filledFrom}. Try a closer photo or say the name.`);
    } catch (err) {
      notifications.show({ title: 'Could not identify it', message: err instanceof Error ? err.message : 'Try again', color: 'red' });
    } finally {
      setIdentifying(false);
    }
  };

  const snapAndIdentify = async (file: File | null) => {
    if (!file || !user) return;
    setIdentifying(true);
    try {
      const path = await uploadPendingPhoto(user.id, file);
      setPendingPhoto({ path, file });
      setPhoto(null);
      setDropPhoto(false);
      await runIdentify({ photoPath: path, transcript: describe.trim() || undefined });
    } catch (err) {
      notifications.show({ title: 'Photo not uploaded', message: err instanceof Error ? err.message : 'Try again', color: 'red' });
      setIdentifying(false);
    }
  };

  const dictation = useDictation((text) => {
    setDescribe(text);
    runIdentify({ transcript: text, photoPath: pendingPhoto?.path });
  });

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
      const saved = await saveItem(toDraft(form), {
        id: editing?.id,
        photo,
        photoPath: photo ? null : pendingPhoto?.path ?? null,
        removePhoto: dropPhoto && !photo && !pendingPhoto,
      });
      notifications.show({
        title: editing ? `${saved.display_id} saved` : `Labelled ${saved.display_id}`,
        message: saved.name,
        color: 'green',
      });
      if (another) {
        // Batch entry: same shelf, same category, fresh everything else.
        setForm(blank({ category_id: form.category_id, location_id: form.location_id, condition: form.condition }));
        setPhoto(null);
        setPendingPhoto(null);
        setDescribe('');
        setIdentified(null);
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
              <FileButton onChange={(f) => { setPhoto(f); setPendingPhoto(null); setDropPhoto(false); }} accept="image/jpeg,image/png,image/webp,image/*" capture="environment">
                {(props) => <Button {...props} variant="default" leftSection={<Camera size={16} />}>{shownPhoto ? 'Replace photo' : 'Add photo'}</Button>}
              </FileButton>
              {shownPhoto && (
                <Button variant="subtle" color="gray" size="compact-sm" leftSection={<X size={14} />}
                  onClick={() => { setPhoto(null); setPendingPhoto(null); setDropPhoto(true); }}>
                  Remove photo
                </Button>
              )}
            </Stack>
          </Group>

          <Box style={{ border: '1px solid var(--color-border)', padding: 12 }}>
            <Eyebrow accent="var(--color-highlight)">{editing ? 'Fill the blanks' : 'Quick add'}</Eyebrow>
            <Stack gap="xs">
              <Text size="sm" style={{ color: 'var(--color-text-secondary)' }}>
                Snap the part or its packaging, or say what it is (&ldquo;two Shimano 11-speed chains, drawer 2&rdquo;). Empty fields get filled in.
              </Text>
              <Group gap="xs" wrap="wrap">
                <FileButton onChange={snapAndIdentify} accept="image/jpeg,image/png,image/webp,image/*" capture="environment" disabled={identifying}>
                  {(props) => <Button {...props} leftSection={<Sparkle size={16} />} disabled={identifying}>Snap &amp; identify</Button>}
                </FileButton>
                {dictation.supported && (
                  <Button variant={dictation.listening ? 'filled' : 'default'} color={dictation.listening ? 'pink' : undefined}
                    leftSection={dictation.listening ? <MicrophoneSlash size={16} /> : <Microphone size={16} />}
                    onClick={dictation.listening ? dictation.stop : dictation.start} disabled={identifying}>
                    {dictation.listening ? 'Stop' : 'Say it'}
                  </Button>
                )}
              </Group>
              <Group gap="xs" wrap="nowrap" align="flex-start">
                <TextInput
                  style={{ flex: 1 }}
                  placeholder={dictation.supported ? 'Or type it…' : 'Describe it…'}
                  value={dictation.listening ? dictation.interim : describe}
                  onChange={(e) => setDescribe(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); runIdentify({ transcript: describe.trim(), photoPath: pendingPhoto?.path }); }
                  }}
                  readOnly={dictation.listening}
                />
                <Button variant="default" disabled={identifying || !describe.trim()}
                  onClick={() => runIdentify({ transcript: describe.trim(), photoPath: pendingPhoto?.path })}>
                  Fill in
                </Button>
              </Group>
              {identifying && <Group gap={6}><Loader size="xs" color="dark" /><Text size="xs">Identifying…</Text></Group>}
              {!identifying && identified && <Text size="xs" style={{ color: 'var(--color-text-secondary)' }}>{identified}</Text>}
              {dictation.error && <Text size="xs" style={{ color: 'var(--color-signal-text)' }}>{dictation.error}</Text>}
            </Stack>
          </Box>

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
                  styles={{ input: { fontFamily: 'var(--font-mono)' } }}
                  rightSection={
                    <ActionIcon variant="subtle" color="gray" aria-label="Scan barcode" onClick={() => setScanOpen(true)}>
                      <Barcode size={18} />
                    </ActionIcon>
                  } />
              </SimpleGrid>
              <Box>
                <Text size="sm" fw={500} mb={4}>Condition</Text>
                <SegmentedControl fullWidth value={form.condition}
                  onChange={(v) => { set('condition', v as Condition); setTouched((t) => ({ ...t, condition: true })); }}
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
                <NumberInput label="Quantity" min={0} allowDecimal={false} value={form.quantity}
                  onChange={(v) => { set('quantity', v); setTouched((t) => ({ ...t, quantity: true })); }} />
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

      <Modal opened={scanOpen} onClose={() => setScanOpen(false)} title="Scan the barcode" centered size="lg">
        {scanOpen && (
          <Scanner onResult={(raw) => {
            const r = parseScan(raw);
            if (r.kind === 'barcode') set('upc', r.code);
            else notifications.show({ title: 'Not a product barcode', message: raw, color: 'gray' });
            setScanOpen(false);
          }} />
        )}
      </Modal>

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
