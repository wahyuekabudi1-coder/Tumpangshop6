import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { Order, Product, StoreConfig, OrderAffiliateSnapshot, AffiliateApplication } from './src/types';
import { initialStoreConfig, initialProducts } from './src/data/mockData';
import { calculateOrderAffiliateCommission } from './src/lib/commissionCalculator';
import { getAffiliatePerformanceMetrics, AffiliatePayoutRequest } from './src/lib/affiliateAttribution';
import {
  hashPasswordScrypt,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  verifyAdminCredentials,
  extractBearerToken,
  DEFAULT_ADMIN_EMAIL
} from './src/server/passwordSecurity';
import {
  getArtoPayConfig,
  calculateOrderBackend,
  createArtoPayPaymentLink,
  getArtoPayPaymentLinkDetail,
  cancelArtoPayPaymentLink,
  createArtoPayPaymentIntent,
  verifyArtoPayWebhookSignature,
  ArtoPayWebhookPayload
} from './src/server/artopayAdapter';
import {
  initializeServerOrderStore,
  saveOrderToStore,
  getOrderFromStore,
  getAllOrdersFromStore,
  reserveUniqueCodeForBaseAmount,
  isWebhookEventProcessed,
  markWebhookEventProcessed,
  saveAffiliateToStore,
  getAffiliateFromStore,
  getAllAffiliatesFromStore,
  savePayoutToStore,
  getPayoutsFromStore,
  updatePayoutStatusInStore
} from './src/server/serverOrderStore';


dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Supabase server client
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

