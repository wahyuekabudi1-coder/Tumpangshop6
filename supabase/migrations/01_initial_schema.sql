-- ====================================================================
-- MIGRATION 01: Initial Schema for Tumpang Shop
-- Project Ref: sjhujsvifjdfvzjtyetn
-- Note: Review and apply manually via Supabase Dashboard SQL Editor
-- ====================================================================

-- 1. Categories Table
CREATE TABLE IF NOT EXISTS public.categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    image_url TEXT,
    icon TEXT DEFAULT 'Package',
    order_index INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Products Table
CREATE TABLE IF NOT EXISTS public.products (
    id TEXT PRIMARY KEY,
    sku TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    category_id TEXT REFERENCES public.categories(id) ON DELETE RESTRICT,
    price NUMERIC NOT NULL CHECK (price >= 0),
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    unit TEXT NOT NULL DEFAULT 'pcs',
    images JSONB DEFAULT '[]'::jsonb,
    variations JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT TRUE,
    is_featured BOOLEAN DEFAULT FALSE,
    view_count INTEGER DEFAULT 0,
    sales_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Orders Table
CREATE TABLE IF NOT EXISTS public.orders (
    id TEXT PRIMARY KEY,
    order_number TEXT NOT NULL UNIQUE,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_email TEXT,
    delivery_address TEXT NOT NULL,
    customer_district TEXT NOT NULL,
    delivery_notes TEXT,
    shipping_method TEXT NOT NULL DEFAULT 'REGULAR',
    shipping_cost NUMERIC NOT NULL DEFAULT 0,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    subtotal NUMERIC NOT NULL DEFAULT 0,
    service_fee NUMERIC NOT NULL DEFAULT 0,
    total NUMERIC NOT NULL DEFAULT 0,
    payment_status TEXT NOT NULL DEFAULT 'STANDBY',
    order_status TEXT NOT NULL DEFAULT 'NEW',
    payment_method TEXT DEFAULT 'TRANSFER_MANUAL_QRIS',
    payment_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Store Configuration Table
CREATE TABLE IF NOT EXISTS public.store_config (
    id TEXT PRIMARY KEY DEFAULT 'primary_config',
    store_name TEXT NOT NULL,
    store_tagline TEXT,
    store_address TEXT,
    store_phone TEXT,
    is_open BOOLEAN DEFAULT TRUE,
    min_order_amount NUMERIC DEFAULT 15000,
    default_delivery_fee NUMERIC DEFAULT 6000,
    service_fee NUMERIC DEFAULT 1500,
    qris_image_url TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_config ENABLE ROW LEVEL SECURITY;

-- Public read policies for active catalog
CREATE POLICY "Public can view active categories"
ON public.categories FOR SELECT
USING (is_active = TRUE);

CREATE POLICY "Public can view active products"
ON public.products FOR SELECT
USING (is_active = TRUE);

CREATE POLICY "Public can view store config"
ON public.store_config FOR SELECT
USING (TRUE);

-- Authenticated / Admin full access policies
CREATE POLICY "Admins have full access to categories"
ON public.categories FOR ALL
USING (auth.role() = 'authenticated' OR auth.role() = 'anon');

CREATE POLICY "Admins have full access to products"
ON public.products FOR ALL
USING (auth.role() = 'authenticated' OR auth.role() = 'anon');

CREATE POLICY "Public can create orders"
ON public.orders FOR INSERT
WITH CHECK (TRUE);

CREATE POLICY "Admins can view and manage all orders"
ON public.orders FOR ALL
USING (TRUE);
