import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ActionIcon, Box, Button, Group, Modal, Stack, Tabs, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { PencilSimple, Plus, Trash } from '@phosphor-icons/react';
import { useShop } from '../state/ShopProvider';
import { flattenTree, subtreeIds, type TreeNode } from '../logic/tree';
import { suggestPrefix } from '../logic/search';
import type { ShopCategory } from '../types';
import { EmptyState, ItemLabel, MONO, ShopPage } from '../ui/primitives';

type Dialog =
  | { kind: 'add'; tree: 'location' | 'category'; parent: TreeNode | null }
  | { kind: 'rename'; tree: 'location' | 'category'; node: TreeNode }
  | { kind: 'delete'; tree: 'location' | 'category'; node: TreeNode };

export default function SetupScreen() {
  const shop = useShop();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'categories' ? 'categories' : 'locations';
  const [dialog, setDialog] = useState<Dialog | null>(null);

  // Item counts include everything nested underneath.
  const counts = useMemo(() => {
    const direct = (key: 'location_id' | 'category_id') => {
      const m = new Map<string, number>();
      for (const i of shop.items) {
        const id = i[key];
        if (id) m.set(id, (m.get(id) || 0) + 1);
      }
      return m;
    };
    const roll = (rows: TreeNode[], direct: Map<string, number>) => {
      const out = new Map<string, number>();
      for (const r of rows) {
        let n = 0;
        for (const id of subtreeIds(r.id, rows)) n += direct.get(id) || 0;
        out.set(r.id, n);
      }
      return out;
    };
    return {
      location: roll(shop.locations, direct('location_id')),
      category: roll(shop.categories, direct('category_id')),
    };
  }, [shop.items, shop.locations, shop.categories]);

  const unplaced = shop.items.filter((i) => !i.location_id).length;

  return (
    <ShopPage title="Locations & categories" subtitle="Where things live, and how they are labelled.">
      <Tabs value={tab} onChange={(v) => setParams(v === 'categories' ? { tab: 'categories' } : {}, { replace: true })}>
        <Tabs.List>
          <Tabs.Tab value="locations">Locations</Tabs.Tab>
          <Tabs.Tab value="categories">Categories</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="locations" pt="md">
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              Nest them as deep as you like: Garage › Tool cabinet › Drawer 2. {unplaced > 0 && `${unplaced} item${unplaced === 1 ? '' : 's'} not placed yet.`}
            </Text>
            <Group><Button leftSection={<Plus size={16} />} onClick={() => setDialog({ kind: 'add', tree: 'location', parent: null })}>Add location</Button></Group>
            {shop.locations.length === 0 ? (
              <EmptyState title="No locations yet">
                <Text size="sm">Start with the rooms (Garage, Basement), then add shelves and bins inside them.</Text>
              </EmptyState>
            ) : (
              <TreeList
                rows={shop.locations}
                counts={counts.location}
                canNest={() => true}
                onAdd={(parent) => setDialog({ kind: 'add', tree: 'location', parent })}
                onRename={(node) => setDialog({ kind: 'rename', tree: 'location', node })}
                onDelete={(node) => setDialog({ kind: 'delete', tree: 'location', node })}
              />
            )}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="categories" pt="md">
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              Each top-level category owns a label prefix; everything under it is numbered in one series (TL-0001, TL-0002…).
            </Text>
            <Group><Button leftSection={<Plus size={16} />} onClick={() => setDialog({ kind: 'add', tree: 'category', parent: null })}>Add category</Button></Group>
            <TreeList
              rows={shop.categories}
              counts={counts.category}
              // Two levels: a category and its sub-categories.
              canNest={(n) => !n.parent_id}
              badge={(n) => {
                const c = n as ShopCategory;
                return c.prefix ? <ItemLabel id={`${c.prefix}-${String(c.next_sequence).padStart(4, '0')}`} size="xs" /> : null;
              }}
              onAdd={(parent) => setDialog({ kind: 'add', tree: 'category', parent })}
              onRename={(node) => setDialog({ kind: 'rename', tree: 'category', node })}
              onDelete={(node) => setDialog({ kind: 'delete', tree: 'category', node })}
            />
            <Text size="xs" c="dimmed" style={{ fontFamily: MONO }}>The label shown is the next one that category will hand out.</Text>
          </Stack>
        </Tabs.Panel>
      </Tabs>

      <SetupDialog dialog={dialog} counts={counts} onClose={() => setDialog(null)} />
    </ShopPage>
  );
}

