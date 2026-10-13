import http from 'http';
import crypto from 'crypto';

console.log('Testing live server endpoints...');

function makeRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, raw: data });
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

async function run() {
  let passed = 0;
  let failed = 0;

  function check(cond, name, msg = '') {
    if (cond) {
      console.log(`[PASS] ${name}`);
      passed++;
    } else {
      console.error(`[FAIL] ${name}: ${msg}`);
      failed++;
    }
  }

  // 1. Config endpoint
  try {
    const resConfig = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/payment/artopay/config',
      method: 'GET'
    });
    check(resConfig.status === 200, 'GET /api/payment/artopay/config returns 200');
    check(resConfig.data?.gatewayName === 'ArtoPay (Official Gateway)', 'Gateway name is ArtoPay (Official Gateway)');
    check(resConfig.data?.baseUrl === 'https://api-sandbox.arto-pay.com', 'Base URL is ArtoPay sandbox URL');
    check(resConfig.data?.simulationAllowed === true, 'Simulation allowed in test development mode');
    check(resConfig.data?.secretKey === undefined, 'Secret Key is NEVER leaked to client');
  } catch (err) {
    console.error('Config error:', err.message);
  }

  // 2. Checkout endpoint
  let createdOrder = null;
  try {
    const regRes = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/affiliates/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      fullName: 'Test Affiliate PWA',
      phone: '081234567899',
      email: 'testaff01@test.com',
      password: 'password123',
      promotionChannel: 'WhatsApp'
    });

    const registeredReferralCode = regRes.data?.affiliate?.referralCode || 'TS-TESTAFF01';

    const checkoutPayload = {
      customerName: 'Test Customer PWA',
      customerPhone: '081234567890',
      customerEmail: 'customer@test.com',
      deliveryAddress: 'Jl. Raya Tumpang No. 123, RT 02 RW 01',
      customerProvince: 'Jawa Timur',
      customerCity: 'Kabupaten Malang',
      customerDistrict: 'Kecamatan Tumpang',
      customerPostalCode: '65156',
      clientCatalogProducts: [
        {
          id: 'prod-test-item',
          name: 'Beras Pandan Wangi Super',
          price: 65000,
          stock: 25,
          sku: 'TS-BPW-01',
          categoryId: 'cat-sembako',
          unit: 'sak 5kg',
          isActive: true,
          images: ['https://images.unsplash.com/photo-1586201375761-83865001e31c?w=500']
        }
      ],
      items: [
        { productId: 'prod-test-item', quantity: 1 }
      ],
      referralCode: registeredReferralCode,
      affiliateCommission: {
        referralCode: registeredReferralCode,
        totalCommission: 12000,
        status: 'PENDING',
        calculatedAt: new Date().toISOString(),
        itemsCommission: []
      }
    };

    const resCheckout = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/orders/checkout',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, checkoutPayload);

    check(resCheckout.status === 201, 'POST /api/orders/checkout returns 201 Created');
    check(resCheckout.data?.success === true, 'Checkout reports success = true');
    createdOrder = resCheckout.data?.order;
    check(createdOrder && createdOrder.uniqueCode >= 1 && createdOrder.uniqueCode <= 200, `Unique code generated in 1..200 (${createdOrder?.uniqueCode})`);
    check(createdOrder?.total === createdOrder?.subtotal + createdOrder?.shippingCost + createdOrder?.serviceFee + createdOrder?.uniqueCode, 'Exact total matches sum including unique code');
    check(createdOrder?.paymentStatus === 'PENDING', 'Payment status is strictly PENDING at creation');
    check(createdOrder?.referralCode === registeredReferralCode, 'Attributed referral code is preserved on order');
  } catch (err) {
    console.error('Checkout error:', err.message);
  }

  // 3. Test Simulation Endpoint on created order
  if (createdOrder) {
    try {
      const resSim = await makeRequest({
        hostname: 'localhost',
        port: 3000,
        path: '/api/payment/simulate-success',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, {
        orderId: createdOrder.id,
        expectedAmount: createdOrder.total
      });

      check(resSim.status === 200, 'POST /api/payment/simulate-success returns 200');
      check(resSim.data?.success === true, 'Simulation succeeds for test order');
      check(resSim.data?.order?.isTestTransaction === true, 'Order marked as isTestTransaction = true (SIMULATED/TEST)');
      check(resSim.data?.order?.paymentStatus === 'PAID', 'Payment status marked as PAID via simulation');
      check(resSim.data?.order?.orderStatus === 'PAYMENT_VERIFIED', 'Order status marked as PAYMENT_VERIFIED');
    } catch (err) {
      console.error('Simulation error:', err.message);
    }

    // 4. Test wrong amount simulation (should be rejected)
    try {
      const resBadSim = await makeRequest({
        hostname: 'localhost',
        port: 3000,
        path: '/api/payment/simulate-success',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, {
        orderId: createdOrder.id,
        expectedAmount: createdOrder.total + 9999
      });

      check(resBadSim.status === 400, 'Simulation with mismatched expectedAmount is strictly rejected (400)');
    } catch (err) {
      console.error('Bad simulation error:', err.message);
    }
  }

  // 5. Test Webhook Security & Verification
  // Check that bad status is rejected
  try {
    const badStatusPayload = JSON.stringify({
      data: {
        transactionId: 'trx_test_bad',
        partnerReferenceNo: createdOrder ? createdOrder.orderNumber : 'TS-NONEXISTENT',
        status: 'SOME_FAKE_STATUS',
        amount: '100000'
      }
    });

    const resBadStatus = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/payment/artopay/webhook',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Signature': 'fake-sig'
      }
    }, badStatusPayload);

    // Depending on whether ARTOPAY_PRIVATE_KEY is set or not:
    // If not set, it allows in dev or validates fields
    check(resBadStatus.status === 400 || resBadStatus.status === 401, 'Webhook with invalid status/signature returns 400 or 401');
  } catch (err) {
    console.error('Webhook error:', err.message);
  }

  console.log(`\nEndpoint Tests Complete: ${passed} Passed, ${failed} Failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
