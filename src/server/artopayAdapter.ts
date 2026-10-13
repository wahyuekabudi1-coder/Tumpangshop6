import crypto from 'crypto';
import { Order, OrderItem, StoreConfig, Product } from '../types';

export interface ArtoPayConfig {
  environment: 'sandbox' | 'production';
  baseUrl: string;
  secretKey?: string;
  privateKey?: string;
  webhookSecret?: string;
  businessUnitId?: string;
  webhookUrl?: string;
  isConfigured: boolean;
}

export function getArtoPayConfig(customEnv?: NodeJS.ProcessEnv): ArtoPayConfig {
  const envSource = customEnv || process.env;
  const env = envSource.ARTOPAY_ENV === 'production' ? 'production' : 'sandbox';
  const secretKey = (envSource.ARTOPAY_SECRET_KEY || '').trim();
  const privateKey = (envSource.ARTOPAY_PRIVATE_KEY || '').trim();
  // Documented HMAC secret: prioritize explicit ARTOPAY_WEBHOOK_SECRET
  // Avoid blindly assuming pk_... is the HMAC key without explicit webhook secret setup
  const webhookSecret = (
    envSource.ARTOPAY_WEBHOOK_SECRET ||
    envSource.ARTOPAY_PRIVATE_KEY ||
    envSource.ARTOPAY_SECRET_KEY ||
    ''
  ).trim();
  const businessUnitId = (envSource.ARTOPAY_BUSINESS_UNIT_ID || '').trim();
  
  // Official ArtoPay hostnames from docs.arto-pay.com:
  // Production: https://api.arto-pay.com
  // Sandbox / Dev: https://api-sandbox.arto-pay.com
  const defaultBaseUrl = env === 'production' 
    ? 'https://api.arto-pay.com' 
    : 'https://api-sandbox.arto-pay.com';
    
  const baseUrl = (envSource.ARTOPAY_BASE_URL || defaultBaseUrl).replace(/\/$/, '');
  const webhookUrl = (envSource.ARTOPAY_WEBHOOK_URL || '').trim();

  return {
    environment: env,
    baseUrl,
    secretKey: secretKey || undefined,
    privateKey: privateKey || undefined,
    webhookSecret: webhookSecret || undefined,
    businessUnitId: businessUnitId || undefined,
    webhookUrl: webhookUrl || undefined,
    isConfigured: Boolean(secretKey && secretKey.length > 0)
  };
}

/**
 * Generate a random unique payment code between Rp 1 and Rp 200.
 * Collision handling:
 * Active pending transactions with the exact same base amount (subtotal + shipping + service)
 * cannot share the same unique code. If a randomly picked code is already occupied by an active
 * pending order, the algorithm selects the next available code in the range 1..200.
 */
export function generateNonCollidingUniqueCode(
  baseAmount: number,
  activeOrders: Array<{ total: number; uniqueCode?: number; subtotal: number; shippingCost: number; serviceFee: number; paymentStatus: string }>
): { uniqueCode: number; collisionResolved: boolean } {
  // Find all unique codes currently in use by active pending orders with identical base amount
  const occupiedCodes = new Set<number>();
  for (const ord of activeOrders) {
    if (ord.paymentStatus === 'PENDING' || ord.paymentStatus === 'UNPAID' || ord.paymentStatus === 'WAITING_VERIFICATION') {
      const ordBaseAmount = (ord.subtotal || 0) + (ord.shippingCost || 0) + (ord.serviceFee || 0);
      if (Math.abs(ordBaseAmount - baseAmount) < 1 && ord.uniqueCode && ord.uniqueCode >= 1 && ord.uniqueCode <= 200) {
        occupiedCodes.add(ord.uniqueCode);
      }
    }
  }

  // 1. Initial random attempt: pick a number between 1 and 200
  const candidate = Math.floor(Math.random() * 200) + 1; // 1 .. 200
  if (!occupiedCodes.has(candidate)) {
    return { uniqueCode: candidate, collisionResolved: false };
  }

  // 2. Collision detected: find the first available code in 1..200
  for (let code = 1; code <= 200; code++) {
    if (!occupiedCodes.has(code)) {
      console.log(`[ArtoPay UniqueCode] Collision resolved for base amount Rp ${baseAmount}: Candidate ${candidate} occupied, allocated code ${code}`);
      return { uniqueCode: code, collisionResolved: true };
    }
  }

  // 3. Fallback if all 200 slots for the exact same base amount are simultaneously pending:
  const fallback = (Date.now() % 200) + 1;
  console.warn(`[ArtoPay UniqueCode] All 200 unique codes occupied for exact base amount Rp ${baseAmount}. Using fallback: ${fallback}`);
  return { uniqueCode: fallback, collisionResolved: true };
}

