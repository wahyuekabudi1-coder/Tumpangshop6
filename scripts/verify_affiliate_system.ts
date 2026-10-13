// Mock storage and document for Node.js execution
if (typeof globalThis.localStorage === 'undefined') {
  const memStore = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => memStore.get(k) ?? null,
    setItem: (k: string, v: string) => memStore.set(k, String(v)),
    removeItem: (k: string) => memStore.delete(k),
    clear: () => memStore.clear()
  };
}

if (typeof globalThis.document === 'undefined') {
  (globalThis as any).document = {
    referrer: 'https://www.tiktok.com/@creator/video/123456',
    cookie: ''
  };
}

import { 
  getEffectiveProductCommission, 
  calculateOrderAffiliateCommission, 
  detectCampaignConflicts, 
  getCampaignPerformance, 
  syncOrderAffiliateStatus 
} from '../src/lib/commissionCalculator';
import { 
  processIncomingAffiliateLink,
  getActiveAffiliateAttribution,
  clearAffiliateAttribution,
  getAffiliatePerformanceMetrics,
  getAffiliateClicks,
  savePayoutRequest,
  getPayoutRequests,
  updatePayoutRequestStatus,
  ATTRIBUTION_WINDOW_MS
} from '../src/lib/affiliateAttribution';
import { processPaymentGatewayWebhook } from '../src/lib/paymentGateway';
import { Product, StoreConfig, AffiliateCampaign, Order, AffiliateApplication } from '../src/types';

