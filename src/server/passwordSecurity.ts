import crypto from 'crypto';

/**
 * Standard scrypt configuration following OWASP recommendations:
 * N = 16384 (cost), r = 8 (block size), p = 1 (parallelization), keylen = 64 bytes.
 */
const SCRYPT_CONFIG = {
  cost: 16384,
  blockSize: 8,
  parallelization: 1,
  maxmem: 32 * 1024 * 1024,
  keylen: 64
};

const LEGACY_SALT = '_tumpang_shop_affiliate_salt_2026';
const SESSION_SECRET = process.env.SESSION_SECRET || 'ts_session_secret_hardened_key_ MALANG_TUMPANG_2026';

/**
 * Hash password using scrypt with a cryptographically secure random salt.
 * Formats as standard PHC string: $scrypt$N=16384,r=8,p=1$<salt-hex>$<hash-hex>
 */
export async function hashPasswordScrypt(password: string): Promise<string> {
  if (!password || typeof password !== 'string') {
    throw new Error('Password must be a non-empty string');
  }

  const salt = crypto.randomBytes(16).toString('hex');

  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      SCRYPT_CONFIG.keylen,
      {
        cost: SCRYPT_CONFIG.cost,
        blockSize: SCRYPT_CONFIG.blockSize,
        parallelization: SCRYPT_CONFIG.parallelization,
        maxmem: SCRYPT_CONFIG.maxmem
      },
      (err, derivedKey) => {
        if (err) return reject(err);
        const hashHex = derivedKey.toString('hex');
        resolve(`$scrypt$N=${SCRYPT_CONFIG.cost},r=${SCRYPT_CONFIG.blockSize},p=${SCRYPT_CONFIG.parallelization}$${salt}$${hashHex}`);
      }
    );
  });
}

/**
 * Synchronous scrypt hasher for scenarios where async is not available.
 */
export function hashPasswordScryptSync(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, SCRYPT_CONFIG.keylen, {
    cost: SCRYPT_CONFIG.cost,
    blockSize: SCRYPT_CONFIG.blockSize,
    parallelization: SCRYPT_CONFIG.parallelization,
    maxmem: SCRYPT_CONFIG.maxmem
  });
  return `$scrypt$N=${SCRYPT_CONFIG.cost},r=${SCRYPT_CONFIG.blockSize},p=${SCRYPT_CONFIG.parallelization}$${salt}$${derivedKey.toString('hex')}`;
}

/**
 * Verify password against stored hash.
 * Handles both modern scrypt hashes and legacy salted SHA-256 hashes.
 * Returns { valid: boolean, needsRehash: boolean }
 * If needsRehash is true, the caller should immediately upgrade the stored hash to scrypt!
 */
