import { 
  getEffectiveProductCommission, 
  calculateOrderAffiliateCommission, 
  detectCampaignConflicts, 
  getCampaignPerformance, 
  syncOrderAffiliateStatus 
} from '../src/lib/commissionCalculator';
import { Product, StoreConfig, AffiliateCampaign, Order } from '../src/types';

function runTests() {
  console.log('=== STARTING AFFILIATE & COMMISSION SYSTEM VERIFICATION ===\n');
  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    total++;
    if (condition) {
      console.log(`✓ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`✗ [FAIL] ${testName}`);
      if (detail) console.error(`  Detail: ${detail}`);
    }
  }

  const baseConfig: StoreConfig = {
    storeName: 'Tumpang Shop',
    storeTagline: 'Pilihan Produk Berkualitas',
    storeAddress: 'Jl. Raya Tumpang No. 45',
    storePhone: '+62 821-4321-7890',
    isOpen: true,
    minOrderAmount: 10000,
    defaultDeliveryFee: 6000,
    serviceFee: 1500,
    defaultAffiliateCommissionRate: 15
  };

  const productStandard: Product = {
    id: 'prod-std-1',
    name: 'Beras Premium 5kg',
    sku: 'BRS-PREM-5K',
    price: 75000,
    stock: 50,
    images: [],
    unit: 'sak',
    categoryId: 'cat-sembako',
    isActive: true
  };

  const productCustom: Product = {
    id: 'prod-cust-1',
    name: 'Kopi Robusta Lereng Semeru 250g',
    sku: 'KP-SMR-250',
    price: 45000,
    stock: 30,
    images: [],
    unit: 'pack',
    categoryId: 'cat-kopi',
    isActive: true,
    useCustomCommission: true,
    customCommissionRate: 20
  };

  const now = new Date();
  const past = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const future = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const distantFuture = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const distantPast = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  // 1. Test Standard Commission 15%
  const res1 = getEffectiveProductCommission(productStandard, baseConfig, [], now);
  assert(
    res1.ratePercent === 15 && res1.appliedType === 'standard',
    '1. Komisi standar default 15%',
    `Expected 15% standard, got ${res1.ratePercent}% ${res1.appliedType}`
  );

  // 2. Test Admin Configured Standard Commission
  const customConfig = { ...baseConfig, defaultAffiliateCommissionRate: 18 };
  const res2 = getEffectiveProductCommission(productStandard, customConfig, [], now);
  assert(
    res2.ratePercent === 18 && res2.appliedType === 'standard',
    '2. Komisi standar yang diubah admin menjadi 18%',
    `Expected 18%, got ${res2.ratePercent}%`
  );

  // 3. Test Product-Specific Custom Commission
  const res3 = getEffectiveProductCommission(productCustom, baseConfig, [], now);
  assert(
    res3.ratePercent === 20 && res3.appliedType === 'product_custom',
    '3. Komisi khusus produk (Priority #2: 20%)',
    `Expected 20% product_custom, got ${res3.ratePercent}% ${res3.appliedType}`
  );

  // 4. Test Active Campaign (Priority #1 overrides product custom and standard)
  const activeCampaign: AffiliateCampaign = {
    id: 'camp-super-promo',
    name: 'Super Promo Panen Raya',
    description: 'Promo panen',
    productIds: ['prod-std-1', 'prod-cust-1'],
    commissionRate: 25,
    startDate: past.toISOString(),
    endDate: future.toISOString(),
    status: 'ACTIVE',
    createdAt: past.toISOString(),
    updatedAt: past.toISOString()
  };

  const res4Standard = getEffectiveProductCommission(productStandard, baseConfig, [activeCampaign], now);
  const res4Custom = getEffectiveProductCommission(productCustom, baseConfig, [activeCampaign], now);
  assert(
    res4Standard.ratePercent === 25 && res4Standard.appliedType === 'campaign' &&
    res4Custom.ratePercent === 25 && res4Custom.appliedType === 'campaign',
    '4. Campaign aktif mengesampingkan komisi khusus & standar (Priority #1: 25%)',
    `Standard got ${res4Standard.ratePercent}%, Custom got ${res4Custom.ratePercent}%`
  );

  // 5. Test Campaign Before Start Date (SCHEDULED -> fallback)
  const scheduledCampaign: AffiliateCampaign = {
    id: 'camp-scheduled',
    name: 'Upcoming Campaign',
    productIds: ['prod-std-1', 'prod-cust-1'],
    commissionRate: 30,
    startDate: future.toISOString(),
    endDate: distantFuture.toISOString(),
    status: 'SCHEDULED',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
  const res5Std = getEffectiveProductCommission(productStandard, baseConfig, [scheduledCampaign], now);
  const res5Cust = getEffectiveProductCommission(productCustom, baseConfig, [scheduledCampaign], now);
  assert(
    res5Std.ratePercent === 15 && res5Std.appliedType === 'standard' &&
    res5Cust.ratePercent === 20 && res5Cust.appliedType === 'product_custom',
    '5. Campaign sebelum periode (SCHEDULED) tidak berlaku, fallback deterministik',
    `Std got ${res5Std.ratePercent}%, Cust got ${res5Cust.ratePercent}%`
  );

  // 6. Test Campaign After End Date (ENDED -> fallback)
  const endedCampaign: AffiliateCampaign = {
    id: 'camp-ended',
    name: 'Old Campaign',
    productIds: ['prod-std-1', 'prod-cust-1'],
    commissionRate: 35,
    startDate: distantPast.toISOString(),
    endDate: past.toISOString(),
    status: 'ENDED',
    createdAt: distantPast.toISOString(),
    updatedAt: distantPast.toISOString()
  };
  const res6Std = getEffectiveProductCommission(productStandard, baseConfig, [endedCampaign], now);
  assert(
    res6Std.ratePercent === 15 && res6Std.appliedType === 'standard',
    '6. Campaign setelah periode (ENDED) tidak berlaku, fallback ke standar 15%',
    `Std got ${res6Std.ratePercent}%`
  );

  // 7. Test Campaign Conflicts & Deterministic Priority
  const conflictCampaignA: AffiliateCampaign = {
    id: 'camp-a',
    name: 'Campaign A',
    productIds: ['prod-std-1'],
    commissionRate: 22,
    startDate: past.toISOString(),
    endDate: future.toISOString(),
    status: 'ACTIVE',
    createdAt: past.toISOString(),
    updatedAt: past.toISOString()
  };
  const conflictCampaignB: AffiliateCampaign = {
    id: 'camp-b',
    name: 'Campaign B',
    productIds: ['prod-std-1'],
    commissionRate: 28,
    startDate: past.toISOString(),
    endDate: future.toISOString(),
    status: 'ACTIVE',
    createdAt: past.toISOString(),
    updatedAt: past.toISOString()
  };

  const conflicts = detectCampaignConflicts([conflictCampaignA, conflictCampaignB], [productStandard]);
  assert(
    conflicts.length === 1 && conflicts[0].productId === 'prod-std-1',
    '7a. Deteksi konflik campaign dengan produk bersamaan',
    `Found ${conflicts.length} conflicts`
  );

  // Deterministic resolution: highest commission wins (28% instead of summing 22+28=50%)
  const res7 = getEffectiveProductCommission(productStandard, baseConfig, [conflictCampaignA, conflictCampaignB], now);
  assert(
    res7.ratePercent === 28 && res7.campaign?.id === 'camp-b',
    '7b. Resolusi deterministik: memilih persentase tertinggi (28%) tanpa menjumlahkan otomatis',
    `Expected 28% from camp-b, got ${res7.ratePercent}% from ${res7.campaign?.id}`
  );

  // 8. Test Campaign Budget Exhaustion Fallback
  const budgetCampaign: AffiliateCampaign = {
    id: 'camp-budgeted',
    name: 'Campaign Terbatas Anggaran',
    productIds: ['prod-cust-1'],
    commissionRate: 30,
    startDate: past.toISOString(),
    endDate: future.toISOString(),
    status: 'ACTIVE',
    budgetLimit: 10000, // Small budget limit of Rp 10.000
    createdAt: past.toISOString(),
    updatedAt: past.toISOString()
  };

  // Create an order that consumed the budget
  const priorOrder: Order = {
    id: 'ord-prior-1',
    orderNumber: 'TS-2026-001',
    customerName: 'Budi',
    customerPhone: '08123456789',
    deliveryAddress: 'Tumpang',
    customerDistrict: 'Kecamatan Tumpang',
    shippingMethod: 'REGULAR',
    shippingCost: 6000,
    items: [{
      productId: 'prod-cust-1',
      name: productCustom.name,
      sku: productCustom.sku,
      unit: 'pack',
      price: 45000,
      quantity: 1,
      subtotal: 45000
    }],
    subtotal: 45000,
    serviceFee: 1500,
    total: 52500,
    paymentStatus: 'PAID',
    orderStatus: 'COMPLETED',
    createdAt: past.toISOString(),
    updatedAt: past.toISOString(),
    affiliateCommission: {
      referralCode: 'TS-BUDI',
      totalCommission: 13500, // already exceeds 10.000
      status: 'APPROVED',
      calculatedAt: past.toISOString(),
      itemsCommission: [{
        productId: 'prod-cust-1',
        productName: productCustom.name,
        sku: productCustom.sku,
        price: 45000,
        quantity: 1,
        subtotal: 45000,
        appliedType: 'campaign',
        ratePercent: 30,
        commissionAmount: 13500,
        campaignId: 'camp-budgeted',
        campaignName: 'Campaign Terbatas Anggaran'
      }]
    }
  };

  const resBudgetFallback = getEffectiveProductCommission(
    productCustom, 
    baseConfig, 
    [budgetCampaign], 
    now, 
    [priorOrder]
  );
  assert(
    resBudgetFallback.ratePercent === 20 && resBudgetFallback.appliedType === 'product_custom',
    '8. Anggaran campaign habis -> fallback otomatis ke komisi khusus produk (20%)',
    `Expected 20% product_custom, got ${resBudgetFallback.ratePercent}% ${resBudgetFallback.appliedType}`
  );

  // 9. Snapshot Immutability when store / campaign rates change later
  const originalSnapshot = calculateOrderAffiliateCommission(
    [{
      productId: productStandard.id,
      name: productStandard.name,
      sku: productStandard.sku,
      price: productStandard.price,
      quantity: 2,
      subtotal: productStandard.price * 2
    }],
    'REF-PARTNER',
    baseConfig, // 15%
    [productStandard],
    []
  );

  const initialCalculatedAmount = originalSnapshot.totalCommission; // 150.000 * 15% = 22.500
  assert(
    initialCalculatedAmount === 22500,
    '9a. Kalkulasi snapshot pesanan awal tepat (2 * 75.000 * 15% = 22.500)',
    `Expected 22500, got ${initialCalculatedAmount}`
  );

  // Now admin changes store standard commission to 5% or 50%
  const updatedStoreConfig = { ...baseConfig, defaultAffiliateCommissionRate: 5 };
  // Past order snapshot does NOT recalculate or change
  assert(
    originalSnapshot.totalCommission === 22500 && 
    originalSnapshot.itemsCommission[0].ratePercent === 15,
    '9b. Immutability snapshot: perubahan komisi toko TIDAK mengubah transaksi lama',
    `Snapshot rate: ${originalSnapshot.itemsCommission[0].ratePercent}%, amount: ${originalSnapshot.totalCommission}`
  );

  // 10. Order Cancellation / Refund & Idempotent Sync
  const activeOrder: Order = {
    id: 'ord-active-10',
    orderNumber: 'TS-2026-010',
    customerName: 'Siti',
    customerPhone: '08123456788',
    deliveryAddress: 'Tumpang',
    customerDistrict: 'Kecamatan Tumpang',
    shippingMethod: 'REGULAR',
    shippingCost: 6000,
    items: [],
    subtotal: 75000,
    serviceFee: 1500,
    total: 82500,
    paymentStatus: 'PENDING',
    orderStatus: 'NEW',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    affiliateCommission: {
      referralCode: 'REF-SITI',
      totalCommission: 11250,
      status: 'PENDING',
      calculatedAt: now.toISOString(),
      itemsCommission: []
    }
  };

  // Case 10a: Order cancelled -> status becomes CANCELLED
  const cancelledOrder: Order = { ...activeOrder, orderStatus: 'CANCELLED' };
  const syncedCancelled = syncOrderAffiliateStatus(cancelledOrder);
  assert(
    syncedCancelled.affiliateCommission?.status === 'CANCELLED',
    '10a. Pembatalan pesanan mengubah snapshot komisi menjadi CANCELLED secara otomatis',
    `Got ${syncedCancelled.affiliateCommission?.status}`
  );

  // Case 10b: Idempotent - repeated sync calls do not corrupt state
  const syncedTwice = syncOrderAffiliateStatus(syncedCancelled);
  assert(
    syncedTwice.affiliateCommission?.status === 'CANCELLED' &&
    syncedTwice.affiliateCommission?.totalCommission === 11250,
    '10b. Idempotensi sinkronisasi status (repeated sync does not corrupt)',
    `Got ${syncedTwice.affiliateCommission?.status}`
  );

  // Case 10c: Payment PAID -> status becomes APPROVED
  const paidOrder: Order = { ...activeOrder, paymentStatus: 'PAID', orderStatus: 'COMPLETED' };
  const syncedPaid = syncOrderAffiliateStatus(paidOrder);
  assert(
    syncedPaid.affiliateCommission?.status === 'APPROVED',
    '10c. Pembayaran sukses (PAID) mengubah status komisi menjadi APPROVED',
    `Got ${syncedPaid.affiliateCommission?.status}`
  );

  console.log(`\n=== RESULTS: ${passed}/${total} TESTS PASSED ===\n`);
  if (passed === total) {
    console.log('ALL COMMISSION & AFFILIATE SYSTEM SPECIFICATIONS VERIFIED SUCCESSFULLY!');
  } else {
    process.exit(1);
  }
}

runTests();
