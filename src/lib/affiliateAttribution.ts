import { AffiliateApplication, Order } from '../types';

export interface AffiliateAttribution {
  referralCode: string;
  affiliateId?: string;
  affiliateName?: string;
  timestamp: number;
  expiresAt: number; // 30 days window (last-click attribution)
  landingPath: string;
  source: string;
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
  notes?: string;
}

export const ATTRIBUTION_STORAGE_KEY = 'tumpang_shop_affiliate_attribution_v2';
export const ATTRIBUTION_COOKIE_NAME = 'ts_aff_attr';
export const CLICKS_STORAGE_KEY = 'tumpang_shop_affiliate_clicks_v2';
export const PAYOUTS_STORAGE_KEY = 'tumpang_shop_affiliate_payouts_v2';

// 30 days validity per requirement
export const ATTRIBUTION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

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
  if (refLower.includes('tiktok.com')) return 'TikTok';
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
 * Sets a safe cookie for attribution fallback (e.g. across tabs)
 */
function setCookie(name: string, value: string, days: number = 30) {
  try {
    const d = new Date();
    d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
    const expires = 'expires=' + d.toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)};${expires};path=/;SameSite=Lax`;
  } catch {
    // Cookie blocked by browser settings
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
 * Validates and records an affiliate click and updates last-click attribution.
 * Must validate against approved affiliates to protect from manipulation.
 */
export function processIncomingAffiliateLink(
  queryString: string,
  pathname: string,
  affiliates: AffiliateApplication[]
): AffiliateAttribution | null {
  try {
    const searchParams = new URLSearchParams(queryString);
    const rawRef = searchParams.get('ref') || searchParams.get('referral') || searchParams.get('aff');
    if (!rawRef || !rawRef.trim()) {
      return null;
    }

    const cleanRef = rawRef.trim().toUpperCase();

    // Verification Guard: Only approved affiliates are eligible for attribution
    const matchedAffiliate = affiliates.find(
      a => a.referralCode?.toUpperCase() === cleanRef && a.status === 'APPROVED'
    );

    if (!matchedAffiliate) {
      console.warn(`[Affiliate Security] Referral code "${cleanRef}" is not recognized or not yet approved.`);
      return null;
    }

    const now = Date.now();
    const source = detectReferralSource(typeof document !== 'undefined' ? document.referrer : '', searchParams);

    const attribution: AffiliateAttribution = {
      referralCode: matchedAffiliate.referralCode,
      affiliateId: matchedAffiliate.id,
      affiliateName: matchedAffiliate.fullName,
      timestamp: now,
      expiresAt: now + ATTRIBUTION_WINDOW_MS,
      landingPath: pathname || '/',
      source
    };

    // 1. Save last-click attribution to localStorage
    localStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(attribution));

    // 2. Save to cookie
    setCookie(ATTRIBUTION_COOKIE_NAME, JSON.stringify(attribution), 30);

    // 3. Record valid click analytics event
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
 * Returns null if expired or if the affiliate was revoked.
 */
export function getActiveAffiliateAttribution(
  affiliates: AffiliateApplication[]
): AffiliateAttribution | null {
  try {
    let raw = localStorage.getItem(ATTRIBUTION_STORAGE_KEY);
    if (!raw) {
      raw = getCookie(ATTRIBUTION_COOKIE_NAME);
    }
    if (!raw) return null;

    const parsed: AffiliateAttribution = JSON.parse(raw);
    const now = Date.now();

    // Check 30-day expiration window
    if (!parsed.expiresAt || now > parsed.expiresAt) {
      clearAffiliateAttribution();
      return null;
    }

    // Verify affiliate still exists and remains APPROVED
    const matched = affiliates.find(
      a => a.referralCode?.toUpperCase() === parsed.referralCode.toUpperCase() && a.status === 'APPROVED'
    );

    if (!matched) {
      clearAffiliateAttribution();
      return null;
    }

    return parsed;
  } catch (err) {
    console.warn('Error reading affiliate attribution:', err);
    return null;
  }
}

/**
 * Clears stored attribution
 */
export function clearAffiliateAttribution() {
  try {
    localStorage.removeItem(ATTRIBUTION_STORAGE_KEY);
    deleteCookie(ATTRIBUTION_COOKIE_NAME);
  } catch {}
}

/**
 * Saves a valid click event in persistent storage for affiliate analytics
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
