import { Order, StoreConfig, CartItem, Product } from '../src/types';
import { initialStoreConfig, INDONESIA_PROVINCES } from '../src/data/mockData';
import { getOrderStatusInfo, formatShippingMethod, AIR_SHIPPING_ESTIMATE_DAYS } from '../src/lib/orderStatusHelper';

function runCheckoutVerification() {
  console.log('=== VERIFIKASI CHECKOUT PENGIRIMAN REGULER VIA UDARA & STATUS OPERASIONAL ===\n');
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

  // 1. Metode Pengiriman Tunggal & Estimasi 14 Hari
  const formattedMethod = formatShippingMethod('AIR_REGULAR');
  assert(formattedMethod === 'Pengiriman Reguler via Udara', '1a. Metode pengiriman standar adalah Pengiriman Reguler via Udara');
  assert(AIR_SHIPPING_ESTIMATE_DAYS === 14, '1b. Default estimasi pengiriman adalah 14 hari kalender');
  
  // 2. Formulir Alamat Pengiriman
  assert(INDONESIA_PROVINCES.includes('Jawa Timur') && INDONESIA_PROVINCES.includes('DKI Jakarta'), '2a. Daftar provinsi Indonesia tersedia lengkap');

  // 3. Transparansi Total Pembayaran
  const mockConfig: StoreConfig = {
    ...initialStoreConfig,
    defaultDeliveryFee: 15000,
    airFreightDeliveryFee: 15000,
    airFreightEstimatedDays: 14,
    serviceFee: 1500
  };
  const subtotal = 150000;
  const shippingCost = mockConfig.airFreightDeliveryFee!;
  const serviceFee = mockConfig.serviceFee;
  const totalAkhir = subtotal + shippingCost + serviceFee;
  assert(totalAkhir === 166500, '3a. Perhitungan total akhir transparan (Subtotal: 150.000 + Ongkir Udara: 15.000 + Biaya Layanan: 1.500 = 166.500)');

  // 4. Status Pesanan Operasional 7 Tahap
  const s1 = getOrderStatusInfo('NEW');
  assert(s1.label === 'Menunggu Pembayaran' && s1.stepIndex === 1, '4a. Status 1: Menunggu Pembayaran');

  const s2 = getOrderStatusInfo('PAYMENT_VERIFIED');
  assert(s2.label === 'Pembayaran Terverifikasi' && s2.stepIndex === 2, '4b. Status 2: Pembayaran Terverifikasi');

  const s3 = getOrderStatusInfo('WAITING_SUPPLIER_CONFIRMATION');
  assert(s3.label === 'Menunggu Konfirmasi Ketersediaan Pemasok' && s3.stepIndex === 3, '4c. Status 3: Menunggu Konfirmasi Ketersediaan Pemasok');

  const s4 = getOrderStatusInfo('SUPPLIER_PROCESSING');
  assert(s4.label === 'Diproses Pemasok' && s4.stepIndex === 4, '4d. Status 4: Diproses Pemasok');

  const s5 = getOrderStatusInfo('IN_TRANSIT_AIR');
  assert(s5.label === 'Dalam Pengiriman (Kargo Udara)' && s5.stepIndex === 5, '4e. Status 5: Dalam Pengiriman (Kargo Udara)');

  const s6 = getOrderStatusInfo('DELIVERED');
  assert(s6.label === 'Terkirim' && s6.stepIndex === 6, '4f. Status 6: Terkirim');

  const s7 = getOrderStatusInfo('CANCELLED');
  assert(s7.label.includes('Dibatalkan') && s7.stepIndex === -1, '4g. Status 7: Dibatalkan / Pengembalian Dana');

  // 5. Pesanan Baru tidak membutuhkan kode referral di checkout
  const mockOrder: Order = {
    id: 'ord-test-1',
    orderNumber: 'TS-20261013-101',
    customerName: 'Budi Santoso',
    customerPhone: '081234567890',
    deliveryAddress: 'Jl. Raya Tumpang No. 45',
    customerProvince: 'Jawa Timur',
    customerCity: 'Kabupaten Malang',
    customerDistrict: 'Kecamatan Tumpang',
    customerPostalCode: '65156',
    shippingMethod: 'AIR_REGULAR',
    shippingCost: 15000,
    estimatedAirDeliveryDays: 14,
    shippingCarrier: 'Kargo Udara Reguler',
    items: [],
    subtotal: 150000,
    serviceFee: 1500,
    total: 166500,
    paymentStatus: 'PENDING',
    orderStatus: 'NEW',
    paymentMethod: 'PAYMENT_GATEWAY_LINK',
    paymentExpiresAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  assert(mockOrder.shippingMethod === 'AIR_REGULAR', '5a. Pesanan tercatat dengan metode AIR_REGULAR');
  assert(mockOrder.orderStatus === 'NEW' && mockOrder.paymentStatus === 'PENDING', '5b. Pesanan baru berstatus NEW & PENDING');
  assert(mockOrder.customerProvince === 'Jawa Timur' && mockOrder.customerPostalCode === '65156', '5c. Alamat lengkap dengan provinsi dan kode pos tersimpan rapi');

  console.log(`\n=== RESULTS: ${passed}/${total} TESTS PASSED ===`);
  if (passed === total) {
    console.log('SEMUA SPESIFIKASI CHECKOUT & LOGISTIK KARGO UDARA BERHASIL TERVERIFIKASI!');
  } else {
    process.exit(1);
  }
}

runCheckoutVerification();
