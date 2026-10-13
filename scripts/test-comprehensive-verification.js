import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

console.log('=== RUNNING REAL VERIFICATION TESTS FOR TUMPANG SHOP ===\n');

let passCount = 0;
let failCount = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passCount++;
  } else {
    console.error(`[FAIL] ${testName}: ${details}`);
    failCount++;
  }
}

// ----------------------------------------------------------------------------
// TEST SUITE 1: PWA COMPLIANCE AND ASSETS
// ----------------------------------------------------------------------------
console.log('--- TEST SUITE 1: PWA COMPLIANCE AND ASSETS ---');

const publicFiles = [
  'icon.svg',
  'pwa-192x192.png',
  'pwa-512x512.png',
  'pwa-maskable-512x512.png',
  'apple-touch-icon.png',
  'favicon.ico'
];

for (const file of publicFiles) {
  const filePath = path.resolve('public', file);
  const exists = fs.existsSync(filePath);
  const size = exists ? fs.statSync(filePath).size : 0;
  assert(exists && size > 100, `PWA Asset public/${file} exists and non-empty (${size} bytes)`);
}

// Verify index.html contains essential PWA tags
const indexHtml = fs.readFileSync(path.resolve('index.html'), 'utf-8');
assert(indexHtml.includes('theme-color') && indexHtml.includes('#FE8A00'), 'index.html contains correct theme-color #FE8A00');
assert(indexHtml.includes('apple-mobile-web-app-capable'), 'index.html contains apple-mobile-web-app-capable');
assert(indexHtml.includes('manifest.webmanifest'), 'index.html references manifest.webmanifest');
assert(indexHtml.includes('apple-touch-icon'), 'index.html contains apple-touch-icon');

// ----------------------------------------------------------------------------
// TEST SUITE 2: ARTOPAY ADAPTER & SIGNATURE SPECIFICATION
// ----------------------------------------------------------------------------
console.log('\n--- TEST SUITE 2: ARTOPAY ADAPTER & SECURITY ---');

import { 
  getArtoPayConfig,
  generateNonCollidingUniqueCode,
  calculateOrderBackend,
  verifyArtoPayWebhookSignature
} from '../src/server/artopayAdapter.js';

// Test 2.1: Config separation (sandbox vs production)
const testConfig = getArtoPayConfig({
  ARTOPAY_ENV: 'sandbox',
  ARTOPAY_SECRET_KEY: 'test-secret-key-123',
  ARTOPAY_BUSINESS_UNIT_ID: 'BU-999'
});

assert(testConfig.environment === 'sandbox', 'ArtoPay config sets sandbox environment');
assert(testConfig.baseUrl === 'https://api-sandbox.arto-pay.com', 'Sandbox base URL matches official doc https://api-sandbox.arto-pay.com');
assert(testConfig.isConfigured === true, 'isConfigured is true when secret key is provided');

// Test 2.2: Production base URL
const prodConfig = getArtoPayConfig({
  ARTOPAY_ENV: 'production',
  ARTOPAY_SECRET_KEY: 'prod-secret-456'
});
assert(prodConfig.baseUrl === 'https://api.arto-pay.com', 'Production base URL matches official doc https://api.arto-pay.com');

// Test 2.3: Unique code random range (Rp 1 - Rp 200) and collision resolution
const activeOrdersMock = [
  { id: '1', total: 100050, uniqueCode: 50, paymentStatus: 'PENDING' },
  { id: '2', total: 100051, uniqueCode: 51, paymentStatus: 'PENDING' }
];

for (let i = 0; i < 20; i++) {
  const result = generateNonCollidingUniqueCode(100000, activeOrdersMock);
  assert(
    result.uniqueCode >= 1 && result.uniqueCode <= 200,
    `Unique code generation run #${i+1} is within range 1..200 (Got: ${result.uniqueCode})`
  );
}

// Test collision avoidance when candidate code is occupied
const fullMockOrders = [];
for (let c = 1; c <= 10; c++) {
  fullMockOrders.push({ id: `ord-${c}`, total: 50000 + c, uniqueCode: c, paymentStatus: 'PENDING' });
}
const collisionTestResult = generateNonCollidingUniqueCode(50000, fullMockOrders);
assert(
  collisionTestResult.uniqueCode > 10 && collisionTestResult.uniqueCode <= 200,
  `Unique code avoids already pending active codes 1..10 (Allocated: ${collisionTestResult.uniqueCode})`
);

