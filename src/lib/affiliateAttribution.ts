import { AffiliateApplication, Order } from '../types';
import { getStoredAffiliates } from './supabase';

export interface AffiliateAttribution {
  referralCode: string;
  affiliateId: string;
  affiliateName: string;
  timestamp: number;
  expiresAt: number; // 30 days window (last-click attribution)
  landingPath: string;
  source: string;
  signature?: string;
}

export interface AffiliateClickEvent {
  id: string;
  referralCode: string;
  timestamp: string;
  landingPath: string;
  source: string;
}

export interface AffiliatePayoutRequest {
  id: string;
  affiliateId: string;
  referralCode: string;
  amount: number;
  bankName: string;
  accountNumber: string;
  accountName: string;
  status: 'PENDING' | 'PROCESSED' | 'REJECTED';
  createdAt: string;
  processedAt?: string;
  notes?: string;
}

export interface AffiliatePerformanceMetrics {
  referralCode: string;
  validClicksCount: number;
  attributedOrdersCount: number;
  validOrdersCount: number;
  totalSalesVolume: number; // Total GMV (Rp) from valid attributed orders
  pendingCommission: number;
  approvedCommission: number;
  paidCommission: number;
  totalCommission: number;
  pendingPayoutRequestsAmount: number;
  processedPayoutsAmount: number;
  availableBalanceForPayout: number;
}

export const ATTRIBUTION_STORAGE_KEY = 'tumpang_shop_affiliate_attribution_v2';
export const ATTRIBUTION_COOKIE_NAME = 'ts_aff_attr';
export const CLICKS_STORAGE_KEY = 'tumpang_shop_affiliate_clicks_v2';
export const PAYOUTS_STORAGE_KEY = 'tumpang_shop_affiliate_payouts_v2';
export const AFFILIATE_TOKEN_KEY = 'tumpang_shop_affiliate_token_v1';
export const ADMIN_TOKEN_KEY = 'tumpang_shop_admin_token_v1';

