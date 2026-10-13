-- ====================================================================
-- MIGRATION 08: Comprehensive Security Hardening & Strict Role-Based RLS
-- Project: Tumpang Shop
--
-- Audit & Security Hardening Objectives:
-- 1. Cleans up all legacy, conflicting, or overly-permissive RLS policies from Migrations 01-07.
-- 2. Preserves verified Admin Management capabilities:
--    - Admins retain full CREATE, READ, UPDATE, and DELETE (CRUD) permissions on products,
--      categories, store_config, and affiliate_campaigns.
--    - Grants explicit table-level permissions to 'authenticated' and 'service_role' so
--      PostgreSQL privilege layer does not abort before RLS is evaluated.
-- 3. Secures public.orders:
--    - REVOKES direct SELECT, UPDATE, and DELETE from anon and authenticated roles.
--    - Direct SELECT from anon/authenticated is blocked to protect customer PII (phone, address, items).
--    - Customer order receipts and status queries are strictly mediated by backend authorized
--      endpoints (GET /api/orders/:id and GET /api/payment/order-status).
--    - Public INSERT is strictly constrained to payment_status = 'PENDING',
--      waiting order_status, non-test orders, and unique_code within business rules (Rp 1 - Rp 200).
-- 4. Secures public.affiliate_applications:
--    - REVOKES direct INSERT, UPDATE, and DELETE from anon and authenticated roles.
--    - Direct public self-approval or modification is eliminated.
--    - All affiliate registrations run strictly through backend POST /api/affiliates/register
--      using service_role credentials, ensuring scrypt password hashing and server-side validation.
-- 5. Secures public.affiliate_payouts:
--    - Only service_role and verified admins have management and balance review access.
--    - Direct client-side payout requests from anon are completely revoked.
--    - Enforces business rule minimum payout of Rp 50.000 (CHECK amount >= 50000).
-- 6. Secures public.affiliate_clicks:
--    - Validates referral_code length (3..50 characters) on INSERT.
--    - Direct SELECT access is restricted to verified admins and backend only (traffic analytics protected).
-- 7. Guarantees public.is_admin() function with SECURITY DEFINER and admin_users table verification.
-- 8. Fully idempotent, conflict-free, and non-destructive: safe to re-run on populated databases.
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. ENSURE ADMIN USERS TABLE & IS_ADMIN() VERIFICATION FUNCTION
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT,
    role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'superadmin')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
    -- Check if caller matches verified admin email, user ID, or JWT role metadata
    RETURN EXISTS (
        SELECT 1 
        FROM public.admin_users 
        WHERE email = auth.jwt() ->> 'email'
           OR user_id = auth.uid()
    ) OR (
        auth.jwt() -> 'app_metadata' ->> 'role' IN ('admin', 'superadmin')
    ) OR (
        (auth.jwt() ->> 'email') = 'tumpanggo@gmail.com'
    );
END;
$$;

-- Seed primary store administrator safely
INSERT INTO public.admin_users (email, full_name, role)
VALUES ('tumpanggo@gmail.com', 'Pengelola Toko Tumpang', 'superadmin')
ON CONFLICT (email) DO NOTHING;

DROP POLICY IF EXISTS "Admins can view admin_users list" ON public.admin_users;
CREATE POLICY "Admins can view admin_users list"
ON public.admin_users FOR SELECT
TO authenticated, service_role
USING (public.is_admin());

DROP POLICY IF EXISTS "Superadmins can manage admin_users" ON public.admin_users;
CREATE POLICY "Superadmins can manage admin_users"
ON public.admin_users FOR ALL
TO authenticated, service_role
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- --------------------------------------------------------------------
-- 2. ENSURE REQUIRED SCHEMA COLUMNS EXIST (NON-DESTRUCTIVE)
-- --------------------------------------------------------------------
DO $$ 
BEGIN 
    -- 2a. password_hash on affiliate_applications for scrypt KDF storage
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'affiliate_applications' AND column_name = 'password_hash'
    ) THEN
        ALTER TABLE public.affiliate_applications ADD COLUMN password_hash TEXT;
    END IF;

    -- 2b. unique_code on orders (Rp 1 - Rp 200)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'unique_code'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN unique_code NUMERIC DEFAULT 0;
    END IF;

    -- 2c. is_test_transaction on orders
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'is_test_transaction'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN is_test_transaction BOOLEAN DEFAULT FALSE;
    END IF;

    -- 2d. payment_gateway on orders
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'payment_gateway'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN payment_gateway TEXT;
    END IF;

    -- 2e. payment_reference on orders
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'payment_reference'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN payment_reference TEXT;
    END IF;

    -- 2f. payment_link_url on orders
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'payment_link_url'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN payment_link_url TEXT;
    END IF;

    -- 2g. artopay_payment_id on orders
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'artopay_payment_id'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN artopay_payment_id TEXT;
    END IF;

    -- 2h. artopay_customer_token on orders
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'artopay_customer_token'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN artopay_customer_token TEXT;
    END IF;

    -- 2i. simulation_note on orders
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'simulation_note'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN simulation_note TEXT;
    END IF;

    -- 2j. paid_at on orders
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'paid_at'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN paid_at TIMESTAMPTZ;
    END IF;
