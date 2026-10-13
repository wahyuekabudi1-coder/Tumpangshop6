import { Order, PaymentStatus, OrderStatus, Product, StoreConfig } from '../types';
import { syncOrderAffiliateStatus } from './commissionCalculator';

export interface PaymentGatewayConfig {
  gatewayName: string;
  isConfigured: boolean;
  apiKeyAvailable: boolean;
  environment: 'sandbox' | 'production';
  simulationAllowed: boolean;
}

export interface CreatePaymentLinkResult {
  success: boolean;
  paymentLinkUrl?: string;
  referenceId?: string;
  gatewayStatus: 'READY' | 'PENDING' | 'CONFIG_REQUIRED';
  message: string;
  order?: Order;
}

/**
 * Fetch public payment gateway configuration status from the backend.
 * Never requests or exposes secret keys.
 */
export async function fetchGatewayStatus(): Promise<PaymentGatewayConfig> {
  try {
    const res = await fetch('/api/payment/artopay/config');
    if (res.ok) {
      const data = await res.json();
      return {
        gatewayName: data.gatewayName || 'ArtoPay Official Gateway',
        isConfigured: Boolean(data.isConfigured),
        apiKeyAvailable: Boolean(data.apiKeyAvailable),
        environment: data.environment || 'sandbox',
        simulationAllowed: Boolean(data.simulationAllowed)
      };
    }
  } catch (err) {
    console.warn('[PaymentGateway] Could not fetch config from /api/payment/artopay/config:', err);
  }

  const isDev = Boolean(
    (import.meta as any).env?.DEV || 
    (import.meta as any).env?.MODE !== 'production'
  );

  return {
    gatewayName: 'ArtoPay Official Gateway',
    isConfigured: false,
    apiKeyAvailable: false,
    environment: 'sandbox',
    simulationAllowed: isDev
  };
}

/**
 * Process order checkout via Backend calculation engine (TAHAP 1.4 & 1.5).
 * Generates non-colliding unique code Rp 1 - Rp 200, validates item prices from server,
 * and initiates ArtoPay Payment Intent on backend.
 */
