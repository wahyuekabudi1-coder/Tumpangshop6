import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Order } from '../types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const ORDERS_FILE = path.join(DATA_DIR, 'server-orders.json');
const WEBHOOKS_FILE = path.join(DATA_DIR, 'processed-webhooks.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// In-memory cache for fast lookups
const orderCache = new Map<string, Order>();
const processedWebhookEventIds = new Set<string>();

// Concurrency lock for in-flight checkouts:
// Set of strings: `${baseAmount}_${uniqueCode}`
const inFlightCodeReservations = new Set<string>();

/**
 * Load stored orders and processed webhook events from disk on startup
 */
export function initializeServerOrderStore() {
  try {
    if (fs.existsSync(ORDERS_FILE)) {
      const content = fs.readFileSync(ORDERS_FILE, 'utf-8');
      const orders: Order[] = JSON.parse(content);
      for (const ord of orders) {
        if (ord && ord.id) {
          orderCache.set(ord.id, ord);
          if (ord.orderNumber) {
            orderCache.set(ord.orderNumber, ord);
          }
        }
      }
      console.log(`[OrderStore] Loaded ${orders.length} persistent orders from disk.`);
    }
  } catch (err) {
    console.warn('[OrderStore] Warning loading orders from disk:', err);
  }

  try {
    if (fs.existsSync(WEBHOOKS_FILE)) {
      const content = fs.readFileSync(WEBHOOKS_FILE, 'utf-8');
      const webhookIds: string[] = JSON.parse(content);
      for (const id of webhookIds) {
        processedWebhookEventIds.add(id);
      }
      console.log(`[OrderStore] Loaded ${processedWebhookEventIds.size} processed webhook IDs from disk.`);
    }
  } catch (err) {
    console.warn('[OrderStore] Warning loading webhooks from disk:', err);
  }
}

/**
 * Atomically flush current orders to disk
 */
function flushOrdersToDisk() {
  try {
    // Unique orders array (avoiding duplicates from id and orderNumber keys)
    const uniqueOrders = Array.from(new Set(orderCache.values()));
    const tmpFile = `${ORDERS_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(uniqueOrders, null, 2), 'utf-8');
    fs.renameSync(tmpFile, ORDERS_FILE);
  } catch (err) {
    console.error('[OrderStore] Failed to save orders to disk:', err);
  }
}

/**
 * Flush processed webhook IDs to disk
 */
function flushWebhooksToDisk() {
  try {
    const tmpFile = `${WEBHOOKS_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(Array.from(processedWebhookEventIds), null, 2), 'utf-8');
    fs.renameSync(tmpFile, WEBHOOKS_FILE);
  } catch (err) {
    console.error('[OrderStore] Failed to save webhook IDs to disk:', err);
  }
}

/**
 * Save or update an order
 */
export function saveOrderToStore(order: Order): Order {
  orderCache.set(order.id, order);
  if (order.orderNumber) {
    orderCache.set(order.orderNumber, order);
  }
  flushOrdersToDisk();
  return order;
}

/**
 * Retrieve an order by ID or Order Number
 */
export function getOrderFromStore(idOrNumber: string): Order | undefined {
  return orderCache.get(idOrNumber);
}

/**
 * Get all stored orders
 */
export function getAllOrdersFromStore(): Order[] {
  return Array.from(new Set(orderCache.values()));
}

/**
 * Reserve a unique code (1..200) safely against concurrent checkouts.
 * Returns the code and a release/commit function.
 */
export function reserveUniqueCodeForBaseAmount(baseAmount: number): {
  uniqueCode: number;
  commitReservation: () => void;
  releaseReservation: () => void;
} {
  const activeOrders = getAllOrdersFromStore();
  const occupiedCodes = new Set<number>();

  // Collect occupied codes from existing pending orders with the exact same base amount
  for (const ord of activeOrders) {
    if (ord.paymentStatus === 'PENDING' || ord.paymentStatus === 'UNPAID' || ord.paymentStatus === 'WAITING_VERIFICATION') {
      const ordBase = (ord.subtotal || 0) + (ord.shippingCost || 0) + (ord.serviceFee || 0);
      if (Math.abs(ordBase - baseAmount) < 1 && ord.uniqueCode && ord.uniqueCode >= 1 && ord.uniqueCode <= 200) {
        occupiedCodes.add(ord.uniqueCode);
      }
    }
  }

  // Also collect in-flight reservations for this exact base amount
  for (const key of inFlightCodeReservations) {
    if (key.startsWith(`${baseAmount}_`)) {
      const code = Number(key.split('_')[1]);
      if (!isNaN(code)) {
        occupiedCodes.add(code);
      }
    }
  }

  // 1. Initial random attempt
  let chosenCode: number | null = null;
  const candidate = Math.floor(Math.random() * 200) + 1;
  if (!occupiedCodes.has(candidate)) {
    chosenCode = candidate;
  } else {
    // 2. Linear scan for first unoccupied slot in 1..200
    for (let code = 1; code <= 200; code++) {
      if (!occupiedCodes.has(code)) {
        chosenCode = code;
        break;
      }
    }
  }

  // 3. Fallback if all 200 slots occupied
  if (!chosenCode) {
    chosenCode = (Date.now() % 200) + 1;
  }

  const reservationKey = `${baseAmount}_${chosenCode}`;
  inFlightCodeReservations.add(reservationKey);

  return {
    uniqueCode: chosenCode,
    commitReservation: () => {
      inFlightCodeReservations.delete(reservationKey);
    },
    releaseReservation: () => {
      inFlightCodeReservations.delete(reservationKey);
    }
  };
}

/**
 * Webhook idempotency management
 */
export function isWebhookEventProcessed(eventKey: string): boolean {
  return processedWebhookEventIds.has(eventKey);
}

export function markWebhookEventProcessed(eventKey: string): void {
  processedWebhookEventIds.add(eventKey);
  flushWebhooksToDisk();
}

// ----------------------------------------------------------------------------
// Affiliate Store (Memory Cache + Disk Backup)
// ----------------------------------------------------------------------------
import { AffiliateApplication } from '../types';
const AFFILIATES_FILE = path.join(DATA_DIR, 'server-affiliates.json');
const affiliateCache = new Map<string, AffiliateApplication>();

try {
  if (fs.existsSync(AFFILIATES_FILE)) {
    const raw = fs.readFileSync(AFFILIATES_FILE, 'utf-8');
    const affs: AffiliateApplication[] = JSON.parse(raw);
    for (const a of affs) {
      if (a && a.id) {
        affiliateCache.set(a.id, a);
        if (a.referralCode) affiliateCache.set(a.referralCode.toUpperCase(), a);
        if (a.email) affiliateCache.set(a.email.toLowerCase(), a);
        if (a.phone) affiliateCache.set(a.phone.replace(/\D/g, ''), a);
      }
    }
  }
} catch (e) {
  console.warn('[AffiliateStore] Warning loading affiliates from disk:', e);
}

function flushAffiliatesToDisk() {
  try {
    const unique = Array.from(new Set(affiliateCache.values()));
    const tmp = `${AFFILIATES_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(unique, null, 2), 'utf-8');
    fs.renameSync(tmp, AFFILIATES_FILE);
  } catch (err) {
    console.error('[AffiliateStore] Failed to save affiliates to disk:', err);
  }
}

export function saveAffiliateToStore(app: AffiliateApplication): AffiliateApplication {
  affiliateCache.set(app.id, app);
  if (app.referralCode) affiliateCache.set(app.referralCode.toUpperCase(), app);
  if (app.email) affiliateCache.set(app.email.toLowerCase(), app);
  if (app.phone) affiliateCache.set(app.phone.replace(/\D/g, ''), app);
  flushAffiliatesToDisk();
  return app;
}

export function getAffiliateFromStore(identifier: string): AffiliateApplication | undefined {
  if (!identifier) return undefined;
  const clean = identifier.trim();
  const digits = clean.replace(/\D/g, '');
  return affiliateCache.get(clean.toUpperCase()) || 
         affiliateCache.get(clean.toLowerCase()) || 
         (digits.length >= 8 ? affiliateCache.get(digits) : undefined);
}

export function getAllAffiliatesFromStore(): AffiliateApplication[] {
  return Array.from(new Set(affiliateCache.values()));
}

// ----------------------------------------------------------------------------
// Payouts Store (Disk + Memory)
// ----------------------------------------------------------------------------
import { AffiliatePayoutRequest } from '../lib/affiliateAttribution';
const PAYOUTS_FILE = path.join(DATA_DIR, 'server-payouts.json');
const payoutCache = new Map<string, AffiliatePayoutRequest>();

try {
  if (fs.existsSync(PAYOUTS_FILE)) {
    const raw = fs.readFileSync(PAYOUTS_FILE, 'utf-8');
    const payouts: AffiliatePayoutRequest[] = JSON.parse(raw);
    for (const p of payouts) {
      if (p && p.id) {
        payoutCache.set(p.id, p);
      }
    }
  }
} catch (e) {
  console.warn('[PayoutStore] Warning loading payouts from disk:', e);
}

function flushPayoutsToDisk() {
  try {
    const unique = Array.from(payoutCache.values());
    const tmp = `${PAYOUTS_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(unique, null, 2), 'utf-8');
    fs.renameSync(tmp, PAYOUTS_FILE);
  } catch (err) {
    console.error('[PayoutStore] Failed to save payouts to disk:', err);
  }
}

export function savePayoutToStore(payout: AffiliatePayoutRequest): AffiliatePayoutRequest {
  payoutCache.set(payout.id, payout);
  flushPayoutsToDisk();
  return payout;
}

export function getPayoutsFromStore(referralCode?: string): AffiliatePayoutRequest[] {
  const all = Array.from(payoutCache.values());
  if (!referralCode) return all;
  const clean = referralCode.trim().toUpperCase();
  return all.filter(p => p.referralCode && p.referralCode.toUpperCase() === clean);
}

export function updatePayoutStatusInStore(
  payoutId: string,
  status: 'PENDING' | 'PROCESSED' | 'REJECTED',
  notes?: string
): AffiliatePayoutRequest | undefined {
  const existing = payoutCache.get(payoutId);
  if (!existing) return undefined;
  existing.status = status;
  if (notes !== undefined) existing.notes = notes;
  if (status === 'PROCESSED') existing.processedAt = new Date().toISOString();
  flushPayoutsToDisk();
  return existing;
}