/**
 * Validates cart items against trusted product catalogue,
 * calculates subtotal, shipping cost, service fee, and unique code on the backend.
 */
export function calculateOrderBackend(params: {
  items: Array<{ productId: string; selectedOptionId?: string; quantity: number }>;
  storeConfig: StoreConfig;
  catalogProducts: Product[];
  activeOrders: Order[];
  uniqueCode?: number;
}): {
  orderItems: OrderItem[];
  subtotal: number;
  shippingCost: number;
  serviceFee: number;
  uniqueCode: number;
  total: number;
  estimatedAirDeliveryDays: number;
} {
  const { items, storeConfig, catalogProducts, activeOrders } = params;

  if (!items || items.length === 0) {
    throw new Error('Keranjang belanja kosong.');
  }

  const orderItems: OrderItem[] = [];
  let subtotal = 0;

  for (const item of items) {
    const product = catalogProducts.find(p => p.id === item.productId);
    if (!product) {
      throw new Error(`Produk dengan ID ${item.productId} tidak ditemukan di katalog toko.`);
    }

    let unitPrice = product.price;
    let variationInfo: string | undefined = undefined;
    let itemSku = product.sku;

    if (item.selectedOptionId && product.variations && product.variations.length > 0) {
      const primaryVar = product.variations[0];
      const opt = primaryVar.options.find(o => o.id === item.selectedOptionId);
      if (opt) {
        unitPrice += (opt.priceDelta || 0);
        variationInfo = `${primaryVar.name}: ${opt.name}`;
        if (opt.sku) itemSku = opt.sku;
      }
    }

    const itemSubtotal = unitPrice * item.quantity;
    subtotal += itemSubtotal;

    orderItems.push({
      productId: product.id,
      name: product.name,
      sku: itemSku,
      unit: product.unit || 'pcs',
      variationInfo,
      price: unitPrice,
      quantity: item.quantity,
      subtotal: itemSubtotal
    });
  }

  const shippingCost = storeConfig.airFreightDeliveryFee ?? storeConfig.defaultDeliveryFee ?? 15000;
  const serviceFee = storeConfig.serviceFee || 0;
  const estimatedAirDeliveryDays = storeConfig.airFreightEstimatedDays ?? 14;

  const baseAmount = subtotal + shippingCost + serviceFee;
  const uniqueCode = params.uniqueCode !== undefined && params.uniqueCode >= 1 && params.uniqueCode <= 200
    ? params.uniqueCode
    : generateNonCollidingUniqueCode(baseAmount, activeOrders).uniqueCode;

  // Total includes exact unique code
  const total = baseAmount + uniqueCode;

  return {
    orderItems,
    subtotal,
    shippingCost,
    serviceFee,
    uniqueCode,
    total,
    estimatedAirDeliveryDays
  };
}

/**
 * Normalizes phone numbers to standard countryCode (+62) and number without leading 0.
 */
function normalizeIndonesianPhone(phoneStr?: string): { countryCode: string; number: string } {
  if (!phoneStr) return { countryCode: '+62', number: '81234567890' };
  let digits = phoneStr.replace(/\D/g, '');
  if (digits.startsWith('62')) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  return {
    countryCode: '+62',
    number: digits || '81234567890'
  };
}

export interface ArtoPayPaymentLinkResponse {
  responseCode: string;
  responseMessage: string;
  responseData?: {
    id: string;
    referenceCode: string;
    status: 'PENDING' | 'PAID' | 'CANCELLED' | 'EXPIRED' | string;
    description: string;
    subtotal: string;
    total: string;
    additionalFee?: Array<{ name: string; fee: string }>;
    businessUnitId?: string;
    businessUnitName?: string;
    url: string;
    expiredAt: string;
    createdAt: string;
    transaction?: any;
  };
}

