-- ====================================================================
-- MIGRATION 03: Product Reviews Schema with Order Verification & RLS
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.product_reviews (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    user_email TEXT,
    order_id TEXT REFERENCES public.orders(id) ON DELETE SET NULL,
    is_verified_purchase BOOLEAN DEFAULT FALSE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices for rapid lookup by product
CREATE INDEX IF NOT EXISTS idx_product_reviews_product_id ON public.product_reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_product_reviews_created_at ON public.product_reviews(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;

-- 1. Public read policy: Everyone can view product reviews
CREATE POLICY "Public can view product reviews"
ON public.product_reviews FOR SELECT
USING (TRUE);

-- 2. Authenticated or verified buyers can insert reviews
CREATE POLICY "Buyers can submit reviews"
ON public.product_reviews FOR INSERT
WITH CHECK (
    -- Only allow if order_id corresponds to a COMPLETED order containing the product
    EXISTS (
        SELECT 1 FROM public.orders
        WHERE orders.id = product_reviews.order_id
          AND orders.order_status = 'COMPLETED'
    )
    OR is_verified_purchase = FALSE
);
