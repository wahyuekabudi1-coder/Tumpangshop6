import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { initialProducts, initialCategories, initialStoreConfig } from '../data/mockData';
import { Product, Category, StoreConfig, Order, UserProfile, ProductReview, AffiliateApplication, AffiliateCampaign } from '../types';

const env = (import.meta as any).env || {};
const supabaseUrl = env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabaseAnonKey && 
  supabaseUrl.startsWith('https://') &&
  supabaseUrl !== 'https://your-project.supabase.co'
);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export const getSupabaseConfigStatus = () => {
  return {
    isConfigured: isSupabaseConfigured,
    url: supabaseUrl || '',
    hasAnonKey: Boolean(supabaseAnonKey),
    missingVars: [
      !supabaseUrl ? 'VITE_SUPABASE_URL' : null,
      !supabaseAnonKey ? 'VITE_SUPABASE_ANON_KEY' : null
    ].filter(Boolean) as string[]
  };
};

export const ADMIN_PRIMARY_EMAIL = 'tumpanggo@gmail.com';

// Local storage key constants for robust standalone operation
const STORAGE_KEYS = {
  PRODUCTS: 'tumpang_shop_products_v3',
  CATEGORIES: 'tumpang_shop_categories_v3',
  CONFIG: 'tumpang_shop_config_v3',
  ORDERS: 'tumpang_shop_orders_v2',
  USER: 'tumpang_shop_current_user_v2',
  ADMIN_AUTH: 'tumpang_shop_admin_auth_v1',
  REVIEWS: 'tumpang_shop_reviews_v2',
  AFFILIATES: 'tumpang_shop_affiliates_v1',
  CAMPAIGNS: 'tumpang_shop_campaigns_v1'
};

const DUMMY_CATEGORY_IDS = new Set([
  'cat-sembako',
  'cat-sayur-buah',
  'cat-umkm-khas',
  'cat-lauk-daging',
  'cat-snack-minuman'
]);

const DUMMY_PRODUCT_IDS = new Set([
  'prod-beras-pandan',
  'prod-apel-manalagi',
  'prod-kopi-dampit',
  'prod-keripik-tempe',
  'prod-minyak-goreng',
  'prod-sayur-paket-sop',
  'prod-madu-murni',
  'prod-telur-ayam'
]);

// --- CATEGORIES ---
export const getStoredCategories = (): Category[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CATEGORIES);
    if (!raw) {
      // Migrate only custom user-added categories from v2, ignoring dummy demo categories
      const oldRaw = localStorage.getItem('tumpang_shop_categories_v2');
      if (oldRaw) {
        try {
          const oldList: Category[] = JSON.parse(oldRaw);
          const customCategories = oldList.filter(c => !DUMMY_CATEGORY_IDS.has(c.id));
          localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(customCategories));
          return customCategories;
        } catch {}
      }
      localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(initialCategories));
      return initialCategories;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) 
      ? parsed.filter((c: Category) => !DUMMY_CATEGORY_IDS.has(c.id)) 
      : initialCategories;
  } catch {
    return initialCategories;
  }
};

export const saveStoredCategories = (categories: Category[]) => {
  try {
    localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(categories));
  } catch (err) {
    console.error('Failed to save categories locally', err);
  }

  // Sync to Supabase if available
  if (supabase) {
    // Attempt background sync without blocking UI
    categories.forEach(async (cat) => {
      try {
        await supabase.from('categories').upsert({
          id: cat.id,
          name: cat.name,
          slug: cat.slug,
          description: cat.description,
          image_url: cat.imageUrl,
          icon: cat.icon,
          order_index: cat.orderIndex,
          is_active: cat.isActive,
          updated_at: new Date().toISOString()
        });
      } catch (err) {
        console.warn('Supabase category upsert warning:', err);
      }
    });
  }
};

// --- PRODUCTS ---
export const getStoredProducts = (): Product[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
    if (!raw) {
      // Migrate only custom user-added products from v2, ignoring dummy demo items
      const oldRaw = localStorage.getItem('tumpang_shop_products_v2');
      if (oldRaw) {
        try {
          const oldList: Product[] = JSON.parse(oldRaw);
          const customProducts = oldList.filter(p => !DUMMY_PRODUCT_IDS.has(p.id));
          localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(customProducts));
          return customProducts;
        } catch {}
      }
      localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(initialProducts));
      return initialProducts;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) 
      ? parsed.filter((p: Product) => !DUMMY_PRODUCT_IDS.has(p.id)) 
      : initialProducts;
  } catch {
    return initialProducts;
  }
};