// Test 2.4: Server calculation engine
const mockProduct = {
  id: 'prod-test-1',
  sku: 'SKU-001',
  name: 'Beras Premium',
  price: 75000,
  stock: 20,
  unit: 'sak',
  categoryId: 'cat-1',
  isActive: true,
  images: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

const storeConfigMock = {
  storeName: 'Tumpang Shop',
  storeTagline: 'Test',
  storeAddress: 'Tumpang',
  storePhone: '081234567890',
  isOpen: true,
  minOrderAmount: 0,
  defaultDeliveryFee: 15000,
  airFreightDeliveryFee: 15000,
  serviceFee: 1000,
  defaultAffiliateCommissionRate: 15
};

const calcResult = calculateOrderBackend({
  items: [{ productId: 'prod-test-1', quantity: 2 }],
  storeConfig: storeConfigMock,
  catalogProducts: [mockProduct],
  activeOrders: [],
  uniqueCode: 77
});

assert(calcResult.subtotal === 150000, 'Calculation engine subtotal is 150.000 (2 x 75.000)');
assert(calcResult.shippingCost === 15000, 'Shipping cost is 15.000');
assert(calcResult.serviceFee === 1000, 'Service fee is 1.000');
assert(calcResult.uniqueCode === 77, 'Unique code is exactly preserved (77)');
assert(calcResult.total === 150000 + 15000 + 1000 + 77, `Total equals subtotal + shipping + service + uniqueCode (${calcResult.total} == 166.077)`);

// Test 2.5: Webhook HMAC-SHA256 Signature Verification
const secret = 'super-secret-key-32-chars-length';
const samplePayload = {
  transactionId: 'trx_987654321',
  partnerReferenceNo: 'TS-20261013-101',
  status: 'PAID',
  amount: { value: 166077, currency: 'IDR' }
};
const timestamp = '2026-10-13T07:00:00Z';
const payloadString = JSON.stringify(samplePayload);

// Correct signature computation on raw JSON payload
const expectedSig = crypto
  .createHmac('sha256', secret)
  .update(payloadString)
  .digest('hex');

const validVerification = verifyArtoPayWebhookSignature(
  payloadString,
  expectedSig,
  secret
);
assert(validVerification === true, 'Webhook HMAC signature verifies with valid secret & payload');

// Tampered payload verification
const tamperedPayloadString = JSON.stringify({ ...samplePayload, status: 'FAILED' });
const tamperedVerification = verifyArtoPayWebhookSignature(
  tamperedPayloadString,
  expectedSig,
  secret
);
assert(tamperedVerification === false, 'Tampered payload correctly rejected by signature verifier');

// Fake signature verification
const fakeSigVerification = verifyArtoPayWebhookSignature(
  payloadString,
  'fake-hex-signature-1234567890abcdef',
  secret
);
assert(fakeSigVerification === false, 'Forged signature correctly rejected');

// ----------------------------------------------------------------------------
// TEST SUITE 3: AFFILIATE ATTRIBUTION & PERSISTENCE
// ----------------------------------------------------------------------------
console.log('\n--- TEST SUITE 3: AFFILIATE ATTRIBUTION & ISOLATION ---');

import { 
  detectReferralSource, 
  ATTRIBUTION_WINDOW_MS 
} from '../src/lib/affiliateAttribution.js';

assert(ATTRIBUTION_WINDOW_MS === 30 * 24 * 60 * 60 * 1000, 'Attribution window is strictly 30 days');

// Traffic source identification
assert(detectReferralSource('https://www.tiktok.com/@user/video/123') === 'TikTok', 'Detects TikTok traffic source');
assert(detectReferralSource('https://l.instagram.com/') === 'Instagram', 'Detects Instagram traffic source');
assert(detectReferralSource('https://web.whatsapp.com/') === 'WhatsApp', 'Detects WhatsApp traffic source');
assert(detectReferralSource('https://m.facebook.com/') === 'Facebook', 'Detects Facebook traffic source');

// ----------------------------------------------------------------------------
// SUMMARY REPORT
// ----------------------------------------------------------------------------
console.log('\n======================================================');
console.log(`TOTAL REAL TESTS RUN: ${passCount + failCount}`);
console.log(`PASSED: ${passCount}`);
console.log(`FAILED: ${failCount}`);
console.log('======================================================\n');

if (failCount > 0) {
  process.exit(1);
} else {
  console.log('ALL VERIFICATION TESTS COMPLETED SUCCESSFULLY!');
  process.exit(0);
}