// Extend Request to retain rawBody for webhook HMAC-SHA256 verification
interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const isDev = process.env.NODE_ENV !== 'production';

  // 1. Initialize persistent server storage
  initializeServerOrderStore();

  // 2. Preload orders from Supabase if connected
  if (supabase) {
    try {
      const { data: dbOrders, error: dbErr } = await supabase.from('orders').select('*');
      if (!dbErr && dbOrders && dbOrders.length > 0) {
        for (const d of dbOrders) {
          saveOrderToStore({
            id: d.id,
            orderNumber: d.order_number,
            customerName: d.customer_name,
            customerPhone: d.customer_phone,
            customerEmail: d.customer_email,
            deliveryAddress: d.delivery_address,
            customerDistrict: d.customer_district,
            shippingMethod: d.shipping_method,
            shippingCost: Number(d.shipping_cost),
            items: d.items,
            subtotal: Number(d.subtotal),
            serviceFee: Number(d.service_fee),
            total: Number(d.total),
            uniqueCode: Number(d.unique_code || 0),
            paymentStatus: d.payment_status,
            orderStatus: d.order_status,
            paymentMethod: d.payment_method,
            paymentGateway: d.payment_gateway,
            paymentLinkUrl: d.payment_link_url,
            paymentReference: d.payment_reference,
            artopayPaymentId: d.artopay_payment_id,
            isTestTransaction: Boolean(d.is_test_transaction),
            simulationNote: d.simulation_note,
            paidAt: d.paid_at,
            paymentExpiresAt: d.payment_expires_at,
            createdAt: d.created_at,
            updatedAt: d.updated_at
          });
        }
        console.log(`[Server] Preloaded ${dbOrders.length} orders from Supabase database.`);
      }
    } catch (err) {
      console.warn('[Server] Supabase orders preload exception:', err);
    }
  }

  app.use(cors());

  // Capture raw request body for HMAC signature verification
  app.use(express.json({
    verify: (req: RawBodyRequest, _res, buf) => {
      req.rawBody = buf;
    }
  }));

  // --------------------------------------------------------------------------
  // 1. HEALTH & ARTO-PAY CONFIG STATUS
  // --------------------------------------------------------------------------
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'Tumpang Shop Backend & ArtoPay Adapter',
      environment: process.env.NODE_ENV || 'development',
      artoPayEnv: process.env.ARTOPAY_ENV || 'sandbox',
      timestamp: new Date().toISOString()
    });
  });

  app.get('/api/payment/artopay/config', (_req: Request, res: Response) => {
    const config = getArtoPayConfig();
    const isProduction = process.env.NODE_ENV === 'production' || process.env.ARTOPAY_ENV === 'production';
    const simulationEnabled = !isProduction && (process.env.ENABLE_PAYMENT_SIMULATION !== 'false');

    // Safe public config (never leak Secret Key or Private Key to client)
    res.json({
      gatewayName: 'ArtoPay (Official Gateway)',
      environment: config.environment,
      baseUrl: config.baseUrl,
      isConfigured: config.isConfigured,
      apiKeyAvailable: config.isConfigured,
      simulationAllowed: simulationEnabled,
      isProduction
    });
  });

  // --------------------------------------------------------------------------
  // 2. CHECKOUT & SERVER-SIDE CALCULATION ENGINE (TAHAP 1.4 & 1.5)
  // --------------------------------------------------------------------------
  app.post('/api/orders/checkout', async (req: Request, res: Response) => {
    try {
      const {
        items,
        customerName,
        customerPhone,
        customerEmail,
        deliveryAddress,
        customerProvince,
        customerCity,
        customerDistrict,
        customerPostalCode,
        deliveryNotes,
        referralCode,
        affiliateCommission,
        clientCatalogProducts,
        storeConfig: clientStoreConfig
      } = req.body;

      if (!customerName || !customerPhone || !deliveryAddress || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Data pemesanan tidak lengkap (Nama, WhatsApp, Alamat, dan Produk wajib diisi).'
        });
      }

      // 1. Fetch live products from database or fallback catalog
      let catalogProducts: Product[] = [];
      if (supabase) {
        try {
          const { data, error } = await supabase.from('products').select('*');
          if (!error && data && data.length > 0) {
            catalogProducts = data.map((d: any) => ({
              id: d.id,
              sku: d.sku,
              name: d.name,
              description: d.description || '',
              categoryId: d.category_id,
              subcategoryId: d.subcategory_id || undefined,
              price: Number(d.price),
              stock: Number(d.stock),
              images: d.images || [],
              unit: d.unit || 'pcs',
              isActive: d.is_active,
              variations: d.variations || [],
              createdAt: d.created_at,
              updatedAt: d.updated_at
            }));
          }
        } catch (dbErr) {
          console.warn('[Server] Supabase product fetch error:', dbErr);
        }
      }

      if (catalogProducts.length === 0 && Array.isArray(clientCatalogProducts) && clientCatalogProducts.length > 0) {
        catalogProducts = clientCatalogProducts;
      } else if (catalogProducts.length === 0) {
        catalogProducts = initialProducts;
      }

      // Store configuration
      const activeStoreConfig: StoreConfig = clientStoreConfig || initialStoreConfig;

      // Calculate provisional subtotal to obtain base amount for concurrency reservation
      let provisionalSubtotal = 0;
      for (const it of items) {
        const prod = catalogProducts.find(p => p.id === it.productId);
        if (!prod) {
          return res.status(400).json({
            success: false,
            error: `Produk dengan ID ${it.productId} tidak ditemukan di katalog toko.`
          });
        }
        let price = prod.price;
        if (it.selectedOptionId && prod.variations && prod.variations.length > 0) {
          const opt = prod.variations[0].options.find(o => o.id === it.selectedOptionId);
          if (opt) price += (opt.priceDelta || 0);
        }
        provisionalSubtotal += price * (Number(it.quantity) || 1);
      }

      const shippingCost = activeStoreConfig.airFreightDeliveryFee ?? activeStoreConfig.defaultDeliveryFee ?? 15000;
      const serviceFee = activeStoreConfig.serviceFee || 0;
      const baseAmount = provisionalSubtotal + shippingCost + serviceFee;

      // Concurrency-safe reservation of unique code Rp 1 - Rp 200
      const reservation = reserveUniqueCodeForBaseAmount(baseAmount);
      let reservationCommitted = false;

      try {
        // 2. Perform definitive server-side calculation with reserved unique code
        const calculation = calculateOrderBackend({
          items,
          storeConfig: activeStoreConfig,
          catalogProducts,
          activeOrders: getAllOrdersFromStore(),
          uniqueCode: reservation.uniqueCode
        });

        const now = new Date();
        const orderNumber = `TS-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${Math.floor(100 + Math.random() * 900)}`;
        const orderId = `ord_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

        // 3. Backend Referral Attribution & Commission Calculation (Requirement 2)
        // Never accept or trust client-provided commission values!
        let validatedReferralCode: string | undefined = undefined;
        let calculatedAffiliateCommission: OrderAffiliateSnapshot | undefined = undefined;

        if (referralCode && String(referralCode).trim()) {
          const cleanRef = String(referralCode).trim().toUpperCase();
          let approvedAffiliate: any = null;

          if (supabase) {
            try {
              const { data: affData } = await supabase
                .from('affiliate_applications')
                .select('*')
                .or(`referral_code.eq.${cleanRef},id.eq.${cleanRef}`)
                .eq('status', 'APPROVED')
                .single();
              if (affData) {
                approvedAffiliate = {
                  id: affData.id,
                  fullName: affData.full_name,
                  referralCode: affData.referral_code
                };
              }
            } catch (affErr) {
              console.warn('[Server] Supabase affiliate lookup warning:', affErr);
            }
          }

          if (!approvedAffiliate) {
            const localAff = getAffiliateFromStore(cleanRef);
            if (localAff && localAff.status === 'APPROVED') {
              approvedAffiliate = {
                id: localAff.id,
                fullName: localAff.fullName,
                referralCode: localAff.referralCode
              };
            }
          }

          if (approvedAffiliate) {
            validatedReferralCode = approvedAffiliate.referralCode;

            // Fetch live campaigns for accurate backend calculation
            let liveCampaigns: any[] = [];
            if (supabase) {
              try {
                const { data: campData } = await supabase.from('affiliate_campaigns').select('*');
                if (campData) {
                  liveCampaigns = campData.map((c: any) => ({
                    id: c.id,
                    name: c.name,
                    description: c.description,
                    productIds: c.product_ids || [],
                    commissionRate: Number(c.commission_rate),
                    startDate: c.start_date,
                    endDate: c.end_date,
                    status: c.status,
                    budgetLimit: c.budget_limit !== null ? Number(c.budget_limit) : undefined,
                    maxOrders: c.max_orders !== null ? Number(c.max_orders) : undefined
                  }));
                }
              } catch {}
            }

            calculatedAffiliateCommission = calculateOrderAffiliateCommission(
              calculation.orderItems,
              validatedReferralCode,
              activeStoreConfig,
              catalogProducts,
              liveCampaigns,
              approvedAffiliate,
              getAllOrdersFromStore()
            );
            // Strictly enforce initial status as PENDING (can only become APPROVED upon verified payment)
            calculatedAffiliateCommission.status = 'PENDING';
          } else {
            console.warn(`[Server] Referral code "${cleanRef}" is invalid or not approved. Ignoring referral attribution.`);
          }
        }

        // Assemble validated Order object
        const newOrder: Order = {
          id: orderId,
          orderNumber,
          customerName: String(customerName).trim(),
          customerPhone: String(customerPhone).trim(),
          customerEmail: customerEmail ? String(customerEmail).trim() : undefined,
          deliveryAddress: String(deliveryAddress).trim(),
          customerProvince: customerProvince ? String(customerProvince).trim() : 'Jawa Timur',
          customerCity: customerCity ? String(customerCity).trim() : 'Kabupaten Malang',
          customerDistrict: customerDistrict ? String(customerDistrict).trim() : 'Kecamatan Tumpang',
          customerPostalCode: customerPostalCode ? String(customerPostalCode).trim() : '65156',
          deliveryNotes: deliveryNotes ? String(deliveryNotes).trim() : undefined,
          shippingMethod: 'AIR_REGULAR',
          shippingCost: calculation.shippingCost,
          estimatedAirDeliveryDays: calculation.estimatedAirDeliveryDays,
          shippingCarrier: 'Kargo Udara Reguler',
          items: calculation.orderItems,
          subtotal: calculation.subtotal,
          serviceFee: calculation.serviceFee,
          uniqueCode: calculation.uniqueCode,
          total: calculation.total,
          paymentStatus: 'PENDING',
          orderStatus: 'NEW',
          paymentMethod: 'ARTOPAY_LINK',
          paymentGateway: 'ARTOPAY',
          paymentExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          referralCode: validatedReferralCode,
          affiliateCommission: calculatedAffiliateCommission,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString()
        };

        // 4. Connect to ArtoPay Official Payment Link (/v1.0/payment-link)
        const artoPayResult = await createArtoPayPaymentLink(newOrder);

        if (artoPayResult.success && artoPayResult.paymentLinkUrl) {
          newOrder.artopayPaymentId = artoPayResult.paymentLinkId;
          newOrder.paymentLinkUrl = artoPayResult.paymentLinkUrl;
          newOrder.paymentReference = artoPayResult.paymentLinkId || `PL-${newOrder.orderNumber}`;
        } else {
          newOrder.paymentReference = `PENDING-${newOrder.orderNumber}`;
        }

        // 5. Save order permanently in store and commit reservation
        saveOrderToStore(newOrder);
        reservation.commitReservation();
        reservationCommitted = true;

        // 6. Save order to Supabase if connected
        if (supabase) {
          try {
            await supabase.from('orders').upsert({
              id: newOrder.id,
              order_number: newOrder.orderNumber,
              customer_name: newOrder.customerName,
              customer_phone: newOrder.customerPhone,
              customer_email: newOrder.customerEmail,
              delivery_address: newOrder.deliveryAddress,
              customer_district: newOrder.customerDistrict,
              delivery_notes: newOrder.deliveryNotes,
              shipping_method: newOrder.shippingMethod,
              shipping_cost: newOrder.shippingCost,
              items: newOrder.items,
              subtotal: newOrder.subtotal,
              service_fee: newOrder.serviceFee,
              total: newOrder.total,
              unique_code: newOrder.uniqueCode,
              payment_status: newOrder.paymentStatus,
              order_status: newOrder.orderStatus,
              payment_method: newOrder.paymentMethod,
              payment_gateway: newOrder.paymentGateway,
              payment_link_url: newOrder.paymentLinkUrl,
              payment_reference: newOrder.paymentReference,
              artopay_payment_id: newOrder.artopayPaymentId,
              referral_code: newOrder.referralCode || null,
              affiliate_commission: newOrder.affiliateCommission || null,
              payment_expires_at: newOrder.paymentExpiresAt,
              created_at: newOrder.createdAt,
              updated_at: newOrder.updatedAt
            });
          } catch (dbSaveErr) {
            console.warn('[Server] Supabase order upsert warning:', dbSaveErr);
          }
        }

        res.status(201).json({
          success: true,
          order: newOrder,
          paymentLinkUrl: newOrder.paymentLinkUrl,
          uniqueCode: newOrder.uniqueCode,
          total: newOrder.total,
          gatewayStatus: artoPayResult.gatewayStatus,
          message: artoPayResult.message
        });
      } finally {
        if (!reservationCommitted) {
          reservation.releaseReservation();
        }
      }
    } catch (err: any) {
      console.error('[Server] Checkout processing error:', err);
      res.status(500).json({
        success: false,
        error: err?.message || 'Gagal memproses pesanan dan perhitungan pembayaran di backend.'
      });
    }
  });

  // --------------------------------------------------------------------------
  // 3. ARTO-PAY OFFICIAL CALLBACK / WEBHOOK (TAHAP 1.7)
  // --------------------------------------------------------------------------
  app.post(['/api/payment/artopay-webhook', '/api/payment/artopay/webhook'], async (req: RawBodyRequest, res: Response) => {
    try {
      // Check all official ArtoPay signature header variants
      const signatureHeader = 
        (req.headers['x-signature'] as string) || 
        (req.headers['x-pay-signature'] as string) || 
        (req.headers['x-artopay-signature'] as string) || 
        (req.headers['webhook-signature'] as string) || 
        (req.headers['x-callback-signature'] as string) || 
        '';

      const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body));
      const config = getArtoPayConfig();

      console.log(`[ArtoPay Webhook] Received webhook callback. Signature present: ${Boolean(signatureHeader)}`);

      // 1. Signature verification using explicit webhook secret (ARTOPAY_WEBHOOK_SECRET)
      // Avoid blindly assuming pk_... is the HMAC key without explicit webhook secret setup
      const webhookSigningKey = config.webhookSecret || config.privateKey || config.secretKey;
      const isProduction = process.env.NODE_ENV === 'production' || process.env.ARTOPAY_ENV === 'production';
      
      if (isProduction && !webhookSigningKey) {
        console.error('[ArtoPay Webhook] Critical: ARTOPAY_WEBHOOK_SECRET or HMAC key missing in production environment.');
        return res.status(500).json({
          responseCode: '5000001',
          responseMessage: 'Fatal: Webhook HMAC secret not configured in production.'
        });
      }

      if (webhookSigningKey) {
        const isValidSignature = verifyArtoPayWebhookSignature(rawBody, signatureHeader, webhookSigningKey);
        if (!isValidSignature) {
          console.warn('[ArtoPay Webhook] Invalid HMAC-SHA256 signature rejection.');
          return res.status(401).json({
            responseCode: '4010000',
            responseMessage: 'Invalid HMAC signature verification.'
          });
        }
      } else if (isProduction) {
        return res.status(401).json({
          responseCode: '4010000',
          responseMessage: 'Signature verification required in production.'
        });
      } else {
        console.warn('[ArtoPay Webhook] Warning: Webhook secret not configured in dev. Testing signature bypassed only for dev.');
      }

      // 2. Validate payload structure (supports nested data or root fields)
      const payload: ArtoPayWebhookPayload = req.body;
      if (!payload) {
        return res.status(400).json({ responseCode: '4000000', responseMessage: 'Empty or invalid webhook payload.' });
      }

      const pData = payload.data || payload;
      const transactionId = pData.transactionId || (pData as any).id;
      const partnerReferenceNo = pData.partnerReferenceNo || (pData as any).orderId;
      const status = (pData.status || '').toUpperCase();
      const amount = pData.amount;
      const paidAt = pData.paidAt || payload.timestamp;

      if (!transactionId || !partnerReferenceNo || !status) {
        return res.status(400).json({ responseCode: '4000001', responseMessage: 'Missing required webhook fields (transactionId, partnerReferenceNo, status).' });
      }

      // Validate status value against official specifications
      const validStatuses = ['PAID', 'EXPIRED', 'FAILED', 'PENDING'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          responseCode: '4000002',
          responseMessage: `Invalid transaction status '${status}'. Must be one of: PAID, EXPIRED, FAILED, PENDING.`
        });
      }

      const eventKey = `${transactionId}_${status}_${partnerReferenceNo}`;

      // 3. Idempotency: prevent double processing of identical callback events
      if (isWebhookEventProcessed(eventKey)) {
        console.log(`[ArtoPay Webhook] Idempotent duplicate event ${eventKey} acknowledged without re-processing.`);
        return res.status(200).json({ responseCode: '2000000', responseMessage: 'Event already processed (idempotent).' });
      }


      // 4. Find matching order in persistent store or database
      let order = getOrderFromStore(partnerReferenceNo) || getAllOrdersFromStore().find(o => o.orderNumber === partnerReferenceNo);
      
      if (!order && supabase) {
        const { data } = await supabase.from('orders').select('*').eq('order_number', partnerReferenceNo).single();
        if (data) {
          order = {
            id: data.id,
            orderNumber: data.order_number,
            customerName: data.customer_name,
            customerPhone: data.customer_phone,
            deliveryAddress: data.delivery_address,
            customerDistrict: data.customer_district,
            shippingMethod: data.shipping_method,
            shippingCost: Number(data.shipping_cost),
            items: data.items,
            subtotal: Number(data.subtotal),
            serviceFee: Number(data.service_fee),
            total: Number(data.total),
            uniqueCode: Number(data.unique_code || 0),
            paymentStatus: data.payment_status,
            orderStatus: data.order_status,
            paymentMethod: data.payment_method,
            paymentExpiresAt: data.payment_expires_at,
            createdAt: data.created_at,
            updatedAt: data.updated_at
          };
        }
      }

      if (!order) {
        console.warn(`[ArtoPay Webhook] Order ${partnerReferenceNo} not found in system.`);
        return res.status(404).json({ responseCode: '4040000', responseMessage: `Order ${partnerReferenceNo} not found.` });
      }

      // 5. Amount verification: compare received amount with order.total
      const parsedAmount = parseFloat(amount);
      if (!isNaN(parsedAmount) && Math.abs(parsedAmount - order.total) > 1) {
        console.warn(`[ArtoPay Webhook] Amount discrepancy: received ${parsedAmount}, expected ${order.total}`);
        return res.status(400).json({ responseCode: '4000003', responseMessage: 'Amount mismatch with order total.' });
      }

      // 6. Process payment status update:
      // Separate paymentStatus from orderStatus!
      if (status === 'PAID') {
        order.paymentStatus = 'PAID';
        order.orderStatus = 'PAYMENT_VERIFIED'; // Verified by ArtoPay server-side callback
        order.paidAt = paidAt || new Date().toISOString();
        order.paymentReference = transactionId;
        order.updatedAt = new Date().toISOString();

        if (order.affiliateCommission) {
          order.affiliateCommission.status = 'APPROVED';
        }

        console.log(`[ArtoPay Webhook] Order ${order.orderNumber} successfully marked as PAID and PAYMENT_VERIFIED.`);
      } else if (status === 'EXPIRED') {
        order.paymentStatus = 'EXPIRED';
        order.orderStatus = 'CANCELLED';
        order.updatedAt = new Date().toISOString();
      } else if (status === 'FAILED') {
        order.paymentStatus = 'REJECTED';
        order.updatedAt = new Date().toISOString();
      } else if (status === 'PENDING') {
        order.updatedAt = new Date().toISOString();
      }

      // Save updated order permanently and record event idempotency
      saveOrderToStore(order);
      markWebhookEventProcessed(eventKey);

      if (supabase) {
        await supabase.from('orders').update({
          payment_status: order.paymentStatus,
          order_status: order.orderStatus,
          paid_at: order.paidAt,
          payment_reference: order.paymentReference,
          affiliate_commission: order.affiliateCommission || null,
          updated_at: order.updatedAt
        }).eq('order_number', order.orderNumber);
      }

      return res.status(200).json({
        responseCode: '2000000',
        responseMessage: 'Callback processed successfully.'
      });
    } catch (err: any) {
      console.error('[ArtoPay Webhook] Error processing callback:', err);
      return res.status(500).json({ responseCode: '5000000', responseMessage: 'Internal server error processing callback.' });
    }
  });

  // --------------------------------------------------------------------------
  // 3b. ARTO-PAY PAYMENT LINK MANAGEMENT (TAHAP 1.1 & 1.2)
  // --------------------------------------------------------------------------
  app.get('/api/payment/artopay/link/:id', async (req: Request, res: Response) => {
    try {
      const result = await getArtoPayPaymentLinkDetail(req.params.id);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to fetch link detail' });
    }
  });

  app.post('/api/payment/artopay/link/:id/cancel', async (req: Request, res: Response) => {
    try {
      const result = await cancelArtoPayPaymentLink(req.params.id);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to cancel payment link' });
    }
  });

  app.post('/api/payment/artopay/generate-link', async (req: Request, res: Response) => {
    try {
      const { orderId } = req.body;
      let order = getOrderFromStore(orderId) || getAllOrdersFromStore().find(o => o.orderNumber === orderId);
      if (!order && supabase) {
        const { data } = await supabase.from('orders').select('*').or(`id.eq.${orderId},order_number.eq.${orderId}`).single();
        if (data) {
          order = {
            id: data.id,
            orderNumber: data.order_number,
            customerName: data.customer_name,
            customerPhone: data.customer_phone,
            customerEmail: data.customer_email,
            deliveryAddress: data.delivery_address,
            customerDistrict: data.customer_district,
            shippingMethod: data.shipping_method,
            shippingCost: Number(data.shipping_cost),
            items: data.items,
            subtotal: Number(data.subtotal),
            serviceFee: Number(data.service_fee),
            total: Number(data.total),
            uniqueCode: Number(data.unique_code || 0),
            paymentStatus: data.payment_status,
            orderStatus: data.order_status,
            paymentMethod: data.payment_method,
            paymentExpiresAt: data.payment_expires_at,
            createdAt: data.created_at,
            updatedAt: data.updated_at
          };
        }
      }

      if (!order) {
        return res.status(404).json({ success: false, error: 'Pesanan tidak ditemukan.' });
      }

      const result = await createArtoPayPaymentLink(order);
      if (result.success && result.paymentLinkUrl) {
        order.paymentLinkUrl = result.paymentLinkUrl;
        order.paymentReference = result.paymentLinkId;
        order.artopayPaymentId = result.paymentLinkId;
        saveOrderToStore(order);

        if (supabase) {
          await supabase.from('orders').update({
            payment_link_url: order.paymentLinkUrl,
            payment_reference: order.paymentReference,
            artopay_payment_id: order.artopayPaymentId
          }).eq('id', order.id);
        }
      }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Gagal membuat payment link ArtoPay.' });
    }
  });

  // --------------------------------------------------------------------------
  // 4. DEVELOPMENT SIMULATION ENDPOINT (TAHAP 2)
  // --------------------------------------------------------------------------
  app.post('/api/payment/simulate-success', async (req: Request, res: Response) => {
    try {
      // 1. Strict server-side production guard
      // Cannot be overridden by any parameter or header from frontend
      const isProduction = process.env.NODE_ENV === 'production' || process.env.ARTOPAY_ENV === 'production';
      if (isProduction || process.env.ENABLE_PAYMENT_SIMULATION === 'false') {
        return res.status(403).json({
          success: false,
          error: 'Simulasi pembayaran dinonaktifkan di lingkungan production. Hanya tersedia untuk pengujian di development/test mode.'
        });
      }

      const { orderId, orderNumber, expectedAmount } = req.body;
      if (!orderId && !orderNumber) {
        return res.status(400).json({ success: false, error: 'Order ID atau Order Number wajib disertakan.' });
      }

      // 2. Find order in persistent store or DB
      let order = getOrderFromStore(orderId || '') || getOrderFromStore(orderNumber || '') || getAllOrdersFromStore().find(o => o.orderNumber === orderNumber);
      if (!order && supabase) {
        const query = orderId ? supabase.from('orders').select('*').eq('id', orderId) : supabase.from('orders').select('*').eq('order_number', orderNumber);
        const { data } = await query.single();
        if (data) {
          order = {
            id: data.id,
            orderNumber: data.order_number,
            customerName: data.customer_name,
            customerPhone: data.customer_phone,
            deliveryAddress: data.delivery_address,
            customerDistrict: data.customer_district,
            shippingMethod: data.shipping_method,
            shippingCost: Number(data.shipping_cost),
            items: data.items,
            subtotal: Number(data.subtotal),
            serviceFee: Number(data.service_fee),
            total: Number(data.total),
            uniqueCode: Number(data.unique_code || 0),
            paymentStatus: data.payment_status,
            orderStatus: data.order_status,
            paymentMethod: data.payment_method,
            paymentExpiresAt: data.payment_expires_at,
            createdAt: data.created_at,
            updatedAt: data.updated_at
          };
        }
      }

      if (!order) {
        return res.status(404).json({ success: false, error: 'Pesanan uji coba tidak ditemukan di sistem.' });
      }

      // Guard: Never simulate a live production transaction
      if (order.isProductionTransaction || (order.paymentGateway === 'ARTOPAY' && order.artopayPaymentId && !order.artopayPaymentId.startsWith('test_') && process.env.ARTOPAY_ENV === 'production')) {
        return res.status(403).json({
          success: false,
          error: 'Pesanan production tidak dapat disimulasikan sebagai pembayaran uji coba.'
        });
      }

      // 3. Verify amount
      if (expectedAmount !== undefined && Math.abs(Number(expectedAmount) - order.total) > 1) {
        return res.status(400).json({
          success: false,
          error: `Nominal yang diharapkan (Rp ${expectedAmount}) tidak sesuai dengan total pesanan (Rp ${order.total}).`
        });
      }

      // 4. Idempotency: Check if already paid
      if (order.paymentStatus === 'PAID') {
        return res.json({
          success: true,
          alreadyPaid: true,
          order,
          message: `Pesanan #${order.orderNumber} sudah berstatus PAID sebelumnya.`
        });
      }

      // 5. Mark order strictly as SIMULATED / TEST transaction
      const simulatedPaidAt = new Date().toISOString();
      order.paymentStatus = 'PAID';
      order.orderStatus = 'PAYMENT_VERIFIED';
      order.paymentGateway = 'ARTOPAY_SIMULATION';
      order.isTestTransaction = true;
      order.simulationNote = `Simulasi pengujian pembayaran dev berhasil via backend (${simulatedPaidAt})`;
      order.paidAt = simulatedPaidAt;
      order.paymentReference = `SIM-ARTOPAY-${Date.now()}`;
      order.updatedAt = simulatedPaidAt;

      if (order.affiliateCommission) {
        order.affiliateCommission.status = 'APPROVED';
      }

      // Save updated order permanently
      saveOrderToStore(order);

      if (supabase) {
        try {
          await supabase.from('orders').update({
            payment_status: 'PAID',
            order_status: 'PAYMENT_VERIFIED',
            payment_gateway: 'ARTOPAY_SIMULATION',
            is_test_transaction: true,
            simulation_note: order.simulationNote,
            payment_reference: order.paymentReference,
            paid_at: order.paidAt,
            updated_at: order.updatedAt
          }).eq('id', order.id);
        } catch (dbErr) {
          console.warn('[Server] Supabase update warning on simulation:', dbErr);
        }
      }

      console.log(`[Simulated Payment] Order #${order.orderNumber} successfully simulated as PAID (TEST).`);

      return res.json({
        success: true,
        order,
        isSimulation: true,
        message: `Simulasi pembayaran berhasil! Pesanan #${order.orderNumber} telah diverifikasi sebagai pembayaran uji coba (SIMULATED/TEST).`
      });
    } catch (err: any) {
      console.error('[Server] Simulation error:', err);
      res.status(500).json({ success: false, error: err?.message || 'Gagal memproses simulasi pembayaran.' });
    }
  });

  // --------------------------------------------------------------------------
  // 5. GET ORDER BY ID / NUMBER
  // --------------------------------------------------------------------------
  app.get('/api/orders/:id', async (req: Request, res: Response) => {
    const id = req.params.id;
    let order = getOrderFromStore(id) || getAllOrdersFromStore().find(o => o.orderNumber === id);

    if (!order && supabase) {
      const { data } = await supabase.from('orders').select('*').or(`id.eq.${id},order_number.eq.${id}`).single();
      if (data) {
        order = {
          id: data.id,
          orderNumber: data.order_number,
          customerName: data.customer_name,
          customerPhone: data.customer_phone,
          customerEmail: data.customer_email,
          deliveryAddress: data.delivery_address,
          customerDistrict: data.customer_district,
          shippingMethod: data.shipping_method,
          shippingCost: Number(data.shipping_cost),
          items: data.items,
          subtotal: Number(data.subtotal),
          serviceFee: Number(data.service_fee),
          total: Number(data.total),
          uniqueCode: Number(data.unique_code || 0),
          paymentStatus: data.payment_status,
          orderStatus: data.order_status,
          paymentMethod: data.payment_method,
          paymentGateway: data.payment_gateway,
          paymentLinkUrl: data.payment_link_url,
          paymentReference: data.payment_reference,
          artopayPaymentId: data.artopay_payment_id,
          isTestTransaction: Boolean(data.is_test_transaction),
          simulationNote: data.simulation_note,
          paidAt: data.paid_at,
          paymentExpiresAt: data.payment_expires_at,
          createdAt: data.created_at,
          updatedAt: data.updated_at
        };
      }
    }

    if (!order) {
      return res.status(404).json({ success: false, error: 'Pesanan tidak ditemukan.' });
    }

    res.json({ success: true, order });
  });

  // --------------------------------------------------------------------------
  // 5b. AFFILIATE AUTHENTICATION & SECURE METRICS ENDPOINTS (SCRYPT & SECURE SESSIONS)
  // --------------------------------------------------------------------------
  app.post('/api/affiliates/register', async (req: Request, res: Response) => {
    try {
      const { fullName, phone, email, password, promotionChannel, notes } = req.body;
      if (!fullName || !phone || !email || !password || password.length < 6) {
        return res.status(400).json({
          success: false,
          error: 'Nama lengkap, WhatsApp, email, dan kata sandi (minimal 6 karakter) wajib diisi.'
        });
      }

      const cleanName = fullName.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
      const randomSuffix = Math.floor(10 + Math.random() * 90);
      const referralCode = `TS-${cleanName || 'MITRA'}${randomSuffix}`;

      // 1. Password Security: Modern scrypt KDF with cryptographically random salt (OWASP Recommended)
      const passwordHash = await hashPasswordScrypt(password);

      const newAffiliate: AffiliateApplication = {
        id: `aff_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        fullName: String(fullName).trim(),
        phone: String(phone).trim(),
        email: String(email).trim().toLowerCase(),
        promotionChannel: promotionChannel || 'Status WhatsApp & Grup',
        notes: notes ? String(notes).trim() : undefined,
        status: 'APPROVED',
        referralCode,
        passwordHash,
        createdAt: new Date().toISOString()
      };

      // Save to server persistent cache
      saveAffiliateToStore(newAffiliate);

      if (supabase) {
        try {
          await supabase.from('affiliate_applications').upsert({
            id: newAffiliate.id,
            full_name: newAffiliate.fullName,
            phone: newAffiliate.phone,
            email: newAffiliate.email,
            promotion_channel: newAffiliate.promotionChannel,
            notes: newAffiliate.notes,
            status: newAffiliate.status,
            referral_code: newAffiliate.referralCode,
            password_hash: newAffiliate.passwordHash,
            created_at: newAffiliate.createdAt
          });
        } catch (dbErr) {
          console.warn('[Server] Supabase affiliate upsert warning:', dbErr);
        }
      }

      // Generate cryptographically signed session token (7-day validity)
      const session = createSessionToken({
        sub: newAffiliate.id,
        role: 'affiliate',
        email: newAffiliate.email,
        referralCode: newAffiliate.referralCode,
        fullName: newAffiliate.fullName
      });

      // Safe response without exposing passwordHash
      const { passwordHash: _, ...safeAffiliate } = newAffiliate;
      res.status(201).json({
        success: true,
        affiliate: safeAffiliate,
        token: session.token,
        expiresAt: session.expiresAt
      });
    } catch (err: any) {
      console.error('[Server] Affiliate registration error:', err);
      res.status(500).json({ success: false, error: err?.message || 'Gagal mendaftarkan mitra affiliate.' });
    }
  });

  app.post('/api/affiliates/login', async (req: Request, res: Response) => {
    try {
      const { loginInput, password } = req.body;
      if (!loginInput || !password) {
        return res.status(400).json({ success: false, error: 'Identitas (Kode/Email/WA) dan kata sandi wajib diisi.' });
      }

      const query = String(loginInput).trim().toUpperCase();
      let matched: any = null;

      if (supabase) {
        try {
          const { data } = await supabase
            .from('affiliate_applications')
            .select('*')
            .or(`referral_code.eq.${query},email.eq.${query.toLowerCase()},phone.eq.${query}`)
            .single();
          if (data) {
            matched = {
              id: data.id,
              fullName: data.full_name,
              phone: data.phone,
              email: data.email,
              promotionChannel: data.promotion_channel,
              status: data.status,
              referralCode: data.referral_code,
              passwordHash: data.password_hash,
              createdAt: data.created_at
            };
          }
        } catch {}
      }

      if (!matched) {
        matched = getAffiliateFromStore(query);
      }

      if (!matched) {
        return res.status(404).json({ success: false, error: 'Akun mitra tidak ditemukan.' });
      }

      if (matched.status !== 'APPROVED') {
        return res.status(403).json({ success: false, error: `Akun mitra berstatus ${matched.status} dan belum aktif.` });
      }

      // Password Verification with Auto-Migration Strategy (scrypt + legacy SHA-256)
      const { valid, needsRehash } = await verifyPassword(password, matched.passwordHash);
      if (!valid) {
        return res.status(401).json({ success: false, error: 'Kata sandi salah. Akses ditolak untuk menjaga keamanan akun mitra.' });
      }

      // If legacy hash matched, seamlessly upgrade stored hash to scrypt
      if (needsRehash) {
        console.log(`[Security] Upgrading affiliate ${matched.referralCode} to scrypt hash...`);
        const upgradedHash = await hashPasswordScrypt(password);
        matched.passwordHash = upgradedHash;
        saveAffiliateToStore(matched);
        if (supabase) {
          try {
            await supabase.from('affiliate_applications').update({ password_hash: upgradedHash }).eq('id', matched.id);
          } catch {}
        }
      }

      // Cryptographically signed session token (7 days validity)
      const session = createSessionToken({
        sub: matched.id,
        role: 'affiliate',
        email: matched.email,
        referralCode: matched.referralCode,
        fullName: matched.fullName
      });

      const { passwordHash: _, ...safeAffiliate } = matched;
      res.json({
        success: true,
        affiliate: safeAffiliate,
        token: session.token,
        expiresAt: session.expiresAt
      });
    } catch (err: any) {
      console.error('[Server] Affiliate login error:', err);
      res.status(500).json({ success: false, error: err?.message || 'Gagal memproses login affiliate.' });
    }
  });

  // Verify and fetch session data for logged-in affiliate
  app.get('/api/affiliates/session', async (req: Request, res: Response) => {
    try {
      const token = extractBearerToken(req);
      if (!token) {
        return res.status(401).json({ success: false, error: 'Token sesi tidak ditemukan.' });
      }

      const verified = verifySessionToken(token);
      if (!verified.valid || !verified.payload || verified.payload.role !== 'affiliate') {
        return res.status(401).json({
          success: false,
          error: verified.error === 'EXPIRED' ? 'Sesi affiliate telah kedaluwarsa. Silakan masuk kembali.' : 'Token sesi tidak valid.'
        });
      }

      const affiliate = getAffiliateFromStore(verified.payload.sub) || 
                        getAffiliateFromStore(verified.payload.referralCode || '');

      res.json({
        success: true,
        session: verified.payload,
        affiliate: affiliate ? (({ passwordHash, ...rest }) => rest)(affiliate) : null
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Gagal memvalidasi sesi.' });
    }
  });

  // Server-authoritative performance metrics calculation
  app.get('/api/affiliates/metrics/:referralCode', async (req: Request, res: Response) => {
    try {
      const code = req.params.referralCode.trim().toUpperCase();
      const allOrders = getAllOrdersFromStore();
      const allPayouts = getPayoutsFromStore(code);
      const metrics = getAffiliatePerformanceMetrics(code, allOrders, undefined, allPayouts);
      res.json({ success: true, metrics });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Gagal menghitung performa affiliate.' });
    }
  });

  // Protected payout request endpoint (Backend validates balance strictly)
  app.post('/api/affiliates/payouts', async (req: Request, res: Response) => {
    try {
      const token = extractBearerToken(req);
      if (!token) {
        return res.status(401).json({ success: false, error: 'Autentikasi sesi affiliate diperlukan untuk meminta penarikan komisi.' });
      }

      const verified = verifySessionToken(token);
      if (!verified.valid || !verified.payload || verified.payload.role !== 'affiliate') {
        return res.status(401).json({ success: false, error: 'Sesi tidak valid atau telah berakhir.' });
      }

      const { referralCode, amount, bankName, accountNumber, accountName } = req.body;
      const cleanCode = String(referralCode || verified.payload.referralCode).trim().toUpperCase();

      // Authorization guard: Affiliate can only request payout for their own referral code
      if (verified.payload.referralCode && verified.payload.referralCode.toUpperCase() !== cleanCode) {
        return res.status(403).json({ success: false, error: 'Akses ditolak: Tidak dapat menarik saldo mitra lain.' });
      }

      const payoutAmount = Number(amount);
      if (!payoutAmount || payoutAmount < 50000) {
        return res.status(400).json({ success: false, error: 'Nominal penarikan komisi minimal adalah Rp 50.000.' });
      }

      if (!bankName || !accountNumber || !accountName) {
        return res.status(400).json({ success: false, error: 'Nama bank, nomor rekening, dan nama pemilik rekening wajib diisi.' });
      }

      // Backend balance verification (ANTI-TAMPERING)
      const allOrders = getAllOrdersFromStore();
      const currentPayouts = getPayoutsFromStore(cleanCode);
      const metrics = getAffiliatePerformanceMetrics(cleanCode, allOrders, undefined, currentPayouts);

      if (payoutAmount > metrics.availableBalanceForPayout) {
        return res.status(400).json({
          success: false,
          error: `Saldo tidak mencukupi. Saldo tersedia yang dapat ditarik: Rp ${metrics.availableBalanceForPayout.toLocaleString('id-ID')}`
        });
      }

      const newPayout: AffiliatePayoutRequest = {
        id: `pay_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        affiliateId: verified.payload.sub,
        referralCode: cleanCode,
        amount: payoutAmount,
        bankName: String(bankName).trim(),
        accountNumber: String(accountNumber).trim(),
        accountName: String(accountName).trim(),
        status: 'PENDING',
        createdAt: new Date().toISOString()
      };

      savePayoutToStore(newPayout);

      if (supabase) {
        try {
          await supabase.from('affiliate_payouts').insert({
            id: newPayout.id,
            affiliate_id: newPayout.affiliateId,
            referral_code: newPayout.referralCode,
            amount: newPayout.amount,
            bank_name: newPayout.bankName,
            account_number: newPayout.accountNumber,
            account_name: newPayout.accountName,
            status: newPayout.status,
            created_at: newPayout.createdAt
          });
        } catch (dbErr) {
          console.warn('[Server] Supabase affiliate_payouts insert warning:', dbErr);
        }
      }

      res.status(201).json({ success: true, payout: newPayout });
    } catch (err: any) {
      console.error('[Server] Payout request error:', err);
      res.status(500).json({ success: false, error: err?.message || 'Gagal memproses pengajuan pencairan komisi.' });
    }
  });

  // Get payouts for affiliate
  app.get('/api/affiliates/payouts', async (req: Request, res: Response) => {
    try {
      const token = extractBearerToken(req);
      if (!token) {
        return res.status(401).json({ success: false, error: 'Autentikasi diperlukan.' });
      }

      const verified = verifySessionToken(token);
      if (!verified.valid || !verified.payload) {
        return res.status(401).json({ success: false, error: 'Sesi tidak valid.' });
      }

      const targetCode = verified.payload.role === 'admin' 
        ? (req.query.referralCode as string) 
        : verified.payload.referralCode;

      const payouts = getPayoutsFromStore(targetCode);
      res.json({ success: true, payouts });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Gagal memuat riwayat payout.' });
    }
  });

  // --------------------------------------------------------------------------
  // 5c. ADMIN AUTHENTICATION & SECURE SESSIONS (SCRYPT & BACKEND TOKEN)
  // --------------------------------------------------------------------------
  app.post('/api/admin/login', async (req: Request, res: Response) => {
    try {
      const { emailOrUsername, password } = req.body;
      if (!emailOrUsername || !password) {
        return res.status(400).json({ success: false, error: 'Email/username dan kata sandi admin wajib diisi.' });
      }

      const verification = await verifyAdminCredentials(emailOrUsername, password);
      if (!verification.valid) {
        return res.status(401).json({
          success: false,
          error: 'Identitas administrator atau kata sandi tidak valid. Akses ditolak.'
        });
      }

      // Issue signed session token for admin (24-hour expiration)
      const session = createSessionToken({
        sub: 'admin_primary',
        role: 'admin',
        email: verification.email,
        fullName: verification.fullName
      }, 24 * 60 * 60);

      const adminUser = {
        id: 'admin_primary',
        email: verification.email,
        fullName: verification.fullName,
        role: 'admin' as const
      };

      res.json({
        success: true,
        user: adminUser,
        token: session.token,
        expiresAt: session.expiresAt
      });
    } catch (err: any) {
      console.error('[Server] Admin login error:', err);
      res.status(500).json({ success: false, error: err?.message || 'Gagal memproses autentikasi admin.' });
    }
  });

  // Verify and fetch session data for logged-in admin
  app.get('/api/admin/session', async (req: Request, res: Response) => {
    try {
      const token = extractBearerToken(req);
      if (!token) {
        return res.status(401).json({ success: false, error: 'Token sesi administrator tidak ditemukan.' });
      }

      const verified = verifySessionToken(token);
      if (!verified.valid || !verified.payload || verified.payload.role !== 'admin') {
        return res.status(401).json({
          success: false,
          error: verified.error === 'EXPIRED' ? 'Sesi admin telah kedaluwarsa. Silakan masuk kembali.' : 'Token sesi admin tidak valid.'
        });
      }

      res.json({
        success: true,
        user: {
          id: verified.payload.sub,
          email: verified.payload.email,
          fullName: verified.payload.fullName || 'Pengelola Tumpang Shop',
          role: 'admin'
        },
        expiresAt: new Date(verified.payload.exp * 1000).toISOString()
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Gagal memvalidasi sesi admin.' });
    }
  });

  // Admin: Update payout status
  app.post('/api/admin/payouts/:id/status', async (req: Request, res: Response) => {
    try {
      const token = extractBearerToken(req);
      if (!token) return res.status(401).json({ success: false, error: 'Autentikasi admin diperlukan.' });

      const verified = verifySessionToken(token);
      if (!verified.valid || verified.payload?.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Hanya administrator yang dapat mengubah status payout.' });
      }

      const { status, notes } = req.body;
      const payoutId = req.params.id;

      if (!status || !['PENDING', 'PROCESSED', 'REJECTED'].includes(status)) {
        return res.status(400).json({ success: false, error: 'Status tidak valid.' });
      }

      const updated = updatePayoutStatusInStore(payoutId, status, notes);
      if (!updated) {
        return res.status(404).json({ success: false, error: 'Pengajuan payout tidak ditemukan.' });
      }

      if (supabase) {
        try {
          await supabase.from('affiliate_payouts').update({
            status,
            notes,
            processed_at: updated.processedAt
          }).eq('id', payoutId);
        } catch {}
      }

      res.json({ success: true, payout: updated });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Gagal memperbarui status payout.' });
    }
  });


  // --------------------------------------------------------------------------
  // 6. DEV / PROD MIDDLEWARE
  // --------------------------------------------------------------------------
  if (isDev) {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Tumpang Shop] Server running on http://0.0.0.0:${PORT} (mode: ${process.env.NODE_ENV || 'development'})`);
  });
}

startServer().catch((err) => {
  console.error('[Tumpang Shop] Failed to start server:', err);
  process.exit(1);
});
