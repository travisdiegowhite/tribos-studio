-- Migration 127: Shop inventory — parts and shop tools.
--
-- A personal inventory of spare parts, consumables and workshop tools, with
-- human-readable labels (TL-0001, CP-0042) printed on QR stickers, nested
-- storage locations and low-stock thresholds. The UI lives in
-- src/features/shop/ and is currently shown to the owner account only; the
-- data itself is per-user under RLS, so nothing here assumes one user.
--
-- SPIN-OFF CONTRACT: every object is prefixed `shop_`, and the only foreign
-- key leaving this set is user_id → auth.users. Nothing references tribos
-- tables (gear_items, activities, …). Keep it that way: a future standalone
-- app moves these tables and the `shop-photos` bucket with one filtered
-- pg_dump. Any Garage link-up belongs in tribos-side code as a loose
-- reference, never as a foreign key in this file.
--
-- APPLY BY HAND and confirm with `npm run audit:schema`. The storage bucket is
-- created here in SQL (see migration 099's lesson in CLAUDE.md).

-- ============================================================
-- 1. shop_categories — two-level tree; the ROOT owns the label prefix
-- ============================================================

CREATE TABLE IF NOT EXISTS public.shop_categories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL CHECK (length(trim(name)) > 0),
  parent_id     UUID REFERENCES public.shop_categories(id) ON DELETE CASCADE,
  -- Only meaningful on a root; children inherit their root's prefix.
  prefix        TEXT CHECK (prefix IS NULL OR prefix ~ '^[A-Z]{2,4}$'),
  -- Next label number for this root. Only roots are incremented.
  next_sequence INTEGER NOT NULL DEFAULT 1 CHECK (next_sequence > 0),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT shop_categories_root_has_prefix CHECK (parent_id IS NOT NULL OR prefix IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_shop_categories_user ON public.shop_categories(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_shop_categories_root_prefix
  ON public.shop_categories(user_id, prefix) WHERE parent_id IS NULL;

COMMENT ON TABLE public.shop_categories IS 'Shop inventory categories. Roots carry the label prefix (TL, CP…) and the label counter; children inherit both.';

-- ============================================================
-- 2. shop_locations — nested storage (Garage › Tool cabinet › Drawer 2)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.shop_locations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (length(trim(name)) > 0),
  parent_id   UUID REFERENCES public.shop_locations(id) ON DELETE SET NULL,
  description TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shop_locations_user ON public.shop_locations(user_id);

COMMENT ON TABLE public.shop_locations IS 'Shop inventory storage locations, nestable. Deleting one un-nests its children and un-places its items.';

-- ============================================================
-- 3. shop_items
-- ============================================================

CREATE TABLE IF NOT EXISTS public.shop_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Assigned by trigger from the category root (TL-0001). Stable for life:
  -- re-categorising an item does NOT relabel it, since the label is printed.
  display_id    TEXT NOT NULL,
  name          TEXT NOT NULL CHECK (length(trim(name)) > 0),
  -- RESTRICT: a category with items cannot be deleted out from under them.
  category_id   UUID NOT NULL REFERENCES public.shop_categories(id) ON DELETE RESTRICT,
  location_id   UUID REFERENCES public.shop_locations(id) ON DELETE SET NULL,
  quantity      INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  min_quantity  INTEGER CHECK (min_quantity IS NULL OR min_quantity >= 0),
  brand         TEXT,
  model         TEXT,
  mpn           TEXT,
  upc           TEXT,
  condition     TEXT NOT NULL DEFAULT 'good'
                CHECK (condition IN ('new', 'good', 'used', 'worn', 'broken')),
  compatibility TEXT[] NOT NULL DEFAULT '{}',
  tags          TEXT[] NOT NULL DEFAULT '{}',
  unit_cost     NUMERIC(10, 2) CHECK (unit_cost IS NULL OR unit_cost >= 0),
  purchased_on  DATE,
  notes         TEXT,
  -- Object path in the private shop-photos bucket: {user_id}/{item_id}/{ts}.jpg
  photo_path    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_shop_items_display_id UNIQUE (user_id, display_id)
);

CREATE INDEX IF NOT EXISTS idx_shop_items_user ON public.shop_items(user_id);
CREATE INDEX IF NOT EXISTS idx_shop_items_category ON public.shop_items(category_id);
CREATE INDEX IF NOT EXISTS idx_shop_items_location ON public.shop_items(location_id);
CREATE INDEX IF NOT EXISTS idx_shop_items_upc ON public.shop_items(user_id, upc) WHERE upc IS NOT NULL;

COMMENT ON COLUMN public.shop_items.display_id IS 'Printed label (PREFIX-0001), assigned on insert from the category root counter; never changes';
COMMENT ON COLUMN public.shop_items.min_quantity IS 'Low-stock threshold: the item is low when quantity <= min_quantity. NULL = not tracked';

-- ============================================================
-- 4. shop_item_events — what happened to an item (added, moved, used up)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.shop_item_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id    UUID NOT NULL REFERENCES public.shop_items(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('created', 'moved', 'quantity')),
  details    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shop_item_events_item ON public.shop_item_events(item_id, created_at DESC);

-- ============================================================
-- 5. Triggers
-- ============================================================

-- Ownership guard. Foreign-key checks bypass RLS, so without this a row could
-- point at another user's category or location by id.
CREATE OR REPLACE FUNCTION public.shop_items_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  root_id UUID;
  root_prefix TEXT;
  seq INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.shop_categories c WHERE c.id = NEW.category_id AND c.user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'shop: category % does not belong to this user', NEW.category_id USING ERRCODE = '42501';
  END IF;
  IF NEW.location_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.shop_locations l WHERE l.id = NEW.location_id AND l.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'shop: location % does not belong to this user', NEW.location_id USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' AND (NEW.display_id IS NULL OR NEW.display_id = '') THEN
    WITH RECURSIVE up AS (
      SELECT id, parent_id FROM public.shop_categories WHERE id = NEW.category_id
      UNION ALL
      SELECT c.id, c.parent_id FROM public.shop_categories c JOIN up ON c.id = up.parent_id
    )
    SELECT id INTO root_id FROM up WHERE parent_id IS NULL LIMIT 1;

    -- The UPDATE takes the row lock, so two concurrent inserts can never draw
    -- the same number.
    UPDATE public.shop_categories
       SET next_sequence = next_sequence + 1
     WHERE id = root_id
    RETURNING prefix, next_sequence - 1 INTO root_prefix, seq;

    IF root_prefix IS NULL THEN
      RAISE EXCEPTION 'shop: could not resolve a label prefix for category %', NEW.category_id;
    END IF;
    -- lpad would TRUNCATE past 4 digits (12345 → 1234); widen instead.
    NEW.display_id := root_prefix || '-' || CASE WHEN seq < 10000 THEN lpad(seq::text, 4, '0') ELSE seq::text END;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.display_id := OLD.display_id;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shop_items_before_write ON public.shop_items;
CREATE TRIGGER shop_items_before_write
  BEFORE INSERT OR UPDATE ON public.shop_items
  FOR EACH ROW EXECUTE FUNCTION public.shop_items_before_write();

CREATE OR REPLACE FUNCTION public.shop_items_log_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.shop_item_events (user_id, item_id, kind, details)
    VALUES (NEW.user_id, NEW.id, 'created', jsonb_build_object('quantity', NEW.quantity, 'location_id', NEW.location_id));
  ELSE
    IF OLD.location_id IS DISTINCT FROM NEW.location_id THEN
      INSERT INTO public.shop_item_events (user_id, item_id, kind, details)
      VALUES (NEW.user_id, NEW.id, 'moved', jsonb_build_object('from', OLD.location_id, 'to', NEW.location_id));
    END IF;
    IF OLD.quantity IS DISTINCT FROM NEW.quantity THEN
      INSERT INTO public.shop_item_events (user_id, item_id, kind, details)
      VALUES (NEW.user_id, NEW.id, 'quantity', jsonb_build_object('from', OLD.quantity, 'to', NEW.quantity));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shop_items_log_event ON public.shop_items;
CREATE TRIGGER shop_items_log_event
  AFTER INSERT OR UPDATE ON public.shop_items
  FOR EACH ROW EXECUTE FUNCTION public.shop_items_log_event();

-- Same ownership guard for the two trees' parent pointers.
CREATE OR REPLACE FUNCTION public.shop_tree_parent_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  parent_owner UUID;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'shop: a row cannot be its own parent';
  END IF;
  EXECUTE format('SELECT user_id FROM public.%I WHERE id = $1', TG_TABLE_NAME) INTO parent_owner USING NEW.parent_id;
  IF parent_owner IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'shop: parent % does not belong to this user', NEW.parent_id USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shop_categories_parent_guard ON public.shop_categories;
CREATE TRIGGER shop_categories_parent_guard
  BEFORE INSERT OR UPDATE OF parent_id ON public.shop_categories
  FOR EACH ROW EXECUTE FUNCTION public.shop_tree_parent_guard();

DROP TRIGGER IF EXISTS shop_locations_parent_guard ON public.shop_locations;
CREATE TRIGGER shop_locations_parent_guard
  BEFORE INSERT OR UPDATE OF parent_id ON public.shop_locations
  FOR EACH ROW EXECUTE FUNCTION public.shop_tree_parent_guard();

-- ============================================================
-- 6. RLS — owner only, plus service role
-- ============================================================

ALTER TABLE public.shop_categories  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_locations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_item_events ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['shop_categories', 'shop_locations', 'shop_items', 'shop_item_events'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s owner all" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "%s owner all" ON public.%I FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)',
      t, t
    );
    EXECUTE format('DROP POLICY IF EXISTS "%s service role" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "%s service role" ON public.%I FOR ALL USING (auth.role() = ''service_role'')',
      t, t
    );
  END LOOP;
END;
$$;

-- ============================================================
-- 7. Default categories, seeded per user on first open
-- ============================================================

-- Called by the browser (src/features/shop/data/shopApi.ts) when the user has
-- no categories yet. SECURITY INVOKER: it runs under the caller's RLS and only
-- ever writes the caller's rows. The advisory lock makes a double call (React
-- StrictMode, two tabs) seed once.
CREATE OR REPLACE FUNCTION public.shop_seed_defaults()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  root RECORD;
  root_id UUID;
  child TEXT;
  i INTEGER;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'shop: not signed in';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('shop_seed_defaults:' || uid::text));
  IF EXISTS (SELECT 1 FROM public.shop_categories WHERE user_id = uid) THEN
    RETURN;
  END IF;

  FOR root IN
    SELECT * FROM (VALUES
      (1, 'Tools',            'TL', ARRAY['Wrenches', 'Hex & Torx', 'Drivetrain tools', 'Bearing & press tools', 'Measuring', 'Cleaning', 'Stands & workholding']),
      (2, 'Components',       'CP', ARRAY['Drivetrain', 'Brakes', 'Cockpit', 'Seatposts & saddles', 'Headsets & bearings', 'Bottom brackets', 'Pedals']),
      (3, 'Wheels & Tires',   'WT', ARRAY['Wheels', 'Tires', 'Tubes', 'Hubs', 'Spokes & nipples', 'Rim tape & valves']),
      (4, 'Consumables',      'CS', ARRAY['Cables & housing', 'Brake pads', 'Lube & grease', 'Sealant', 'Bar tape', 'Bolts & hardware']),
      (5, 'Frames & Forks',   'FF', ARRAY[]::text[]),
      (6, 'Accessories',      'AC', ARRAY['Lights', 'Bags', 'Computers & mounts']),
      (7, 'Apparel & Safety', 'SA', ARRAY[]::text[]),
      (8, 'Other',            'OT', ARRAY[]::text[])
    ) AS r(sort_order, name, prefix, children)
  LOOP
    INSERT INTO public.shop_categories (user_id, name, prefix, sort_order)
    VALUES (uid, root.name, root.prefix, root.sort_order)
    RETURNING id INTO root_id;

    i := 0;
    FOREACH child IN ARRAY root.children LOOP
      i := i + 1;
      INSERT INTO public.shop_categories (user_id, name, parent_id, sort_order)
      VALUES (uid, child, root_id, i);
    END LOOP;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.shop_seed_defaults() TO authenticated;

-- ============================================================
-- 8. shop-photos — private bucket, owner-folder policies
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('shop-photos', 'shop-photos', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "shop-photos owner select" ON storage.objects;
CREATE POLICY "shop-photos owner select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'shop-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "shop-photos owner insert" ON storage.objects;
CREATE POLICY "shop-photos owner insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'shop-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "shop-photos owner update" ON storage.objects;
CREATE POLICY "shop-photos owner update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'shop-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "shop-photos owner delete" ON storage.objects;
CREATE POLICY "shop-photos owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'shop-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Confirm with:
--   select id, public, file_size_limit from storage.buckets where id = 'shop-photos';
--   select tablename from pg_tables where tablename like 'shop\_%';
