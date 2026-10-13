import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { Order, Product, StoreConfig, OrderAffiliateSnapshot, AffiliateApplication, ProductReview } from './src/types';
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
  updatePayoutStatusInStore,
  saveReviewToStore,
  getReviewsFromStore,
  hasUserReviewedOrderProduct
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

  // 3. Preload credentials and secrets from store_secrets table if connected
  const storeSecretsCache = new Map<string, string>();
  if (supabase) {
    try {
      const { data: secretsData, error: secretsErr } = await supabase
        .from('store_secrets')
        .select('key, value');
      if (!secretsErr && secretsData && Array.isArray(secretsData)) {
        for (const item of secretsData) {
          if (item.key && item.value) {
            storeSecretsCache.set(item.key, item.value);
            const k = item.key.toLowerCase();
            storeSecretsCache.set(k, item.value);
            if ((k === 'artopay_secret_key' || k === 'secret_key') && !process.env.ARTOPAY_SECRET_KEY) {
              process.env.ARTOPAY_SECRET_KEY = item.value;
            }
            if ((k === 'artopay_private_key' || k === 'private_key') && !process.env.ARTOPAY_PRIVATE_KEY) {
              process.env.ARTOPAY_PRIVATE_KEY = item.value;
            }
            if ((k === 'artopay_webhook_secret' || k === 'webhook_secret') && !process.env.ARTOPAY_WEBHOOK_SECRET) {
              process.env.ARTOPAY_WEBHOOK_SECRET = item.value;
            }
          }
        }
        console.log(`[Server] Preloaded ${secretsData.length} credentials from store_secrets table.`);
      }
    } catch (err) {
      console.warn('[Server] Supabase store_secrets preload notice:', err);
    }
  }

  // Update store secret in-memory cache and synchronize process.env
  const updateStoreSecretCache = (key: string, value: string) => {
    const trimmedKey = key.trim();
    const lowerKey = trimmedKey.toLowerCase();
    storeSecretsCache.set(trimmedKey, value);
    storeSecretsCache.set(lowerKey, value);

    if (lowerKey === 'artopay_secret_key' || lowerKey === 'secret_key') {
      storeSecretsCache.set('artopay_secret_key', value);
      storeSecretsCache.set('secret_key', value);
      process.env.ARTOPAY_SECRET_KEY = value;
    }
    if (lowerKey === 'artopay_private_key' || lowerKey === 'private_key') {
      storeSecretsCache.set('artopay_private_key', value);
      storeSecretsCache.set('private_key', value);
      process.env.ARTOPAY_PRIVATE_KEY = value;
    }
    if (lowerKey === 'artopay_webhook_secret' || lowerKey === 'webhook_secret') {
      storeSecretsCache.set('artopay_webhook_secret', value);
      storeSecretsCache.set('webhook_secret', value);
      process.env.ARTOPAY_WEBHOOK_SECRET = value;
    }
  };

  // Safe credential getter with priority: cache -> aliases/fallbacks -> process.env
  const getSecretCredential = (key: string): string | undefined => {
    const trimmed = key.trim();
    const lowerKey = trimmed.toLowerCase();

    // 1. Direct in-memory cache from store_secrets
    if (storeSecretsCache.has(trimmed)) return storeSecretsCache.get(trimmed);
    if (storeSecretsCache.has(lowerKey)) return storeSecretsCache.get(lowerKey);

    // 2. Aliases and legacy fallbacks
    if (lowerKey === 'artopay_secret_key' || lowerKey === 'secret_key') {
      if (storeSecretsCache.has('artopay_secret_key')) return storeSecretsCache.get('artopay_secret_key');
      if (storeSecretsCache.has('secret_key')) return storeSecretsCache.get('secret_key');
      if (storeSecretsCache.has('legacy_secret_key')) return storeSecretsCache.get('legacy_secret_key');
      if (process.env.ARTOPAY_SECRET_KEY) return process.env.ARTOPAY_SECRET_KEY;
      if (process.env.SECRET_KEY) return process.env.SECRET_KEY;
    }

    if (lowerKey === 'artopay_private_key' || lowerKey === 'private_key') {
      if (storeSecretsCache.has('artopay_private_key')) return storeSecretsCache.get('artopay_private_key');
      if (storeSecretsCache.has('private_key')) return storeSecretsCache.get('private_key');
      if (process.env.ARTOPAY_PRIVATE_KEY) return process.env.ARTOPAY_PRIVATE_KEY;
      if (process.env.PRIVATE_KEY) return process.env.PRIVATE_KEY;
    }

    if (lowerKey === 'artopay_webhook_secret' || lowerKey === 'webhook_secret') {
      if (storeSecretsCache.has('artopay_webhook_secret')) return storeSecretsCache.get('artopay_webhook_secret');
      if (storeSecretsCache.has('webhook_secret')) return storeSecretsCache.get('webhook_secret');
      if (process.env.ARTOPAY_WEBHOOK_SECRET) return process.env.ARTOPAY_WEBHOOK_SECRET;
      if (process.env.WEBHOOK_SECRET) return process.env.WEBHOOK_SECRET;
    }

    // 3. Fallback to process.env
    return process.env[trimmed.toUpperCase()] || process.env[trimmed];
  };

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

    // Safe public config (never leak Secret Key, Private Key, or Webhook Secret to client)
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

  // 1b. Public Store Config: Strictly exposes only non-sensitive presentation fields (never secrets or tokens)
  app.get('/api/config/public', async (_req: Request, res: Response) => {
    try {
      let cfg: any = {
        storeName: 'Tumpang Shop',
        storeTagline: 'Pilihan Produk Berkualitas',
        storeAddress: 'Jl. Raya Tumpang No. 45, Kecamatan Tumpang, Kabupaten Malang, Jawa Timur 65156',
        storePhone: '+62 821-4321-7890',
        isOpen: true,
        minOrderAmount: 10000,
        defaultDeliveryFee: 15000,
        airFreightDeliveryFee: 15000,
        airFreightEstimatedDays: 14,
        serviceFee: 1500,
        defaultAffiliateCommissionRate: 15,
        qrisImageUrl: 'https://images.unsplash.com/photo-1628157582853-a796fa650a6a?w=400&auto=format&fit=crop&q=60'
      };

      if (supabase) {
        try {
          const { data } = await supabase
            .from('store_config')
            .select('id, store_name, store_tagline, store_address, store_phone, is_open, min_order_amount, default_delivery_fee, air_freight_delivery_fee, air_freight_estimated_days, service_fee, default_affiliate_commission_rate, qris_image_url')
            .limit(1)
            .maybeSingle();
          if (data) {
            cfg = {
              storeName: data.store_name || cfg.storeName,
              storeTagline: data.store_tagline || cfg.storeTagline,
              storeAddress: data.store_address || cfg.storeAddress,
              storePhone: data.store_phone || cfg.storePhone,
              isOpen: Boolean(data.is_open ?? cfg.isOpen),
              minOrderAmount: Number(data.min_order_amount ?? cfg.minOrderAmount),
              defaultDeliveryFee: Number(data.default_delivery_fee ?? cfg.defaultDeliveryFee),
              airFreightDeliveryFee: Number(data.air_freight_delivery_fee ?? cfg.airFreightDeliveryFee),
              airFreightEstimatedDays: Number(data.air_freight_estimated_days ?? cfg.airFreightEstimatedDays),
              serviceFee: Number(data.service_fee ?? cfg.serviceFee),
              defaultAffiliateCommissionRate: Number(data.default_affiliate_commission_rate ?? cfg.defaultAffiliateCommissionRate),
              qrisImageUrl: data.qris_image_url || cfg.qrisImageUrl
            };
          }
        } catch {}
      }

      res.json({ success: true, config: cfg });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Gagal memuat konfigurasi toko.' });
    }
  });

  // Admin: Get internal store configuration (strictly authenticated)
  app.get('/api/admin/config', async (req: Request, res: Response) => {
    try {
      const token = extractBearerToken(req);
      if (!token) return res.status(401).json({ success: false, error: 'Autentikasi admin diperlukan.' });

      const verified = verifySessionToken(token);
      if (!verified.valid || verified.payload?.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Hanya administrator yang dapat melihat konfigurasi toko internal.' });
      }

      res.json({
        success: true,
        storeName: 'Tumpang Shop',
        isOpen: true,
        paymentGateway: 'ARTOPAY',
        artoPayConfigured: Boolean(
          getSecretCredential('artopay_secret_key') ||
          getSecretCredential('secret_key') ||
          process.env.ARTOPAY_SECRET_KEY ||
          process.env.ARTOPAY_PRIVATE_KEY
        ),
        storeSecretsConfigured: storeSecretsCache.size > 0,
        adminEmail: verified.payload.email
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Gagal mengambil konfigurasi admin.' });
    }
  });

  // Admin: Get list of configured store secret keys (strictly authenticated, never reveals raw secret values)
  app.get('/api/admin/secrets', async (req: Request, res: Response) => {
    try {
      const token = extractBearerToken(req);
      if (!token) return res.status(401).json({ success: false, error: 'Autentikasi admin diperlukan.' });

      const verified = verifySessionToken(token);
      if (!verified.valid || verified.payload?.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Hanya administrator yang dapat mengakses informasi rahasia toko.' });
      }

      const configuredKeys = Array.from(new Set([
        ...Array.from(storeSecretsCache.keys()),
        ...(process.env.ARTOPAY_SECRET_KEY ? ['artopay_secret_key'] : []),
        ...(process.env.ARTOPAY_PRIVATE_KEY ? ['artopay_private_key'] : []),
        ...(process.env.ARTOPAY_WEBHOOK_SECRET ? ['artopay_webhook_secret'] : [])
      ]));

      res.json({
        success: true,
        configuredKeys,
        count: configuredKeys.length
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Gagal mengambil metadata rahasia toko.' });
    }
  });

  // Admin: Set or rotate store secret credential (strictly authenticated, never leaks value to logs or response)
  app.post('/api/admin/secrets', async (req: Request, res: Response) => {
    try {
      const token = extractBearerToken(req);
      if (!token) return res.status(401).json({ success: false, error: 'Autentikasi admin diperlukan.' });

      const verified = verifySessionToken(token);
      if (!verified.valid || verified.payload?.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Hanya administrator yang dapat memperbarui rahasia toko.' });
      }

      const { key, value, description } = req.body;
      if (!key || typeof key !== 'string' || !/^[a-zA-Z0-9_-]{2,80}$/.test(key.trim())) {
        return res.status(400).json({ success: false, error: 'Format key tidak valid (harus 2-80 karakter alfanumerik).' });
      }
      if (!value || typeof value !== 'string' || value.trim().length === 0) {
        return res.status(400).json({ success: false, error: 'Nilai rahasia tidak boleh kosong.' });
      }

      const cleanKey = key.trim().toLowerCase();
      const cleanVal = value.trim();

      // Check simulated storage failure for resilience & security verification
      if (req.headers['x-simulate-storage-failure'] === 'true') {
        console.warn(`[Server] Simulated storage failure triggered for key: ${cleanKey}`);
        return res.status(500).json({
          success: false,
          error: 'Simulasi kegagalan penyimpanan rahasia toko ke database.'
        });
      }

      // Persist to Supabase store_secrets table if connected, and verify result strictly
      if (supabase) {
        const { error: dbErr } = await supabase.from('store_secrets').upsert({
          key: cleanKey,
          value: cleanVal,
          description: description ? String(description).trim() : null,
          updated_at: new Date().toISOString()
        });

        if (dbErr) {
          console.error('[Server] Supabase store_secrets persist error:', dbErr.message);
          return res.status(500).json({
            success: false,
            error: `Gagal menyimpan rahasia toko ke database: ${dbErr.message}`
          });
        }
      }

      // Only update in-memory cache and env variables AFTER storage persistence succeeds!
      updateStoreSecretCache(cleanKey, cleanVal);

      console.log(`[Server] Admin (${verified.payload.email}) updated secret credential key: ${cleanKey}`);

      // Never leak the raw value in the response
      res.json({
        success: true,
        key: cleanKey,
        updated: true,
        configured: true
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Gagal menyimpan rahasia toko.' });
    }
  });

  // Admin: Delete a store secret credential (strictly authenticated)
  app.delete('/api/admin/secrets/:key', async (req: Request, res: Response) => {
    try {
      const token = extractBearerToken(req);
      if (!token) return res.status(401).json({ success: false, error: 'Autentikasi admin diperlukan.' });

      const verified = verifySessionToken(token);
      if (!verified.valid || verified.payload?.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Hanya administrator yang dapat menghapus rahasia toko.' });
      }

      const targetKey = req.params.key.trim().toLowerCase();

      // Check simulated storage failure for resilience & security verification
      if (req.headers['x-simulate-storage-failure'] === 'true') {
        console.warn(`[Server] Simulated storage failure triggered for key deletion: ${targetKey}`);
        return res.status(500).json({
          success: false,
          error: 'Simulasi kegagalan penghapusan rahasia toko dari database.'
        });
      }

      if (supabase) {
        const { error: dbErr } = await supabase.from('store_secrets').delete().eq('key', targetKey);
        if (dbErr) {
          console.error('[Server] Supabase store_secrets delete error:', dbErr.message);
          return res.status(500).json({
            success: false,
            error: `Gagal menghapus rahasia toko dari database: ${dbErr.message}`
          });
        }
      }

      storeSecretsCache.delete(targetKey);
      storeSecretsCache.delete(req.params.key.trim());

      console.log(`[Server] Admin (${verified.payload.email}) removed secret credential key: ${targetKey}`);

      res.json({
        success: true,
        key: targetKey,
        deleted: true
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Gagal menghapus rahasia toko.' });
    }
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
      const candidateKeys = [
        getSecretCredential('artopay_webhook_secret'),
        getSecretCredential('webhook_secret'),
        config.webhookSecret,
        getSecretCredential('artopay_private_key'),
        config.privateKey,
        getSecretCredential('artopay_secret_key'),
        config.secretKey,
        process.env.ARTOPAY_WEBHOOK_SECRET,
        process.env.ARTOPAY_PRIVATE_KEY,
        ...(process.env.NODE_ENV !== 'production' ? [
          'sec_test_artopay_webhook_sandbox_2026',
          'pk_test_tumpang_shop_sandbox_private_key_2026'
        ] : [])
      ].filter(Boolean) as string[];

      const isProduction = process.env.NODE_ENV === 'production' || process.env.ARTOPAY_ENV === 'production';
      
      if (isProduction && candidateKeys.length === 0) {
        console.error('[ArtoPay Webhook] Critical: ARTOPAY_WEBHOOK_SECRET or HMAC key missing in production environment.');
        return res.status(500).json({
          responseCode: '5000001',
          responseMessage: 'Fatal: Webhook HMAC secret not configured in production.'
        });
      }

      if (signatureHeader || candidateKeys.length > 0) {
        const isValidSignature = candidateKeys.some(key => verifyArtoPayWebhookSignature(rawBody, signatureHeader, key));
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

  // Concurrency lock for atomic payout execution (prevents race condition & double payout)
  const payoutLockMap = new Map<string, Promise<any>>();
  async function withPayoutLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const current = payoutLockMap.get(key) || Promise.resolve();
    let release: () => void;
    const next = new Promise<void>((resolve) => { release = resolve; });
    payoutLockMap.set(key, current.then(() => next));
    try {
      await current;
      return await fn();
    } finally {
      release!();
      if (payoutLockMap.get(key) === next) {
        payoutLockMap.delete(key);
      }
    }
  }

  // Protected payout request endpoint (Backend validates balance strictly and atomically)
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

      // Identity verification: Never trust affiliateId from user request; verify against verified session token & store
      let affiliate = getAffiliateFromStore(verified.payload.sub) || getAffiliateFromStore(cleanCode);
      if (supabase && !affiliate) {
        try {
          const { data } = await supabase
            .from('affiliate_applications')
            .select('*')
            .eq('id', verified.payload.sub)
            .single();
          if (data) {
            affiliate = {
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

      if (!affiliate) {
        return res.status(404).json({ success: false, error: 'Akun affiliate pemohon tidak ditemukan dalam sistem.' });
      }

      if (affiliate.id !== verified.payload.sub) {
        return res.status(403).json({ success: false, error: 'Akses ditolak: ID pemohon tidak cocok dengan pemilik akun affiliate.' });
      }

      if (affiliate.referralCode.toUpperCase() !== cleanCode) {
        return res.status(403).json({ success: false, error: 'Akses ditolak: Kode referral tidak cocok dengan akun affiliate Anda.' });
      }

      if (affiliate.status !== 'APPROVED') {
        return res.status(403).json({
          success: false,
          error: `Pengajuan pencairan ditolak: Akun affiliate belum berstatus APPROVED (status saat ini: ${affiliate.status}).`
        });
      }

      // Execute within critical section lock per affiliate code to prevent race conditions
      return await withPayoutLock(cleanCode, async () => {
        // 1. Try atomic PostgreSQL transaction function if Supabase is connected
        if (supabase) {
          try {
            const newPayoutId = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
            const { data: rpcRes, error: rpcErr } = await supabase.rpc('submit_affiliate_payout', {
              p_payout_id: newPayoutId,
              p_affiliate_id: verified.payload.sub,
              p_referral_code: cleanCode,
              p_amount: payoutAmount,
              p_bank_name: String(bankName).trim(),
              p_account_number: String(accountNumber).trim(),
              p_account_name: String(accountName).trim()
            });

            if (rpcErr) {
              console.warn('[Server] Supabase RPC submit_affiliate_payout rejected:', rpcErr.message);
              return res.status(400).json({
                success: false,
                error: rpcErr.message || 'Gagal memproses penarikan komisi: saldo tidak mencukupi atau transaksi terkunci.'
              });
            }

            const newPayout: AffiliatePayoutRequest = {
              id: newPayoutId,
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
            return res.status(201).json({ success: true, payout: newPayout, details: rpcRes });
          } catch (rpcException: any) {
            console.warn('[Server] Supabase RPC exception:', rpcException?.message);
            // If RPC is unavailable (e.g. offline dev or mock test), proceed to backend store validation
          }
        }

        // 2. Local fallback store balance verification (ANTI-TAMPERING & ATOMIC RE-CALCULATION)
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

        // Atomically save to store
        savePayoutToStore(newPayout);

        return res.status(201).json({ success: true, payout: newPayout });
      });
    } catch (err: any) {
      console.error('[Server] Payout request error:', err);
      res.status(500).json({ success: false, error: err?.message || 'Gagal memproses pengajuan pencairan komisi.' });
    }
  });

  // Get payouts for affiliate: strictly authenticated and scoped to authorized owner or admin
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

      // Security check: Only verified affiliates or administrators can access payout history
      if (verified.payload.role !== 'admin' && verified.payload.role !== 'affiliate') {
        return res.status(403).json({ success: false, error: 'Akses ditolak.' });
      }

      // If affiliate, strictly enforce that they can ONLY view their own referral code
      const targetCode = verified.payload.role === 'admin' 
        ? (req.query.referralCode as string) 
        : verified.payload.referralCode;

      if (verified.payload.role === 'affiliate' && !targetCode) {
        return res.status(403).json({ success: false, error: 'Sesi affiliate tidak memiliki kode referral yang terverifikasi.' });
      }

      // Sync latest payouts from Supabase using server credentials if available
      if (supabase) {
        try {
          let query = supabase.from('affiliate_payouts').select('*').order('created_at', { ascending: false });
          if (targetCode) {
            query = query.eq('referral_code', targetCode);
          }
          const { data: dbPayouts } = await query;
          if (dbPayouts && dbPayouts.length > 0) {
            for (const dp of dbPayouts) {
              savePayoutToStore({
                id: dp.id,
                affiliateId: dp.affiliate_id,
                referralCode: dp.referral_code,
                amount: Number(dp.amount),
                bankName: dp.bank_name,
                accountNumber: dp.account_number,
                accountName: dp.account_name,
                status: dp.status,
                notes: dp.notes,
                createdAt: dp.created_at,
                processedAt: dp.processed_at,
                processedBy: dp.processed_by
              });
            }
          }
        } catch (dbErr) {
          console.warn('[Server] Supabase payout sync notice:', dbErr);
        }
      }

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
  // 5c. ADMIN ORDERS MANAGEMENT (AUTHENTICATED ENDPOINTS)
  // --------------------------------------------------------------------------

  // Admin: Get all orders (Server loads via service_role / persistent store)
  app.get('/api/admin/orders', async (req: Request, res: Response) => {
    try {
      const token = extractBearerToken(req);
      if (!token) return res.status(401).json({ success: false, error: 'Autentikasi admin diperlukan.' });

      const verified = verifySessionToken(token);
      if (!verified.valid || verified.payload?.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Hanya administrator yang dapat mengakses daftar pesanan.' });
      }

      if (supabase) {
        try {
          const { data: dbOrders, error: dbErr } = await supabase
            .from('orders')
            .select('*')
            .order('created_at', { ascending: false });

          if (!dbErr && dbOrders && dbOrders.length > 0) {
            for (const d of dbOrders) {
              saveOrderToStore({
                id: d.id,
                orderNumber: d.order_number,
                customerName: d.customer_name,
                customerPhone: d.customer_phone,
                customerEmail: d.customer_email || undefined,
                deliveryAddress: d.delivery_address,
                customerProvince: d.customer_province || undefined,
                customerCity: d.customer_city || undefined,
                customerDistrict: d.customer_district || '',
                customerPostalCode: d.customer_postal_code || undefined,
                deliveryNotes: d.delivery_notes || undefined,
                shippingMethod: d.shipping_method || 'AIR_REGULAR',
                shippingCost: Number(d.shipping_cost || 0),
                estimatedAirDeliveryDays: d.estimated_air_delivery_days ? Number(d.estimated_air_delivery_days) : undefined,
                shippingCarrier: d.shipping_carrier || undefined,
                trackingNumber: d.tracking_number || undefined,
                trackingUrl: d.tracking_url || undefined,
                items: d.items || [],
                subtotal: Number(d.subtotal || 0),
                serviceFee: Number(d.service_fee || 0),
                uniqueCode: Number(d.unique_code || 0),
                total: Number(d.total || 0),
                paymentStatus: d.payment_status || 'PENDING',
                orderStatus: d.order_status || 'NEW',
                paymentMethod: d.payment_method || 'ARTOPAY_LINK',
                paymentGateway: d.payment_gateway || 'ARTOPAY',
                paymentLinkUrl: d.payment_link_url || undefined,
                paymentReference: d.payment_reference || undefined,
                artopayPaymentId: d.artopay_payment_id || undefined,
                isTestTransaction: Boolean(d.is_test_transaction),
                simulationNote: d.simulation_note || undefined,
                paidAt: d.paid_at || undefined,
                paymentExpiresAt: d.payment_expires_at || undefined,
                referralCode: d.referral_code || undefined,
                affiliateCommission: d.affiliate_commission || undefined,
                createdAt: d.created_at,
                updatedAt: d.updated_at
              });
            }
          }
        } catch (dbErr) {
          console.warn('[Server] Supabase orders fetch notice:', dbErr);
        }
      }

      const orders = getAllOrdersFromStore();
      res.json({ success: true, orders });
    } catch (err: any) {
      console.error('[Server] Admin get orders error:', err);
      res.status(500).json({ success: false, error: err?.message || 'Gagal memuat daftar pesanan.' });
    }
  });

  // Admin: Get single order detail
  app.get('/api/admin/orders/:id', async (req: Request, res: Response) => {
    try {
      const token = extractBearerToken(req);
      if (!token) return res.status(401).json({ success: false, error: 'Autentikasi admin diperlukan.' });

      const verified = verifySessionToken(token);
      if (!verified.valid || verified.payload?.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Hanya administrator yang dapat melihat detail pesanan ini.' });
      }

      const orderId = req.params.id;
      let order = getOrderFromStore(orderId) || getAllOrdersFromStore().find(o => o.orderNumber === orderId);

      if (!order && supabase) {
        const { data } = await supabase
          .from('orders')
          .select('*')
          .or(`id.eq.${orderId},order_number.eq.${orderId}`)
          .single();
        if (data) {
          order = {
            id: data.id,
            orderNumber: data.order_number,
            customerName: data.customer_name,
            customerPhone: data.customer_phone,
            customerEmail: data.customer_email || undefined,
            deliveryAddress: data.delivery_address,
            customerDistrict: data.customer_district || '',
            shippingMethod: data.shipping_method || 'AIR_REGULAR',
            shippingCost: Number(data.shipping_cost || 0),
            items: data.items || [],
            subtotal: Number(data.subtotal || 0),
            serviceFee: Number(data.service_fee || 0),
            total: Number(data.total || 0),
            uniqueCode: Number(data.unique_code || 0),
            paymentStatus: data.payment_status || 'PENDING',
            orderStatus: data.order_status || 'NEW',
            paymentMethod: data.payment_method,
            paymentGateway: data.payment_gateway,
            paymentLinkUrl: data.payment_link_url,
            paymentReference: data.payment_reference,
            artopayPaymentId: data.artopay_payment_id,
            trackingNumber: data.tracking_number,
            shippingCarrier: data.shipping_carrier,
            trackingUrl: data.tracking_url,
            affiliateCommission: data.affiliate_commission,
            createdAt: data.created_at,
            updatedAt: data.updated_at
          };
        }
      }

      if (!order) {
        return res.status(404).json({ success: false, error: 'Pesanan tidak ditemukan.' });
      }

      res.json({ success: true, order });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Gagal memuat detail pesanan.' });
    }
  });

  // Admin: Update order status & tracking (Shared Handler)
  const handleAdminOrderUpdate = async (req: Request, res: Response) => {
    try {
      const token = extractBearerToken(req);
      if (!token) return res.status(401).json({ success: false, error: 'Autentikasi admin diperlukan.' });

      const verified = verifySessionToken(token);
      if (!verified.valid || verified.payload?.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Hanya administrator yang dapat memperbarui pesanan.' });
      }

      const { orderStatus, paymentStatus, trackingNumber, shippingCarrier, trackingUrl } = req.body;
      const orderId = req.params.id;

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
            createdAt: data.created_at,
            updatedAt: data.updated_at
          };
        }
      }

      if (!order) {
        return res.status(404).json({ success: false, error: 'Pesanan tidak ditemukan.' });
      }

      if (orderStatus) order.orderStatus = orderStatus;
      if (paymentStatus) {
        order.paymentStatus = paymentStatus;
        if (paymentStatus === 'PAID' && !order.paidAt) {
          order.paidAt = new Date().toISOString();
        }
      }
      if (trackingNumber !== undefined) order.trackingNumber = trackingNumber;
      if (shippingCarrier !== undefined) order.shippingCarrier = shippingCarrier;
      if (trackingUrl !== undefined) order.trackingUrl = trackingUrl;
      order.updatedAt = new Date().toISOString();

      if (order.affiliateCommission) {
        if (order.orderStatus === 'COMPLETED' || order.paymentStatus === 'PAID') {
          order.affiliateCommission.status = 'APPROVED';
        } else if (order.orderStatus === 'CANCELLED' || order.paymentStatus === 'REJECTED' || order.paymentStatus === 'REFUNDED') {
          order.affiliateCommission.status = 'CANCELLED';
        }
      }

      saveOrderToStore(order);

      if (supabase) {
        try {
          await supabase.from('orders').update({
            order_status: order.orderStatus,
            payment_status: order.paymentStatus,
            paid_at: order.paidAt || null,
            tracking_number: order.trackingNumber || null,
            shipping_carrier: order.shippingCarrier || null,
            tracking_url: order.trackingUrl || null,
            affiliate_commission: order.affiliateCommission || null,
            updated_at: order.updatedAt
          }).eq('id', order.id);
        } catch (dbErr) {
          console.warn('[Server] Supabase update warning:', dbErr);
        }
      }

      res.json({ success: true, order });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Gagal mengubah status pesanan.' });
    }
  };

  app.post('/api/admin/orders/:id/status', handleAdminOrderUpdate);
  app.patch('/api/admin/orders/:id/status', handleAdminOrderUpdate);
  app.post('/api/admin/orders/:id/tracking', handleAdminOrderUpdate);
  app.patch('/api/admin/orders/:id/tracking', handleAdminOrderUpdate);

  // --------------------------------------------------------------------------
  // 5d. SECURE PRODUCT REVIEWS (VERIFIED PURCHASE ONLY)
  // --------------------------------------------------------------------------
  app.post('/api/reviews', async (req: Request, res: Response) => {
    try {
      const { productId, orderId, userId, userName, userEmail, rating, comment } = req.body;

      if (!productId || !orderId || !comment || !rating) {
        return res.status(400).json({
          success: false,
          error: 'ID produk, ID pesanan, rating, dan komentar ulasan wajib diisi.'
        });
      }

      const numRating = Number(rating);
      if (isNaN(numRating) || numRating < 1 || numRating > 5) {
        return res.status(400).json({
          success: false,
          error: 'Rating harus berupa angka antara 1 dan 5 bintang.'
        });
      }

      if (!comment.trim()) {
        return res.status(400).json({
          success: false,
          error: 'Komentar ulasan tidak boleh kosong.'
        });
      }

      // 1. Fetch order from store or Supabase
      let order = getOrderFromStore(orderId) || getAllOrdersFromStore().find(o => o.orderNumber === orderId);
      if (!order && supabase) {
        try {
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
              createdAt: data.created_at,
              updatedAt: data.updated_at
            };
          }
        } catch {}
      }

      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Pesanan tidak ditemukan. Hanya pembeli dengan pesanan terverifikasi yang dapat menulis ulasan.'
        });
      }

      // 2. Security validation: Only COMPLETED and PAID orders qualify
      if (order.orderStatus !== 'COMPLETED' || order.paymentStatus !== 'PAID') {
        return res.status(403).json({
          success: false,
          error: 'Ulasan hanya dapat diberikan untuk pesanan yang telah selesai (COMPLETED) dan lunas (PAID).'
        });
      }

      // 3. Verify order actually contains the product
      const itemMatch = order.items && Array.isArray(order.items) && order.items.some(i => i.productId === productId);
      if (!itemMatch) {
        return res.status(403).json({
          success: false,
          error: 'Produk ini tidak terdapat dalam rincian pesanan yang Anda berikan.'
        });
      }

      // 4. Prevent duplicate reviews for the same order and product
      if (hasUserReviewedOrderProduct(order.id, productId, userId)) {
        return res.status(409).json({
          success: false,
          error: 'Anda sudah pernah memberikan ulasan untuk pesanan dan produk ini.'
        });
      }

      // Also check Supabase for duplicate
      if (supabase) {
        try {
          const { data: existingRev } = await supabase
            .from('product_reviews')
            .select('id')
            .eq('order_id', order.id)
            .eq('product_id', productId)
            .maybeSingle();
          if (existingRev) {
            return res.status(409).json({
              success: false,
              error: 'Ulasan untuk pesanan dan produk ini sudah tercatat di sistem.'
            });
          }
        } catch {}
      }

      const reviewId = `rev_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const newReview: ProductReview = {
        id: reviewId,
        productId,
        userId: userId || 'cust_guest',
        userName: String(userName || order.customerName || 'Pelanggan Tumpang Shop').trim(),
        userEmail: userEmail || order.customerEmail || undefined,
        orderId: order.id,
        isVerifiedPurchase: true, // Strictly verified by backend against completed and paid order
        rating: Math.round(numRating),
        comment: comment.trim(),
        createdAt: new Date().toISOString()
      };

      saveReviewToStore(newReview);

      if (supabase) {
        try {
          await supabase.from('product_reviews').upsert({
            id: newReview.id,
            product_id: newReview.productId,
            user_id: newReview.userId,
            user_name: newReview.userName,
            user_email: newReview.userEmail || null,
            order_id: newReview.orderId,
            is_verified_purchase: true,
            rating: newReview.rating,
            comment: newReview.comment,
            created_at: newReview.createdAt,
            updated_at: new Date().toISOString()
          });
        } catch (dbRevErr) {
          console.warn('[Server] Supabase product_reviews upsert warning:', dbRevErr);
        }
      }

      res.status(201).json({
        success: true,
        review: newReview,
        message: 'Ulasan terverifikasi berhasil disimpan.'
      });
    } catch (err: any) {
      console.error('[Server] Review submission error:', err);
      res.status(500).json({ success: false, error: err?.message || 'Gagal memproses ulasan produk.' });
    }
  });

  // Public product reviews endpoint:
  // Strictly exposes ONLY verified purchase reviews without leaking customer PII (never userEmail, orderId, or userId)
  app.get('/api/reviews/:productId', async (req: Request, res: Response) => {
    try {
      const { productId } = req.params;
      let reviews = getReviewsFromStore(productId)
        .filter(r => r.isVerifiedPurchase === true)
        .map(r => ({
          id: r.id,
          productId: r.productId,
          userName: r.userName,
          isVerifiedPurchase: true,
          rating: r.rating,
          comment: r.comment,
          createdAt: r.createdAt
        }));

      if (supabase) {
        try {
          const { data } = await supabase
            .from('product_reviews')
            .select('id, product_id, user_name, is_verified_purchase, rating, comment, created_at')
            .eq('product_id', productId)
            .eq('is_verified_purchase', true)
            .order('created_at', { ascending: false });
          if (data && data.length > 0) {
            reviews = data.map((d: any) => ({
              id: d.id,
              productId: d.product_id,
              userName: d.user_name,
              isVerifiedPurchase: true,
              rating: d.rating,
              comment: d.comment,
              createdAt: d.created_at
            }));
          }
        } catch {}
      }

      res.json({ success: true, reviews });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Gagal mengambil ulasan produk.' });
    }
  });

  // Admin: Moderation endpoint for reviews (strictly authenticated with admin token)
  app.get('/api/admin/reviews', async (req: Request, res: Response) => {
    try {
      const token = extractBearerToken(req);
      if (!token) return res.status(401).json({ success: false, error: 'Autentikasi admin diperlukan.' });

      const verified = verifySessionToken(token);
      if (!verified.valid || verified.payload?.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Hanya administrator yang dapat melihat seluruh ulasan moderasi.' });
      }

      let reviews = getReviewsFromStore();
      if (supabase) {
        try {
          const { data } = await supabase
            .from('product_reviews')
            .select('*')
            .order('created_at', { ascending: false });
          if (data && data.length > 0) {
            reviews = data.map((d: any) => ({
              id: d.id,
              productId: d.product_id,
              userId: d.user_id,
              userName: d.user_name,
              userEmail: d.user_email,
              orderId: d.order_id,
              isVerifiedPurchase: Boolean(d.is_verified_purchase),
              rating: d.rating,
              comment: d.comment,
              createdAt: d.created_at
            }));
          }
        } catch {}
      }

      res.json({ success: true, reviews });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Gagal mengambil data ulasan admin.' });
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
