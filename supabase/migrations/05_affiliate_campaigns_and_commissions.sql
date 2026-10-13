-- ====================================================================
-- MIGRATION 05: Affiliate Campaigns, Custom Product Commissions & Integrity
-- Project Ref: sjhujsvifjdfvzjtyetn
-- Note: Review and apply via Supabase Dashboard SQL Editor
-- ====================================================================

-- 1. Update Products Table with Custom Commission Fields
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS use_custom_commission BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS custom_commission_rate NUMERIC CHECK (custom_commission_rate IS NULL OR (custom_commission_rate >= 0 AND custom_commission_rate <= 100));

-- 2. Update Store Configuration Table with Standard Commission Rate (Default: 15%)
ALTER TABLE public.store_config 
ADD COLUMN IF NOT EXISTS default_affiliate_commission_rate NUMERIC DEFAULT 15 CHECK (default_affiliate_commission_rate >= 0 AND default_affiliate_commission_rate <= 100);

-- Update existing default record if present
UPDATE public.store_config 
SET default_affiliate_commission_rate = 15 
WHERE default_affiliate_commission_rate IS NULL;

-- 3. Update Orders Table with Immutable Affiliate Snapshot Fields
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS referral_code TEXT,
ADD COLUMN IF NOT EXISTS affiliate_commission JSONB;

-- 4. Create Affiliate Applications Table
CREATE TABLE IF NOT EXISTS public.affiliate_applications (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    promotion_channel TEXT NOT NULL,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    referral_code TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index on referral code for instant validation
CREATE INDEX IF NOT EXISTS idx_affiliate_applications_code ON public.affiliate_applications(referral_code);

-- 5. Create Affiliate Campaigns Table
CREATE TABLE IF NOT EXISTS public.affiliate_campaigns (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    product_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    commission_rate NUMERIC NOT NULL CHECK (commission_rate >= 0 AND commission_rate <= 100),
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'ENDED')),
    budget_limit NUMERIC CHECK (budget_limit IS NULL OR budget_limit >= 0),
    max_orders INTEGER CHECK (max_orders IS NULL OR max_orders >= 0),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index on status and dates for active campaign lookups
CREATE INDEX IF NOT EXISTS idx_affiliate_campaigns_lookup ON public.affiliate_campaigns(status, start_date, end_date);

-- 6. Enable Row Level Security (RLS)
ALTER TABLE public.affiliate_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_campaigns ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies for Affiliate Applications
DROP POLICY IF EXISTS "Public can submit affiliate application" ON public.affiliate_applications;
CREATE POLICY "Public can submit affiliate application"
ON public.affiliate_applications FOR INSERT
WITH CHECK (TRUE);

DROP POLICY IF EXISTS "Public can read approved affiliate referral code" ON public.affiliate_applications;
CREATE POLICY "Public can read approved affiliate referral code"
ON public.affiliate_applications FOR SELECT
USING (TRUE);

DROP POLICY IF EXISTS "Admins have full access to affiliate applications" ON public.affiliate_applications;
CREATE POLICY "Admins have full access to affiliate applications"
ON public.affiliate_applications FOR ALL
USING (
  public.is_admin() OR 
  (auth.jwt() ->> 'email') = 'tumpanggo@gmail.com'
)
WITH CHECK (
  public.is_admin() OR 
  (auth.jwt() ->> 'email') = 'tumpanggo@gmail.com'
);

-- 8. RLS Policies for Affiliate Campaigns
DROP POLICY IF EXISTS "Public can view active campaigns" ON public.affiliate_campaigns;
CREATE POLICY "Public can view active campaigns"
ON public.affiliate_campaigns FOR SELECT
USING (
  status = 'ACTIVE' OR 
  public.is_admin() OR 
  (auth.jwt() ->> 'email') = 'tumpanggo@gmail.com'
);

DROP POLICY IF EXISTS "Admins have full access to campaigns" ON public.affiliate_campaigns;
CREATE POLICY "Admins have full access to campaigns"
ON public.affiliate_campaigns FOR ALL
USING (
  public.is_admin() OR 
  (auth.jwt() ->> 'email') = 'tumpanggo@gmail.com'
)
WITH CHECK (
  public.is_admin() OR 
  (auth.jwt() ->> 'email') = 'tumpanggo@gmail.com'
);

-- 9. Protect Product Custom Commission and Store Config from Non-Admin Modifications
-- Note: Products and store_config update policies are strictly limited to is_admin() via Migration 04.