export const saveStoredProducts = (products: Product[]) => {
  try {
    localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
  } catch (err) {
    console.error('Failed to save products locally', err);
  }

  if (supabase) {
    products.forEach(async (prod) => {
      try {
        await supabase.from('products').upsert({
          id: prod.id,
          sku: prod.sku,
          name: prod.name,
          description: prod.description,
          category_id: prod.categoryId,
          price: prod.price,
          stock: prod.stock,
          unit: prod.unit,
          images: prod.images,
          variations: prod.variations,
          is_active: prod.isActive,
          is_featured: prod.isFeatured,
          view_count: prod.viewCount ?? 0,
          sales_count: prod.salesCount ?? 0,
          updated_at: new Date().toISOString()
        });
      } catch (err) {
        console.warn('Supabase product upsert warning:', err);
      }
    });
  }
};

export const incrementProductViewCount = (productId: string) => {
  try {
    const prods = getStoredProducts();
    const target = prods.find(p => p.id === productId);
    if (target) {
      target.viewCount = (target.viewCount || 0) + 1;
      saveStoredProducts(prods);
    }
  } catch (err) {
    console.warn('Could not increment view count', err);
  }

  if (supabase) {
    (async () => {
      try {
        const { error } = await supabase.rpc('increment_product_views', { product_id: productId });
        if (error) {
          const { data } = await supabase.from('products').select('view_count').eq('id', productId).single();
          if (data) {
            await supabase.from('products').update({ view_count: (data.view_count || 0) + 1 }).eq('id', productId);
          }
        }
      } catch (err) {
        console.warn('View count sync warning:', err);
      }
    })();
  }
};

// --- STORE CONFIG ---
export const getStoredConfig = (): StoreConfig => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CONFIG);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(initialStoreConfig));
      return initialStoreConfig;
    }
    const parsed: StoreConfig = JSON.parse(raw);
    if (parsed.storeTagline && parsed.storeTagline.includes('UMKM')) {
      parsed.storeTagline = initialStoreConfig.storeTagline;
      localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(parsed));
    }
    if (typeof parsed.defaultAffiliateCommissionRate !== 'number') {
      parsed.defaultAffiliateCommissionRate = 15;
      localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(parsed));
    }
    return parsed;
  } catch {
    return initialStoreConfig;
  }
};

export const saveStoredConfig = (config: StoreConfig) => {
  try {
    localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(config));
  } catch (err) {
    console.error('Failed to save store config locally', err);
  }

  if (supabase) {
    (async () => {
      try {
        await supabase.from('store_config').upsert({
          id: 'primary_config',
          store_name: config.storeName,
          store_tagline: config.storeTagline,
          store_address: config.storeAddress,
          store_phone: config.storePhone,
          is_open: config.isOpen,
          min_order_amount: config.minOrderAmount,
          default_delivery_fee: config.defaultDeliveryFee,
          service_fee: config.serviceFee,
          qris_image_url: config.qrisImageUrl,
          updated_at: new Date().toISOString()
        });
      } catch (err) {
        console.warn('Supabase config sync warning:', err);
      }
    })();
  }
};

// --- ORDERS ---
export const getStoredOrders = (): Order[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ORDERS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const saveStoredOrder = (order: Order): Order => {
  try {
    const orders = getStoredOrders();
    const existingIndex = orders.findIndex(o => o.id === order.id);
    if (existingIndex >= 0) {
      orders[existingIndex] = order;
    } else {
      orders.unshift(order);
    }
    localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders));
  } catch (err) {
    console.error('Failed to save order locally', err);
  }

  if (supabase) {
    (async () => {
      try {
        await supabase.from('orders').upsert({
          id: order.id,
          order_number: order.orderNumber,
          customer_name: order.customerName,
          customer_phone: order.customerPhone,
          customer_email: order.customerEmail,
          delivery_address: order.deliveryAddress,
          customer_district: order.customerDistrict,
          delivery_notes: order.deliveryNotes,
          shipping_method: order.shippingMethod,
          shipping_cost: order.shippingCost,
          items: order.items,
          subtotal: order.subtotal,
          service_fee: order.serviceFee,
          total: order.total,
          payment_status: order.paymentStatus,
          order_status: order.orderStatus,
          payment_method: order.paymentMethod,
          payment_link_url: order.paymentLinkUrl,
          payment_gateway: order.paymentGateway,
          payment_reference: order.paymentReference,
          paid_at: order.paidAt,
          payment_expires_at: order.paymentExpiresAt,
          created_at: order.createdAt,
          updated_at: new Date().toISOString()
        });
      } catch (err) {
        console.warn('Supabase order sync warning:', err);
      }
    })();
  }

  return order;
};

