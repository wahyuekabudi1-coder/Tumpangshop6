import http from 'http';
import crypto from 'crypto';
import { 
  hashPasswordScrypt, 
  verifyPassword, 
  createSessionToken, 
  verifySessionToken 
} from '../src/server/passwordSecurity.ts';

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

async function runSecurityAuditTests() {
  console.log('====================================================');
  console.log('TUMPANG SHOP - COMPREHENSIVE SECURITY AUDIT SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(cond, testName, details = '') {
    if (cond) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}: ${details}`);
      failed++;
    }
  }

  // TEST 1: scrypt Hashing & Non-Plaintext Storage
  console.log('--- 1. Affiliate Password Security & scrypt Implementation ---');
  const testPassword = 'PasswordMitra2026!';
  const scryptHash = await hashPasswordScrypt(testPassword);
  assert(scryptHash.startsWith('$scrypt$'), 'hashPasswordScrypt produces standard $scrypt$ format', scryptHash);
  assert(scryptHash.includes('N=16384,r=8,p=1'), 'scrypt parameters follow OWASP recommended cost factors', scryptHash);

  const scryptVerifyGood = await verifyPassword(testPassword, scryptHash);
  assert(scryptVerifyGood.valid === true, 'verifyPassword correctly validates matching scrypt password');
  assert(scryptVerifyGood.needsRehash === false, 'Fresh scrypt hash does not require rehash');

  const scryptVerifyBad = await verifyPassword('WrongPassword123', scryptHash);
  assert(scryptVerifyBad.valid === false, 'verifyPassword rejects incorrect password');

  // TEST 2: Legacy Migration & Auto-Rehash Strategy
  console.log('\n--- 2. Legacy Migration & Seamless Upgrade Strategy ---');
  const LEGACY_SALT = '_tumpang_shop_affiliate_salt_2026';
  const legacyHash = crypto.createHash('sha256').update(`${testPassword}${LEGACY_SALT}`).digest('hex');

  const legacyVerify = await verifyPassword(testPassword, legacyHash);
  assert(legacyVerify.valid === true, 'verifyPassword validates legacy salted SHA-256 hash');
  assert(legacyVerify.needsRehash === true, 'Legacy hash flags needsRehash = true for seamless automatic upgrade');

  // TEST 3: Cryptographic Session Tokens with Expiration
  console.log('\n--- 3. Session Token Validity & Tamper-Proofing ---');
  const session = createSessionToken({
    sub: 'aff_test_01',
    role: 'affiliate',
    email: 'mitra@tumpangshop.id',
    referralCode: 'TS-MITRA01',
    fullName: 'Mitra Test'
  }, 3600); // 1 hour

  assert(Boolean(session.token && session.token.split('.').length === 3), 'Session token is a signed 3-part token');
  assert(Boolean(session.expiresAt), 'Session token has explicit ISO expiresAt timestamp');

  const verifiedSession = verifySessionToken(session.token);
  assert(verifiedSession.valid === true, 'verifySessionToken validates untampered token');
  assert(verifiedSession.payload?.role === 'affiliate', 'Decoded payload contains correct role');
  assert(verifiedSession.payload?.referralCode === 'TS-MITRA01', 'Decoded payload contains verified referral code');

  // Tamper test: Alter payload in token
  const tokenParts = session.token.split('.');
  const tamperedToken = `${tokenParts[0]}.eyJzdWIiOiJoYWNrZXIifQ.${tokenParts[2]}`;
  const verifyTampered = verifySessionToken(tamperedToken);
  assert(verifyTampered.valid === false, 'verifySessionToken strictly rejects tampered token');

  // TEST 4: Live Server API Endpoints
  console.log('\n--- 4. Live Server Authentication & Payout API Tests ---');
  
  // 4a. Affiliate Registration via Server
  const testAffEmail = `aff_${Date.now()}@test.com`;
  let regToken = null;
  let regReferralCode = null;

  try {
    const regRes = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/affiliates/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      fullName: 'Budi Santoso',
      phone: '081234567888',
      email: testAffEmail,
      password: testPassword,
      promotionChannel: 'WhatsApp Status'
    });

    assert(regRes.status === 201, 'POST /api/affiliates/register returns 201 Created');
    assert(regRes.data?.success === true, 'Registration reports success = true');
    assert(Boolean(regRes.data?.token), 'Registration returns signed session token');
    assert(regRes.data?.affiliate?.passwordHash === undefined, 'Affiliate response NEVER exposes passwordHash');
    regToken = regRes.data?.token;
    regReferralCode = regRes.data?.affiliate?.referralCode;
  } catch (err) {
    console.error('Registration test error:', err);
  }

  // 4b. Affiliate Login via Server
  let loginToken = null;
  try {
    const loginRes = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/affiliates/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      loginInput: testAffEmail,
      password: testPassword
    });

    assert(loginRes.status === 200, 'POST /api/affiliates/login returns 200 OK');
    assert(loginRes.data?.success === true, 'Login reports success = true');
    assert(Boolean(loginRes.data?.token), 'Login returns signed session token with expiry');
    assert(loginRes.data?.affiliate?.passwordHash === undefined, 'Login response NEVER exposes passwordHash');
    loginToken = loginRes.data?.token;

    // Bad password test
    const badLogin = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/affiliates/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      loginInput: testAffEmail,
      password: 'WrongPassword999'
    });
    assert(badLogin.status === 401, 'POST /api/affiliates/login strictly rejects wrong password with 401');
  } catch (err) {
    console.error('Login test error:', err);
  }

  // 4c. Verify Session Endpoint
  try {
    const sessionRes = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/affiliates/session',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${loginToken || regToken}`
      }
    });

    assert(sessionRes.status === 200, 'GET /api/affiliates/session validates Bearer token (200 OK)');
    assert(sessionRes.data?.session?.role === 'affiliate', 'Session role is affiliate');

    // Missing token test
    const noTokenRes = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/affiliates/session',
      method: 'GET'
    });
    assert(noTokenRes.status === 401, 'GET /api/affiliates/session rejects missing token (401)');
  } catch (err) {
    console.error('Session test error:', err);
  }

  // 4d. Anti-Tampering: Payout Balance Backend Verification
  try {
    // Attempt payout without verified commission balance
    const fakePayoutRes = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/affiliates/payouts',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${loginToken || regToken}`
      }
    }, {
      referralCode: regReferralCode,
      amount: 150000, // No completed orders yet -> available balance is 0
      bankName: 'BCA',
      accountNumber: '1234567890',
      accountName: 'Budi Santoso'
    });

    assert(fakePayoutRes.status === 400, 'POST /api/affiliates/payouts strictly rejects payout exceeding actual balance (400)');
    assert(fakePayoutRes.data?.error?.includes('Saldo tidak mencukupi'), 'Backend surfaces clear insufficient balance error');
  } catch (err) {
    console.error('Payout test error:', err);
  }

  // 4e. Admin Login & Session Protection
  try {
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

    assert(adminLoginRes.status === 200, 'POST /api/admin/login returns 200 OK for valid admin credentials');
    assert(Boolean(adminLoginRes.data?.token), 'Admin login returns cryptographically signed admin session token');
    const adminToken = adminLoginRes.data?.token;

    // Verify admin session
    const adminSessionRes = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/admin/session',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });

    assert(adminSessionRes.status === 200, 'GET /api/admin/session validates admin Bearer token (200 OK)');
    assert(adminSessionRes.data?.user?.role === 'admin', 'Admin session role is verified as admin');

    // Cross-role privilege escalation attempt: Affiliate token trying to access Admin Session
    const privEscRes = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/admin/session',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${loginToken || regToken}`
      }
    });
    assert(privEscRes.status === 401, 'GET /api/admin/session strictly rejects affiliate token (Privilege Escalation Blocked)');
  } catch (err) {
    console.error('Admin auth test error:', err);
  }

  // 4f. ArtoPay Webhook HMAC Verification with Webhook Secret
  console.log('\n--- 5. ArtoPay Webhook Security & HMAC Verification ---');
  const webhookSecret = process.env.ARTOPAY_WEBHOOK_SECRET || 'sec_test_artopay_webhook_sandbox_2026';


  const validPayloadObj = {
    timestamp: new Date().toISOString(),
    data: {
      transactionId: `trx_audit_${Date.now()}`,
      partnerReferenceNo: 'TS-TEST-NONEXISTENT',
      status: 'PAID',
      amount: '50000',
      currency: 'IDR',
      paymentMethod: 'QRIS'
    }
  };
  const rawPayloadStr = JSON.stringify(validPayloadObj);
  const correctHmacHex = crypto.createHmac('sha256', webhookSecret).update(rawPayloadStr).digest('hex');

  // Valid webhook call
  try {
    const webhookRes = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/payment/artopay/webhook',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Signature': correctHmacHex
      }
    }, rawPayloadStr);

    // 404 because order partnerReferenceNo does not exist in store, but signature was verified!
    // If signature failed it would be 401.
    assert(webhookRes.status === 404, 'Webhook with valid HMAC signature passes auth check and reaches order lookup (404 expected for dummy order)');

    // Bad signature test
    const badWebhookRes = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/payment/artopay/webhook',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Signature': 'invalid_forged_hmac_hex'
      }
    }, rawPayloadStr);

    assert(badWebhookRes.status === 401, 'Webhook with invalid HMAC signature is strictly rejected with 401');
  } catch (err) {
    console.error('Webhook test error:', err);
  }

  console.log('\n====================================================');
  console.log(`AUDIT RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

runSecurityAuditTests().catch(err => {
  console.error('Audit suite failure:', err);
  process.exit(1);
});
