-- ====================================================================
-- MIGRATION 08: Comprehensive Security Hardening & Strict Role-Based RLS
-- Project: Tumpang Shop
--
-- Audit & Security Hardening Objectives:
-- 1. Cleans up all legacy, conflicting, or overly-permissive RLS policies from Migrations 01-07.
-- 2. Preserves verified Admin Management capabilities:
--    - Admins retain full CREATE, READ, UPDATE, and DELETE (CRUD) permissions on products,
--      categories, store_config, affiliate_campaigns, admin_users, and product_reviews.
--    - Grants explicit table-level permissions to 'authenticated' and 'service_role' so
--      PostgreSQL privilege layer does not abort before RLS is evaluated.
-- 3. Secures public.orders:
--    - REVOKES direct INSERT, SELECT, UPDATE, DELETE, and TRUNCATE from anon and authenticated roles.
--    - Eliminates client-side order tampering: All checkouts and order calculations are executed
--      strictly through backend POST /api/orders/checkout using secure server credentials (service_role).
--    - Backend recalculates database catalog prices, subtotal, air cargo/standard delivery fee,
--      service fee, non-colliding unique codes (Rp 1 - Rp 200), total, and affiliate commissions.
--    - Guest checkout is 100% preserved through the authorized backend endpoint without requiring login.
--    - Admin order management (list, detail, status updates, tracking/resi) is strictly mediated
--      by authenticated backend endpoints (GET /api/admin/orders, GET /api/admin/orders/:id,
--      POST /api/admin/orders/:id/status, POST /api/admin/orders/:id/tracking) requiring verified admin session tokens.
--    - Customer order receipts and status queries are mediated by backend authorized
--      endpoints (GET /api/orders/:id and GET /api/payment/order-status), protecting customer PII.
-- 4. Secures public.product_reviews:
--    - REVOKES direct INSERT, UPDATE, DELETE, and TRUNCATE from anon and authenticated roles.
--    - Eliminates public probe/guess functions (verify_order_eligibility_for_review dropped).
--    - All reviews must be submitted strictly via backend POST /api/reviews which validates that
--      the order is completed (COMPLETED), paid (PAID), and genuinely contains the reviewed product.
--    - Public SELECT is preserved so store visitors can read verified reviews.
--    - Verified admins retain full moderation access (SELECT, UPDATE, DELETE).
-- 5. Secures public.affiliate_payouts:
--    - Payout requests and commission balance calculations are strictly managed atomically
--      via backend POST /api/affiliates/payouts and atomic PostgreSQL stored function
--      (public.submit_affiliate_payout) using transaction-level advisory locks and row locks.
--    - Prevents double-spending / race conditions across multiple server processes and instances.
--    - REVOKES direct SELECT, INSERT, UPDATE, DELETE from anon and authenticated roles.
--    - Payout history is accessible only by the verified affiliate owner or admin via backend.
--    - Enforces business rule minimum payout of Rp 50.000 (CHECK amount >= 50000).
-- 6. Secures public.affiliate_applications:
--    - REVOKES direct INSERT, UPDATE, and DELETE from anon and authenticated roles.
--    - All affiliate registrations run strictly through backend POST /api/affiliates/register
--      using service_role credentials, ensuring scrypt password hashing and server-side validation.
-- 7. Secures public.affiliate_clicks:
--    - Validates referral_code length (3..50 characters) on INSERT.
--    - Direct SELECT access is restricted to verified admins and backend only (traffic analytics protected).
-- 8. Guarantees public.is_admin() function with SECURITY DEFINER and admin_users table verification.
-- 9. Fully idempotent, conflict-free, and non-destructive: safe to re-run on populated databases.
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

-- 1. Admin users table & recursion-safe is_admin function
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
    v_email TEXT;
    v_uid UUID;
    v_app_role TEXT;