END $$;

-- Enforce database-level check constraint on orders.unique_code (Rp 1 - Rp 200, or 0 / NULL)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_orders_unique_code_range'
    ) THEN
        ALTER TABLE public.orders 
        ADD CONSTRAINT check_orders_unique_code_range 
        CHECK (unique_code IS NULL OR unique_code = 0 OR (unique_code >= 1 AND unique_code <= 200));
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- --------------------------------------------------------------------
-- 3. CREATE AFFILIATE PAYOUTS & CLICKS TABLES (IF NOT EXIST)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.affiliate_payouts (
    id TEXT PRIMARY KEY,
    affiliate_id TEXT NOT NULL,
    referral_code TEXT NOT NULL,
    amount NUMERIC NOT NULL CHECK (amount >= 50000),
    bank_name TEXT NOT NULL,
    account_number TEXT NOT NULL,
    account_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSED', 'REJECTED')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    processed_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_affiliate_payouts_code ON public.affiliate_payouts(referral_code);
CREATE INDEX IF NOT EXISTS idx_affiliate_payouts_status ON public.affiliate_payouts(status);

CREATE TABLE IF NOT EXISTS public.affiliate_clicks (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    referral_code TEXT NOT NULL,
    landing_path TEXT,
    source TEXT,
    referrer TEXT,
    ip_hash TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_code ON public.affiliate_clicks(referral_code);

ALTER TABLE public.affiliate_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_clicks ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------------------
-- 4. HARDEN ORDERS RLS & REVOKE UNNECESSARY SELECT PERMISSIONS
-- --------------------------------------------------------------------
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Clean up ALL legacy orders policies across Migrations 01, 04, and drafts
DROP POLICY IF EXISTS "Public can view orders" ON public.orders;
DROP POLICY IF EXISTS "Public can view active orders" ON public.orders;
DROP POLICY IF EXISTS "Public can view their own order by order_number" ON public.orders;
DROP POLICY IF EXISTS "Public can create orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can view and manage all orders" ON public.orders;
DROP POLICY IF EXISTS "Admins have full access to orders" ON public.orders;
DROP POLICY IF EXISTS "Only admins can update orders" ON public.orders;
DROP POLICY IF EXISTS "Only admins can delete orders" ON public.orders;
DROP POLICY IF EXISTS "Public can create pending orders only" ON public.orders;
DROP POLICY IF EXISTS "Admins can manage orders" ON public.orders;

-- 4a. Admin Full Access (CRUD for verified admins and service_role)
CREATE POLICY "Admins have full access to orders"
ON public.orders FOR ALL
TO authenticated, service_role
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 4b. Restricted Public INSERT (Only pending orders within strict business parameters)
-- Unique code business rule: Rp 1 - Rp 200 (or 0 / NULL if unassigned)
CREATE POLICY "Public can create pending orders only"
ON public.orders FOR INSERT
TO anon, authenticated
WITH CHECK (
    payment_status = 'PENDING' AND
    order_status IN ('WAITING_PAYMENT', 'PENDING', 'NEW') AND
    (is_test_transaction IS NULL OR is_test_transaction = FALSE) AND
    (unique_code IS NULL OR unique_code = 0 OR (unique_code >= 1 AND unique_code <= 200))
);

-- Note: DIRECT SELECT from anon and regular authenticated is intentionally NOT granted!
-- Customers query their order status and receipts strictly via backend authenticated
-- endpoints (GET /api/orders/:id and GET /api/payment/order-status).

-- --------------------------------------------------------------------
-- 5. HARDEN AFFILIATE APPLICATIONS RLS (REVOKE DIRECT PUBLIC INSERT)
-- --------------------------------------------------------------------
ALTER TABLE public.affiliate_applications ENABLE ROW LEVEL SECURITY;

-- Clean up all previous affiliate application policies across Migrations 05 and drafts
DROP POLICY IF EXISTS "Public can submit affiliate application" ON public.affiliate_applications;
DROP POLICY IF EXISTS "Public can read approved affiliate referral code" ON public.affiliate_applications;
DROP POLICY IF EXISTS "Admins have full access to affiliate applications" ON public.affiliate_applications;
DROP POLICY IF EXISTS "Affiliates can read their own profile" ON public.affiliate_applications;
DROP POLICY IF EXISTS "Public can register pending affiliate application only" ON public.affiliate_applications;
DROP POLICY IF EXISTS "Only admins can update affiliate applications" ON public.affiliate_applications;
DROP POLICY IF EXISTS "Only admins can delete affiliate applications" ON public.affiliate_applications;

-- Admin full management access
CREATE POLICY "Admins have full access to affiliate applications"
ON public.affiliate_applications FOR ALL
TO authenticated, service_role
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Note: Direct public INSERT from anon/authenticated is completely revoked.
-- All affiliate registrations run strictly via backend POST /api/affiliates/register
-- using service_role credentials, ensuring scrypt password hashing and validation.

-- --------------------------------------------------------------------
-- 6. HARDEN AFFILIATE PAYOUTS RLS (BACKEND-AUTHORITATIVE ONLY)
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins have full access to affiliate_payouts" ON public.affiliate_payouts;
DROP POLICY IF EXISTS "Affiliates can create payout request" ON public.affiliate_payouts;
DROP POLICY IF EXISTS "Affiliates can view own payouts" ON public.affiliate_payouts;
DROP POLICY IF EXISTS "Only admins can view payouts" ON public.affiliate_payouts;

-- Payout creation and balance calculation is strictly managed by backend
-- POST /api/affiliates/payouts using service_role. Direct anon client INSERT is forbidden.
CREATE POLICY "Admins have full access to affiliate_payouts"
ON public.affiliate_payouts FOR ALL
TO authenticated, service_role
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- --------------------------------------------------------------------
-- 7. HARDEN AFFILIATE CLICKS RLS (ANALYTICS PROTECTED)
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can record affiliate clicks" ON public.affiliate_clicks;
DROP POLICY IF EXISTS "Admins can view affiliate clicks" ON public.affiliate_clicks;
DROP POLICY IF EXISTS "Public can insert verified referral clicks" ON public.affiliate_clicks;

-- Public can record click events with validated referral code length (3..50 characters)
CREATE POLICY "Public can insert verified referral clicks"
ON public.affiliate_clicks FOR INSERT
TO anon, authenticated
WITH CHECK (
    referral_code IS NOT NULL AND
    length(referral_code) >= 3 AND
    length(referral_code) <= 50
);

-- Analytics reading is restricted to verified admins and backend only
CREATE POLICY "Admins can view affiliate clicks"
ON public.affiliate_clicks FOR SELECT
TO authenticated, service_role
USING (public.is_admin());

-- --------------------------------------------------------------------
-- 8. SECURE CATEGORIES, PRODUCTS, STORE CONFIG & CAMPAIGNS
--    (ADMIN MANAGEMENT GUARANTEED WITH REPLACEMENT POLICIES)
-- --------------------------------------------------------------------
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_campaigns ENABLE ROW LEVEL SECURITY;

-- 8a. Categories Policies
DROP POLICY IF EXISTS "Public can view active categories" ON public.categories;
DROP POLICY IF EXISTS "Admins have full access to categories" ON public.categories;
DROP POLICY IF EXISTS "Only admins can modify categories" ON public.categories;
DROP POLICY IF EXISTS "Admins can manage categories" ON public.categories;

CREATE POLICY "Public can view active categories"
ON public.categories FOR SELECT
TO anon, authenticated
USING (is_active = TRUE OR public.is_admin());

CREATE POLICY "Admins have full access to categories"
ON public.categories FOR ALL
TO authenticated, service_role
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 8b. Products Policies
DROP POLICY IF EXISTS "Public can view active products" ON public.products;
DROP POLICY IF EXISTS "Admins have full access to products" ON public.products;
DROP POLICY IF EXISTS "Only admins can modify products" ON public.products;
DROP POLICY IF EXISTS "Admins can manage products" ON public.products;

CREATE POLICY "Public can view active products"
ON public.products FOR SELECT
TO anon, authenticated
USING (is_active = TRUE OR public.is_admin());

CREATE POLICY "Admins have full access to products"
ON public.products FOR ALL
TO authenticated, service_role
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 8c. Store Config Policies
DROP POLICY IF EXISTS "Public can view store config" ON public.store_config;
DROP POLICY IF EXISTS "Only admins can modify store config" ON public.store_config;
DROP POLICY IF EXISTS "Admins have full access to store config" ON public.store_config;

CREATE POLICY "Public can view store config"
ON public.store_config FOR SELECT
TO anon, authenticated
USING (TRUE);

CREATE POLICY "Admins have full access to store config"
ON public.store_config FOR ALL
TO authenticated, service_role
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 8d. Affiliate Campaigns Policies
DROP POLICY IF EXISTS "Public can view active campaigns" ON public.affiliate_campaigns;
DROP POLICY IF EXISTS "Admins have full access to campaigns" ON public.affiliate_campaigns;

CREATE POLICY "Public can view active campaigns"
ON public.affiliate_campaigns FOR SELECT
TO anon, authenticated
USING (status = 'ACTIVE' OR public.is_admin());

CREATE POLICY "Admins have full access to campaigns"
ON public.affiliate_campaigns FOR ALL
TO authenticated, service_role
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 8e. Product Reviews Policies
DROP POLICY IF EXISTS "Public can view product reviews" ON public.product_reviews;
DROP POLICY IF EXISTS "Buyers can submit reviews" ON public.product_reviews;

CREATE POLICY "Public can view product reviews"
ON public.product_reviews FOR SELECT
TO anon, authenticated
USING (TRUE);

CREATE POLICY "Buyers can submit reviews"
ON public.product_reviews FOR INSERT
TO anon, authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.orders
        WHERE orders.id = product_reviews.order_id
          AND orders.order_status = 'COMPLETED'
    )
    OR is_verified_purchase = FALSE
);