function runTests() {
  console.log('=== STARTING TIKTOK-STYLE AFFILIATE & COMMISSION SYSTEM VERIFICATION ===\n');
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

  const approvedAffiliateA: AffiliateApplication = {
    id: 'aff_siti_01',
    fullName: 'Siti Rahma',
    phone: '081234567890',
    email: 'siti@example.com',
    promotionChannel: 'TikTok & Video Pendek',
    status: 'APPROVED',
    referralCode: 'TS-SITI01',
    createdAt: new Date().toISOString()
  };

  const approvedAffiliateB: AffiliateApplication = {
    id: 'aff_budi_02',
    fullName: 'Budi Santoso',
    phone: '081298765432',
    email: 'budi@example.com',
    promotionChannel: 'Instagram & WhatsApp',
    status: 'APPROVED',
    referralCode: 'TS-BUDI02',
    createdAt: new Date().toISOString()
  };

  const unapprovedAffiliate: AffiliateApplication = {
    id: 'aff_pending_03',
    fullName: 'Calon Mitra',
    phone: '081333444555',
    email: 'calon@example.com',
    promotionChannel: 'Facebook',
    status: 'PENDING',
    referralCode: 'TS-PENDING03',
    createdAt: new Date().toISOString()
  };

  const affiliatesList = [approvedAffiliateA, approvedAffiliateB, unapprovedAffiliate];

  const now = new Date();
  const past = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const future = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // --------------------------------------------------------------------------
  // SKENARIO 1: KLIK TAUTAN AFFILIATE OTOMATIS & DETEKSI SUMBER TRAFIK
  // --------------------------------------------------------------------------
  clearAffiliateAttribution();

  // Test 1a: Click TikTok link with ?ref=TS-SITI01 on product URL /products/beras-premium?ref=TS-SITI01
  const incomingResult = processIncomingAffiliateLink(
    '?ref=TS-SITI01', 
    '/products/beras-premium', 
    affiliatesList
  );
  assert(
    incomingResult !== null && incomingResult.referralCode === 'TS-SITI01',
    '1a. Klik tautan affiliate terekam otomatis dari ?ref=TS-SITI01',
    `Expected TS-SITI01, got ${incomingResult?.referralCode}`
  );
  assert(
    incomingResult?.source === 'TikTok',
    '1b. Deteksi otomatis kanal media sosial (TikTok)',
    `Expected TikTok, got ${incomingResult?.source}`
  );
  assert(
    incomingResult !== null && incomingResult.expiresAt - incomingResult.timestamp === ATTRIBUTION_WINDOW_MS,
    '1c. Jendela atribusi valid selama 30 hari penuh (30 days validity)',
    `Diff ms: ${incomingResult ? incomingResult.expiresAt - incomingResult.timestamp : 0}`
  );

  // Test 1d: Unapproved referral code rejected for security
  const unapprovedResult = processIncomingAffiliateLink(
    '?ref=TS-PENDING03', 
    '/products/beras-premium', 
    affiliatesList
  );
  assert(
    unapprovedResult === null,
    '1d. Kode referral yang belum disetujui (PENDING) ditolak oleh sistem keamanan'
  );

  // --------------------------------------------------------------------------
  // SKENARIO 2: PERSISTENSI ATRIBUSI SAAT NAVIGASI & LIHAT PRODUK LAIN TANPA LOGIN
  // --------------------------------------------------------------------------
  // Customer navigates to other pages (e.g. /products, /product/kopi-robusta, /cart) without ref in query string
  const activeAttribution = getActiveAffiliateAttribution(affiliatesList);
  assert(
    activeAttribution !== null && activeAttribution.referralCode === 'TS-SITI01',
    '2a. Atribusi tetap aktif saat customer berpindah halaman & melihat produk lain tanpa login',
    `Expected TS-SITI01, got ${activeAttribution?.referralCode}`
  );

  // --------------------------------------------------------------------------
  // SKENARIO 3: ATRIBUSI KLIK TERAKHIR (LAST-CLICK ATTRIBUTION)
  // --------------------------------------------------------------------------
  // If customer subsequently clicks Affiliate B link from Instagram, Affiliate B should overwrite
  (globalThis as any).document.referrer = 'https://www.instagram.com/reels/';
  const secondClick = processIncomingAffiliateLink('?ref=TS-BUDI02', '/products/kopi-robusta', affiliatesList);
  const updatedActiveAttribution = getActiveAffiliateAttribution(affiliatesList);
  assert(
    updatedActiveAttribution !== null && updatedActiveAttribution.referralCode === 'TS-BUDI02',
    '3. Model Atribusi Klik Terakhir (Last-Click): klik terbaru dari Affiliate B menimpa atribusi lama',
    `Expected TS-BUDI02, got ${updatedActiveAttribution?.referralCode}`
  );

  // --------------------------------------------------------------------------
  // SKENARIO 4: CHECKOUT TANPA LOGIN & TANPA INPUT KODE
  // --------------------------------------------------------------------------
  // Customer creates order at checkout without entering any code manually
  const checkoutItems = [
    {
      productId: productStandard.id,
      name: productStandard.name,
      sku: productStandard.sku,
      price: productStandard.price,
      quantity: 1,
      subtotal: productStandard.price
    },
    {
      productId: productCustom.id,
      name: productCustom.name,
      sku: productCustom.sku,
      price: productCustom.price,
      quantity: 1,
      subtotal: productCustom.price
    }
  ];

  const orderSnapshot = calculateOrderAffiliateCommission(
    checkoutItems,
    updatedActiveAttribution!.referralCode,
    baseConfig,
    [productStandard, productCustom],
    [],
    { id: approvedAffiliateB.id, fullName: approvedAffiliateB.fullName }
  );

  // productStandard: 75.000 * 15% = 11.250
  // productCustom: 45.000 * 20% (custom rate) = 9.000
  // Total Commission = 20.250
  assert(
    orderSnapshot.totalCommission === 20250,
    '4a. Kalkulasi komisi otomatis di backend (15% standar + 20% khusus produk = Rp 20.250)',
    `Expected 20250, got ${orderSnapshot.totalCommission}`
  );
  assert(
    orderSnapshot.status === 'PENDING',
    '4b. Status awal komisi pesanan baru adalah PENDING (bukan langsung cair)',
    `Expected PENDING, got ${orderSnapshot.status}`
  );

  const testOrder: Order = {
    id: 'ord-test-tiktok-01',
    orderNumber: 'TS-2026-TT01',
    customerName: 'Customer Guest',
    customerPhone: '081233445566',
    deliveryAddress: 'Jl. Raya Tumpang',
    customerDistrict: 'Kecamatan Tumpang',
    shippingMethod: 'REGULAR',
    shippingCost: 6000,
    items: checkoutItems.map(it => ({ ...it, unit: 'pcs' })),
    subtotal: 120000,
    serviceFee: 1500,
    total: 127500,
    paymentStatus: 'PENDING',
    orderStatus: 'NEW',
    paymentMethod: 'PAYMENT_GATEWAY_LINK',
    paymentExpiresAt: future.toISOString(),
    referralCode: updatedActiveAttribution!.referralCode,
    affiliateCommission: orderSnapshot,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };

  // --------------------------------------------------------------------------
  // SKENARIO 5: VERIFIKASI PEMBAYARAN RESMI VIA PAYMENT GATEWAY (PAID)
  // --------------------------------------------------------------------------
  const webhookPaid = processPaymentGatewayWebhook(
    {
      orderId: testOrder.id,
      transactionStatus: 'PAID',
      grossAmount: 127500,
      paymentReference: 'GW-REF-9988'
    },
    [testOrder]
  );

  assert(
    webhookPaid.success && webhookPaid.updatedOrder?.paymentStatus === 'PAID',
    '5a. Webhook pembayaran resmi memverifikasi status pesanan menjadi PAID',
    `Status: ${webhookPaid.updatedOrder?.paymentStatus}`
  );
  assert(
    webhookPaid.updatedOrder?.affiliateCommission?.status === 'APPROVED',
    '5b. Pembayaran terverifikasi mengubah status komisi affiliate dari PENDING menjadi APPROVED',
    `Affiliate status: ${webhookPaid.updatedOrder?.affiliateCommission?.status}`
  );

  // --------------------------------------------------------------------------
  // SKENARIO 6: PERLINDUNGAN WEBHOOK DUPLIKAT / REPLAY
  // --------------------------------------------------------------------------
  const duplicateWebhook = processPaymentGatewayWebhook(
    {
      orderId: testOrder.id,
      transactionStatus: 'PAID',
      grossAmount: 127500,
      paymentReference: 'GW-REF-9988'
    },
    [webhookPaid.updatedOrder!]
  );
  assert(
    duplicateWebhook.isDuplicate === true,
    '6. Proteksi idempotensi: webhook berulang/duplikat ditangani dengan aman tanpa menduplikasi data'
  );

  // --------------------------------------------------------------------------
  // SKENARIO 7: PEMBATALAN DAN REFUND PESANAN (MENGANULIR KOMISI)
  // --------------------------------------------------------------------------
  // Case 7a: Order refunded
  const refundedOrder: Order = {
    ...webhookPaid.updatedOrder!,
    paymentStatus: 'REFUNDED',
    orderStatus: 'CANCELLED'
  };
  const syncedRefunded = syncOrderAffiliateStatus(refundedOrder);
  assert(
    syncedRefunded.affiliateCommission?.status === 'CANCELLED',
    '7a. Refund pesanan menganulir komisi affiliate menjadi CANCELLED secara otomatis',
    `Got ${syncedRefunded.affiliateCommission?.status}`
  );

  // Case 7b: Order cancelled before payment
  const cancelledOrder: Order = {
    ...testOrder,
    orderStatus: 'CANCELLED'
  };
  const syncedCancelled = syncOrderAffiliateStatus(cancelledOrder);
  assert(
    syncedCancelled.affiliateCommission?.status === 'CANCELLED',
    '7b. Pembatalan pesanan mengubah status komisi menjadi CANCELLED'
  );

  // --------------------------------------------------------------------------
  // SKENARIO 8: METRIK PERFORMA AFFILIATE RIIL (TANPA DUMMY/KLAIM PALSU)
  // --------------------------------------------------------------------------
  // Calculate real performance metrics for Affiliate B
  const affiliateBMetrics = getAffiliatePerformanceMetrics(
    'TS-BUDI02',
    [webhookPaid.updatedOrder!] // valid completed order
  );
  assert(
    affiliateBMetrics.validOrdersCount === 1 && affiliateBMetrics.totalSalesVolume === 127500,
    '8a. Metrik penjualan teratribusi (GMV) akurat sesuai transaksi nyata (Rp 127.500)',
    `GMV: ${affiliateBMetrics.totalSalesVolume}`
  );
  assert(
    affiliateBMetrics.approvedCommission === 20250 && affiliateBMetrics.availableBalanceForPayout === 20250,
    '8b. Saldo komisi siap cair terhitung tepat (Rp 20.250)',
    `Available: ${affiliateBMetrics.availableBalanceForPayout}`
  );

  // --------------------------------------------------------------------------
  // SKENARIO 9: PENCAIRAN KOMISI (WITHDRAWAL) & INTEGRITAS SALDO
  // --------------------------------------------------------------------------
  const payoutReq = savePayoutRequest({
    id: 'payout-test-01',
    affiliateId: approvedAffiliateB.id,
    referralCode: approvedAffiliateB.referralCode,
    amount: 20000,
    bankName: 'BCA',
    accountNumber: '123456789',
    accountName: 'Budi Santoso',
    status: 'PENDING',
    createdAt: now.toISOString()
  });

  const metricsAfterPayoutReq = getAffiliatePerformanceMetrics(
    'TS-BUDI02',
    [webhookPaid.updatedOrder!],
    undefined,
    payoutReq
  );
  assert(
    metricsAfterPayoutReq.availableBalanceForPayout === 250, // 20.250 - 20.000 = 250
    '9a. Permintaan pencairan memotong saldo siap cair secara real-time (20.250 - 20.000 = 250)',
    `Available remaining: ${metricsAfterPayoutReq.availableBalanceForPayout}`
  );

  // Admin approves payout
  const updatedPayouts = updatePayoutRequestStatus('payout-test-01', 'PROCESSED');
  const metricsAfterProcessed = getAffiliatePerformanceMetrics(
    'TS-BUDI02',
    [webhookPaid.updatedOrder!],
    undefined,
    updatedPayouts
  );
  assert(
    metricsAfterProcessed.processedPayoutsAmount === 20000,
    '9b. Pencairan yang disetujui admin berpindah ke akumulasi "Telah Dicairkan" (Rp 20.000)'
  );

  // --------------------------------------------------------------------------
  // SKENARIO 10: SATU PESANAN HANYA MEMBERI KOMISI UNTUK SATU AFFILIATE
  // --------------------------------------------------------------------------
  assert(
    webhookPaid.updatedOrder?.affiliateCommission?.referralCode === 'TS-BUDI02' &&
    webhookPaid.updatedOrder?.referralCode === 'TS-BUDI02',
    '10. Aturan integritas: satu pesanan hanya mengatribusi satu mitra affiliate (single attribution)'
  );

  console.log(`\n=== RESULTS: ${passed}/${total} TESTS PASSED ===\n`);
  if (passed === total) {
    console.log('SEMUA SPESIFIKASI SISTEM TIKTOK AFFILIATE BERHASIL TERVERIFIKASI 100%!');
  } else {
    process.exit(1);
  }
}

runTests();