BEGIN
    -- 1. Fast-path check via JWT claims: avoids table scan and eliminates RLS recursion risk
    v_email := auth.jwt() ->> 'email';
    v_app_role := auth.jwt() -> 'app_metadata' ->> 'role';

    IF (v_email IS NOT NULL AND v_email = 'tumpanggo@gmail.com')
       OR v_app_role IN ('admin', 'superadmin') THEN
        RETURN TRUE;
    END IF;

    IF auth.role() = 'service_role' THEN
        RETURN TRUE;
    END IF;

    -- 2. Check admin_users table safely (caller email / UID registered in database)
    v_uid := auth.uid();
    IF v_email IS NOT NULL OR v_uid IS NOT NULL THEN
        RETURN EXISTS (
            SELECT 1 
            FROM public.admin_users 
            WHERE (email IS NOT NULL AND email = v_email)
               OR (user_id IS NOT NULL AND user_id = v_uid)
        );
    END IF;

    RETURN FALSE;
END;
$$;

-- Secure function execution rights: Revoke PUBLIC, grant strictly to client & service contexts
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;

-- Seed primary store administrator safely
INSERT INTO public.admin_users (email, full_name, role)
VALUES ('tumpanggo@gmail.com', 'Pengelola Toko Tumpang', 'superadmin')
ON CONFLICT (email) DO NOTHING;

-- Policies for admin_users: protect table while preventing recursive evaluation
DROP POLICY IF EXISTS "Admins can view admin_users list" ON public.admin_users;
CREATE POLICY "Admins can view admin_users list"
ON public.admin_users FOR SELECT
TO authenticated, service_role
USING (
    (auth.jwt() ->> 'email') = 'tumpanggo@gmail.com'
    OR (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'superadmin')
    OR auth.role() = 'service_role'
    OR public.is_admin()
);

DROP POLICY IF EXISTS "Superadmins can manage admin_users" ON public.admin_users;
CREATE POLICY "Superadmins can manage admin_users"
ON public.admin_users FOR ALL
TO authenticated, service_role
USING (
    (auth.jwt() ->> 'email') = 'tumpanggo@gmail.com'
    OR (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'superadmin')
    OR auth.role() = 'service_role'
    OR public.is_admin()
)
WITH CHECK (
    (auth.jwt() ->> 'email') = 'tumpanggo@gmail.com'
    OR (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'superadmin')
    OR auth.role() = 'service_role'
    OR public.is_admin()
);

-- --------------------------------------------------------------------
-- 2. ENSURE REQUIRED SCHEMA COLUMNS & CONSTRAINTS (NON-DESTRUCTIVE)
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

    -- 2j-1. tracking_number, shipping_carrier, tracking_url on orders for logistics management
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'tracking_number'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN tracking_number TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'shipping_carrier'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN shipping_carrier TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'tracking_url'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN tracking_url TEXT;
    END IF;

    -- 2k. air_freight_delivery_fee and air_freight_estimated_days on store_config
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'store_config' AND column_name = 'air_freight_delivery_fee'
    ) THEN
        ALTER TABLE public.store_config ADD COLUMN air_freight_delivery_fee NUMERIC DEFAULT 15000;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'store_config' AND column_name = 'air_freight_estimated_days'
    ) THEN
        ALTER TABLE public.store_config ADD COLUMN air_freight_estimated_days NUMERIC DEFAULT 14;
    END IF;
END $$;

