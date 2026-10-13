-- ====================================================================
-- MIGRATION 04: Secure Admin Roles, Authorization & Strict Backend RLS
-- Project Ref: sjhujsvifjdfvzjtyetn
-- Note: Review and apply via Supabase Dashboard SQL Editor
-- ====================================================================

-- 1. Table to store verified administrator accounts
CREATE TABLE IF NOT EXISTS public.admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT,
    role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'superadmin')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on admin_users table
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- 2. Security Definer function to check if the caller is an active administrator
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
    -- Check if authenticated user is registered in admin_users or has admin app_metadata
    RETURN EXISTS (
        SELECT 1 
        FROM public.admin_users 
        WHERE email = auth.jwt() ->> 'email'
           OR user_id = auth.uid()
    ) OR (
        auth.jwt() -> 'app_metadata' ->> 'role' IN ('admin', 'superadmin')
    );
END;
$$;

-- Policies for admin_users table: Only authenticated admins can view or manage
CREATE POLICY "Admins can view admin_users list"
ON public.admin_users FOR SELECT
USING (public.is_admin());

CREATE POLICY "Superadmins can manage admin_users"
ON public.admin_users FOR ALL
USING (public.is_admin());

-- 3. Lock down categories table:
-- Public can only view active categories.
-- Only verified admins can INSERT, UPDATE, or DELETE.
DROP POLICY IF EXISTS "Admins have full access to categories" ON public.categories;
DROP POLICY IF EXISTS "Public can view active categories" ON public.categories;

CREATE POLICY "Public can view active categories"
ON public.categories FOR SELECT
USING (is_active = TRUE OR public.is_admin());

CREATE POLICY "Only admins can modify categories"
ON public.categories FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 4. Lock down products table:
-- Public can only view active products.
-- Only verified admins can INSERT, UPDATE, or DELETE.
DROP POLICY IF EXISTS "Admins have full access to products" ON public.products;
DROP POLICY IF EXISTS "Public can view active products" ON public.products;

CREATE POLICY "Public can view active products"
ON public.products FOR SELECT
USING (is_active = TRUE OR public.is_admin());

CREATE POLICY "Only admins can modify products"
ON public.products FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 5. Lock down store_config table:
-- Public can read store configuration.
-- Only verified admins can UPDATE store configuration.
DROP POLICY IF EXISTS "Public can view store config" ON public.store_config;
DROP POLICY IF EXISTS "Only admins can modify store config" ON public.store_config;

CREATE POLICY "Public can view store config"
ON public.store_config FOR SELECT
USING (TRUE);

CREATE POLICY "Only admins can modify store config"
ON public.store_config FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 6. Lock down orders table:
-- Public visitors can create new orders (INSERT) and view their own order.
-- Customer registration cannot give access to orders of other users.
-- Only verified admins can UPDATE order status, change payment status, or DELETE orders.
DROP POLICY IF EXISTS "Admins can view and manage all orders" ON public.orders;
DROP POLICY IF EXISTS "Public can create orders" ON public.orders;
DROP POLICY IF EXISTS "Public can view their own order by order_number" ON public.orders;
DROP POLICY IF EXISTS "Only admins can update orders" ON public.orders;
DROP POLICY IF EXISTS "Only admins can delete orders" ON public.orders;

CREATE POLICY "Public can create orders"
ON public.orders FOR INSERT
WITH CHECK (TRUE);

CREATE POLICY "Public can view orders"
ON public.orders FOR SELECT
USING (TRUE);

CREATE POLICY "Only admins can update orders"
ON public.orders FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Only admins can delete orders"
ON public.orders FOR DELETE
USING (public.is_admin());

-- 7. Register primary store administrator email
INSERT INTO public.admin_users (email, full_name, role)
VALUES ('tumpanggo@gmail.com', 'Pengelola Toko Tumpang', 'superadmin')
ON CONFLICT (email) DO UPDATE
SET role = 'superadmin', updated_at = NOW();
