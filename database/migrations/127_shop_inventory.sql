-- Migration 127: Shop inventory — spare parts, consumables and shop tools.
--
-- An owner-only inventory that lives at /shop (code: src/features/shop/).
-- Every table is prefixed shop_, carries owner_id and is scoped to it by RLS.
-- Nothing here references a tribos table, so the feature can be exported to
-- its own project later without untangling foreign keys. It is deliberately
-- separate from the Garage (gear_items / gear_components) for now.
--
-- Additive only. APPLY BY HAND and confirm with `npm run audit:schema`.
-- The photo bucket is created here in SQL, not described for someone to make
-- in the dashboard (the migration 099 lesson in CLAUDE.md).

-- ============================================================
-- 1. Categories — a two-level tree; children inherit the root's prefix
-- ============================================================

CREATE TABLE IF NOT EXISTS public.shop_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  prefix text NOT NULL CHECK (prefix ~ '^[A-Z]{2}$'),
  parent_id uuid REFERENCES public.shop_categories(id) ON DELETE SET NULL,
  icon text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shop_categories_owner ON public.shop_categories(owner_id);

-- ============================================================
-- 2. Display-ID sequences — one counter per owner and prefix
-- ============================================================

CREATE TABLE IF NOT EXISTS public.shop_id_sequences (
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prefix text NOT NULL,
  next_value int NOT NULL DEFAULT 1,
  PRIMARY KEY (owner_id, prefix)
);

-- ============================================================
-- 3. Locations — a tree (Garage → Pegboard)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.shop_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  parent_id uuid REFERENCES public.shop_locations(id) ON DELETE SET NULL,
  description text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shop_locations_owner ON public.shop_locations(owner_id);

-- ============================================================
-- 4. Items
-- ============================================================

CREATE TABLE IF NOT EXISTS public.shop_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  display_id text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'part' CHECK (kind IN ('tool', 'part', 'consumable')),
  description text,
  category_id uuid REFERENCES public.shop_categories(id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.shop_locations(id) ON DELETE SET NULL,
  quantity int NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  min_quantity int CHECK (min_quantity >= 0),
  brand text,
  model text,
  mpn text,
  upc text,
  condition text NOT NULL DEFAULT 'good' CHECK (condition IN ('new', 'good', 'fair', 'worn', 'unknown')),
  compatibility text[] NOT NULL DEFAULT '{}',
  purchase_date date,
  purchase_price_cents int CHECK (purchase_price_cents >= 0),
  notes text,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, display_id)
);

COMMENT ON COLUMN public.shop_items.display_id IS 'Readable label ID like TL-0001; set by trigger, never reused, printed on QR labels';
COMMENT ON COLUMN public.shop_items.mpn IS 'Manufacturer part number';
COMMENT ON COLUMN public.shop_items.archived_at IS 'Archive instead of delete so a printed label never points at nothing';