-- 2l. Safe Credentials Migration & Strict Access Isolation:
-- Create dedicated table for store private credentials, tokens, and secrets
CREATE TABLE IF NOT EXISTS public.store_secrets (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.store_secrets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.store_secrets FROM anon, authenticated;
GRANT ALL ON public.store_secrets TO service_role;

DROP POLICY IF EXISTS "Only admins can view or manage store secrets" ON public.store_secrets;
CREATE POLICY "Only admins can view or manage store secrets"
ON public.store_secrets FOR ALL
TO authenticated, service_role
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Safely copy any existing legacy credential data from store_config into store_secrets
-- WITHOUT deleting or dropping legacy columns, and without logging secret values.
DO $$
BEGIN
    -- Check if secret_key column exists on store_config and copy non-null values
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'store_config' AND column_name = 'secret_key'
    ) THEN
        INSERT INTO public.store_secrets (key, value, description)
        SELECT 'artopay_secret_key', secret_key, 'ArtoPay API Secret Key migrated from store_config.secret_key'
        FROM public.store_config
        WHERE secret_key IS NOT NULL AND TRIM(secret_key) <> ''
        ON CONFLICT (key) DO NOTHING;

        INSERT INTO public.store_secrets (key, value, description)
        SELECT 'secret_key', secret_key, 'Legacy store_config secret_key'
        FROM public.store_config
        WHERE secret_key IS NOT NULL AND TRIM(secret_key) <> ''
        ON CONFLICT (key) DO NOTHING;
    END IF;

    -- Check if api_token column exists on store_config and copy non-null values
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'store_config' AND column_name = 'api_token'
    ) THEN
        INSERT INTO public.store_secrets (key, value, description)
        SELECT 'api_token', api_token, 'Store API Token migrated from store_config.api_token'
        FROM public.store_config
        WHERE api_token IS NOT NULL AND TRIM(api_token) <> ''
        ON CONFLICT (key) DO NOTHING;
    END IF;

    -- Check if webhook_secret column exists on store_config and copy non-null values
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'store_config' AND column_name = 'webhook_secret'
    ) THEN
        INSERT INTO public.store_secrets (key, value, description)
        SELECT 'artopay_webhook_secret', webhook_secret, 'ArtoPay Webhook HMAC Secret migrated from store_config.webhook_secret'
        FROM public.store_config
        WHERE webhook_secret IS NOT NULL AND TRIM(webhook_secret) <> ''
        ON CONFLICT (key) DO NOTHING;

        INSERT INTO public.store_secrets (key, value, description)
        SELECT 'webhook_secret', webhook_secret, 'Legacy store_config webhook_secret'
        FROM public.store_config
        WHERE webhook_secret IS NOT NULL AND TRIM(webhook_secret) <> ''
        ON CONFLICT (key) DO NOTHING;
    END IF;

    -- Check if private_key column exists on store_config and copy non-null values
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'store_config' AND column_name = 'private_key'
    ) THEN
        INSERT INTO public.store_secrets (key, value, description)
        SELECT 'artopay_private_key', private_key, 'ArtoPay Private Key migrated from store_config.private_key'
        FROM public.store_config
        WHERE private_key IS NOT NULL AND TRIM(private_key) <> ''
        ON CONFLICT (key) DO NOTHING;

        INSERT INTO public.store_secrets (key, value, description)
        SELECT 'private_key', private_key, 'Legacy store_config private_key'
        FROM public.store_config
        WHERE private_key IS NOT NULL AND TRIM(private_key) <> ''
        ON CONFLICT (key) DO NOTHING;
    END IF;
END $$;

-- NOTE: Legacy columns in store_config (if present) are deliberately PRESERVED to prevent data loss.
-- They are completely shielded from public/authenticated access via REVOKE and column-level GRANTs in Section 9g.

-- Enforce database-level check constraint on orders.unique_code (Rp 1 - Rp 200, or 0 / NULL)
-- Strictly check and add constraint without swallowing errors with EXCEPTION WHEN OTHERS THEN NULL
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_orders_unique_code_range'
    ) THEN
        ALTER TABLE public.orders 
        ADD CONSTRAINT check_orders_unique_code_range 
        CHECK (unique_code IS NULL OR unique_code = 0 OR (unique_code >= 1 AND unique_code <= 200));
    END IF;
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
-- 4. HARDEN ORDERS RLS & REVOKE ALL DIRECT CLIENT ACCESS
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

-- Note on Orders Security:
-- Direct INSERT, SELECT, UPDATE, DELETE, and TRUNCATE from anon and authenticated
-- roles is completely REVOKED. Public client cannot create or modify orders directly.
-- All checkouts and order calculations are processed strictly via backend
-- POST /api/orders/checkout using secure server credentials (service_role).
-- Customers check out as guests safely through this endpoint without exposing orders
-- table to direct public writes or client tampering.
-- Admin order operations (list, detail, status, tracking) are mediated by backend
-- authenticated endpoints (GET /api/admin/orders, GET /api/admin/orders/:id,
-- POST /api/admin/orders/:id/status, POST /api/admin/orders/:id/tracking).
-- Customer order tracking and receipts are mediated by backend endpoints
-- (GET /api/orders/:id and GET /api/payment/order-status).