export function getStoredAffiliateToken(): string | null {
  try {
    return localStorage.getItem(AFFILIATE_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredAffiliateToken(token: string): void {
  try {
    localStorage.setItem(AFFILIATE_TOKEN_KEY, token);
  } catch {}
}

export function clearStoredAffiliateToken(): void {
  try {
    localStorage.removeItem(AFFILIATE_TOKEN_KEY);
  } catch {}
}

export function getStoredAdminToken(): string | null {
  try {
    return localStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredAdminToken(token: string): void {
  try {
    localStorage.setItem(ADMIN_TOKEN_KEY, token);
  } catch {}
}

export function clearStoredAdminToken(): void {
  try {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {}
}

// 30 days validity per requirement (TikTok-style last-click attribution)
export const ATTRIBUTION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Computes an anti-tamper signature for stored attribution to protect
 * from client-side manipulation of expiration dates or referral identifiers.
 */
export function computeAttributionSignature(attr: {
  referralCode: string;
  affiliateId?: string;
  timestamp: number;
  expiresAt: number;
}): string {
  const affiliateId = attr.affiliateId || '';
  const payload = `${attr.referralCode}#${affiliateId}#${attr.timestamp}#${attr.expiresAt}#ts_secure_aff_2026`;
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    const char = payload.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Validates whether an attribution payload signature is authentic.
 */
export function verifyAttributionSignature(attr: {
  referralCode: string;
  affiliateId?: string;
  timestamp: number;
  expiresAt: number;
  signature?: string;
}): boolean {
  if (!attr.signature) return false;
  const expected = computeAttributionSignature({
    referralCode: attr.referralCode,
    affiliateId: attr.affiliateId,
    timestamp: attr.timestamp,
    expiresAt: attr.expiresAt
  });
  return attr.signature === expected;
}

/**
 * Computes SHA-256 hash for secure affiliate password storage & verification.
 */
export async function hashPasswordSHA256(password: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(`${password}_tumpang_shop_affiliate_salt_2026`);
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback string hash
  let h = 0;
  for (let i = 0; i < data.length; i++) {
    h = ((h << 5) - h) + data[i];
    h |= 0;
  }
  return Math.abs(h).toString(16);
}

/**
 * Identifies traffic source from document.referrer and query parameters
 * (TikTok, Instagram, WhatsApp, Facebook, X, etc.)
 */
export function detectReferralSource(referrer: string = '', searchParams?: URLSearchParams): string {
  if (searchParams) {
    const utmSource = searchParams.get('utm_source');
    if (utmSource && utmSource.trim()) {
      return utmSource.trim();
    }
  }

  const refLower = referrer.toLowerCase();
  if (refLower.includes('tiktok.com') || refLower.includes('tiktok')) return 'TikTok';
  if (refLower.includes('instagram.com')) return 'Instagram';
  if (refLower.includes('facebook.com') || refLower.includes('fb.me')) return 'Facebook';
  if (refLower.includes('whatsapp.com') || refLower.includes('wa.me')) return 'WhatsApp';
  if (refLower.includes('twitter.com') || refLower.includes('x.com')) return 'X (Twitter)';
  if (refLower.includes('telegram.org') || refLower.includes('t.me')) return 'Telegram';
  if (refLower.includes('youtube.com') || refLower.includes('youtu.be')) return 'YouTube';
  if (refLower.includes('google.com')) return 'Google Search';

  return 'Media Sosial / Tautan Langsung';
}

/**
 * Sets a safe cookie for attribution fallback across browser tabs and sessions
 */
function setCookie(name: string, value: string, days: number = 30) {
  try {
    const d = new Date();
    d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
    const expires = 'expires=' + d.toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)};${expires};path=/;SameSite=Lax`;
  } catch {
    // Silently continue if cookies are restricted
  }
}

/**
 * Gets cookie value by name
 */
function getCookie(name: string): string | null {
  try {
    const cname = name + '=';
    const decodedCookie = decodeURIComponent(document.cookie);
    const ca = decodedCookie.split(';');
    for (let i = 0; i < ca.length; i++) {
      let c = ca[i].trim();
      if (c.indexOf(cname) === 0) {
        return c.substring(cname.length, c.length);
      }
    }
  } catch {}
  return null;
}

/**
 * Removes cookie by name
 */
function deleteCookie(name: string) {
  try {
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;SameSite=Lax`;
  } catch {}
}

/**
 * Validates and records an incoming affiliate click and updates the 30-day Last-Click attribution.
 * Validates against approved affiliates to protect from manipulation.
 * Works seamlessly whether customer accesses via /products/:slug?ref=CODE, /?ref=CODE, etc.
 */
export function processIncomingAffiliateLink(
  queryString: string,
  pathname: string,
  affiliates?: AffiliateApplication[]
): AffiliateAttribution | null {
  try {
    const searchParams = new URLSearchParams(queryString);
    const rawRef = searchParams.get('ref') || searchParams.get('referral') || searchParams.get('aff');
    if (!rawRef || !rawRef.trim()) {
      return null;
    }

    const cleanRef = rawRef.trim().toUpperCase();

    // Resolve list of affiliates (from parameter or stored repository)
    const effectiveAffiliates = (affiliates && affiliates.length > 0) 
      ? affiliates 
      : getStoredAffiliates();

    // Verification Guard: Only approved affiliates are eligible for attribution
    // Match either by unique referralCode (e.g. TS-SITI21) or unique affiliateId (e.g. aff_...)
    const matchedAffiliate = effectiveAffiliates.find(
      a => (a.referralCode?.toUpperCase() === cleanRef || a.id?.toUpperCase() === cleanRef) && 
           a.status === 'APPROVED'
    );

    if (!matchedAffiliate) {
      console.warn(`[Affiliate Security] Referral identifier "${cleanRef}" is not recognized or not yet approved.`);
      return null;
    }

    const now = Date.now();
    const source = detectReferralSource(typeof document !== 'undefined' ? document.referrer : '', searchParams);
    const expiresAt = now + ATTRIBUTION_WINDOW_MS;

    const baseData = {
      referralCode: matchedAffiliate.referralCode,
      affiliateId: matchedAffiliate.id,
      timestamp: now,
      expiresAt
    };

    const signature = computeAttributionSignature(baseData);

    const attribution: AffiliateAttribution = {
      referralCode: matchedAffiliate.referralCode,
      affiliateId: matchedAffiliate.id,
      affiliateName: matchedAffiliate.fullName,
      timestamp: now,
      expiresAt,
      landingPath: pathname || '/',
      source,
      signature
    };

    // 1. Save last-click attribution to localStorage
    localStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(attribution));

    // 2. Save to cookie for 30-day cross-session persistence
    setCookie(ATTRIBUTION_COOKIE_NAME, JSON.stringify(attribution), 30);

    // 3. Record valid click analytics event (with spam/rapid click debounce)
    const clickEvent: AffiliateClickEvent = {
      id: `clk_${now}_${Math.random().toString(36).substring(2, 7)}`,
      referralCode: matchedAffiliate.referralCode,
      timestamp: new Date(now).toISOString(),
      landingPath: pathname || '/',
      source
    };
    recordAffiliateClickEvent(clickEvent);

    return attribution;
  } catch (err) {
    console.error('Error processing incoming affiliate link:', err);
    return null;
  }
}

/**
 * Retrieves the active, valid attribution within the 30-day window.
 * Returns null if expired, tampered with, or if the affiliate is no longer APPROVED.
 */
export function getActiveAffiliateAttribution(
  affiliates?: AffiliateApplication[]
): AffiliateAttribution | null {
  try {
    let raw = localStorage.getItem(ATTRIBUTION_STORAGE_KEY);
    if (!raw) {
      raw = getCookie(ATTRIBUTION_COOKIE_NAME);
    }
    if (!raw) return null;

    const parsed: AffiliateAttribution = JSON.parse(raw);
    const now = Date.now();

    // 1. Check 30-day expiration window
    if (!parsed.expiresAt || now > parsed.expiresAt) {
      clearAffiliateAttribution();
      return null;
    }

    // 2. Tamper-protection verification
    if (parsed.signature) {
      const expectedSignature = computeAttributionSignature({
        referralCode: parsed.referralCode,
        affiliateId: parsed.affiliateId,
        timestamp: parsed.timestamp,
        expiresAt: parsed.expiresAt
      });
      if (parsed.signature !== expectedSignature) {
        console.warn('[Affiliate Security] Attribution signature invalid. Clearing suspicious attribution.');
        clearAffiliateAttribution();
        return null;
      }
    }

    // 3. Verify affiliate still exists and remains in APPROVED status
    const effectiveAffiliates = (affiliates && affiliates.length > 0) 
      ? affiliates 
      : getStoredAffiliates();

    const matched = effectiveAffiliates.find(
      a => (a.referralCode?.toUpperCase() === parsed.referralCode.toUpperCase() || 
            a.id?.toUpperCase() === parsed.affiliateId.toUpperCase()) && 
           a.status === 'APPROVED'
    );

    if (!matched) {
      clearAffiliateAttribution();
      return null;
    }

    // Refresh matched details if any updated
    parsed.referralCode = matched.referralCode;
    parsed.affiliateId = matched.id;
    parsed.affiliateName = matched.fullName;

    return parsed;
  } catch (err) {
    console.warn('Error reading affiliate attribution:', err);
    return null;
  }
}

/**
 * Clears stored attribution from both localStorage and cookie
 */
export function clearAffiliateAttribution() {
  try {
    localStorage.removeItem(ATTRIBUTION_STORAGE_KEY);
    deleteCookie(ATTRIBUTION_COOKIE_NAME);
  } catch {}
}

/**
 * Saves a valid click event in persistent storage for affiliate analytics
 * Prevents rapid spam clicks within 5 seconds for same referral and path.
 */
export function recordAffiliateClickEvent(event: AffiliateClickEvent) {
  try {
    const raw = localStorage.getItem(CLICKS_STORAGE_KEY);
    const existing: AffiliateClickEvent[] = raw ? JSON.parse(raw) : [];
    
    // Prevent duplicated rapid clicks from the exact same referral and path within 5 seconds
    const isSpam = existing.some(
      e => e.referralCode === event.referralCode &&
           e.landingPath === event.landingPath &&
           Math.abs(new Date(e.timestamp).getTime() - new Date(event.timestamp).getTime()) < 5000
    );

    if (!isSpam) {
      const updated = [event, ...existing].slice(0, 1000); // retain up to 1000 events
      localStorage.setItem(CLICKS_STORAGE_KEY, JSON.stringify(updated));
    }
  } catch (err) {
    console.warn('Failed to record affiliate click event:', err);
  }
}

/**
 * Gets all recorded valid clicks for an affiliate referral code
 */
export function getAffiliateClicks(referralCode: string): AffiliateClickEvent[] {
  try {
    const raw = localStorage.getItem(CLICKS_STORAGE_KEY);
    if (!raw) return [];
    const list: AffiliateClickEvent[] = JSON.parse(raw);
    return list.filter(e => e.referralCode?.toUpperCase() === referralCode.toUpperCase());
  } catch {
    return [];
  }
}

/**
 * Retrieves all payout requests
 */
export function getPayoutRequests(): AffiliatePayoutRequest[] {
  try {
    const raw = localStorage.getItem(PAYOUTS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * Saves a new payout request
 */
export function savePayoutRequest(request: AffiliatePayoutRequest): AffiliatePayoutRequest[] {
  try {
    const existing = getPayoutRequests();
    const updated = [request, ...existing];
    localStorage.setItem(PAYOUTS_STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.error('Failed to save payout request:', err);
    return [];
  }
}

/**
 * Updates payout request status by admin (e.g. from PENDING to PROCESSED or REJECTED)
 */
export function updatePayoutRequestStatus(
  requestId: string,
  status: 'PENDING' | 'PROCESSED' | 'REJECTED',
  notes?: string
): AffiliatePayoutRequest[] {
  try {
    const existing = getPayoutRequests();
    const updated = existing.map(req => {
      if (req.id === requestId) {
        return {
          ...req,
          status,
          notes: notes !== undefined ? notes : req.notes,
          processedAt: status !== 'PENDING' ? new Date().toISOString() : undefined
        };
      }
      return req;
    });
    localStorage.setItem(PAYOUTS_STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.error('Failed to update payout request status:', err);
    return [];
  }
}

/**
 * Pure, reliable performance metrics calculator.
 * Computes live operational metrics for an affiliate based strictly on genuine orders,
 * verified clicks, and genuine payout records. No dummy data or fake numbers!
 */
export function getAffiliatePerformanceMetrics(
  referralCode: string,
  orders: Order[],
  clicks?: AffiliateClickEvent[],
  payouts?: AffiliatePayoutRequest[]
): AffiliatePerformanceMetrics {
  const cleanCode = referralCode.trim().toUpperCase();

  // 1. Filter genuine attributed orders
  const attributedOrders = orders.filter(
    o => o.referralCode?.toUpperCase() === cleanCode || 
         o.affiliateCommission?.referralCode?.toUpperCase() === cleanCode
  );

  // 2. Count genuine clicks
  const validClicks = clicks || getAffiliateClicks(cleanCode);
  const validClicksCount = validClicks.length;

  let validOrdersCount = 0;
  let totalSalesVolume = 0;
  let pendingCommission = 0;
  let approvedCommission = 0;
  let paidCommission = 0;

  for (const ord of attributedOrders) {
    // Skip cancelled or rejected orders
    if (
      ord.orderStatus === 'CANCELLED' || 
      ord.paymentStatus === 'REJECTED' || 
      ord.paymentStatus === 'EXPIRED' ||
      ord.paymentStatus === 'REFUNDED'
    ) {
      continue;
    }

    validOrdersCount++;
    totalSalesVolume += ord.total;

    const rawAmount = ord.affiliateCommission?.totalCommission ?? (ord.affiliateCommission as any)?.commissionAmount ?? 0;
    const commAmount = Number(rawAmount) || 0;
    const commStatus = ord.affiliateCommission?.status || 'PENDING';

    // Strictly exclude rejected or cancelled commissions (even if order was completed or paid)
    if (commStatus === 'REJECTED' || commStatus === 'CANCELLED') {
      continue;
    }

    if (commStatus === 'PAID') {
      paidCommission += commAmount;
    } else if (commStatus === 'APPROVED' || (ord.orderStatus === 'COMPLETED' && ord.paymentStatus === 'PAID')) {
      approvedCommission += commAmount;
    } else {
      pendingCommission += commAmount;
    }
  }

  // 3. Payouts calculation
  const allPayouts = payouts || getPayoutRequests();
  const affPayouts = allPayouts.filter(p => p.referralCode?.toUpperCase() === cleanCode);
  
  let pendingPayoutRequestsAmount = 0;
  let processedPayoutsAmount = 0;

  for (const p of affPayouts) {
    if (p.status === 'PENDING') {
      pendingPayoutRequestsAmount += p.amount;
    } else if (p.status === 'PROCESSED') {
      processedPayoutsAmount += p.amount;
    }
  }

  const totalCommission = pendingCommission + approvedCommission + paidCommission;
  const availableBalanceForPayout = Math.max(
    0, 
    approvedCommission - pendingPayoutRequestsAmount - processedPayoutsAmount
  );

  return {
    referralCode: cleanCode,
    validClicksCount,
    attributedOrdersCount: attributedOrders.length,
    validOrdersCount,
    totalSalesVolume,
    pendingCommission,
    approvedCommission,
    paidCommission,
    totalCommission,
    pendingPayoutRequestsAmount,
    processedPayoutsAmount,
    availableBalanceForPayout
  };
}
