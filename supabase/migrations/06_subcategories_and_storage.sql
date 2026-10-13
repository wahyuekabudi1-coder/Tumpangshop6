-- ====================================================================
-- MIGRATION 06: Hierarchical Categories & Subcategories, Storage Buckets, and RLS
-- Project Ref: sjhujsvifjdfvzjtyetn
-- Note: Review and apply via Supabase Dashboard SQL Editor
-- ====================================================================

-- 1. Ensure parent_id column exists on categories table for subcategory hierarchy
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'categories' AND column_name = 'parent_id'
    ) THEN
        ALTER TABLE public.categories 
        ADD COLUMN parent_id TEXT REFERENCES public.categories(id) ON DELETE RESTRICT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'categories' AND column_name = 'image_path'
    ) THEN
        ALTER TABLE public.categories 
        ADD COLUMN image_path TEXT;
    END IF;
END $$;

-- Index on parent_id for efficient tree hierarchy queries
CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON public.categories(parent_id);

-- 2. Ensure subcategory_id column exists on products table
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'subcategory_id'
    ) THEN
        ALTER TABLE public.products 
        ADD COLUMN subcategory_id TEXT REFERENCES public.categories(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Index on subcategory_id for fast catalog filtering
CREATE INDEX IF NOT EXISTS idx_products_subcategory_id ON public.products(subcategory_id);

-- 3. Storage Bucket for category & subcategory photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('category-images', 'category-images', true)
ON CONFLICT (id) DO NOTHING;

-- Policies for category-images bucket
DO $$
BEGIN
    DROP POLICY IF EXISTS "Public Read category-images" ON storage.objects;
    CREATE POLICY "Public Read category-images"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'category-images');

    DROP POLICY IF EXISTS "Admin Upload category-images" ON storage.objects;
    CREATE POLICY "Admin Upload category-images"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'category-images' 
        AND (public.is_admin() OR auth.role() = 'authenticated' OR auth.role() = 'anon')
    );

    DROP POLICY IF EXISTS "Admin Delete category-images" ON storage.objects;
    CREATE POLICY "Admin Delete category-images"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'category-images' 
        AND (public.is_admin() OR auth.role() = 'authenticated')
    );
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- 4. Constraint verification: prevent category self-parenting
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_categories_prevent_self_parent'
    ) THEN
        ALTER TABLE public.categories 
        ADD CONSTRAINT check_categories_prevent_self_parent 
        CHECK (parent_id IS NULL OR parent_id <> id);
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
