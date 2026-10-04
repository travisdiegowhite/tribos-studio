import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, FileButton, Button, Group, Loader, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Camera } from '@phosphor-icons/react';
import { useAuth } from '../host';
import { ShopLayout } from '../components/ShopLayout';
import { EMPTY_ITEM, ItemForm } from '../components/ItemForm';
import { useCatalog } from '../data/useShopData';
import { addPhoto, createItem, nextDisplayId } from '../data/shopApi';
import { kindForPrefix, prefixFor } from '../lib/catalog';
import type { ItemInput } from '../types';

const LAST_KEY = 'shop:last-add';

/** Rapid entry: the last category and location stick, per browser. */
function readLast(): Pick<ItemInput, 'category_id' | 'location_id'> {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return { category_id: parsed.category_id ?? null, location_id: parsed.location_id ?? null };
  } catch {
    return { category_id: null, location_id: null };
  }
}

function writeLast(input: ItemInput) {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify({ category_id: input.category_id, location_id: input.location_id }));
  } catch {
    // Private mode or blocked storage: the form just starts blank next time.
  }
}

/** /shop/add */
export default function AddItemPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { categories, locations, loading, error, addLocation } = useCatalog();
  const [photo, setPhoto] = useState<File | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [initial, setInitial] = useState<ItemInput>(() => ({ ...EMPTY_ITEM, ...readLast() }));

  const handleSubmit = async (input: ItemInput, { addAnother }: { addAnother: boolean }) => {
    try {
      const item = await createItem(input);
      writeLast(input);
      let photoFailed = false;
      if (photo && user) {
        try {
          await addPhoto(item, user.id, photo);
        } catch (e) {
          photoFailed = true;
          notifications.show({ color: 'red', title: `${item.display_id} saved, photo didn't upload`, message: e instanceof Error ? e.message : String(e) });
        }
      }
      if (!photoFailed) notifications.show({ title: `Saved ${item.display_id}`, message: item.name });
      if (addAnother) {
        setPhoto(null);
        setInitial({ ...EMPTY_ITEM, category_id: input.category_id, location_id: input.location_id, kind: input.kind });
        setFormKey((k) => k + 1);
      } else {
        navigate(`/shop/items/${item.display_id}`);
      }
    } catch (e) {
      notifications.show({ color: 'red', title: "Couldn't save", message: e instanceof Error ? e.message : String(e) });
    }
  };

  // The form mounts after categories load, so the remembered category's kind is known.
  const seededInitial = useMemo(
    () => (initial.category_id
      ? { ...initial, kind: kindForPrefix(prefixFor(initial.category_id, categories)) }
      : initial),
    [initial, categories],
  );

  return (
    <ShopLayout title="Add item">
      {error && <Alert color="red" title="Couldn't load categories">{error}</Alert>}
      {loading ? (
        <Group justify="center" py="xl"><Loader /></Group>
      ) : (
        <>
          <Group gap="sm">
            <FileButton onChange={setPhoto} accept="image/*" capture="environment">
              {(props) => (
                <Button {...props} variant="default" leftSection={<Camera size={18} />}>
                  {photo ? 'Change photo' : 'Add photo'}
                </Button>
              )}
            </FileButton>
            {photo && <Text size="sm" c="dimmed" truncate maw={220}>{photo.name}</Text>}
          </Group>
          <ItemForm
            key={formKey}
            categories={categories}
            locations={locations}
            initial={seededInitial}
            previewId={nextDisplayId}
            onAddLocation={(name) => addLocation(name)}
            onSubmit={handleSubmit}
            submitLabel="Save"
            allowAddAnother
          />
        </>
      )}
    </ShopLayout>
  );
}
