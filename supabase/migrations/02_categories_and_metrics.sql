-- ====================================================================
-- MIGRATION 02: Add category images, product view count, and sales count
-- ====================================================================

-- 1. Ensure image_url column exists in categories
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'categories' AND column_name = 'image_url') THEN
        ALTER TABLE public.categories ADD COLUMN image_url TEXT;
    END IF;
END $$;

-- 2. Ensure view_count and sales_count exist in products
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'view_count') THEN
        ALTER TABLE public.products ADD COLUMN view_count INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'sales_count') THEN
        ALTER TABLE public.products ADD COLUMN sales_count INTEGER DEFAULT 0;
    END IF;
END $$;

-- 3. Storage bucket for category and product photos (if Supabase Storage is configured)
INSERT INTO storage.buckets (id, name, public)
VALUES ('shop-assets', 'shop-assets', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public Access to shop-assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'shop-assets');

CREATE POLICY "Allow authenticated or anon uploads to shop-assets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'shop-assets');