/**
 * Creates a payment link via official ArtoPay Non-SNAP API:
 * POST /v1.0/payment-link
 * Endpoint:
 *   Production: https://api.arto-pay.com/v1.0/payment-link
 *   Sandbox:    https://api-sandbox.arto-pay.com/v1.0/payment-link
 * Headers:
 *   X-Secret-Key: sk_...
 */
export async function createArtoPayPaymentLink(order: Order, options?: { returnUrl?: string }): Promise<{
  success: boolean;
  paymentLinkUrl?: string;
  paymentLinkId?: string;
  gatewayStatus: 'READY' | 'CONFIG_REQUIRED' | 'FAILED';
  message: string;
  rawResponse?: any;
}> {
  const config = getArtoPayConfig();

  if (!config.isConfigured || !config.secretKey) {
    return {
      success: false,
      gatewayStatus: 'CONFIG_REQUIRED',
      message: 'Kredensial ArtoPay (ARTOPAY_SECRET_KEY) belum dikonfigurasi di server backend. Adapter backend telah siap menerima kredensial resmi.',
      paymentLinkId: undefined,
      paymentLinkUrl: undefined
    };
  }

  const phoneParsed = normalizeIndonesianPhone(order.customerPhone);
  const fallbackEmail = `${phoneParsed.number}@customer.tumpang.shop`;
  const defaultReturnUrl = options?.returnUrl || `${process.env.APP_URL || 'https://tumpang.shop'}/order-confirmation?orderNumber=${order.orderNumber}`;

  // Itemized breakdown according to official docs
  const items = (order.items || []).map(it => ({
    name: it.name.slice(0, 100),
    description: (it.variationInfo || it.sku || '').slice(0, 100),
    qty: it.quantity,
    unitPrice: String(it.price),
    subtotal: String(it.subtotal)
  }));

  // Additional fee array: Shipping, Service fee, and Unique code
  const additionalFee: Array<{ name: string; fee: string }> = [];
  if (order.shippingCost > 0) {
    additionalFee.push({
      name: 'Kargo Udara Reguler',
      fee: String(order.shippingCost)
    });
  }
  if (order.serviceFee > 0) {
    additionalFee.push({
      name: 'Biaya Layanan',
      fee: String(order.serviceFee)
    });
  }
  if (order.uniqueCode && order.uniqueCode > 0) {
    additionalFee.push({
      name: 'Kode Unik Pembayaran',
      fee: String(order.uniqueCode)
    });
  }

  // Official documentation payload
  const requestBody: Record<string, any> = {
    referenceCode: order.orderNumber,
    subtotal: String(order.subtotal),
    total: String(order.total),
    description: `Pembayaran Pesanan ${order.orderNumber} - Tumpang Shop`.slice(0, 500),
    customerId: order.customerPhone || `cust_${order.id.slice(0, 8)}`,
    customerMetadata: {
      name: order.customerName,
      email: order.customerEmail || fallbackEmail,
      phone: {
        countryCode: phoneParsed.countryCode,
        number: phoneParsed.number
      },
      items: items.length > 0 ? items : undefined
    },
    additionalFee: additionalFee.length > 0 ? additionalFee : undefined,
    url: defaultReturnUrl,
    expiredAt: order.paymentExpiresAt,
    paymentDate: order.paymentExpiresAt
  };

  if (config.businessUnitId) {
    requestBody.businessUnitId = config.businessUnitId;
  }

  try {
    const endpoint = `${config.baseUrl}/v1.0/payment-link`;
    console.log(`[ArtoPay Adapter] Calling ${endpoint} for order ${order.orderNumber} with total Rp ${order.total}`);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Secret-Key': config.secretKey
      },
      body: JSON.stringify(requestBody)
    });

    const data: ArtoPayPaymentLinkResponse = await res.json();

    if (res.ok && data.responseData && (data.responseCode === '2002700' || data.responseCode === 'success' || data.responseData.id)) {
      const paymentLinkId = data.responseData.id;
      const paymentLinkUrl = data.responseData.url;

      return {
        success: true,
        gatewayStatus: 'READY',
        paymentLinkId,
        paymentLinkUrl,
        message: 'Payment Link ArtoPay resmi berhasil dibuat.',
        rawResponse: data
      };
    } else {
      console.warn('[ArtoPay Adapter] API Error response from /v1.0/payment-link:', data);
      return {
        success: false,
        gatewayStatus: 'FAILED',
        message: data.responseMessage || 'Gagal membuat payment link ArtoPay.',
        rawResponse: data
      };
    }
  } catch (err: any) {
    console.error('[ArtoPay Adapter] Network exception:', err);
    return {
      success: false,
      gatewayStatus: 'FAILED',
      message: `Koneksi ke API ArtoPay gagal: ${err?.message || 'Network error'}`
    };
  }
}