function TreeList({ rows, counts, canNest, badge, onAdd, onRename, onDelete }: {
  rows: TreeNode[];
  counts: Map<string, number>;
  canNest: (n: TreeNode) => boolean;
  badge?: (n: TreeNode) => React.ReactNode;
  onAdd: (parent: TreeNode) => void;
  onRename: (n: TreeNode) => void;
  onDelete: (n: TreeNode) => void;
}) {
  return (
    <Box style={{ borderTop: '1px solid var(--color-border)' }}>
      {flattenTree(rows).map(({ node, depth }) => (
        <Group key={node.id} gap="xs" wrap="nowrap" style={{ borderBottom: '1px solid var(--color-border)', padding: '8px 0', paddingLeft: depth * 20 }}>
          <Box style={{ flex: 1, minWidth: 0 }}>
            <Group gap={8} wrap="nowrap">
              <Text size="sm" fw={depth === 0 ? 700 : 400} truncate style={{ color: 'var(--color-text-primary)' }}>{node.name}</Text>
              {badge?.(node)}
            </Group>
          </Box>
          <Text size="xs" style={{ fontFamily: MONO, color: 'var(--color-text-muted)', flex: '0 0 auto' }}>{counts.get(node.id) || 0}</Text>
          {canNest(node) && (
            <ActionIcon variant="subtle" color="gray" aria-label={`Add inside ${node.name}`} onClick={() => onAdd(node)}><Plus size={16} /></ActionIcon>
          )}
          <ActionIcon variant="subtle" color="gray" aria-label={`Rename ${node.name}`} onClick={() => onRename(node)}><PencilSimple size={16} /></ActionIcon>
          <ActionIcon variant="subtle" color="gray" aria-label={`Delete ${node.name}`} onClick={() => onDelete(node)}><Trash size={16} /></ActionIcon>
        </Group>
      ))}
    </Box>
  );
}

function SetupDialog({ dialog, counts, onClose }: {
  dialog: Dialog | null;
  counts: { location: Map<string, number>; category: Map<string, number> };
  onClose: () => void;
}) {
  const shop = useShop();
  const [name, setName] = useState('');
  const [prefix, setPrefix] = useState('');
  const [prefixTouched, setPrefixTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(dialog?.kind === 'rename' ? dialog.node.name : '');
    setPrefix('');
    setPrefixTouched(false);
  }, [dialog]);

  const takenPrefixes = useMemo(
    () => new Set(shop.categories.filter((c) => !c.parent_id && c.prefix).map((c) => c.prefix as string)),
    [shop.categories],
  );
  const needsPrefix = dialog?.kind === 'add' && dialog.tree === 'category' && !dialog.parent;
  const effectivePrefix = prefixTouched ? prefix : suggestPrefix(name, takenPrefixes);
  const prefixError = needsPrefix && effectivePrefix
    ? (!/^[A-Z]{2,4}$/.test(effectivePrefix) ? '2–4 capital letters' : takenPrefixes.has(effectivePrefix) ? 'Already used' : null)
    : null;

  if (!dialog) return null;
  const noun = dialog.tree === 'location' ? 'location' : 'category';

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      notifications.show({ title: done, message: '', color: 'green' });
      onClose();
    } catch (err) {
      notifications.show({ title: 'Not saved', message: err instanceof Error ? err.message : 'Try again', color: 'red' });
    } finally {
      setBusy(false);
    }
  };

  if (dialog.kind === 'delete') {
    const n = counts[dialog.tree].get(dialog.node.id) || 0;
    const blocked = dialog.tree === 'category' && n > 0;
    return (
      <Modal opened onClose={onClose} title={`Delete ${dialog.node.name}?`} centered>
        <Text size="sm" mb="md">
          {blocked
            ? `${n} item${n === 1 ? ' is' : 's are'} filed here (sub-categories included). Move ${n === 1 ? 'it' : 'them'} to another category first.`
            : dialog.tree === 'location'
              ? n > 0
                ? `${n} item${n === 1 ? '' : 's'} here will become "not placed". Locations inside it move up to the top level.`
                : 'Locations inside it move up to the top level.'
              : 'Its sub-categories go with it.'}
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{blocked ? 'OK' : 'Keep it'}</Button>
          {!blocked && (
            <Button color="dark" loading={busy} onClick={() => run(
              () => (dialog.tree === 'location' ? shop.deleteLocation(dialog.node.id) : shop.deleteCategory(dialog.node.id)),
              `${dialog.node.name} deleted`,
            )}>Delete</Button>
          )}
        </Group>
      </Modal>
    );
  }

  const isAdd = dialog.kind === 'add';
  const title = isAdd
    ? dialog.parent ? `New ${noun} inside ${dialog.parent.name}` : `New ${noun}`
    : `Rename ${dialog.node.name}`;
  const valid = name.trim() !== '' && (!needsPrefix || (!!effectivePrefix && !prefixError));

  const submit = () => {
    if (!valid) return;
    if (dialog.kind === 'rename') {
      run(() => (dialog.tree === 'location' ? shop.renameLocation(dialog.node.id, name) : shop.renameCategory(dialog.node.id, name)), 'Renamed');
    } else {
      const parentId = dialog.parent?.id ?? null;
      run(
        () => (dialog.tree === 'location' ? shop.addLocation(name, parentId) : shop.addCategory(name, parentId, needsPrefix ? effectivePrefix : null)),
        `${name.trim()} added`,
      );
    }
  };

  return (
    <Modal opened onClose={onClose} title={title} centered>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Stack gap="sm">
          <TextInput label="Name" value={name} onChange={(e) => setName(e.currentTarget.value)} data-autofocus />
          {needsPrefix && (
            <TextInput
              label="Label prefix"
              description="Printed on every label in this category. Can't be changed later."
              value={effectivePrefix}
              maxLength={4}
              error={prefixError}
              onChange={(e) => { setPrefixTouched(true); setPrefix(e.currentTarget.value.toUpperCase().replace(/[^A-Z]/g, '')); }}
              styles={{ input: { fontFamily: 'var(--font-mono)', letterSpacing: 1 } }}
            />
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={busy} disabled={!valid}>{isAdd ? 'Add' : 'Save'}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
