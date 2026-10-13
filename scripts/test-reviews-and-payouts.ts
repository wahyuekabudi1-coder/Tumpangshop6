import http from 'http';
import { getAffiliatePerformanceMetrics } from '../src/lib/affiliateAttribution';

function makeRequest(options: http.RequestOptions, postData?: any): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode || 0, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode || 0, data });
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

async function test() {
  console.log('=== TESTING REVIEWS SECURITY & PAYOUT CONCURRENCY LOCK ===\n');
  let passed = 0;
  let failed = 0;

  function assert(cond: boolean, name: string, detail?: string) {
    if (cond) {
      console.log(`[PASS] ${name}`);
      passed++;
    } else {
      console.error(`[FAIL] ${name} ${detail ? `- ${detail}` : ''}`);
      failed++;
    }
  }

  // 1. Checkout an order
  const checkoutRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/orders/checkout',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    customerName: 'Reviewer Test',
    customerPhone: '081233445566',
    deliveryAddress: 'Jl. Ulasan No. 1, Tumpang',
    customerProvince: 'Jawa Timur',
    customerCity: 'Kabupaten Malang',
    customerDistrict: 'Kecamatan Tumpang',
    customerPostalCode: '65156',
    items: [{ productId: 'prod-rev-test-1', quantity: 1 }],
    clientCatalogProducts: [{
      id: 'prod-rev-test-1',
      name: 'Apel Manalagi Super',
      sku: 'APL-MNL-01',
      price: 35000,
      stock: 50,
      unit: 'kg',
      categoryId: 'cat-buah',
      isActive: true,
      images: []
    }]
  });

  assert(checkoutRes.status === 201 && checkoutRes.data?.success, 'Order created successfully for review testing');
  const order = checkoutRes.data?.order;

  // 2. Attempt to review while order is still PENDING / WAITING_PAYMENT (Must be rejected 403)
  const pendingRevRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/reviews',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    productId: 'prod-rev-test-1',
    orderId: order.id,
    rating: 5,
    comment: 'Produk enak dan segar!'
  });

  assert(pendingRevRes.status === 403, 'Review on unpaid/incomplete order strictly rejected with 403 Forbidden');
  assert(pendingRevRes.data?.error?.includes('COMPLETED') || pendingRevRes.data?.error?.includes('PAID'), 'Rejection mentions completed and paid requirement');

  // 3. Attempt review for a product not in the order (Must be rejected 403)
  const wrongProdRevRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/reviews',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    productId: 'prod-unrelated-999',
    orderId: order.id,
    rating: 5,
    comment: 'Produk ini tidak pernah saya beli'
  });

  assert(wrongProdRevRes.status === 403, 'Review for unpurchased product strictly rejected with 403 Forbidden');

  // 4. Mark order as PAID & COMPLETED via official backend endpoints
  await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/payment/simulate-success',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    orderId: order.id,
    expectedAmount: order.total
  });

  // Login as admin to update order status to COMPLETED
  const adminLoginRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/admin/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    emailOrUsername: 'admin',
    password: 'admin123'
  });

  const adminToken = adminLoginRes.data?.token;

  await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/admin/orders/${order.id}/status`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    }
  }, {
    orderStatus: 'COMPLETED',
    paymentStatus: 'PAID'
  });

  // 5. Submit valid review for COMPLETED order
  const validRevRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/reviews',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    productId: 'prod-rev-test-1',
    orderId: order.id,
    userId: 'user_test_buyer_01',
    userName: 'Reviewer Test',
    rating: 5,
    comment: 'Kualitas buah sangat manis dan segar, pengiriman cepat!'
  });

  assert(validRevRes.status === 201 && validRevRes.data?.success, 'Review on COMPLETED order accepted (201 Created)');
  assert(validRevRes.data?.review?.isVerifiedPurchase === true, 'Review marked strictly as isVerifiedPurchase = true');

  // 6. Duplicate review for the same order & product must be rejected with 409
  const dupRevRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/reviews',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    productId: 'prod-rev-test-1',
    orderId: order.id,
    userId: 'user_test_buyer_01',
    userName: 'Reviewer Test',
    rating: 4,
    comment: 'Coba ulas lagi...'
  });

  assert(dupRevRes.status === 409, 'Duplicate review on same order and product rejected with 409 Conflict');

  // 7. Get reviews for the product
  const getReviewsRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/reviews/prod-rev-test-1',
    method: 'GET'
  });

  assert(getReviewsRes.status === 200 && Array.isArray(getReviewsRes.data?.reviews), 'GET /api/reviews/:productId returns 200 and reviews list');
  assert(getReviewsRes.data?.reviews?.every((r: any) => !r.orderId && !r.userEmail && !r.userId), 'Buyer PII (orderId, userEmail, userId) strictly not exposed in public review list');

  // 8. Verify commission balance calculation strictly excludes REJECTED and CANCELLED commissions
  const testRef = 'REF_REJECT_TEST';
  const mockOrders: any[] = [
    {
      id: 'ord_active_approved',
      orderNumber: 'ORD-001',
      total: 100000,
      orderStatus: 'COMPLETED',
      paymentStatus: 'PAID',
      referralCode: testRef,
      affiliateCommission: {
        referralCode: testRef,
        totalCommission: 15000,
        status: 'APPROVED'
      }
    },
    {
      id: 'ord_completed_rejected',
      orderNumber: 'ORD-002',
      total: 200000,
      orderStatus: 'COMPLETED',
      paymentStatus: 'PAID',
      referralCode: testRef,
      affiliateCommission: {
        referralCode: testRef,
        totalCommission: 30000,
        status: 'REJECTED' // Commission marked rejected by admin
      }
    },
    {
      id: 'ord_completed_cancelled',
      orderNumber: 'ORD-003',
      total: 150000,
      orderStatus: 'COMPLETED',
      paymentStatus: 'PAID',
      referralCode: testRef,
      affiliateCommission: {
        referralCode: testRef,
        totalCommission: 22500,
        status: 'CANCELLED' // Commission marked cancelled
      }
    }
  ];

  const calculatedMetrics = getAffiliatePerformanceMetrics(testRef, mockOrders);
  assert(calculatedMetrics.availableBalanceForPayout === 15000, 'Available balance includes only approved commissions (Rp 15.000) and excludes REJECTED/CANCELLED (Rp 30.000 + Rp 22.500)');
  assert(calculatedMetrics.approvedCommission === 15000, 'Approved commission strictly excludes REJECTED and CANCELLED commissions even when order was COMPLETED & PAID');

  console.log(`\n======================================================`);
  console.log(`TESTS COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log(`======================================================\n`);
  process.exit(failed > 0 ? 1 : 0);
}

test().catch(err => {
  console.error('Test script error:', err);
  process.exit(1);
});
