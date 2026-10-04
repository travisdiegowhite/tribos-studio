# Shop inventory — parts, spares and shop tools

A personal inventory for the workshop: spare parts, consumables and tools,
each with a printed label (`TL-0001`, `CP-0042`), a place it lives
(`Garage › Tool cabinet › Drawer 2`), and an optional low-stock threshold.

It replaces the unfinished standalone prototype in the private
`travisdiegowhite/BikeTools` repo. That repo was used as a feature list only;
nothing was ported and it held no data.

**Status:** Phase 1 (core). Owner-only. Lives at `/garage/shop`, linked from
the Garage header for the owner account.

## Phases

| Phase | Scope | State |
|---|---|---|
| 1 — Core | Tables, RLS, photo bucket, label generator; list with search/filters, low stock, stats; add/edit/detail with photo and history; locations & categories; CSV import/export | **This PR** |
| 2 — Shop floor | QR/UPC/EAN scanning, printable QR label sheets, voice entry and photo identification (Claude, admin-gated API, `api/utils/shop/`) | Next |
| 3 — Garage link-up | "Install on bike" (spare → `gear_components`, stock −1), "return removed part" (back on the shelf as worn), stock shown on wear alerts | After 2 |

## Built to be spun off

The feature is laid out so it can become its own app with little work.

- **One folder.** Everything is in `src/features/shop/`. The only links into
  tribos are the route in `src/App.jsx`, the Shop button in
  `src/pages/GaragePage.tsx`, and **`src/features/shop/host.tsx`**, the single
  file that may import tribos code. It provides the Supabase client, the
  current user, the page frame (`AppShell`), the mount path and the access
  check.
- **Enforced by a test.** `src/features/shop/boundary.test.ts` fails if any
  other shop file imports from outside the folder, or uses an npm package not
  on its list (react, react-router-dom, Mantine core/notifications, Phosphor,
  supabase-js).
- **Separate tables.** All tables are `shop_*` and the only foreign key that
  leaves them is `user_id → auth.users`. Nothing references `gear_items` or
  any other tribos table. Photos are in their own private `shop-photos`
  bucket. The Phase 3 Garage bridge will live in tribos code
  outside the folder and store only a loose reference.
- **Styling.** Plain Mantine plus the `--color-*` / `--font-*` CSS variables;
  a spin-off copies `src/theme.js` and `src/styles/global.css` and looks the
  same.

**To spin off:** copy `src/features/shop/`, rewrite `host.tsx` for the new
app's auth and layout, and either point it at the same Supabase project
(same login, no migration) or `pg_dump -t 'public.shop_*'` plus the bucket
into a new one.

## Data model (migration 127)

| Table | Notes |
|---|---|
| `shop_categories` | Two-level tree. Roots carry the label `prefix` (2–4 caps, unique per user) and the `next_sequence` counter; children inherit both. Seeded per user on first open by `shop_seed_defaults()`. |
| `shop_locations` | Any depth. Deleting one un-nests its children and un-places its items. |
| `shop_items` | `display_id` assigned on insert from the category root and **never changes** (it is printed). `category_id` is required and `ON DELETE RESTRICT`. `tags` and `compatibility` are `text[]`. |
| `shop_item_events` | Written by trigger: created, moved, quantity changed. Shown as History. |

Triggers also check that an item's category and location, and a tree row's
parent, belong to the same user. Foreign-key checks skip RLS, so without
this check a row could point at another user's category or location.

The label counter is incremented with `UPDATE … RETURNING`, so concurrent
inserts never draw the same number. Labels past 9999 widen (`OT-12345`)
rather than truncate. That truncation was a bug in the prototype's `lpad`.

**Apply by hand** and confirm with `npm run audit:schema`. Until it is
applied the shop shows "the shop tables are missing — apply migration 127".

## Design decisions

- **Client-side search.** The provider loads the whole inventory (paged
  1000 rows at a time) and filters in memory. A personal shop is hundreds to
  a few thousand rows, so search is instant and needs no full-text index.
- **Filters in the URL**, so Back from an item returns to the same list.
- **Labels are typed loosely.** `tl1`, `TL-1` and `TL-0001` all find the
  item; Enter on an exact label jumps to it. This is the hook the Phase 2
  scanner will use.
- **CSV import never reuses labels.** Exported files import as new items.
  Unknown locations are created; an unknown category files the item under
  Other with a warning.
