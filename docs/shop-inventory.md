# Shop inventory — parts, spares and shop tools

A personal inventory for the workshop: spare parts, consumables and tools,
each with a printed label (`TL-0001`, `CP-0042`), a place it lives
(`Garage › Tool cabinet › Drawer 2`), and an optional low-stock threshold.

It replaces the unfinished standalone prototype in the private
`travisdiegowhite/BikeTools` repo. That repo was used as a feature list only;
nothing was ported and it held no data.

**Status:** Phases 1–2 shipped. Owner-only. Lives at `/garage/shop`, linked
from the Garage header for the owner account.

## Phases

| Phase | Scope | State |
|---|---|---|
| 1 — Core | Tables, RLS, photo bucket, label generator; list with search/filters, low stock, stats; add/edit/detail with photo and history; locations & categories; CSV import/export | Shipped |
| 2 — Shop floor | Camera scanning (QR labels, UPC/EAN/Code 128), printable QR label sheets, snap-and-identify and spoken/typed quick add via Claude | Shipped |
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
  supabase-js, html5-qrcode, qrcode).
- **Separate tables.** All tables are `shop_*` and the only foreign key that
  leaves them is `user_id → auth.users`. Nothing references `gear_items` or
  any other tribos table. Photos are in their own private `shop-photos`
  bucket. The Phase 3 Garage bridge will live in tribos code
  outside the folder and store only a loose reference.
- **Server code.** `api/shop-identify.js` and `api/utils/shop/` are the
  shop's only server files. They touch `shop_*` tables only and use the
  standard auth/cors/rate-limit/quota utilities, which a spin-off would copy
  or replace.
- **Styling.** Plain Mantine plus the `--color-*` / `--font-*` CSS variables;
  a spin-off copies `src/theme.js` and `src/styles/global.css` and looks the
  same.

**To spin off:** copy `src/features/shop/`, rewrite `host.tsx` for the new
app's auth and layout, and either point it at the same Supabase project
(same login, no migration) or `pg_dump -t 'public.shop_*'` plus the bucket
into a new one.

## Phase 2 — shop floor

**Scan** (`/garage/shop/scan`, Scan button on the shop home). One screen for
every code:

- **A printed label** opens its item. QR labels encode an absolute URL
  (`https://www.tribos.studio/garage/shop/items/TL-0001`), so a phone's own
  camera app opens them too.
- **A shelf label** (`…/garage/shop/?loc=<id>`) opens the list filtered to
  that location and everything nested in it.
- **A product barcode** finds the item with that UPC. UPC-A and its EAN-13
  form count as the same product. If no item has it, the screen offers "Add
  it" with the barcode pre-filled.
- **Anything else** becomes a search. There is also a box for typing a code
  in by hand.

The scanner is `html5-qrcode`, imported only when a camera opens. It uses
the browser's native `BarcodeDetector` where one exists and bundled ZXing
elsewhere (iOS Safari). The editor's UPC field has its own scan button.

**Labels** (`/garage/shop/labels`, the item page's Label button, Setup's
Shelf labels button).

- **Stock:** Avery 5160/8160 (30 per sheet), Avery 5163/8163 (10 per
  sheet), a 62 × 29 mm Brother roll, or 2 in squares on plain paper to cut
  out.
- **Partly used sheets:** "Start at position" skips the labels already
  peeled off.
- **Alignment:** a remembered mm nudge absorbs a printer's offset.
- **Printing:** the pages render into a portal outside the app root, so
  print CSS hides the whole app with one rule. `@page` is the stock's exact
  size. Print at 100% / Actual size, margins None.
- **Verified** by printing to PDF and decoding the QR codes back out at the
  5160 and paper-grid positions.

Set **`VITE_SHOP_PUBLIC_ORIGIN=https://www.tribos.studio`** in Vercel so
labels printed from a preview deploy still point at production. Without
it, labels use the current origin. The in-app scanner reads the label from
any origin, so a domain change only affects phone-camera scans of old
labels.

**Quick add** (top of the item editor).

- **Snap & identify** uploads the photo straight to `shop-photos` under
  `{user}/pending/` and calls `/api/shop-identify` with the path. The same
  photo becomes the item's photo on save, so it is never uploaded twice.
- **Say it** uses the browser's Web Speech API (Chrome, Edge, Safari incl.
  iOS; not Firefox). Typing a description works everywhere.
- **Merging:** only empty fields are filled. Quantity and condition count as
  empty until you touch them, so nothing you typed is overwritten.

`api/shop-identify.js` (with pure helpers in `api/utils/shop/identify.js`):

- **Access:** owner-only (`SHOP_OWNER_EMAILS`, default: the same two
  addresses as the UI), plus a 40/hour burst limit and the shared daily AI
  quota.
- **Constrained output:** it reads the caller's own category and location
  paths (filtered by `user_id`) and gives them to Claude as JSON-schema
  enums, so a result always maps onto rows that exist. It writes nothing:
  the editor proposes and the owner saves.
- **Model:** `claude-opus-5-5` with structured output (`output_config.format`),
  effort `low` for text and `medium` with a photo, and the server-side
  refusal fallback (`fallbacks: "default"`).
- **Leftover photos:** a cancelled snap leaves an orphan object under
  `pending/`. It is harmless and private; sweep it later if it ever
  matters.

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