export const saveStoredOrders = (orders: Order[]): void => {
  try {
    localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders));
  } catch (err) {
    console.error('Failed to save orders list locally', err);
  }
};

// --- USER SESSIONS ---
export const getStoredUser = (): UserProfile | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.USER);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const saveStoredUser = (user: UserProfile | null) => {
  try {
    if (!user) {
      localStorage.removeItem(STORAGE_KEYS.USER);
    } else {
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
    }
  } catch (err) {
    console.error('Failed to save user session locally', err);
  }
};

// --- SECURE ADMIN AUTHENTICATION UTILS ---
export interface LocalAdminAuth {
  email: string;
  passwordHash: string;
  updatedAt: string;
}

export const hashPassword = async (password: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

export const getLocalAdminAuth = (): LocalAdminAuth | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ADMIN_AUTH);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const setLocalAdminAuth = async (password: string): Promise<void> => {
  const passwordHash = await hashPassword(password);
  const authData: LocalAdminAuth = {
    email: ADMIN_PRIMARY_EMAIL,
    passwordHash,
    updatedAt: new Date().toISOString()
  };
  localStorage.setItem(STORAGE_KEYS.ADMIN_AUTH, JSON.stringify(authData));
};

export const isLocalAdminConfigured = (): boolean => {
  return Boolean(getLocalAdminAuth());
};

export const verifyLocalAdminPassword = async (email: string, password: string): Promise<boolean> => {
  const stored = getLocalAdminAuth();
  if (!stored) return false;

  const cleanEmail = email.trim().toLowerCase();
  // Allow login using the registered owner email or short username "admin"
  if (cleanEmail !== ADMIN_PRIMARY_EMAIL && cleanEmail !== 'admin') {
    return false;
  }

  const inputHash = await hashPassword(password);
  return inputHash === stored.passwordHash;
};

export const verifyAdminAuthorization = async (email: string, userId?: string): Promise<boolean> => {
  const cleanEmail = email.trim().toLowerCase();
  if (cleanEmail === ADMIN_PRIMARY_EMAIL) {
    return true;
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('admin_users')
        .select('id, role')
        .eq('email', cleanEmail)
        .maybeSingle();

      if (!error && data && (data.role === 'admin' || data.role === 'superadmin')) {
        return true;
      }
    } catch (err) {
      console.warn('Backend admin verification check:', err);
    }
  }

  return false;
};