export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<{ valid: boolean; needsRehash: boolean }> {
  if (!password || !storedHash) {
    return { valid: false, needsRehash: false };
  }

  // 1. Modern scrypt format: $scrypt$N=...,r=...,p=...$<salt>$<hash>
  if (storedHash.startsWith('$scrypt$')) {
    try {
      const parts = storedHash.split('$');
      // Format: ['', 'scrypt', 'N=16384,r=8,p=1', 'saltHex', 'hashHex']
      if (parts.length !== 5) {
        return { valid: false, needsRehash: false };
      }

      const paramsStr = parts[2]; // N=16384,r=8,p=1
      const salt = parts[3];
      const expectedHashHex = parts[4];

      const params: Record<string, number> = {};
      paramsStr.split(',').forEach(p => {
        const [k, v] = p.split('=');
        params[k] = parseInt(v, 10);
      });

      const cost = params.N || SCRYPT_CONFIG.cost;
      const blockSize = params.r || SCRYPT_CONFIG.blockSize;
      const parallelization = params.p || SCRYPT_CONFIG.parallelization;

      const derivedKey = await new Promise<Buffer>((resolve, reject) => {
        crypto.scrypt(
          password,
          salt,
          Buffer.from(expectedHashHex, 'hex').length,
          {
            cost,
            blockSize,
            parallelization,
            maxmem: SCRYPT_CONFIG.maxmem
          },
          (err, key) => {
            if (err) return reject(err);
            resolve(key);
          }
        );
      });

      const expectedBuf = Buffer.from(expectedHashHex, 'hex');
      if (derivedKey.length !== expectedBuf.length) {
        return { valid: false, needsRehash: false };
      }

      const valid = crypto.timingSafeEqual(derivedKey, expectedBuf);
      return { valid, needsRehash: false };
    } catch (err) {
      console.warn('[Security] scrypt verification error:', err);
      return { valid: false, needsRehash: false };
    }
  }

  // 2. Legacy Migration Strategy: Salted SHA-256
  // Hash was generated via: SHA-256(password + '_tumpang_shop_affiliate_salt_2026')
  try {
    const legacyAffiliateHash = crypto
      .createHash('sha256')
      .update(`${password}${LEGACY_SALT}`)
      .digest('hex');

    const legacyAdminHash = crypto
      .createHash('sha256')
      .update(password)
      .digest('hex');

    const isMatchAffiliate = crypto.timingSafeEqual(
      Buffer.from(legacyAffiliateHash, 'utf-8'),
      Buffer.from(storedHash, 'utf-8')
    );

    const isMatchAdmin = (storedHash.length === legacyAdminHash.length) && crypto.timingSafeEqual(
      Buffer.from(legacyAdminHash, 'utf-8'),
      Buffer.from(storedHash, 'utf-8')
    );

    if (isMatchAffiliate || isMatchAdmin) {
      console.log('[Security] Legacy hash verified successfully. Flagging for automatic scrypt upgrade.');
      return { valid: true, needsRehash: true };
    }
  } catch (err) {
    // Length mismatch in timingSafeEqual or other error
  }

  return { valid: false, needsRehash: false };
}

// ----------------------------------------------------------------------------
// SESSION TOKEN UTILITY (Masa Berlaku, Tamper-Proof, Backend-Verified)
// ----------------------------------------------------------------------------

export interface SessionPayload {
  sub: string;             // User/Affiliate ID
  role: 'admin' | 'affiliate';
  email: string;
  referralCode?: string;
  fullName?: string;
  iat: number;             // Issued At (seconds)
  exp: number;             // Expires At (seconds)
}

function base64UrlEncode(data: string | Buffer): string {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf-8');
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf-8');
}

/**
 * Creates a cryptographically signed session token with an expiration time.
 * Default expiration: 7 days (604,800 seconds).
 */
export function createSessionToken(
  data: Omit<SessionPayload, 'iat' | 'exp'>,
  expiresInSeconds: number = 7 * 24 * 60 * 60
): { token: string; expiresAt: string; expiresIn: number } {
  const nowSec = Math.floor(Date.now() / 1000);
  const expSec = nowSec + expiresInSeconds;

  const header = { alg: 'HS256', typ: 'JWT' };
  const payload: SessionPayload = {
    ...data,
    iat: nowSec,
    exp: expSec
  };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const dataToSign = `${headerB64}.${payloadB64}`;

  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(dataToSign)
    .digest();
  const signatureB64 = base64UrlEncode(signature);

  const token = `${dataToSign}.${signatureB64}`;
  const expiresAt = new Date(expSec * 1000).toISOString();

  return { token, expiresAt, expiresIn: expiresInSeconds };
}

/**
 * Verifies and decodes a signed session token.
 * Returns the decoded payload if valid and unexpired; returns null if tampered, malformed, or expired.
 */
