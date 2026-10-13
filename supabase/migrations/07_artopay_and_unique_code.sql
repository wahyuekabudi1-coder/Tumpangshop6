-- ====================================================================
-- MIGRATION 07: ArtoPay Integration, Unique Payment Code, and Test Transaction Fields
-- Project: Tumpang Shop
-- ====================================================================

DO $$ 
BEGIN 
    -- 1. unique_code for random Rp 1 - Rp 200 payment identification
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'unique_code'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN unique_code NUMERIC DEFAULT 0;
    END IF;

    -- 2. payment_gateway to identify gateway used (e.g. ARTOPAY, ARTOPAY_SIMULATION)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'payment_gateway'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN payment_gateway TEXT;
    END IF;

    -- 3. payment_reference for transaction ID returned from ArtoPay
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'payment_reference'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN payment_reference TEXT;
    END IF;

    -- 4. payment_link_url
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'payment_link_url'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN payment_link_url TEXT;
    END IF;

    -- 5. artopay_payment_id
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'artopay_payment_id'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN artopay_payment_id TEXT;
    END IF;

    -- 6. artopay_customer_token
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'artopay_customer_token'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN artopay_customer_token TEXT;
    END IF;

    -- 7. is_test_transaction for marking SIMULATED / TEST orders
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'is_test_transaction'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN is_test_transaction BOOLEAN DEFAULT FALSE;
    END IF;

    -- 8. simulation_note
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'simulation_note'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN simulation_note TEXT;
    END IF;

    -- 9. paid_at
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'paid_at'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN paid_at TIMESTAMPTZ;
    END IF;
END $$;

-- Indexes for efficient queries and unique code conflict detection
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON public.orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_unique_code ON public.orders(unique_code);
CREATE INDEX IF NOT EXISTS idx_orders_artopay_payment_id ON public.orders(artopay_payment_id);