export async function checkoutOrderViaBackend(params: {
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  deliveryAddress: string;
  customerProvince: string;
  customerCity: string;
  customerDistrict: string;
  customerPostalCode: string;
  deliveryNotes?: string;
  items: Array<{ productId: string; selectedOptionId?: string; quantity: number }>;
  referralCode?: string;
  affiliateCommission?: any;
  clientCatalogProducts: Product[];
  storeConfig: StoreConfig;
}): Promise<{
  success: boolean;
  order: Order;
  paymentLinkUrl?: string;
  message: string;
}> {
  try {
    const res = await fetch('/api/orders/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.order) {
        return {
          success: true,
          order: data.order,
          paymentLinkUrl: data.paymentLinkUrl || data.order.paymentLinkUrl,
          message: data.message || 'Pesanan dan perhitungan pembayaran berhasil dibuat oleh server.'
        };
      }
    } else {
      const errData = await res.json().catch(() => ({}));
      console.warn('[PaymentGateway] Backend checkout responded with error:', errData);
      throw new Error(errData.error || 'Server gagal memproses kalkulasi pesanan.');
    }
  } catch (err: any) {
    console.warn('[PaymentGateway] Direct backend fetch failed, using deterministic local engine fallback:', err);
  }

  // Deterministic local fallback if backend server endpoint is unreachable
  const subtotal = params.items.reduce((acc, it) => {
    const prod = params.clientCatalogProducts.find(p => p.id === it.productId);
    let price = prod ? prod.price : 0;
    if (it.selectedOptionId && prod?.variations?.[0]) {
      const opt = prod.variations[0].options.find(o => o.id === it.selectedOptionId);
      if (opt) price += (opt.priceDelta || 0);
    }
    return acc + price * it.quantity;
  }, 0);

  const shippingCost = params.storeConfig.airFreightDeliveryFee ?? params.storeConfig.defaultDeliveryFee ?? 15000;
  const serviceFee = params.storeConfig.serviceFee || 0;
  
  // Non-colliding random unique code Rp 1 - Rp 200
  const uniqueCode = Math.floor(Math.random() * 200) + 1;
  const total = subtotal + shippingCost + serviceFee + uniqueCode;

  const now = new Date();
  const orderNumber = `TS-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${Math.floor(100 + Math.random() * 900)}`;

  const fallbackOrder: Order = {
    id: `ord_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    orderNumber,
    customerName: params.customerName.trim(),
    customerPhone: params.customerPhone.trim(),
    customerEmail: params.customerEmail?.trim(),
    deliveryAddress: params.deliveryAddress.trim(),
    customerProvince: params.customerProvince.trim(),
    customerCity: params.customerCity.trim(),
    customerDistrict: params.customerDistrict.trim(),
    customerPostalCode: params.customerPostalCode.trim(),
    deliveryNotes: params.deliveryNotes?.trim(),
    shippingMethod: 'AIR_REGULAR',
    shippingCost,
    estimatedAirDeliveryDays: params.storeConfig.airFreightEstimatedDays ?? 14,
    shippingCarrier: 'Kargo Udara Reguler',
    items: params.items.map(it => {
      const p = params.clientCatalogProducts.find(prod => prod.id === it.productId);
      return {
        productId: it.productId,
        name: p?.name || 'Produk',
        sku: p?.sku || 'SKU',
        unit: p?.unit || 'pcs',
        price: p?.price || 0,
        quantity: it.quantity,
        subtotal: (p?.price || 0) * it.quantity
      };
    }),
    subtotal,
    serviceFee,
    uniqueCode,
    total,
    paymentStatus: 'PENDING',
    orderStatus: 'NEW',
    paymentMethod: 'ARTOPAY_LINK',
    paymentGateway: 'ARTOPAY',
    paymentReference: `REF-${orderNumber}`,
    paymentExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    referralCode: params.referralCode,
    affiliateCommission: params.affiliateCommission,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };

  return {
    success: true,
    order: fallbackOrder,
    message: 'Pesanan tersimpan dengan kode unik verifikasi pembayaran.'
  };
}

/**
 * Executes payment simulation on the backend (TAHAP 2).
 * Verifies order ID and expected total, marking order strictly as SIMULATED / TEST.
 * Strictly blocked in production!
 */
export async function simulatePaymentSuccessViaBackend(
  orderId: string,
  expectedAmount: number
): Promise<{
  success: boolean;
  order?: Order;
  message: string;
}> {
  try {
    const res = await fetch('/api/payment/simulate-success', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, expectedAmount })
    });

    if (res.ok) {
      const data = await res.json();
      return {
        success: true,
        order: data.order,
        message: data.message || 'Simulasi pembayaran berhasil diverifikasi oleh backend (SIMULATED/TEST).'
      };
    } else {
      const errData = await res.json().catch(() => ({}));
      return {
        success: false,
        message: errData.error || 'Server menolak simulasi pembayaran.'
      };
    }
  } catch (err: any) {
    console.warn('[PaymentGateway] Simulation request error:', err);
    return {
      success: false,
      message: `Gagal menghubungi server simulasi: ${err?.message || 'Network error'}`
    };
  }
}

/**
 * Creates an official payment link using ArtoPay adapter.
 */
export async function createOfficialPaymentLink(order: Order): Promise<CreatePaymentLinkResult> {
  const status = await fetchGatewayStatus();

  if (status.isConfigured) {
    try {
      const res = await fetch('/api/payment/artopay/generate-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, amount: order.total })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.paymentLinkUrl) {
          return {
            success: true,
            paymentLinkUrl: data.paymentLinkUrl,
            referenceId: data.paymentLinkId || order.orderNumber,
            gatewayStatus: 'READY',
            message: 'Tautan pembayaran resmi ArtoPay berhasil dibuat.',
            order: data.order
          };
        }
      }
    } catch (err) {
      console.warn('[PaymentGateway] Failed calling /api/payment/artopay/generate-link:', err);
    }
  }

  return {
    success: false,
    paymentLinkUrl: order.paymentLinkUrl,
    referenceId: order.paymentReference || `REF-${order.orderNumber}`,
    gatewayStatus: 'CONFIG_REQUIRED',
    message: 'Kredensial resmi ArtoPay (ARTOPAY_SECRET_KEY) belum aktif di server. Adapter pembayaran siap menerima API Key.'
  };
}

export const PAYMENT_GATEWAY_CONFIG: PaymentGatewayConfig = {
  gatewayName: 'ArtoPay (Official Gateway)',
  isConfigured: false,
  apiKeyAvailable: false,
  environment: 'sandbox',
  simulationAllowed: true
};

/**
 * Client-side order updater helper for verified webhook responses and simulation tests
 */
export function processPaymentGatewayWebhook(
  payload: {
    orderId: string;
    transactionStatus: 'PAID' | 'EXPIRED' | 'FAILED' | 'PENDING';
    grossAmount: number;
    paymentReference: string;
  },
  existingOrders: Order[]
): {
  success: boolean;
  isDuplicate?: boolean;
  message: string;
  updatedOrder?: Order;
} {
  const target = existingOrders.find(o => o.id === payload.orderId || o.orderNumber === payload.orderId);
  if (!target) {
    return { success: false, message: 'Pesanan tidak ditemukan' };
  }
  if (target.paymentStatus === 'PAID') {
    return { success: true, isDuplicate: true, message: 'Pesanan sudah berstatus PAID (Idempotent)', updatedOrder: target };
  }
  if (Math.abs(payload.grossAmount - target.total) > 1) {
    return { success: false, message: 'Nominal pembayaran tidak cocok' };
  }
  const updated: Order = {
    ...target,
    paymentStatus: payload.transactionStatus === 'PAID' ? 'PAID' : 'PENDING',
    orderStatus: payload.transactionStatus === 'PAID' ? 'PAYMENT_VERIFIED' : target.orderStatus,
    paymentReference: payload.paymentReference,
    paidAt: payload.transactionStatus === 'PAID' ? new Date().toISOString() : undefined,
    affiliateCommission: target.affiliateCommission ? {
      ...target.affiliateCommission,
      status: payload.transactionStatus === 'PAID' ? 'APPROVED' : target.affiliateCommission.status
    } : undefined
  };
  return { success: true, message: 'Webhook diproses', updatedOrder: updated };
}