/**
 * Query payment link detail from ArtoPay (GET /v1.0/payment-link/{id})
 */
export async function getArtoPayPaymentLinkDetail(paymentLinkId: string): Promise<{
  success: boolean;
  data?: any;
  message?: string;
}> {
  const config = getArtoPayConfig();
  if (!config.secretKey) {
    return { success: false, message: 'ArtoPay Secret Key not configured.' };
  }

  try {
    const endpoint = `${config.baseUrl}/v1.0/payment-link/${paymentLinkId}`;
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'X-Secret-Key': config.secretKey
      }
    });
    const data = await res.json();
    if (res.ok && data.responseData) {
      return { success: true, data: data.responseData };
    }
    return { success: false, message: data.responseMessage || 'Failed to fetch payment link detail.' };
  } catch (err: any) {
    return { success: false, message: err?.message };
  }
}

/**
 * Cancel payment link in ArtoPay (POST /v1.0/payment-link/{id}/cancel)
 */
export async function cancelArtoPayPaymentLink(paymentLinkId: string): Promise<{
  success: boolean;
  message: string;
}> {
  const config = getArtoPayConfig();
  if (!config.secretKey) {
    return { success: false, message: 'ArtoPay Secret Key not configured.' };
  }

  try {
    const endpoint = `${config.baseUrl}/v1.0/payment-link/${paymentLinkId}/cancel`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'X-Secret-Key': config.secretKey
      }
    });
    const data = await res.json();
    return {
      success: res.ok,
      message: data.responseMessage || 'Cancel request processed'
    };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Network error' };
  }
}

export interface ArtoPayPaymentIntentResponse {
  responseCode: string;
  responseMessage: string;
  responseData?: {
    id: string;
    amount: string;
    currency: string;
    customerToken?: string;
    secret?: string;
    status: string;
    createdAt?: string;
    metadata?: Record<string, any>;
  };
}

/**
 * Creates a payment intent via official ArtoPay API (POST /v1.1/payment-intents).
 */