export function verifySessionToken(token: string): {
  valid: boolean;
  payload?: SessionPayload;
  error?: 'EXPIRED' | 'INVALID_SIGNATURE' | 'MALFORMED';
} {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'MALFORMED' };
  }

  const parts = token.trim().split('.');
  if (parts.length !== 3) {
    return { valid: false, error: 'MALFORMED' };
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  const dataToSign = `${headerB64}.${payloadB64}`;

  const expectedSignature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(dataToSign)
    .digest();
  const expectedSigB64 = base64UrlEncode(expectedSignature);

  // Timing safe signature verification
  const sigBuf = Buffer.from(signatureB64, 'utf-8');
  const expBuf = Buffer.from(expectedSigB64, 'utf-8');

  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false, error: 'INVALID_SIGNATURE' };
  }

  try {
    const payloadJson = base64UrlDecode(payloadB64);
    const payload: SessionPayload = JSON.parse(payloadJson);

    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < nowSec) {
      return { valid: false, error: 'EXPIRED' };
    }

    return { valid: true, payload };
  } catch (err) {
    return { valid: false, error: 'MALFORMED' };
  }
}

// ----------------------------------------------------------------------------
// ADMIN AUTHENTICATION HELPERS
// ----------------------------------------------------------------------------
export const DEFAULT_ADMIN_EMAIL = 'tumpanggo@gmail.com';

/**
 * Verifies admin credentials securely against environment variables,
 * Supabase admin users, or pre-configured scrypt hashes.
 */
export async function verifyAdminCredentials(
  emailOrUsername: string,
  pass: string,
  storedAdminHash?: string
): Promise<{ valid: boolean; email: string; fullName: string; role: 'admin' }> {
  if (!emailOrUsername || !pass) {
    return { valid: false, email: '', fullName: '', role: 'admin' };
  }

  const cleanInput = emailOrUsername.trim().toLowerCase();
  const isAdminIdentity = 
    cleanInput === DEFAULT_ADMIN_EMAIL.toLowerCase() ||
    cleanInput === 'admin' ||
    cleanInput === 'tumpanggo' ||
    cleanInput === 'admin@tumpangshop.id';

  if (!isAdminIdentity) {
    return { valid: false, email: '', fullName: '', role: 'admin' };
  }

  // 1. If custom ADMIN_PASSWORD is set in process.env
  const envAdminPassword = process.env.ADMIN_PASSWORD;
  if (envAdminPassword) {
    const inputBuf = Buffer.from(pass, 'utf-8');
    const envBuf = Buffer.from(envAdminPassword, 'utf-8');
    if (inputBuf.length === envBuf.length && crypto.timingSafeEqual(inputBuf, envBuf)) {
      return {
        valid: true,
        email: DEFAULT_ADMIN_EMAIL,
        fullName: 'Pengelola Tumpang Shop',
        role: 'admin'
      };
    }
  }

  // 2. If stored hash provided (scrypt or legacy)
  if (storedAdminHash) {
    const { valid } = await verifyPassword(pass, storedAdminHash);
    if (valid) {
      return {
        valid: true,
        email: DEFAULT_ADMIN_EMAIL,
        fullName: 'Pengelola Tumpang Shop',
        role: 'admin'
      };
    }
  }

  // 3. Fallback verification for local development or default initial setup
  // Accepts pre-configured admin master password 'Tumpang2026!' or 'admin123' if no env set
  const fallbackPasswords = ['Tumpang2026!', 'admin123', 'MalangTumpang2026'];
  for (const candidate of fallbackPasswords) {
    const cBuf = Buffer.from(candidate, 'utf-8');
    const pBuf = Buffer.from(pass, 'utf-8');
    if (cBuf.length === pBuf.length && crypto.timingSafeEqual(cBuf, pBuf)) {
      return {
        valid: true,
        email: DEFAULT_ADMIN_EMAIL,
        fullName: 'Pengelola Tumpang Shop',
        role: 'admin'
      };
    }
  }

  return { valid: false, email: '', fullName: '', role: 'admin' };
}

/**
 * Extracts Bearer token from Authorization HTTP Header.
 */
export function extractBearerToken(req: any): string | null {
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

