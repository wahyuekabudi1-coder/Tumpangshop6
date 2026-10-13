import assert from 'assert';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'http://localhost:3000';

async function runAudit() {
  console.log('====================================================');
  console.log('FINAL AUDIT: MIGRATION 08 & TUMPANG SHOP SECURITY');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function pass(desc) {
    console.log(`[PASS] ${desc}`);
    passed++;
  }

  function fail(desc, err) {
    console.error(`[FAIL] ${desc}:`, err?.message || err);
    failed++;
  }

  // --------------------------------------------------------------------------
  // SUITE 1: Migration 08 SQL Inspection
  // --------------------------------------------------------------------------
  console.log('--- 1. Migration 08 SQL Integrity & Anti-Tampering ---');
  try {
    const migrationFile = path.resolve(__dirname, '../supabase/migrations/08_security_hardening_rls_and_payouts.sql');
    const sql = fs.readFileSync(migrationFile, 'utf-8');

    // 1.1 No EXCEPTION WHEN OTHERS THEN NULL on constraints
    assert(!sql.includes('EXCEPTION WHEN OTHERS THEN\n    NULL'), 'Migration 08 must not swallow errors with EXCEPTION WHEN OTHERS THEN NULL');
    pass('Migration 08 does NOT swallow SQL errors with EXCEPTION WHEN OTHERS THEN NULL');

    // 1.2 Revoke orders INSERT/SELECT/UPDATE from anon & authenticated
    assert(sql.includes('REVOKE ALL ON public.orders FROM anon, authenticated'), 'Orders must revoke all from anon and authenticated');
    pass('Direct access to public.orders is strictly REVOKED from anon and authenticated');

    // 1.3 Revoke product_reviews INSERT from anon & authenticated
    assert(sql.includes('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.product_reviews FROM anon, authenticated'), 'Reviews must revoke INSERT from anon and authenticated');
    pass('Direct INSERT on public.product_reviews is strictly REVOKED from anon and authenticated');

    // 1.4 Product reviews RLS policy enforces is_verified_purchase = TRUE (NOT USING (TRUE))
    assert(sql.includes('is_verified_purchase = TRUE'), 'Review SELECT policy must require is_verified_purchase = TRUE');
    assert(!sql.includes('CREATE POLICY "Public can view product reviews"\nON public.product_reviews FOR SELECT\nTO anon, authenticated, service_role\nUSING (TRUE);'), 'Review SELECT must NOT use USING (TRUE)');
    pass('Product reviews RLS strictly enforces is_verified_purchase = TRUE (no USING (TRUE))');

    // 1.5 Sanitized public views
    assert(sql.includes('CREATE OR REPLACE VIEW public.public_product_reviews'), 'Must provide sanitized view for public reviews');
    assert(sql.includes('CREATE OR REPLACE VIEW public.public_store_config'), 'Must provide sanitized view for store config');
    pass('Sanitized public views for product reviews and store config are defined');

    // 1.6 Separation of store secrets from public config without destructive column drops
    assert(!sql.includes('DROP COLUMN'), 'Migration 08 must NOT drop any existing columns from store_config or any table');
    assert(sql.includes('CREATE TABLE IF NOT EXISTS public.store_secrets'), 'Must create store_secrets table');
    assert(sql.includes('ON CONFLICT (key) DO NOTHING'), 'Must safely migrate existing credentials into store_secrets without crashing or dropping data');
    assert(sql.includes('REVOKE ALL ON public.store_secrets FROM anon, authenticated'), 'store_secrets must revoke all from anon/auth');
    pass('store_secrets table is isolated with strict RLS and legacy columns are preserved without dropping data');

    // 1.7 Column-level permissions on store_config protect internal data
    assert(sql.includes('GRANT SELECT (id, store_name, store_tagline'), 'store_config grants only non-sensitive presentation columns');
    pass('store_config permissions restricted to safe public presentation columns');

    // 1.8 Dropped public probe function
    assert(sql.includes('DROP FUNCTION IF EXISTS public.verify_order_eligibility_for_review'), 'Must drop probe function');
    assert(!sql.includes('CREATE OR REPLACE FUNCTION public.verify_order_eligibility_for_review'), 'Must not create probe function');
    pass('Public order-guessing probe function is eliminated from schema');

    // 1.9 Atomic stored function for payouts with strict referral code, approval & ownership checks
    assert(sql.includes('CREATE OR REPLACE FUNCTION public.submit_affiliate_payout'), 'Must define submit_affiliate_payout function');
    assert(sql.includes('pg_advisory_xact_lock'), 'Must use pg_advisory_xact_lock for cross-process mutex');
    assert(sql.includes('FOR UPDATE'), 'Must use row-level locking on affiliate_applications');
    assert(sql.includes('v_app_status IS DISTINCT FROM \'APPROVED\''), 'submit_affiliate_payout must abort if affiliate is not APPROVED');
    assert(sql.includes('TRIM(p_affiliate_id) IS DISTINCT FROM v_app_id'), 'submit_affiliate_payout must abort if applicant ID does not match owner');
    assert(sql.includes('COALESCE(affiliate_commission->>\'status\', \'PENDING\') NOT IN (\'REJECTED\', \'CANCELLED\')'), 'submit_affiliate_payout must strictly exclude REJECTED and CANCELLED commissions');
    assert(sql.includes('COALESCE(affiliate_commission->>\'totalCommission\''), 'submit_affiliate_payout must check totalCommission and commissionAmount');
    assert(sql.includes('GRANT EXECUTE ON FUNCTION public.submit_affiliate_payout'), 'Must grant execute to service_role');
    pass('submit_affiliate_payout enforces advisory lock, referral lookup, APPROVED status, owner match, and strictly excludes REJECTED/CANCELLED commissions');

    // 1.10 Payouts table revoked from direct client access
    assert(sql.includes('REVOKE ALL ON public.affiliate_payouts FROM PUBLIC, anon, authenticated'), 'Payouts table must revoke all from PUBLIC, anon and authenticated');
    pass('Direct client access to public.affiliate_payouts is strictly REVOKED');

    // 1.11 Schema alignment: orders tracking columns
    assert(sql.includes('tracking_number'), 'Migration 08 must add tracking_number column to orders');
    assert(sql.includes('shipping_carrier'), 'Migration 08 must add shipping_carrier column to orders');
    assert(sql.includes('tracking_url'), 'Migration 08 must add tracking_url column to orders');
    pass('Schema alignment: orders tracking columns (tracking_number, shipping_carrier, tracking_url) verified in Migration 08');

    // 1.12 Storage security: explicit legacy policy drops & strict policies for SELECT, INSERT, UPDATE, DELETE
    assert(sql.includes('DROP POLICY IF EXISTS "Public Access to shop-assets"'), 'Must explicitly drop legacy shop-assets policies');
    assert(sql.includes('DROP POLICY IF EXISTS "Admin Upload category-images"'), 'Must explicitly drop legacy category-images policies');
    assert(sql.includes('CREATE POLICY "Public Read shop-assets"') && sql.includes('CREATE POLICY "Public Read category-images"'), 'Must provide public read policies');
    assert(sql.includes('CREATE POLICY "Admin Insert shop-assets"') && sql.includes('CREATE POLICY "Admin Insert category-images"'), 'Must restrict INSERT to admin / service_role');
    assert(sql.includes('CREATE POLICY "Admin Update shop-assets"') && sql.includes('CREATE POLICY "Admin Update category-images"'), 'Must restrict UPDATE to admin / service_role');
    assert(sql.includes('CREATE POLICY "Admin Delete shop-assets"') && sql.includes('CREATE POLICY "Admin Delete category-images"'), 'Must restrict DELETE to admin / service_role');
    pass('Storage security hardening: explicit legacy drops and comprehensive SELECT/INSERT/UPDATE/DELETE policies verified');

    // 1.13 Static check: Storage policies 100% idempotency
    const storagePolicyNames = [
      'Public Read shop-assets',
      'Public Read category-images',
      'Admin Insert shop-assets',
      'Admin Insert category-images',
      'Admin Update shop-assets',
      'Admin Update category-images',
      'Admin Delete shop-assets',
      'Admin Delete category-images'
    ];
    for (const pName of storagePolicyNames) {
      const dropSnippet = `DROP POLICY IF EXISTS "${pName}" ON storage.objects;`;
      const createSnippet = `CREATE POLICY "${pName}"`;
      assert(sql.includes(dropSnippet), `Must have "${dropSnippet}" for idempotency`);
      assert(sql.includes(createSnippet), `Must have "${createSnippet}"`);
      const dropIdx = sql.indexOf(dropSnippet);
      const createIdx = sql.indexOf(createSnippet);
      assert(dropIdx !== -1 && createIdx !== -1 && dropIdx < createIdx, `DROP snippet for "${pName}" must precede CREATE snippet`);
    }
    pass('Storage idempotency audit: every CREATE POLICY in Section 10 is preceded by DROP POLICY IF EXISTS');

    // 1.14 Static check: Explicit drop list & Manual notice for unrecognized policies (No automatic dynamic DROP)
    const sec10Start = sql.indexOf('-- 10. STORAGE BUCKETS SECURITY HARDENING');
    const sec10End = sql.indexOf('END $$;', sec10Start);
    const sec10Content = sql.substring(sec10Start, sec10End);
    assert(!sec10Content.includes('EXECUTE format(\'DROP POLICY'), 'Must NOT dynamically execute DROP POLICY on storage.objects matching qual/name patterns');
    assert(sec10Content.includes('RAISE NOTICE') && sec10Content.includes('Unrecognized active policy'), 'Must report unrecognized storage policies via RAISE NOTICE for manual review');
    pass('Storage policy cleanup audit: dynamic automated dropping removed; uses explicit legacy drop list and manual audit notices');

    // 1.15 Static check: Zero anon mutations on Storage & catalog-only public read
    assert(!sec10Content.includes('TO anon') || sec10Content.includes('TO public\n        USING (bucket_id = '), 'Storage mutations must NEVER grant to anon');
    assert(sec10Content.includes('(public.is_admin() OR auth.role() = \'service_role\')'), 'Storage mutations must require is_admin() or service_role');
    assert(sec10Content.includes('bucket_id = \'shop-assets\'') && sec10Content.includes('bucket_id = \'category-images\''), 'Storage policies must be strictly scoped to shop-assets and category-images');
    pass('Storage access restriction audit: public read is strictly scoped to catalog buckets, and mutations are limited to authenticated admins & service_role');

    // 1.16 Static check: public.is_admin() SECURITY DEFINER, search_path, anti-recursion and EXECUTE grant
    assert(sql.includes('SECURITY DEFINER'), 'is_admin() must be SECURITY DEFINER');
    assert(sql.includes('SET search_path = public, pg_temp'), 'is_admin() must set search_path = public, pg_temp');
    assert(sql.includes('v_email = \'tumpanggo@gmail.com\'') || sql.includes('v_app_role IN (\'admin\', \'superadmin\')'), 'is_admin() must have claim fast-path to prevent RLS recursion');
    assert(sql.includes('REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC'), 'Must revoke execute from PUBLIC');
    assert(sql.includes('GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role'), 'Must grant EXECUTE on is_admin() to anon, authenticated, service_role');
    pass('Function permission & safety audit: public.is_admin() configured with SECURITY DEFINER, safe search_path, RLS recursion guard, and proper EXECUTE grants');
  } catch (err) {
    fail('Migration 08 SQL audit', err);
  }

  // --------------------------------------------------------------------------
  // SUITE 2: Admin Authentication & Orders Backend Endpoints
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Admin Dashboard & Orders Endpoints Security ---');
  let adminToken = '';
  try {
    // 2.1 Admin login
    const loginRes = await fetch(`${BASE_URL}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailOrUsername: 'admin', password: 'admin123' })
    });
    assert.strictEqual(loginRes.status, 200);
    const loginData = await loginRes.json();
    assert(loginData.token);
    adminToken = loginData.token;
    pass('Admin login successful and returned signed admin session token');

    // 2.2 Unauthenticated GET /api/admin/orders is rejected (401)
    const unauthOrdRes = await fetch(`${BASE_URL}/api/admin/orders`);
    assert.strictEqual(unauthOrdRes.status, 401);
    pass('GET /api/admin/orders without token is strictly rejected (401)');

    // 2.3 Authenticated GET /api/admin/orders
    const authOrdRes = await fetch(`${BASE_URL}/api/admin/orders`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(authOrdRes.status, 200);
    const ordList = await authOrdRes.json();
    assert(ordList.success);
    assert(Array.isArray(ordList.orders));
    pass(`GET /api/admin/orders with admin token returns 200 OK (${ordList.orders.length} orders)`);

    // 2.4 Checkout an order as guest to test status update and tracking
    const checkoutRes = await fetch(`${BASE_URL}/api/orders/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: 'Audit Test Customer',
        customerPhone: '081299998888',
        customerEmail: 'audit@example.com',
        deliveryAddress: 'Jl. Uji Keamanan No. 1',
        customerDistrict: 'Tumpang',
        shippingMethod: 'AIR_REGULAR',
        clientCatalogProducts: [
          {
            id: 'prod_audit_1',
            name: 'Alpukat Pameling Super',
            price: 75000,
            stock: 20,
            categoryId: 'cat_buah',
            unit: 'kg',
            isActive: true
          }
        ],
        items: [{ productId: 'prod_audit_1', quantity: 2 }]
      })
    });
    assert.strictEqual(checkoutRes.status, 201);
    const orderData = await checkoutRes.json();
    const testOrderId = orderData.order.id;
    pass('Guest checkout processed via backend POST /api/orders/checkout (201 Created)');

    // 2.5 Admin GET /api/admin/orders/:id
    const singleRes = await fetch(`${BASE_URL}/api/admin/orders/${testOrderId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(singleRes.status, 200);
    const singleData = await singleRes.json();
    assert.strictEqual(singleData.order.id, testOrderId);
    pass('GET /api/admin/orders/:id returns order detail for authenticated admin');

    // 2.6 Admin updates status
    const updateStatusRes = await fetch(`${BASE_URL}/api/admin/orders/${testOrderId}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        orderStatus: 'COMPLETED',
        paymentStatus: 'PAID'
      })
    });
    assert.strictEqual(updateStatusRes.status, 200);
    const updatedOrder = await updateStatusRes.json();
    assert.strictEqual(updatedOrder.order.orderStatus, 'COMPLETED');
    assert.strictEqual(updatedOrder.order.paymentStatus, 'PAID');
    pass('Admin successfully updated order to COMPLETED and PAID via POST /api/admin/orders/:id/status');

    // 2.7 Admin updates tracking / resi
    const updateTrackingRes = await fetch(`${BASE_URL}/api/admin/orders/${testOrderId}/tracking`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        trackingNumber: 'AWB-AUDIT-998877',
        shippingCarrier: 'Garuda Air Cargo',
        trackingUrl: 'https://cargo.garuda-indonesia.com/track/AWB-AUDIT-998877'
      })
    });
    assert.strictEqual(updateTrackingRes.status, 200);
    const trackedOrder = await updateTrackingRes.json();
    assert.strictEqual(trackedOrder.order.trackingNumber, 'AWB-AUDIT-998877');
    pass('Admin successfully updated tracking/resi via POST /api/admin/orders/:id/tracking');
  } catch (err) {
    fail('Admin dashboard & orders audit', err);
  }

  // --------------------------------------------------------------------------
  // SUITE 3: Product Reviews Security & PII Protection
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Product Reviews Security & PII Protection ---');
  try {
    // 3.1 Review for non-existent order is rejected (404)
    const fakeOrderRev = await fetch(`${BASE_URL}/api/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: 'prod_audit_1',
        orderId: 'fake_order_12345',
        rating: 5,
        comment: 'Fake review'
      })
    });
    assert.strictEqual(fakeOrderRev.status, 404);
    pass('Review for non-existent order is rejected (404)');

    // 3.2 Review for UNPAID order is rejected (403)
    const unpaidOrderRes = await fetch(`${BASE_URL}/api/orders/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: 'Unpaid Customer',
        customerPhone: '081211112222',
        customerEmail: 'unpaid@example.com',
        deliveryAddress: 'Jl. Belum Bayar No. 2',
        customerDistrict: 'Tumpang',
        shippingMethod: 'AIR_REGULAR',
        clientCatalogProducts: [
          {
            id: 'prod_audit_unpaid',
            name: 'Madu Randu Asli',
            price: 85000,
            stock: 10,
            categoryId: 'cat_madu',
            unit: 'botol',
            isActive: true
          }
        ],
        items: [{ productId: 'prod_audit_unpaid', quantity: 1 }]
      })
    });
    const unpaidOrder = await unpaidOrderRes.json();
    const unpaidRev = await fetch(`${BASE_URL}/api/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: 'prod_audit_unpaid',
        orderId: unpaidOrder.order.id,
        rating: 5,
        comment: 'Trying to review unpaid order'
      })
    });
    assert.strictEqual(unpaidRev.status, 403);
    pass('Review for UNPAID/NEW order is strictly rejected (403 Forbidden)');

    // 3.3 Create a completed & paid order containing prod_audit_verified, then try to review prod_mismatch
    const paidOrderRes = await fetch(`${BASE_URL}/api/orders/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: 'Verified Buyer',
        customerPhone: '081233334444',
        customerEmail: 'buyer@example.com',
        deliveryAddress: 'Jl. Pembeli Sah No. 3',
        customerDistrict: 'Tumpang',
        shippingMethod: 'AIR_REGULAR',
        clientCatalogProducts: [
          {
            id: 'prod_audit_verified',
            name: 'Jeruk Manis Malang',
            price: 45000,
            stock: 50,
            categoryId: 'cat_buah',
            unit: 'kg',
            isActive: true
          }
        ],
        items: [{ productId: 'prod_audit_verified', quantity: 1 }]
      })
    });
    const paidOrderData = await paidOrderRes.json();
    const validOrderId = paidOrderData.order.id;

    // Admin marks order COMPLETED and PAID
    await fetch(`${BASE_URL}/api/admin/orders/${validOrderId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ orderStatus: 'COMPLETED', paymentStatus: 'PAID' })
    });

    // Attempt to review prod_other (which is NOT in the order)
    const wrongProdRev = await fetch(`${BASE_URL}/api/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: 'prod_other_mismatched',
        orderId: validOrderId,
        rating: 5,
        comment: 'Trying to review item not in order'
      })
    });
    assert.strictEqual(wrongProdRev.status, 403);
    pass('Review for product not in order items is strictly rejected (403)');

    // 3.4 Valid review for prod_audit_verified in valid order
    const validRev = await fetch(`${BASE_URL}/api/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: 'prod_audit_verified',
        orderId: validOrderId,
        userId: 'buyer_user_1',
        userName: 'Verified Buyer',
        rating: 5,
        comment: 'Buah jeruk sangat manis dan segar langsung dari kebun!'
      })
    });
    assert.strictEqual(validRev.status, 201);
    const validRevData = await validRev.json();
    assert(validRevData.success);
    assert.strictEqual(validRevData.review.isVerifiedPurchase, true);
    pass('Genuine review for COMPLETED & PAID order containing product succeeds (201 Created)');

    // 3.5 Duplicate review submission for same order and product is rejected (409)
    const duplicateRev = await fetch(`${BASE_URL}/api/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: 'prod_audit_verified',
        orderId: validOrderId,
        userId: 'buyer_user_1',
        userName: 'Verified Buyer',
        rating: 4,
        comment: 'Trying duplicate review'
      })
    });
    assert.strictEqual(duplicateRev.status, 409);
    pass('Duplicate review submission for same order and product is rejected (409 Conflict)');

    // 3.6 Public reviews reading is functional AND protects customer PII
    const getRevs = await fetch(`${BASE_URL}/api/reviews/prod_audit_verified`);
    assert.strictEqual(getRevs.status, 200);
    const revsList = await getRevs.json();
    assert(revsList.success);
    assert(revsList.reviews.some(r => r.productId === 'prod_audit_verified' && r.isVerifiedPurchase === true));

    // Verify PII Protection: userEmail, orderId, and userId MUST NOT be leaked
    const hasPiiLeak = revsList.reviews.some(r => r.userEmail || r.orderId || r.userId);
    assert(!hasPiiLeak, 'Public review feed must NOT leak userEmail, orderId, or userId');
    pass('Public GET /api/reviews/:productId lists verified reviews without leaking customer PII (no email/orderId/userId)');
  } catch (err) {
    fail('Product reviews security audit', err);
  }

  // --------------------------------------------------------------------------
  // SUITE 4: Affiliate Payouts Security, Concurrency Mutex & Scoping
  // --------------------------------------------------------------------------
  console.log('\n--- 4. Affiliate Payouts Security, Concurrency & Scoping ---');
  try {
    // 4.1 Register affiliate
    const regAffRes = await fetch(`${BASE_URL}/api/affiliates/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Affiliate Audit Tester',
        email: `aff_${Date.now()}@example.com`,
        phone: '081255556666',
        password: 'PasswordSuperAman#2026',
        promotionChannel: 'Instagram'
      })
    });
    assert.strictEqual(regAffRes.status, 201);
    const regAffData = await regAffRes.json();
    const affToken = regAffData.token;
    const testAffCode = regAffData.affiliate.referralCode;
    const testAffId = regAffData.affiliate.id;
    pass(`Registered test affiliate with code ${testAffCode} (status: ${regAffData.affiliate.status})`);

    // 4.2 Unknown referral code rejected (403/404)
    const unknownCodeRes = await fetch(`${BASE_URL}/api/affiliates/payouts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${affToken}`
      },
      body: JSON.stringify({
        referralCode: 'UNKNOWN_CODE_99999',
        amount: 50000,
        bankName: 'BCA',
        accountNumber: '1234567890',
        accountName: 'Affiliate Tester'
      })
    });
    assert(unknownCodeRes.status === 403 || unknownCodeRes.status === 404, 'Unknown referral code payout must be rejected with 403 or 404');
    pass('Payout request with unknown referral code is strictly rejected');

    // 4.3 Mismatched applicant ID / cross-affiliate withdrawal rejected (403)
    const crossAffPayout = await fetch(`${BASE_URL}/api/affiliates/payouts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${affToken}`
      },
      body: JSON.stringify({
        referralCode: 'OTHER_CODE_99',
        amount: 50000,
        bankName: 'BCA',
        accountNumber: '1234567890',
        accountName: 'Affiliate Audit Tester'
      })
    });
    assert.strictEqual(crossAffPayout.status, 403);
    pass('Attempt to request payout for another referral code / mismatched owner is rejected (403 Forbidden)');

    // 4.4 Unapproved affiliate (status != APPROVED) is rejected (403)
    // Note: If newly registered affiliate is PENDING, payout must be rejected
    const unapprovedPayout = await fetch(`${BASE_URL}/api/affiliates/payouts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${affToken}`
      },
      body: JSON.stringify({
        referralCode: testAffCode,
        amount: 50000,
        bankName: 'BCA',
        accountNumber: '1234567890',
        accountName: 'Affiliate Audit Tester'
      })
    });
    // In our system, newly registered affiliate is APPROVED or PENDING. If PENDING, status is 403.
    // If APPROVED, balance check applies. Let's verify rejection occurs safely.
    assert(unapprovedPayout.status === 400 || unapprovedPayout.status === 403, 'Payout request rejected when status is not approved or balance is insufficient');
    pass('Payout request validates approval status and balance before processing');

    // 4.5 Concurrent Payout Requests (Race Condition / Mutex Locking Test)
    // Create an order with approved commission for test affiliate
    const commOrderRes = await fetch(`${BASE_URL}/api/orders/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: 'Commission Test Buyer',
        customerPhone: '081244445555',
        customerEmail: 'commbuyer@example.com',
        deliveryAddress: 'Jl. Komisi No. 5',
        customerDistrict: 'Tumpang',
        shippingMethod: 'AIR_REGULAR',
        referralCode: testAffCode,
        clientCatalogProducts: [
          {
            id: 'prod_comm_1',
            name: 'Kopi Dampit Robusta Super',
            price: 400000, // 15% commission = Rp 60.000 (enough for 1 payout of Rp 50.000, but NOT 2)
            stock: 10,
            categoryId: 'cat_kopi',
            unit: 'kg',
            isActive: true
          }
        ],
        items: [{ productId: 'prod_comm_1', quantity: 1 }]
      })
    });
    const commOrderData = await commOrderRes.json();
    const commOrderId = commOrderData.order.id;

    // Admin marks order COMPLETED & PAID to release approved commission
    await fetch(`${BASE_URL}/api/admin/orders/${commOrderId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ orderStatus: 'COMPLETED', paymentStatus: 'PAID' })
    });

    // Now test concurrent payout requests for the exact same balance (Rp 50.000)
    // Both requests sent simultaneously to test server concurrency mutex / advisory lock
    console.log('    Testing 2 concurrent payout requests competing for Rp 60.000 commission balance...');
    const payoutPayload = {
      referralCode: testAffCode,
      amount: 50000,
      bankName: 'BCA',
      accountNumber: '1234567890',
      accountName: 'Affiliate Audit Tester'
    };

    const [res1, res2] = await Promise.all([
      fetch(`${BASE_URL}/api/affiliates/payouts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${affToken}` },
        body: JSON.stringify(payoutPayload)
      }),
      fetch(`${BASE_URL}/api/affiliates/payouts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${affToken}` },
        body: JSON.stringify(payoutPayload)
      })
    ]);

    const statuses = [res1.status, res2.status];
    const has201 = statuses.includes(201);
    const has400 = statuses.includes(400);

    assert(has201 && has400, `Concurrent requests must allow exactly one success (201) and reject the duplicate (400). Got: ${statuses.join(', ')}`);
    pass('Concurrent payout requests mutex successfully prevented double-spending (1 succeeded, 1 rejected with 400)');

    // 4.6 Payout history scoping: Affiliate can only view own history
    const affPayoutHistory = await fetch(`${BASE_URL}/api/affiliates/payouts?referralCode=HACK_OTHER`, {
      headers: { Authorization: `Bearer ${affToken}` }
    });
    assert.strictEqual(affPayoutHistory.status, 200);
    const affPayoutData = await affPayoutHistory.json();
    assert(affPayoutData.success);
    assert(affPayoutData.payouts.every(p => p.referralCode === testAffCode));
    pass('GET /api/affiliates/payouts strictly scopes affiliate history to authenticated caller referral code');
  } catch (err) {
    fail('Affiliate payouts audit', err);
  }

  // --------------------------------------------------------------------------
  // SUITE 5: Store Config & Private Secrets Protection
  // --------------------------------------------------------------------------
  console.log('\n--- 5. Store Config & Private Secrets Isolation ---');
  try {
    // 5.1 Public store config endpoint exposes only safe presentation fields
    const publicCfgRes = await fetch(`${BASE_URL}/api/config/public`);
    assert.strictEqual(publicCfgRes.status, 200);
    const publicCfg = await publicCfgRes.json();
    assert(publicCfg.success);
    assert(publicCfg.config.storeName);
    assert(typeof publicCfg.config.isOpen === 'boolean');

    // Verify NO internal credentials or tokens are exposed
    const leakedKeys = ['secretKey', 'apiKey', 'token', 'privateKey', 'webhookSecret', 'password', 'serviceRole'];
    const cfgKeys = Object.keys(publicCfg.config);
    const foundLeak = leakedKeys.some(k => cfgKeys.includes(k) || publicCfg.config[k]);
    assert(!foundLeak, `Public store config must NOT expose private keys or tokens. Found keys: ${cfgKeys.join(', ')}`);
    pass('GET /api/config/public exposes public store presentation fields without leaking private keys or secrets');

    // 5.2 Payment gateway public config does NOT expose secret keys
    const artopayCfgRes = await fetch(`${BASE_URL}/api/payment/artopay/config`);
    assert.strictEqual(artopayCfgRes.status, 200);
    const artopayCfg = await artopayCfgRes.json();
    assert(!artopayCfg.secretKey && !artopayCfg.privateKey && !artopayCfg.webhookSecret);
    pass('GET /api/payment/artopay/config does NOT expose ArtoPay secret key, private key, or webhook secret');

    // 5.3 Internal admin config endpoint strictly requires admin authorization
    const unauthAdminCfg = await fetch(`${BASE_URL}/api/admin/config`);
    assert.strictEqual(unauthAdminCfg.status, 401);
    pass('GET /api/admin/config without admin token is rejected (401 Unauthorized)');

    const authAdminCfg = await fetch(`${BASE_URL}/api/admin/config`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(authAdminCfg.status, 200);
    const adminCfgData = await authAdminCfg.json();
    assert(adminCfgData.success);
    pass('GET /api/admin/config with admin token succeeds (200 OK)');

    // 5.4 Internal admin secrets metadata endpoint (never exposes raw secrets)
    const unauthSecrets = await fetch(`${BASE_URL}/api/admin/secrets`);
    assert.strictEqual(unauthSecrets.status, 401);
    pass('GET /api/admin/secrets without admin token is rejected (401 Unauthorized)');

    const authSecrets = await fetch(`${BASE_URL}/api/admin/secrets`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(authSecrets.status, 200);
    const secretsData = await authSecrets.json();
    assert(secretsData.success && Array.isArray(secretsData.configuredKeys));
    // 5.5 Dynamic store secrets cache update and rotation test
    const unauthPostSecret = await fetch(`${BASE_URL}/api/admin/secrets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'test_audit_dynamic_key', value: 'secret_sensitive_123456' })
    });
    assert.strictEqual(unauthPostSecret.status, 401);
    pass('POST /api/admin/secrets without token is rejected (401 Unauthorized)');

    // 5.6 Credential rotation with simulated storage failure
    const failedRotationRes = await fetch(`${BASE_URL}/api/admin/secrets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-simulate-storage-failure': 'true'
      },
      body: JSON.stringify({
        key: 'test_storage_fail_key',
        value: 'leaked_value_should_never_persist_777'
      })
    });
    assert.strictEqual(failedRotationRes.status, 500);
    const failData = await failedRotationRes.json();
    assert(!failData.success, 'Simulated failure must return success: false');
    assert(!JSON.stringify(failData).includes('leaked_value_should_never_persist_777'), 'Error response must NOT leak secret value');
    pass('Simulated storage failure on POST /api/admin/secrets returns 500 without leaking secret value');

    // Verify the failed key was NOT committed to storeSecretsCache
    const checkAfterFailRes = await fetch(`${BASE_URL}/api/admin/secrets`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const checkAfterFailData = await checkAfterFailRes.json();
    assert(!checkAfterFailData.configuredKeys.includes('test_storage_fail_key'), 'Failed secret key must NOT be added to cache or metadata');
    pass('storeSecretsCache is NOT updated when secret storage persistence fails');

    // 5.7 Successful credential rotation: rotate artopay_webhook_secret
    const rotatedSecretValue = 'rot_wh_secret_live_987654321';
    const rotateRes = await fetch(`${BASE_URL}/api/admin/secrets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        key: 'artopay_webhook_secret',
        value: rotatedSecretValue,
        description: 'Rotated live webhook secret for security audit'
      })
    });
    assert.strictEqual(rotateRes.status, 200);
    const rotateData = await rotateRes.json();
    assert(rotateData.success && rotateData.updated && rotateData.configured);
    assert(!JSON.stringify(rotateData).includes(rotatedSecretValue), 'Rotation response must NOT leak secret value');
    pass('POST /api/admin/secrets rotates artopay_webhook_secret cleanly without leaking value in response');

    // 5.8 Webhook signature verification using rotated credential
    const dummyWebhookPayload = JSON.stringify({
      responseCode: '2000000',
      responseMessage: 'Success',
      data: {
        transactionId: 'trx_rot_test_audit_888',
        partnerReferenceNo: 'ORD-NOT-FOUND-DUMMY',
        status: 'PAID',
        amount: 50000,
        paidAt: new Date().toISOString()
      }
    });

    // Valid signature with newly rotated secret
    const validRotatedSig = crypto.createHmac('sha256', rotatedSecretValue)
      .update(Buffer.from(dummyWebhookPayload, 'utf-8'))
      .digest('hex');

    const webhookValidRes = await fetch(`${BASE_URL}/api/payment/artopay-webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-signature': validRotatedSig
      },
      body: dummyWebhookPayload
    });
    // The webhook must accept signature (not 401). If order not found, it responds with order not found or 400/404, strictly NOT 401
    assert.notStrictEqual(webhookValidRes.status, 401, 'Webhook must accept signature generated with rotated secret');
    pass('ArtoPay Webhook successfully verifies HMAC signature computed with newly rotated secret');

    // Invalid signature rejection: sign with the failed/rejected key
    const invalidSig = crypto.createHmac('sha256', 'leaked_value_should_never_persist_777')
      .update(Buffer.from(dummyWebhookPayload, 'utf-8'))
      .digest('hex');

    const webhookInvalidRes = await fetch(`${BASE_URL}/api/payment/artopay-webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-signature': invalidSig
      },
      body: dummyWebhookPayload
    });
    assert.strictEqual(webhookInvalidRes.status, 401, 'Webhook must reject signature computed with uncommitted or invalid key');
    const invalidWhBody = await webhookInvalidRes.json();
    assert.strictEqual(invalidWhBody.responseCode, '4010000');
    pass('ArtoPay Webhook strictly rejects signatures created with uncommitted or invalid keys (401 Unauthorized)');

    // 5.9 Audit responses for total secrecy (no leaked secret values anywhere)
    const pubConfigCheck = await fetch(`${BASE_URL}/api/config/public`);
    const pubConfigText = await pubConfigCheck.text();
    assert(!pubConfigText.includes(rotatedSecretValue), 'Public store config must never leak rotated secret');

    const artopayConfigCheck = await fetch(`${BASE_URL}/api/payment/artopay/config`);
    const artopayConfigText = await artopayConfigCheck.text();
    assert(!artopayConfigText.includes(rotatedSecretValue), 'ArtoPay public config must never leak rotated secret');

    const adminSecretsCheck = await fetch(`${BASE_URL}/api/admin/secrets`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const adminSecretsText = await adminSecretsCheck.text();
    assert(!adminSecretsText.includes(rotatedSecretValue), 'Admin secrets metadata must never leak raw secret values');
    pass('Audit verified: zero secret leaks in public config, payment config, and admin secrets list');

    // 5.10 Test secret deletion error handling and clean deletion
    const delFailRes = await fetch(`${BASE_URL}/api/admin/secrets/artopay_webhook_secret`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-simulate-storage-failure': 'true'
      }
    });
    assert.strictEqual(delFailRes.status, 500);
    pass('Simulated failure on DELETE /api/admin/secrets/:key returns 500 without premature cache deletion');

    // Clean up temporary rotated secret
    const delSecretRes = await fetch(`${BASE_URL}/api/admin/secrets/artopay_webhook_secret`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(delSecretRes.status, 200);
    pass('DELETE /api/admin/secrets/:key safely deletes secret from cache and database');
  } catch (err) {
    fail('Store config & secrets audit', err);
  }

  // --------------------------------------------------------------------------
  // SUITE 6: All Admin Endpoints Authorization Verification
  // --------------------------------------------------------------------------
  console.log('\n--- 6. Admin Endpoints Authorization Enforcement ---');
  try {
    const adminEndpoints = [
      { path: '/api/admin/orders', method: 'GET' },
      { path: '/api/admin/orders/ord_test_fake', method: 'GET' },
      { path: '/api/admin/orders/ord_test_fake/status', method: 'POST', body: { orderStatus: 'COMPLETED' } },
      { path: '/api/admin/orders/ord_test_fake/tracking', method: 'POST', body: { trackingNumber: '123' } },
      { path: '/api/admin/payouts/pay_test_fake/status', method: 'POST', body: { status: 'PROCESSED' } },
      { path: '/api/admin/reviews', method: 'GET' },
      { path: '/api/admin/config', method: 'GET' },
      { path: '/api/admin/secrets', method: 'GET' },
      { path: '/api/admin/secrets', method: 'POST', body: { key: 'test', value: '123' } },
      { path: '/api/admin/secrets/test_key', method: 'DELETE' }
    ];

    for (const ep of adminEndpoints) {
      const res = await fetch(`${BASE_URL}${ep.path}`, {
        method: ep.method,
        headers: { 'Content-Type': 'application/json' },
        body: ep.body ? JSON.stringify(ep.body) : undefined
      });
      assert(res.status === 401, `Endpoint ${ep.method} ${ep.path} must return 401 Unauthorized when token is missing. Got ${res.status}`);
    }
    pass('All admin endpoints strictly enforce Bearer token verification and reject unauthenticated calls (401)');
  } catch (err) {
    fail('Admin endpoints authorization audit', err);
  }

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n====================================================');
  console.log(`FINAL SECURITY AUDIT RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runAudit().catch(err => {
  console.error('Audit run error:', err);
  process.exit(1);
});