-- --------------------------------------------------------------------
-- 9. SCHEMA PERMISSIONS & EXPLICIT ROLE GRANTS
-- --------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- 9a. Orders:
-- Revoke direct SELECT, UPDATE, DELETE from anon and authenticated.
-- Only pending checkout INSERT is granted. Order lookups run via backend GET /api/orders/:id.
REVOKE SELECT, UPDATE, DELETE, TRUNCATE ON public.orders FROM anon, authenticated;
GRANT INSERT ON public.orders TO anon, authenticated;
GRANT ALL ON public.orders TO service_role;

-- 9b. Affiliate Applications:
-- Revoke direct public modifications. Registrations run via backend POST /api/affiliates/register.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.affiliate_applications FROM anon, authenticated;
REVOKE SELECT ON public.affiliate_applications FROM anon;
GRANT SELECT ON public.affiliate_applications TO authenticated;
GRANT ALL ON public.affiliate_applications TO service_role;

-- 9c. Affiliate Clicks:
-- Public can record click events; analytics reads reserved for admins and backend.
REVOKE SELECT, UPDATE, DELETE, TRUNCATE ON public.affiliate_clicks FROM anon, authenticated;
GRANT INSERT ON public.affiliate_clicks TO anon, authenticated;
GRANT ALL ON public.affiliate_clicks TO service_role;