export async function createArtoPayPaymentIntent(order: Order): Promise<{
  success: boolean;
  paymentLinkUrl?: string;
  paymentId?: string;
  customerToken?: string;
  clientSecret?: string;
  gatewayStatus: 'READY' | 'CONFIG_REQUIRED' | 'FAILED';
  message: string;
  rawResponse?: any;
}> {
  const config = getArtoPayConfig();

  if (!config.isConfigured || !config.secretKey) {
    return {
      success: false,
      gatewayStatus: 'CONFIG_REQUIRED',
      message: 'Kredensial ArtoPay (ARTOPAY_SECRET_KEY) belum dikonfigurasi di server backend. Adapter backend telah siap menerima kredensial resmi.',
      paymentId: undefined,
      paymentLinkUrl: undefined
    };
  }

  const formattedAmount = `${order.total}.00`;

  const requestBody = {
    amount: formattedAmount,
    currency: 'IDR',
    orderId: order.orderNumber,
    customerId: order.customerPhone || order.customerEmail || `cust_${order.id.slice(0, 8)}`,
    description: `Pembayaran Pesanan ${order.orderNumber} - Tumpang Shop`,
    metadata: {
      orderId: order.id,
      orderNumber: order.orderNumber,
      uniqueCode: order.uniqueCode || 0,
      subtotal: order.subtotal,
      shippingCost: order.shippingCost,
      serviceFee: order.serviceFee
    }
  };

  try {
    const endpoint = `${config.baseUrl}/v1.1/payment-intents`;
    console.log(`[ArtoPay Adapter] Calling ${endpoint} for order ${order.orderNumber} with amount ${formattedAmount}`);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Secret-Key': config.secretKey
      },
      body: JSON.stringify(requestBody)
    });

    const data: ArtoPayPaymentIntentResponse = await res.json();

    if (res.ok && data.responseData && (data.responseCode === '2002700' || data.responseData.id)) {
      const paymentId = data.responseData.id;
      const secret = data.responseData.secret;
      const customerToken = data.responseData.customerToken;
      
      const paymentLinkUrl = `https://pay.artopay.online/pay/${paymentId}?token=${secret || ''}`;

      return {
        success: true,
        gatewayStatus: 'READY',
        paymentId,
        clientSecret: secret,
        customerToken,
        paymentLinkUrl,
        message: 'Payment intent ArtoPay berhasil dibuat.',
        rawResponse: data
      };
    } else {
      console.warn('[ArtoPay Adapter] API Error response from payment-intents:', data);
      return {
        success: false,
        gatewayStatus: 'FAILED',
        message: data.responseMessage || 'Gagal membuat transaksi ArtoPay.',
        rawResponse: data
      };
    }
  } catch (err: any) {
    console.error('[ArtoPay Adapter] Network exception:', err);
    return {
      success: false,
      gatewayStatus: 'FAILED',
      message: `Koneksi ke API ArtoPay gagal: ${err?.message || 'Network error'}`
    };
  }
}

/**
 * Verify ArtoPay Webhook signature using HMAC-SHA256.
 * Supported headers:
 * - X-Signature
 * - X-Pay-Signature
 * - X-ArtoPay-Signature
 * - Webhook-Signature
 * - X-Callback-Signature
 * 
 * Algorithm: HMAC-SHA256 computed on raw UTF-8 / binary payload.
 * Supports hex (standard) and base64 digest formats, with optional sha256= prefix.
 */
export function verifyArtoPayWebhookSignature(
  rawPayload: string | Buffer,
  signatureHeader: string,
  hmacSecret: string
): boolean {
  if (!signatureHeader || !hmacSecret) {
    return false;
  }

  try {
    const rawBuffer = Buffer.isBuffer(rawPayload) ? rawPayload : Buffer.from(rawPayload, 'utf-8');
    const hmacHex = crypto.createHmac('sha256', hmacSecret).update(rawBuffer).digest('hex');
    const hmacBase64 = crypto.createHmac('sha256', hmacSecret).update(rawBuffer).digest('base64');

    const cleanReceived = signatureHeader.replace(/^sha256=/i, '').trim();

    // 1. Try Hex match
    const expBufHex = Buffer.from(hmacHex, 'utf-8');
    const recBuf = Buffer.from(cleanReceived, 'utf-8');

    if (expBufHex.length === recBuf.length && crypto.timingSafeEqual(expBufHex, recBuf)) {
      return true;
    }

    // 2. Try Base64 match
    const expBufB64 = Buffer.from(hmacBase64, 'utf-8');
    if (expBufB64.length === recBuf.length && crypto.timingSafeEqual(expBufB64, recBuf)) {
      return true;
    }

    return false;
  } catch (err) {
    console.error('[ArtoPay Webhook] Signature verification error:', err);
    return false;
  }
}

export interface ArtoPayWebhookPayload {
  timestamp?: string;
  // Supported both as nested data (official ArtoPay format) or direct fields
  data?: {
    transactionId?: string;
    partnerReferenceNo?: string;
    orderId?: string;
    status: 'PAID' | 'EXPIRED' | 'FAILED' | 'PENDING' | string;
    amount: string | number;
    currency?: string;
    paymentMethod?: string;
    bank?: string;
    paidAt?: string;
    expiredAt?: string;
  };
  // Fallback direct root fields if gateway posts flat JSON
  transactionId?: string;
  partnerReferenceNo?: string;
  orderId?: string;
  status?: string;
  amount?: string | number;
  paidAt?: string;
}