-- --------------------------------------------------------------------
-- 5. HARDEN AFFILIATE APPLICATIONS RLS (REVOKE DIRECT PUBLIC MODIFICATIONS)
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
-- 6. HARDEN AFFILIATE PAYOUTS RLS & ATOMIC DATABASE TRANSACTION FUNCTION
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins have full access to affiliate_payouts" ON public.affiliate_payouts;
DROP POLICY IF EXISTS "Affiliates can create payout request" ON public.affiliate_payouts;
DROP POLICY IF EXISTS "Affiliates can view own payouts" ON public.affiliate_payouts;
DROP POLICY IF EXISTS "Only admins can view payouts" ON public.affiliate_payouts;

-- Payout creation and balance calculation is strictly managed by backend
-- POST /api/affiliates/payouts using service_role. Direct client INSERT/SELECT is revoked.
CREATE POLICY "Admins have full access to affiliate_payouts"
ON public.affiliate_payouts FOR ALL
TO authenticated, service_role
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Atomic stored procedure for cross-process/cross-server concurrency locking:
-- Acquires transaction-level advisory lock and row lock, recalculates balance atomically,
-- prevents double payouts across multiple servers/processes, and inserts payout record.
CREATE OR REPLACE FUNCTION public.submit_affiliate_payout(
    p_payout_id TEXT,
    p_affiliate_id TEXT,
    p_referral_code TEXT,
    p_amount NUMERIC,
    p_bank_name TEXT,
    p_account_number TEXT,
    p_account_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clean_code TEXT;
    v_app_id TEXT;
    v_app_status TEXT;
    v_approved_commission NUMERIC := 0;
    v_claimed_payouts NUMERIC := 0;
    v_available_balance NUMERIC := 0;
BEGIN
    -- 1. Input parameter validation
    IF p_payout_id IS NULL OR TRIM(p_payout_id) = '' THEN
        RAISE EXCEPTION 'ID payout wajib disertakan.';
    END IF;

    IF p_amount IS NULL OR p_amount < 50000 THEN
        RAISE EXCEPTION 'Nominal penarikan komisi minimal adalah Rp 50.000.';
    END IF;

    IF p_affiliate_id IS NULL OR TRIM(p_affiliate_id) = '' THEN
        RAISE EXCEPTION 'ID affiliate pemohon wajib disertakan.';
    END IF;

    v_clean_code := UPPER(TRIM(p_referral_code));
    IF v_clean_code IS NULL OR v_clean_code = '' THEN
        RAISE EXCEPTION 'Kode referral wajib disertakan.';
    END IF;

    IF p_bank_name IS NULL OR TRIM(p_bank_name) = '' OR
       p_account_number IS NULL OR TRIM(p_account_number) = '' OR
       p_account_name IS NULL OR TRIM(p_account_name) = '' THEN
        RAISE EXCEPTION 'Data rekening bank (nama bank, nomor rekening, atas nama) wajib lengkap.';
    END IF;

    -- 2. Acquire transaction-level advisory lock on referral code hash
    -- This serializes concurrent payout requests for the same code across ALL database connections/processes
    PERFORM pg_advisory_xact_lock(hashtext(v_clean_code));

    -- 3. Row lock on affiliate_applications and strictly validate existence, approval status, and ownership
    SELECT id, status INTO v_app_id, v_app_status
    FROM public.affiliate_applications
    WHERE UPPER(referral_code) = v_clean_code
    FOR UPDATE;

    -- Batalkan transaksi jika kode referral tidak ditemukan
    IF v_app_id IS NULL THEN
        RAISE EXCEPTION 'Kode referral "%" tidak ditemukan dalam pendaftaran affiliate.', v_clean_code;
    END IF;

    -- Batalkan transaksi jika status affiliate belum disetujui (status != APPROVED)
    IF v_app_status IS DISTINCT FROM 'APPROVED' THEN
        RAISE EXCEPTION 'Pengajuan pencairan ditolak: Status akun affiliate belum disetujui (status saat ini: %).', COALESCE(v_app_status, 'UNKNOWN');
    END IF;

    -- Batalkan transaksi jika p_affiliate_id tidak cocok dengan ID pemilik kode referral
    IF TRIM(p_affiliate_id) IS DISTINCT FROM v_app_id THEN
        RAISE EXCEPTION 'ID affiliate pemohon (%) tidak cocok dengan pemilik kode referral %.', TRIM(p_affiliate_id), v_clean_code;
    END IF;

    -- 3. Calculate approved commissions from orders atomically
    -- Strictly exclude any commission marked REJECTED or CANCELLED even if the order was COMPLETED and PAID.
    -- Supports both 'totalCommission' (standard OrderAffiliateSnapshot) and 'commissionAmount'.
    SELECT COALESCE(SUM(
        CASE 
            WHEN COALESCE(affiliate_commission->>'totalCommission', affiliate_commission->>'commissionAmount') ~ '^[0-9]+(\.[0-9]+)?$' 
            THEN (COALESCE(affiliate_commission->>'totalCommission', affiliate_commission->>'commissionAmount'))::numeric
            ELSE 0 
        END
    ), 0)
    INTO v_approved_commission
    FROM public.orders
    WHERE UPPER(referral_code) = v_clean_code
      AND COALESCE(affiliate_commission->>'status', 'PENDING') NOT IN ('REJECTED', 'CANCELLED')
      AND (
          (affiliate_commission->>'status' = 'APPROVED')
          OR (order_status = 'COMPLETED' AND payment_status = 'PAID')
      );

    -- 4. Calculate total pending and processed payouts
    SELECT COALESCE(SUM(amount), 0)
    INTO v_claimed_payouts
    FROM public.affiliate_payouts
    WHERE UPPER(referral_code) = v_clean_code
      AND status IN ('PENDING', 'PROCESSED');

    -- 5. Strict balance validation
    v_available_balance := v_approved_commission - v_claimed_payouts;
    IF p_amount > v_available_balance THEN
        RAISE EXCEPTION 'Saldo tidak mencukupi. Saldo tersedia yang dapat ditarik: Rp %', v_available_balance;
    END IF;

    -- 6. Insert new payout atomically
    INSERT INTO public.affiliate_payouts (
        id,
        affiliate_id,
        referral_code,
        amount,
        bank_name,
        account_number,
        account_name,
        status,
        created_at
    ) VALUES (
        p_payout_id,
        p_affiliate_id,
        v_clean_code,
        p_amount,
        p_bank_name,
        p_account_number,
        p_account_name,
        'PENDING',
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'payoutId', p_payout_id,
        'amount', p_amount,
        'availableBalanceAfter', (v_available_balance - p_amount)
    );
END;
$$;

-- Revoke execute from public/anon/authenticated and restrict strictly to service_role
REVOKE EXECUTE ON FUNCTION public.submit_affiliate_payout(TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_affiliate_payout(TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT) TO service_role;

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
-- 8. SECURE CATEGORIES, PRODUCTS, STORE CONFIG, CAMPAIGNS & REVIEWS
-- --------------------------------------------------------------------
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;

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

-- Dedicated sanitized view for public store presentation config
CREATE OR REPLACE VIEW public.public_store_config AS
SELECT 
    id,
    store_name,
    store_tagline,
    store_address,
    store_phone,
    is_open,
    min_order_amount,
    default_delivery_fee,
    air_freight_delivery_fee,
    air_freight_estimated_days,
    service_fee,
    default_affiliate_commission_rate,
    qris_image_url,
    updated_at
FROM public.store_config;

GRANT SELECT ON public.public_store_config TO anon, authenticated, service_role;

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

-- 8e. Product Reviews Policies:
-- Clean up all previous review submission policies
DROP POLICY IF EXISTS "Public can view product reviews" ON public.product_reviews;
DROP POLICY IF EXISTS "Public can view verified published product reviews" ON public.product_reviews;
DROP POLICY IF EXISTS "Buyers can submit reviews" ON public.product_reviews;
DROP POLICY IF EXISTS "Buyers can submit reviews for verified completed orders" ON public.product_reviews;
DROP POLICY IF EXISTS "Admins have full access to product_reviews" ON public.product_reviews;

-- Drop obsolete public order verification function to avoid probe/guessing vulnerabilities
DROP FUNCTION IF EXISTS public.verify_order_eligibility_for_review(TEXT, TEXT);

-- Public read policy: Only genuine verified purchases may be viewed by visitors
CREATE POLICY "Public can view verified published product reviews"
ON public.product_reviews FOR SELECT
TO anon, authenticated
USING (is_verified_purchase = TRUE);

-- Admin full moderation access (SELECT, UPDATE, DELETE)
CREATE POLICY "Admins have full access to product_reviews"
ON public.product_reviews FOR ALL
TO authenticated, service_role
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Dedicated sanitized view for public product reviews (strictly eliminates buyer PII: user_email, order_id, user_id)
CREATE OR REPLACE VIEW public.public_product_reviews AS
SELECT 
    id,
    product_id,
    user_name,
    is_verified_purchase,
    rating,
    comment,
    created_at
FROM public.product_reviews
WHERE is_verified_purchase = TRUE;

GRANT SELECT ON public.public_product_reviews TO anon, authenticated, service_role;

-- Note on Product Reviews Security:
-- Direct INSERT from anon and authenticated is completely REVOKED.
-- All review submissions are strictly processed through backend POST /api/reviews
-- using service_role credentials. The backend verifies that the order is COMPLETED,
-- PAID, actually contains the reviewed product, and prevents duplicate submissions.

-- --------------------------------------------------------------------
-- 9. SCHEMA PERMISSIONS & EXPLICIT ROLE GRANTS
-- --------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- 9a. Orders:
-- Revoke direct INSERT, SELECT, UPDATE, DELETE, and TRUNCATE from anon and authenticated.
-- All order processing and checkout is handled exclusively by the backend server.
REVOKE ALL ON public.orders FROM anon, authenticated;
REVOKE ALL ON public.orders FROM PUBLIC;
GRANT ALL ON public.orders TO service_role;

-- 9b. Affiliate Applications:
-- Revoke direct public modifications. Registrations run via backend POST /api/affiliates/register.
REVOKE ALL ON public.affiliate_applications FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.affiliate_applications FROM anon, authenticated;
REVOKE SELECT ON public.affiliate_applications FROM anon;
GRANT SELECT ON public.affiliate_applications TO authenticated;
GRANT ALL ON public.affiliate_applications TO service_role;

-- 9c. Affiliate Clicks:
-- Public can record click events; analytics reads reserved for admins and backend.
REVOKE SELECT, UPDATE, DELETE, TRUNCATE ON public.affiliate_clicks FROM anon, authenticated;
REVOKE ALL ON public.affiliate_clicks FROM PUBLIC;
GRANT INSERT ON public.affiliate_clicks TO anon, authenticated;
GRANT ALL ON public.affiliate_clicks TO service_role;

-- 9d. Affiliate Payouts:
-- Revoke direct access from public/browser. Payout creation and history queries
-- are mediated strictly by authenticated backend endpoints using service_role.
REVOKE ALL ON public.affiliate_payouts FROM anon, authenticated;
REVOKE ALL ON public.affiliate_payouts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.affiliate_payouts TO service_role;

-- 9e. Categories:
-- Public can view active categories; authenticated admins and service_role have full management.
REVOKE ALL ON public.categories FROM PUBLIC;
GRANT SELECT ON public.categories TO anon;
GRANT ALL ON public.categories TO authenticated, service_role;

-- 9f. Products:
-- Public can view active products; authenticated admins and service_role have full management.
REVOKE ALL ON public.products FROM PUBLIC;
GRANT SELECT ON public.products TO anon;
GRANT ALL ON public.products TO authenticated, service_role;

-- 9g. Store Config:
-- Direct public SELECT granted only for safe public presentation columns (never secrets, tokens, or credentials)
REVOKE ALL ON public.store_config FROM anon, authenticated;
REVOKE ALL ON public.store_config FROM PUBLIC;
GRANT SELECT (id, store_name, store_tagline, store_address, store_phone, is_open, min_order_amount, default_delivery_fee, air_freight_delivery_fee, air_freight_estimated_days, service_fee, default_affiliate_commission_rate, qris_image_url, updated_at) ON public.store_config TO anon, authenticated;
GRANT ALL ON public.store_config TO service_role;

-- 9h. Affiliate Campaigns:
-- Public can view active campaigns; authenticated admins and service_role have full management.
REVOKE ALL ON public.affiliate_campaigns FROM PUBLIC;
GRANT SELECT ON public.affiliate_campaigns TO anon;
GRANT ALL ON public.affiliate_campaigns TO authenticated, service_role;

-- 9i. Product Reviews:
-- Direct client INSERT, UPDATE, DELETE, TRUNCATE are revoked. Reviews are submitted via POST /api/reviews.
-- Direct table SELECT is restricted to safe public columns only to protect buyer PII (user_email, order_id, user_id).
REVOKE ALL ON public.product_reviews FROM anon, authenticated;
REVOKE ALL ON public.product_reviews FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.product_reviews FROM anon, authenticated;
GRANT SELECT (id, product_id, user_name, is_verified_purchase, rating, comment, created_at) ON public.product_reviews TO anon, authenticated;
GRANT ALL ON public.product_reviews TO service_role;

-- 9j. Admin Users:
REVOKE ALL ON public.admin_users FROM anon;
REVOKE ALL ON public.admin_users FROM PUBLIC;
GRANT SELECT ON public.admin_users TO authenticated;
GRANT ALL ON public.admin_users TO service_role;

-- --------------------------------------------------------------------
-- 10. STORAGE BUCKETS SECURITY HARDENING (COMPREHENSIVE AUDIT & STRICT POLICIES)
-- --------------------------------------------------------------------
DO $$
DECLARE
    r RECORD;
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'storage' AND table_name = 'objects'
    ) THEN
        -- 10a. Explicitly drop known legacy storage policies from migrations 02 and 06
        -- Strictly uses explicit names to guarantee no accidental deletion of other application buckets
        DROP POLICY IF EXISTS "Public Access to shop-assets" ON storage.objects;
        DROP POLICY IF EXISTS "Allow authenticated or anon uploads to shop-assets" ON storage.objects;
        DROP POLICY IF EXISTS "Admin Upload shop-assets" ON storage.objects;
        DROP POLICY IF EXISTS "Public Read category-images" ON storage.objects;
        DROP POLICY IF EXISTS "Admin Upload category-images" ON storage.objects;
        DROP POLICY IF EXISTS "Admin Delete category-images" ON storage.objects;
        DROP POLICY IF EXISTS "Allow authenticated or anon uploads to category-images" ON storage.objects;

        -- 10b. Audit & Report Unrecognized Storage Policies on Target Buckets:
        -- Inspects for any unknown active policies targeting shop-assets or category-images.
        -- Strictly DOES NOT drop them automatically; raises an audit notice for manual administrative inspection.
        FOR r IN (
            SELECT policyname, cmd, qual, with_check
            FROM pg_policies 
            WHERE schemaname = 'storage' AND tablename = 'objects'
              AND (
                  COALESCE(qual, '') ~* '''(shop-assets|category-images)'''
                  OR COALESCE(with_check, '') ~* '''(shop-assets|category-images)'''
                  OR policyname ILIKE '%shop-assets%'
                  OR policyname ILIKE '%category-images%'
              )
              AND policyname NOT IN (
                  -- Explicitly known legacy policy names
                  'Public Access to shop-assets',
                  'Allow authenticated or anon uploads to shop-assets',
                  'Admin Upload shop-assets',
                  'Admin Delete category-images',
                  'Admin Upload category-images',
                  'Allow authenticated or anon uploads to category-images',
                  -- Migration 08 managed standard policy names
                  'Public Read shop-assets',
                  'Public Read category-images',
                  'Admin Insert shop-assets',
                  'Admin Insert category-images',
                  'Admin Update shop-assets',
                  'Admin Update category-images',
                  'Admin Delete shop-assets',
                  'Admin Delete category-images'
              )
        ) LOOP
            RAISE NOTICE 'AUDIT NOTICE: Unrecognized active policy "%" (CMD: %) targets catalog storage buckets. Please review manually; not dropped automatically.', r.policyname, r.cmd;
        END LOOP;

        -- 10c. Comprehensive SELECT (Public visitors and clients may view public catalog images ONLY)
        -- Both buckets are strictly catalog assets. Idempotency guaranteed: DROP IF EXISTS precedes CREATE POLICY.
        DROP POLICY IF EXISTS "Public Read shop-assets" ON storage.objects;
        CREATE POLICY "Public Read shop-assets"
        ON storage.objects FOR SELECT
        TO public
        USING (bucket_id = 'shop-assets');

        DROP POLICY IF EXISTS "Public Read category-images" ON storage.objects;
        CREATE POLICY "Public Read category-images"
        ON storage.objects FOR SELECT
        TO public
        USING (bucket_id = 'category-images');

        -- 10d. Comprehensive INSERT (Strictly verified admins or trusted service_role backend - no anon uploads)
        DROP POLICY IF EXISTS "Admin Insert shop-assets" ON storage.objects;
        CREATE POLICY "Admin Insert shop-assets"
        ON storage.objects FOR INSERT
        TO authenticated, service_role
        WITH CHECK (
            bucket_id = 'shop-assets'
            AND (public.is_admin() OR auth.role() = 'service_role')
        );

        DROP POLICY IF EXISTS "Admin Insert category-images" ON storage.objects;
        CREATE POLICY "Admin Insert category-images"
        ON storage.objects FOR INSERT
        TO authenticated, service_role
        WITH CHECK (
            bucket_id = 'category-images'
            AND (public.is_admin() OR auth.role() = 'service_role')
        );

        -- 10e. Comprehensive UPDATE (Strictly verified admins or trusted service_role backend)
        DROP POLICY IF EXISTS "Admin Update shop-assets" ON storage.objects;
        CREATE POLICY "Admin Update shop-assets"
        ON storage.objects FOR UPDATE
        TO authenticated, service_role
        USING (
            bucket_id = 'shop-assets'
            AND (public.is_admin() OR auth.role() = 'service_role')
        )
        WITH CHECK (
            bucket_id = 'shop-assets'
            AND (public.is_admin() OR auth.role() = 'service_role')
        );

        DROP POLICY IF EXISTS "Admin Update category-images" ON storage.objects;
        CREATE POLICY "Admin Update category-images"
        ON storage.objects FOR UPDATE
        TO authenticated, service_role
        USING (
            bucket_id = 'category-images'
            AND (public.is_admin() OR auth.role() = 'service_role')
        )
        WITH CHECK (
            bucket_id = 'category-images'
            AND (public.is_admin() OR auth.role() = 'service_role')
        );

        -- 10f. Comprehensive DELETE (Strictly verified admins or trusted service_role backend)
        DROP POLICY IF EXISTS "Admin Delete shop-assets" ON storage.objects;
        CREATE POLICY "Admin Delete shop-assets"
        ON storage.objects FOR DELETE
        TO authenticated, service_role
        USING (
            bucket_id = 'shop-assets'
            AND (public.is_admin() OR auth.role() = 'service_role')
        );

        DROP POLICY IF EXISTS "Admin Delete category-images" ON storage.objects;
        CREATE POLICY "Admin Delete category-images"
        ON storage.objects FOR DELETE
        TO authenticated, service_role
        USING (
            bucket_id = 'category-images'
            AND (public.is_admin() OR auth.role() = 'service_role')
        );
    END IF;
END $$;