// --- REVIEWS ---
export const getStoredReviews = (): ProductReview[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.REVIEWS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const saveStoredReview = (review: ProductReview): ProductReview => {
  try {
    const reviews = getStoredReviews();
    reviews.unshift(review);
    localStorage.setItem(STORAGE_KEYS.REVIEWS, JSON.stringify(reviews));
  } catch (err) {
    console.error('Failed to save review locally', err);
  }

  if (supabase) {
    (async () => {
      try {
        await supabase.from('product_reviews').upsert({
          id: review.id,
          product_id: review.productId,
          user_id: review.userId,
          user_name: review.userName,
          user_email: review.userEmail,
          order_id: review.orderId,
          is_verified_purchase: review.isVerifiedPurchase,
          rating: review.rating,
          comment: review.comment,
          created_at: review.createdAt
        });
      } catch (err) {
        console.warn('Supabase review sync warning:', err);
      }
    })();
  }

  return review;
};

export const getProductReviews = (productId: string): ProductReview[] => {
  const all = getStoredReviews();
  return all.filter(r => r.productId === productId);
};

// --- AFFILIATES ---
export const getStoredAffiliates = (): AffiliateApplication[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.AFFILIATES);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const saveStoredAffiliate = (app: AffiliateApplication): AffiliateApplication => {
  try {
    const apps = getStoredAffiliates();
    apps.unshift(app);
    localStorage.setItem(STORAGE_KEYS.AFFILIATES, JSON.stringify(apps));
  } catch (err) {
    console.error('Failed to save affiliate application locally', err);
  }

  if (supabase) {
    (async () => {
      try {
        await supabase.from('affiliate_applications').upsert({
          id: app.id,
          full_name: app.fullName,
          phone: app.phone,
          email: app.email,
          promotion_channel: app.promotionChannel,
          notes: app.notes,
          status: app.status,
          referral_code: app.referralCode,
          created_at: app.createdAt
        });
      } catch (err) {
        console.warn('Supabase affiliate sync warning:', err);
      }
    })();
  }

  return app;
};

// --- AFFILIATE CAMPAIGNS ---
export const getStoredCampaigns = (): AffiliateCampaign[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CAMPAIGNS);
    if (raw) return JSON.parse(raw);
    return [];
  } catch {
    return [];
  }
};

export const saveStoredCampaigns = (campaigns: AffiliateCampaign[]): void => {
  try {
    localStorage.setItem(STORAGE_KEYS.CAMPAIGNS, JSON.stringify(campaigns));
  } catch (err) {
    console.error('Failed to save campaigns locally', err);
  }

  if (supabase) {
    (async () => {
      try {
        for (const c of campaigns) {
          await supabase.from('affiliate_campaigns').upsert({
            id: c.id,
            name: c.name,
            description: c.description,
            product_ids: c.productIds,
            commission_rate: c.commissionRate,
            start_date: c.startDate,
            end_date: c.endDate,
            status: c.status,
            budget_limit: c.budgetLimit,
            max_orders: c.maxOrders,
            created_at: c.createdAt,
            updated_at: c.updatedAt
          });
        }
      } catch (err) {
        console.warn('Supabase campaigns sync warning:', err);
      }
    })();
  }
};

export const saveStoredCampaign = (campaign: AffiliateCampaign): AffiliateCampaign => {
  const current = getStoredCampaigns();
  const exists = current.some(c => c.id === campaign.id);
  const updated = exists ? current.map(c => c.id === campaign.id ? campaign : c) : [campaign, ...current];
  saveStoredCampaigns(updated);
  return campaign;
};

export const deleteStoredCampaign = (campaignId: string): void => {
  const current = getStoredCampaigns();
  const updated = current.filter(c => c.id !== campaignId);
  saveStoredCampaigns(updated);

  if (supabase) {
    (async () => {
      try {
        await supabase.from('affiliate_campaigns').delete().eq('id', campaignId);
      } catch (err) {
        console.warn('Supabase campaign delete warning:', err);
      }
    })();
  }
};

// --- PRODUCT IMAGES STORAGE ---
export const uploadProductImageToStorage = async (file: File): Promise<string> => {
  // If Supabase is connected, attempt uploading to 'product-images' storage bucket
  if (supabase) {
    try {
      const fileExt = file.name.split('.').pop() || 'jpg';
      const cleanFileName = file.name.replace(/[^a-zA-Z0-9]/g, '_');
      const filePath = `products/${Date.now()}_${cleanFileName}.${fileExt}`;

      const { data, error } = await supabase.storage
        .from('product-images')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (!error && data) {
        const { data: publicUrlData } = supabase.storage
          .from('product-images')
          .getPublicUrl(filePath);

        if (publicUrlData?.publicUrl) {
          return publicUrlData.publicUrl;
        }
      } else if (error) {
        console.warn('Supabase storage upload error, falling back to local data URL:', error.message);
      }
    } catch (storageErr) {
      console.warn('Storage upload exception, fallback to local URL:', storageErr);
    }
  }

  // Fallback: Read as persistent base64 Data URL so images display seamlessly without broken links
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Gagal membaca berkas gambar.'));
      }
    };
    reader.onerror = () => reject(new Error('Gagal membaca berkas gambar.'));
    reader.readAsDataURL(file);
  });
};