-- 9d. Affiliate Payouts:
-- Payout creation and approval is managed strictly by backend service.
REVOKE ALL ON public.affiliate_payouts FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.affiliate_payouts FROM authenticated;
GRANT SELECT ON public.affiliate_payouts TO authenticated;
GRANT ALL ON public.affiliate_payouts TO service_role;

-- 9e. Categories:
-- Public can view active categories; authenticated admins and service_role have full management.
GRANT SELECT ON public.categories TO anon;
GRANT ALL ON public.categories TO authenticated, service_role;

-- 9f. Products:
-- Public can view active products; authenticated admins and service_role have full management.
GRANT SELECT ON public.products TO anon;
GRANT ALL ON public.products TO authenticated, service_role;

-- 9g. Store Config:
GRANT SELECT ON public.store_config TO anon;
GRANT ALL ON public.store_config TO authenticated, service_role;

-- 9h. Affiliate Campaigns:
GRANT SELECT ON public.affiliate_campaigns TO anon;
GRANT ALL ON public.affiliate_campaigns TO authenticated, service_role;

-- 9i. Product Reviews:
GRANT SELECT, INSERT ON public.product_reviews TO anon, authenticated;
GRANT ALL ON public.product_reviews TO authenticated, service_role;

-- 9j. Admin Users:
REVOKE ALL ON public.admin_users FROM anon;
GRANT SELECT ON public.admin_users TO authenticated;
GRANT ALL ON public.admin_users TO service_role;