CREATE INDEX IF NOT EXISTS idx_shop_items_owner ON public.shop_items(owner_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_shop_items_location ON public.shop_items(location_id);
CREATE INDEX IF NOT EXISTS idx_shop_items_category ON public.shop_items(category_id);
CREATE INDEX IF NOT EXISTS idx_shop_items_upc ON public.shop_items(owner_id, upc) WHERE upc IS NOT NULL;

-- display_id: the root category's prefix plus the owner's next number for it.
-- The counter row is created or bumped in one INSERT … ON CONFLICT, which takes
-- a row lock, so two quick saves can never be handed the same number.
CREATE OR REPLACE FUNCTION public.shop_items_set_display_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  root_prefix text;
  seq int;
BEGIN
  IF NEW.display_id IS NOT NULL AND NEW.display_id <> '' THEN
    RETURN NEW;
  END IF;

  IF NEW.category_id IS NOT NULL THEN
    WITH RECURSIVE tree AS (
      SELECT id, prefix, parent_id FROM public.shop_categories WHERE id = NEW.category_id
      UNION ALL
      SELECT c.id, c.prefix, c.parent_id
      FROM public.shop_categories c JOIN tree t ON c.id = t.parent_id
    )
    SELECT prefix INTO root_prefix FROM tree WHERE parent_id IS NULL LIMIT 1;
  END IF;
  root_prefix := COALESCE(root_prefix, 'XX');

  INSERT INTO public.shop_id_sequences AS s (owner_id, prefix, next_value)
  VALUES (NEW.owner_id, root_prefix, 2)
  ON CONFLICT (owner_id, prefix) DO UPDATE SET next_value = s.next_value + 1
  RETURNING s.next_value - 1 INTO seq;

  NEW.display_id := root_prefix || '-' || LPAD(seq::text, 4, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shop_items_display_id ON public.shop_items;
CREATE TRIGGER shop_items_display_id
  BEFORE INSERT ON public.shop_items
  FOR EACH ROW EXECUTE FUNCTION public.shop_items_set_display_id();

CREATE OR REPLACE FUNCTION public.shop_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shop_items_updated_at ON public.shop_items;
CREATE TRIGGER shop_items_updated_at
  BEFORE UPDATE ON public.shop_items
  FOR EACH ROW EXECUTE FUNCTION public.shop_touch_updated_at();

-- ============================================================
-- 5. Photos, tags, activity
-- ============================================================

CREATE TABLE IF NOT EXISTS public.shop_item_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.shop_items(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shop_item_photos_item ON public.shop_item_photos(item_id);

CREATE TABLE IF NOT EXISTS public.shop_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT 'ink',
  UNIQUE (owner_id, name)
);

CREATE TABLE IF NOT EXISTS public.shop_item_tags (
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.shop_items(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.shop_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, tag_id)
);

CREATE TABLE IF NOT EXISTS public.shop_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.shop_items(id) ON DELETE SET NULL,
  display_id text,
  action text NOT NULL CHECK (action IN ('created', 'edited', 'quantity', 'moved', 'archived', 'restored', 'photo')),
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shop_activity_item ON public.shop_activity(item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shop_activity_owner ON public.shop_activity(owner_id, created_at DESC);

-- ============================================================
-- 6. RLS — every table owner-scoped, plus service role
-- ============================================================

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'shop_categories', 'shop_id_sequences', 'shop_locations', 'shop_items',
    'shop_item_photos', 'shop_tags', 'shop_item_tags', 'shop_activity'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Owner manages own rows" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "Owner manages own rows" ON public.%I FOR ALL TO authenticated '
      'USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id)', t);
    EXECUTE format('DROP POLICY IF EXISTS "Service role full access" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "Service role full access" ON public.%I FOR ALL '
      'USING (auth.role() = ''service_role'')', t);
  END LOOP;
END $$;

-- ============================================================
-- 7. Default categories — seeded per owner on first visit
-- ============================================================

-- SECURITY INVOKER: it can only ever write the caller's own rows. Idempotent:
-- does nothing once the caller has any category.
CREATE OR REPLACE FUNCTION public.shop_seed_defaults()
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  root_id uuid;
  r record;
BEGIN
  IF me IS NULL OR EXISTS (SELECT 1 FROM public.shop_categories WHERE owner_id = me) THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT * FROM (VALUES
      (1, 'Tools', 'TL', ARRAY['Wrenches', 'Hex/Allen Keys', 'Torx', 'Specialty Tools', 'Measuring', 'Cleaning', 'Stands & Workholding']),
      (2, 'Components', 'CP', ARRAY['Drivetrain', 'Brakes', 'Handlebars & Stems', 'Seatposts & Saddles', 'Headsets & Bearings', 'Pedals', 'Bottom Brackets']),
      (3, 'Consumables', 'CS', ARRAY['Tubes', 'Cables & Housing', 'Brake Pads', 'Chain Lube & Grease', 'Tape & Adhesives', 'Bolts & Hardware']),
      (4, 'Wheels & Tires', 'WT', ARRAY['Wheels', 'Tires', 'Rims', 'Hubs', 'Spokes & Nipples']),
      (5, 'Frames & Forks', 'FF', ARRAY[]::text[]),
      (6, 'Accessories', 'AC', ARRAY[]::text[]),
      (7, 'Safety & Apparel', 'SA', ARRAY[]::text[])
    ) AS v(sort_order, name, prefix, children)
  LOOP
    INSERT INTO public.shop_categories (owner_id, name, prefix, sort_order)
    VALUES (me, r.name, r.prefix, r.sort_order)
    RETURNING id INTO root_id;

    INSERT INTO public.shop_categories (owner_id, name, prefix, parent_id, sort_order)
    SELECT me, child, r.prefix, root_id, ord
    FROM unnest(r.children) WITH ORDINALITY AS c(child, ord);
  END LOOP;

  INSERT INTO public.shop_tags (owner_id, name, color)
  VALUES (me, 'Lent out', 'signal'), (me, 'Needs replacing', 'signal'), (me, 'NOS', 'easy')
  ON CONFLICT (owner_id, name) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.shop_seed_defaults() TO authenticated;

-- ============================================================
-- 8. Private photo bucket + owner-scoped object policies
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('shop-photos', 'shop-photos', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Object keys are `{owner_id}/{item_id}/{uuid}.jpg`; the first path segment
-- must be the caller's id.
DROP POLICY IF EXISTS "shop-photos owner select" ON storage.objects;
CREATE POLICY "shop-photos owner select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'shop-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "shop-photos owner insert" ON storage.objects;
CREATE POLICY "shop-photos owner insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'shop-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "shop-photos owner delete" ON storage.objects;
CREATE POLICY "shop-photos owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'shop-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Confirm after applying:
--   npm run audit:schema
--   select id, public, file_size_limit from storage.buckets where id = 'shop-photos';
