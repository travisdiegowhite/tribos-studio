/**
 * Helpers for the two parent/child trees (categories and locations).
 * Every walk is cycle-safe: a bad parent pointer degrades to "treat as root"
 * rather than hanging the page.
 */

export interface TreeNode {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
}

export const PATH_SEPARATOR = ' › ';

function indexById<T extends TreeNode>(rows: readonly T[]): Map<string, T> {
  return new Map(rows.map((r) => [r.id, r]));
}

/** Root-first chain of nodes ending at `id`. Empty when `id` is unknown. */
export function ancestry<T extends TreeNode>(id: string | null | undefined, rows: readonly T[]): T[] {
  if (!id) return [];
  const byId = indexById(rows);
  const chain: T[] = [];
  const seen = new Set<string>();
  let cur = byId.get(id);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.unshift(cur);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return chain;
}

export function pathLabel(id: string | null | undefined, rows: readonly TreeNode[]): string {
  return ancestry(id, rows).map((n) => n.name).join(PATH_SEPARATOR);
}

export function rootOf<T extends TreeNode>(id: string | null | undefined, rows: readonly T[]): T | undefined {
  return ancestry(id, rows)[0];
}

/** `id` plus everything under it. */
export function subtreeIds(id: string, rows: readonly TreeNode[]): Set<string> {
  const children = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.parent_id) continue;
    const list = children.get(r.parent_id) || [];
    list.push(r.id);
    children.set(r.parent_id, list);
  }
  const out = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    if (out.has(cur)) continue;
    out.add(cur);
    for (const c of children.get(cur) || []) stack.push(c);
  }
  return out;
}

export interface FlatNode<T> {
  node: T;
  depth: number;
  path: string;
}

/** Depth-first, sort_order then name, for indented pickers and lists. */
export function flattenTree<T extends TreeNode>(rows: readonly T[]): FlatNode<T>[] {
  const byId = indexById(rows);
  const children = new Map<string | null, T[]>();
  for (const r of rows) {
    // A parent that no longer exists (or a self-loop) makes the row a root.
    const parent = r.parent_id && r.parent_id !== r.id && byId.has(r.parent_id) ? r.parent_id : null;
    const list = children.get(parent) || [];
    list.push(r);
    children.set(parent, list);
  }
  const order = (a: T, b: T) => a.sort_order - b.sort_order || a.name.localeCompare(b.name);
  const out: FlatNode<T>[] = [];
  const seen = new Set<string>();
  const walk = (parent: string | null, depth: number, prefix: string) => {
    for (const n of (children.get(parent) || []).slice().sort(order)) {
      if (seen.has(n.id)) continue;
      seen.add(n.id);
      const path = prefix ? `${prefix}${PATH_SEPARATOR}${n.name}` : n.name;
      out.push({ node: n, depth, path });
      walk(n.id, depth + 1, path);
    }
  };
  walk(null, 0, '');
  // Anything only reachable through a cycle never hangs off a root; list it flat.
  for (const r of rows) if (!seen.has(r.id)) out.push({ node: r, depth: 0, path: r.name });
  return out;
}

/** Options for a Mantine Select: indented names, full path searchable. */
export function treeSelectData(rows: readonly TreeNode[]): { value: string; label: string }[] {
  return flattenTree(rows).map(({ node, depth, path }) => ({
    value: node.id,
    label: depth === 0 ? node.name : path,
  }));
}

/** Case-insensitive lookup of a "Parent > Child" (or "Parent › Child") path. */
export function findByPath<T extends TreeNode>(path: string, rows: readonly T[]): T | undefined {
  const want = splitPath(path).map((p) => p.toLowerCase());
  if (!want.length) return undefined;
  return flattenTree(rows).find(({ path: p }) => {
    const got = splitPath(p).map((s) => s.toLowerCase());
    return got.length === want.length && got.every((s, i) => s === want[i]);
  })?.node;
}

export function splitPath(path: string): string[] {
  return path
    .split(/\s*[>›]\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}
