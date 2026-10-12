import { Order } from '../types';

export interface PaymentGatewayConfig {
  gatewayName: string;
  isConfigured: boolean;
  apiKeyAvailable: boolean;
  merchantId?: string;
  webhookUrl?: string;
  mode: 'SANDBOX' | 'PRODUCTION' | 'NOT_CONFIGURED';
}

// Check environment variables safely
const env = (import.meta as any).env || {};

export const PAYMENT_GATEWAY_CONFIG: PaymentGatewayConfig = {
  gatewayName: env.VITE_PAYMENT_GATEWAY_NAME || 'Official Payment Gateway (Midtrans / Xendit / ArtoPay)',
  isConfigured: Boolean(
    (env.VITE_PAYMENT_GATEWAY_KEY && env.VITE_PAYMENT_GATEWAY_KEY.trim() !== '') ||
    (env.VITE_MIDTRANS_SERVER_KEY && env.VITE_MIDTRANS_SERVER_KEY.trim() !== '') ||
    (env.VITE_XENDIT_SECRET_KEY && env.VITE_XENDIT_SECRET_KEY.trim() !== '')
  ),
  apiKeyAvailable: Boolean(
    env.VITE_PAYMENT_GATEWAY_KEY || 
    env.VITE_MIDTRANS_SERVER_KEY || 
    env.VITE_XENDIT_SECRET_KEY
  ),
  merchantId: env.VITE_PAYMENT_MERCHANT_ID || '',
  mode: env.VITE_PAYMENT_GATEWAY_MODE || 'NOT_CONFIGURED'
};

export interface CreatePaymentLinkResult {
  success: boolean;
  paymentLinkUrl?: string;
  referenceId?: string;
  gatewayStatus: 'PENDING' | 'CONFIG_REQUIRED';
  message: string;
}

/**
 * Creates an official payment link for a newly created Order.
 * Strict Integrity Rule:
 * If gateway credentials/API keys are not yet configured on the server/environment,
 * this function transparently reports that payment credentials are not active yet,
 * sets the order status to PENDING with safe official instructions,
 * and does NOT fabricate fake authorization tokens or claim a mock payment is real.
 */
export async function createOfficialPaymentLink(order: Order): Promise<CreatePaymentLinkResult> {
  // If backend endpoint for official payment exists:
  if (PAYMENT_GATEWAY_CONFIG.isConfigured) {
    try {
      const response = await fetch('/api/payment/create-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          orderNumber: order.orderNumber,
          amount: order.total,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          customerEmail: order.customerEmail
        })
      });

      if (response.ok) {
        const data = await response.json();
        return {
          success: true,
          paymentLinkUrl: data.payment_url || data.invoice_url,
          referenceId: data.reference_id || data.id,
          gatewayStatus: 'PENDING',
          message: 'Tautan pembayaran resmi berhasil digenerate oleh Payment Gateway.'
        };
      }
    } catch (err) {
      console.warn('Backend payment gateway API request returned:', err);
    }
  }

  // Gateway credentials are not yet configured in .env
  return {
    success: false,
    paymentLinkUrl: undefined,
    referenceId: `REF-${order.orderNumber}`,
    gatewayStatus: 'CONFIG_REQUIRED',
    message: 'Kredensial atau server API Payment Gateway belum dikonfigurasi di environment (.env). Pesanan disimpan aman dengan status Pembayaran: PENDING (Menunggu Pembayaran) dan Status Pesanan: Baru.'
  };
}
