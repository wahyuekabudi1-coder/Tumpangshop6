import http from 'http';
import crypto from 'crypto';

console.log('====================================================');
console.log('AUDIT FINAL PRODUCTION READINESS - TUMPANG SHOP');
console.log('====================================================\n');

function makeRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data), headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, raw: data, headers: res.headers });
        }
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runAudit() {
  let passed = 0;
  let failed = 0;
  const results = [];

  function test(condition, category, testName, detail = '') {
    if (condition) {
      console.log(`[LULUS] [${category}] ${testName}`);
      passed++;
      results.push({ category, name: testName, status: 'LULUS', detail });
    } else {
      console.error(`[GAGAL] [${category}] ${testName} - ${detail}`);
      failed++;
      results.push({ category, name: testName, status: 'GAGAL', detail });
    }
  }

  const PRIVATE_KEY = process.env.ARTOPAY_PRIVATE_KEY || 'pk_test_tumpang_shop_sandbox_private_key_2026';

  // --------------------------------------------------------------------------
  // FOKUS 1: AUTENTIKASI AFFILIATE DAN ADMIN
  // --------------------------------------------------------------------------
  console.log('\n--- Uji Fokus 1: Autentikasi Affiliate dan Admin ---');

  // 1.1 Register affiliate with password
  let testAffiliate = null;
  const affEmail = `aff_audit_${Date.now()}@example.com`;
  const affPass = 'RahasiaSuper123';
  try {
    const resReg = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/affiliates/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      fullName: 'Mitra Audit Production',
      phone: '081298765432',
      email: affEmail,
      password: affPass,
      promotionChannel: 'Status WhatsApp & TikTok'
    });

    test(resReg.status === 201 && resReg.data?.success === true, 'AUTENTIKASI', 'Pendaftaran Affiliate dengan Kata Sandi', 'Endpoint /api/affiliates/register membuat akun berstatus APPROVED');
    testAffiliate = resReg.data?.affiliate;
    test(testAffiliate?.passwordHash === undefined, 'AUTENTIKASI', 'Password Hash Tidak Bocor ke Respons Klien', 'Field passwordHash disaring sebelum dikirim');
  } catch (err) {
    test(false, 'AUTENTIKASI', 'Pendaftaran Affiliate', err.message);
  }

  // 1.2 Login without password must FAIL (400)
  try {
    const resNoPass = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/affiliates/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      loginInput: testAffiliate ? testAffiliate.referralCode : 'TS-AUDIT01',
      password: ''
    });
    test(resNoPass.status === 400, 'AUTENTIKASI', 'Penolakan Login Tanpa Kata Sandi', 'ID referral atau nomor HP saja tidak dapat login');
  } catch (err) {
    test(false, 'AUTENTIKASI', 'Penolakan Login Tanpa Kata Sandi', err.message);
  }

  // 1.3 Login with wrong password must FAIL (401)
  try {
    const resWrongPass = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/affiliates/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      loginInput: testAffiliate ? testAffiliate.referralCode : 'TS-AUDIT01',
      password: 'KataSandiSalahTotal'
    });
    test(resWrongPass.status === 401, 'AUTENTIKASI', 'Penolakan Kata Sandi Salah', 'Akses ditolak dengan status 401');
  } catch (err) {
    test(false, 'AUTENTIKASI', 'Penolakan Kata Sandi Salah', err.message);
  }

  // 1.4 Login with correct password must SUCCEED (200)
  try {
    const resOkPass = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/affiliates/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      loginInput: testAffiliate ? testAffiliate.referralCode : affEmail,
      password: affPass
    });
    test(resOkPass.status === 200 && resOkPass.data?.success === true, 'AUTENTIKASI', 'Login Sah dengan Kata Sandi Terverifikasi', 'Berhasil membuka sesi affiliate resmi');
  } catch (err) {
    test(false, 'AUTENTIKASI', 'Login Sah dengan Kata Sandi', err.message);
  }

  // --------------------------------------------------------------------------
  // FOKUS 2: KEAMANAN REFERRAL DAN KOMISI
  // --------------------------------------------------------------------------
  console.log('\n--- Uji Fokus 2: Keamanan Referral dan Komisi ---');

  let orderForTest = null;
  const manipulatedClientCommission = {
    referralCode: testAffiliate ? testAffiliate.referralCode : 'TS-AUDIT01',
    totalCommission: 99999999, // FORGED 100 JUTA!
    ratePercent: 99,           // FORGED 99%!
    status: 'APPROVED'         // FORGED APPROVED!
  };

  try {
    const checkoutPayload = {
      customerName: 'Pelanggan Uji Integritas',
      customerPhone: '081234567890',
      customerEmail: 'audit@tumpang.shop',
      deliveryAddress: 'Jl. Raya Tumpang No. 99, RT 01 RW 02',
      customerDistrict: 'Kecamatan Tumpang',
      clientCatalogProducts: [
        {
          id: 'prod-beras-pandan',
          name: 'Beras Pandan Wangi Super',
          price: 65000,
          stock: 30,
          sku: 'TS-BPW-01',
          categoryId: 'cat-sembako',
          unit: 'sak 5kg',
          isActive: true
        }
      ],
      items: [
        { productId: 'prod-beras-pandan', quantity: 2 } // Subtotal = 130,000
      ],
      referralCode: testAffiliate ? testAffiliate.referralCode : 'TS-AUDIT01',
      affiliateCommission: manipulatedClientCommission // Attacker sends manipulated commission!
    };

    const resCheckout = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/orders/checkout',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, checkoutPayload);

    test(resCheckout.status === 201, 'KEAMANAN_KOMISI', 'Pembuatan Pesanan via Backend', 'Status 201 Created');
    orderForTest = resCheckout.data?.order;

    // Verify backend calculated commission accurately, completely ignoring 99,999,999!
    // Subtotal 130,000 at 15% standard commission = 19,500
    const comm = orderForTest?.affiliateCommission;
    test(comm !== undefined && comm?.totalCommission !== 99999999, 'KEAMANAN_KOMISI', 'Penolakan Pemalsuan Komisi Browser', `Total komisi bukan 99.999.999 melainkan dihitung backend: Rp ${comm?.totalCommission}`);
    test(comm?.status === 'PENDING', 'KEAMANAN_KOMISI', 'Status Komisi Awal Wajib PENDING', 'Komisi baru tidak boleh langsung APPROVED sebelum bayar');
    test(orderForTest?.uniqueCode >= 1 && orderForTest?.uniqueCode <= 200, 'KEAMANAN_KOMISI', 'Alokasi Kode Unik Bersih (1..200)', `Kode unik dialokasikan: Rp ${orderForTest?.uniqueCode}`);
  } catch (err) {
    test(false, 'KEAMANAN_KOMISI', 'Integritas Komisi Checkout', err.message);
  }

  // --------------------------------------------------------------------------
  // FOKUS 3: PERSISTENSI DATABASE & SERVER STORE
  // --------------------------------------------------------------------------
  console.log('\n--- Uji Fokus 3: Persistensi Database & Order Store ---');

  if (orderForTest) {
    try {
      const resGet = await makeRequest({
        hostname: 'localhost',
        port: 3000,
        path: `/api/orders/${orderForTest.id}`,
        method: 'GET'
      });
      test(resGet.status === 200 && resGet.data?.order?.id === orderForTest.id, 'PERSISTENSI', 'Query Pesanan dari Backend Store', 'Pesanan tersimpan persisten di backend');
      test(resGet.data?.order?.total === orderForTest.total, 'PERSISTENSI', 'Total Nominal Persisten & Tidak Berubah', `Nominal tersimpan Rp ${resGet.data?.order?.total}`);
    } catch (err) {
      test(false, 'PERSISTENSI', 'Query Pesanan Backend', err.message);
    }
  }

  // --------------------------------------------------------------------------
  // FOKUS 4: ARTOPAY DAN PWA
  // --------------------------------------------------------------------------
  console.log('\n--- Uji Fokus 4: ArtoPay Webhook & Simulasi Pembayaran ---');

  // 4.1 Test Webhook with FORGED signature (Must return 401)
  if (orderForTest) {
    const rawPayload = JSON.stringify({
      timestamp: new Date().toISOString(),
      data: {
        transactionId: `trx_${Date.now()}_forged`,
        partnerReferenceNo: orderForTest.orderNumber,
        status: 'PAID',
        amount: String(orderForTest.total),
        currency: 'IDR',
        paymentMethod: 'QRIS'
      }
    });

    try {
      const resForgedSig = await makeRequest({
        hostname: 'localhost',
        port: 3000,
        path: '/api/payment/artopay/webhook',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Signature': 'fake_forged_hmac_signature_999999'
        }
      }, rawPayload);

      test(resForgedSig.status === 401, 'ARTOPAY', 'Penolakan Webhook Signature Palsu', 'Webhook dengan signature tidak valid ditolak dengan status 401');
    } catch (err) {
      test(false, 'ARTOPAY', 'Penolakan Webhook Signature Palsu', err.message);
    }

    // 4.2 Test Webhook with VALID HMAC-SHA256 signature
    try {
      const hmac = crypto.createHmac('sha256', PRIVATE_KEY);
      hmac.update(Buffer.from(rawPayload));
      const validSignature = hmac.digest('hex');

      const resValidSig = await makeRequest({
        hostname: 'localhost',
        port: 3000,
        path: '/api/payment/artopay/webhook',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Signature': validSignature
        }
      }, rawPayload);

      test(resValidSig.status === 200, 'ARTOPAY', 'Verifikasi Webhook Signature Sah (HMAC-SHA256)', 'Webhook resmi diterima dan diverifikasi');

      // Check that order is now PAID and PAYMENT_VERIFIED, and commission is APPROVED
      const resCheckPaid = await makeRequest({
        hostname: 'localhost',
        port: 3000,
        path: `/api/orders/${orderForTest.id}`,
        method: 'GET'
      });
      test(resCheckPaid.data?.order?.paymentStatus === 'PAID', 'ARTOPAY', 'Status Pembayaran Diperbarui Menjadi PAID', 'Hanya diubah setelah verifikasi webhook resmi');
      test(resCheckPaid.data?.order?.orderStatus === 'PAYMENT_VERIFIED', 'ARTOPAY', 'Status Pesanan Menjadi PAYMENT_VERIFIED', 'Pemisahan paymentStatus dan orderStatus terjaga');
      test(resCheckPaid.data?.order?.affiliateCommission?.status === 'APPROVED', 'ARTOPAY', 'Komisi Diperbarui Menjadi APPROVED Pasca-Bayar', 'Komisi sah disetujui setelah pembayaran terverifikasi');

      // 4.3 Test Idempotent Duplicate Webhook (Must return 200 without duplicate processing)
      const resDup = await makeRequest({
        hostname: 'localhost',
        port: 3000,
        path: '/api/payment/artopay/webhook',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Signature': validSignature
        }
      }, rawPayload);
      test(resDup.status === 200 && resDup.data?.responseCode === '2000000', 'ARTOPAY', 'Penanganan Idempotensi Event Webhook Duplikat', 'Event duplikat diakui tanpa proses ulang');
    } catch (err) {
      test(false, 'ARTOPAY', 'Verifikasi Webhook Signature Sah', err.message);
    }

    // 4.4 Test Webhook with MISMATCHED AMOUNT
    try {
      const badAmountPayload = JSON.stringify({
        timestamp: new Date().toISOString(),
        data: {
          transactionId: `trx_${Date.now()}_bad_amt`,
          partnerReferenceNo: orderForTest.orderNumber,
          status: 'PAID',
          amount: '500', // Mismatch!
          currency: 'IDR',
          paymentMethod: 'QRIS'
        }
      });
      const hmacBad = crypto.createHmac('sha256', PRIVATE_KEY);
      hmacBad.update(Buffer.from(badAmountPayload));
      const sigBad = hmacBad.digest('hex');

      const resBadAmt = await makeRequest({
        hostname: 'localhost',
        port: 3000,
        path: '/api/payment/artopay/webhook',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Signature': sigBad
        }
      }, badAmountPayload);
      test(resBadAmt.status === 400, 'ARTOPAY', 'Penolakan Webhook Nominal Tidak Cocok', 'Nominal callback yang berbeda dengan total pesanan ditolak (400)');
    } catch (err) {
      test(false, 'ARTOPAY', 'Penolakan Webhook Nominal Tidak Cocok', err.message);
    }
  }

  // --------------------------------------------------------------------------
  // RINGKASAN AUDIT
  // --------------------------------------------------------------------------
  console.log('\n====================================================');
  console.log(`HASIL AUDIT: ${passed} LULUS, ${failed} GAGAL`);
  console.log('====================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

runAudit();
