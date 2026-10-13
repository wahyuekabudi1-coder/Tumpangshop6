import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Navbar from './components/Navbar';
import BannerCarousel from './components/BannerCarousel';
import CategoryVisualCards from './components/CategoryVisualCards';
import ProductCard from './components/ProductCard';
import ProductDetailPage from './components/ProductDetailPage';
import CartPage from './components/CartPage';
import CheckoutPage from './components/CheckoutPage';
import PaymentInstructionPage from './components/PaymentInstructionPage';
import OrderDetailPage from './components/OrderDetailPage';
import AuthModal from './components/AuthModal';
import AdminDashboard from './components/AdminDashboard';
import AdminLoginPage from './components/AdminLoginPage';
import AffiliatePage from './components/AffiliatePage';
import Footer from './components/Footer';
import PWAInstallButton from './components/PWAInstallButton';
import { 
  Product, Category, CartItem, Order, StoreConfig, 
  UserProfile, ProductVariationOption, ProductReview,
  AffiliateApplication, AffiliateCampaign
} from './types';
import { 
  getStoredProducts, saveStoredProducts, 
  getStoredCategories, saveStoredCategories, 
  getStoredConfig, saveStoredConfig, 
  getStoredOrders, saveStoredOrder, saveStoredOrders,
  getStoredUser, saveStoredUser,
  getStoredReviews, saveStoredReview,
  getStoredAffiliates, saveStoredAffiliate,
  getStoredCampaigns, saveStoredCampaigns,
  incrementProductViewCount,
  supabase, isSupabaseConfigured,
  fetchDataFromSupabase, checkSupabaseProductionStatus
} from './lib/supabase';
import { getProductSlug } from './data/mockData';
import { 
  processIncomingAffiliateLink, 
  getActiveAffiliateAttribution, 
  getStoredAdminToken, 
  clearStoredAdminToken 
} from './lib/affiliateAttribution';

import { 
  Store, ShieldCheck, Truck, CheckCircle2, 
  ShoppingBag, Search, Sparkles, TrendingUp,
  Eye, Flame, Filter, ArrowUpDown, Clock, AlertTriangle, X
} from 'lucide-react';

export default function App() {
  // Core Data
  const [products, setProducts] = useState<Product[]>(getStoredProducts);
  const [categories, setCategories] = useState<Category[]>(getStoredCategories);
  const [storeConfig, setStoreConfig] = useState<StoreConfig>(getStoredConfig);
  const [orders, setOrders] = useState<Order[]>(getStoredOrders);
  const [reviews, setReviews] = useState<ProductReview[]>(getStoredReviews);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(getStoredUser);

  // Active full page views state (driven by URL routing)
  const [activeProductDetail, setActiveProductDetail] = useState<Product | null>(null);
  const [isAffiliateView, setIsAffiliateView] = useState(false);
  const [isCartView, setIsCartView] = useState(false);
  const [isCheckoutView, setIsCheckoutView] = useState(false);
  const [activePaymentOrderId, setActivePaymentOrderId] = useState<string | null>(null);
  const [activeOrderDetailId, setActiveOrderDetailId] = useState<string | null>(null);
  const [affiliateApps, setAffiliateApps] = useState<AffiliateApplication[]>(getStoredAffiliates);
  const [campaigns, setCampaigns] = useState<AffiliateCampaign[]>(getStoredCampaigns);
  const [activeReferralCode, setActiveReferralCode] = useState<string>(() => {
    try {
      return localStorage.getItem('tumpang_shop_active_referral') || '';
    } catch {
      return '';
    }
  });

  // Supabase live database synchronization & production environment check
  const [supabaseProdStatus] = useState(checkSupabaseProductionStatus);
  const [dismissProdWarning, setDismissProdWarning] = useState(false);

  useEffect(() => {
    if (isSupabaseConfigured) {
      fetchDataFromSupabase().then(dbData => {
        if (dbData) {
          if (dbData.products && dbData.products.length > 0) setProducts(dbData.products);
          if (dbData.categories && dbData.categories.length > 0) setCategories(dbData.categories);
          if (dbData.orders && dbData.orders.length > 0) setOrders(dbData.orders);
          if (dbData.affiliates && dbData.affiliates.length > 0) setAffiliateApps(dbData.affiliates);
          if (dbData.campaigns && dbData.campaigns.length > 0) setCampaigns(dbData.campaigns);
          if (dbData.storeConfig) setStoreConfig(dbData.storeConfig);
          console.log('[Tumpang Shop] Live data synchronized with Supabase database.');
        }
      }).catch(err => {
        console.warn('[Tumpang Shop] Supabase sync notice:', err);
      });
    }
  }, []);

  // Admin Backend Session Token Verification (Protects against localStorage tampering)
  useEffect(() => {
    const adminToken = getStoredAdminToken();
    const stored = currentUser || getStoredUser();
    if (stored?.role === 'admin') {
      if (!adminToken) {
        console.warn('[Admin Auth] Missing admin session token, requiring login.');
        setCurrentUser(null);
        saveStoredUser(null);
        setIsAdminView(false);
        if (window.location.pathname.startsWith('/admin')) {
          setIsAdminLoginView(true);
        }
      } else {
        fetch('/api/admin/session', {
          headers: { 'Authorization': `Bearer ${adminToken}` }
        })
          .then(res => res.json())
          .then(data => {
            if (!data.success) {
              console.warn('[Admin Auth] Backend rejected admin session token:', data.error);
              clearStoredAdminToken();
              setCurrentUser(null);
              saveStoredUser(null);
              setIsAdminView(false);
              if (window.location.pathname.startsWith('/admin')) {
                setIsAdminLoginView(true);
              }
            }
          })
          .catch(() => {});
      }
    }
  }, [currentUser]);


  // Cart state persisted to localStorage
  const [cartItems, setCartItems] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('tumpang_shop_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Selected item IDs in Cart (defaults to all items in cart)
  const [selectedCartItemIds, setSelectedCartItemIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('tumpang_shop_cart');
      const parsed: CartItem[] = saved ? JSON.parse(saved) : [];
      return parsed.map(p => p.cartItemId);
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('tumpang_shop_cart', JSON.stringify(cartItems));
    } catch (err) {
      console.error('Failed to save cart', err);
    }
  }, [cartItems]);

  // Filtering & View state
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'default' | 'price_asc' | 'price_desc' | 'name_asc'>('default');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [isAdminView, setIsAdminView] = useState(false);
  const [isAdminLoginView, setIsAdminLoginView] = useState(false);

  // Modals state (Only AuthModal for user accounts; shopping flow is 100% full-page)
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  // Notification Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // --------------------------------------------------------------------------
  // URL ROUTING & HISTORY SYNCHRONIZATION
  // Full-page routes:
  // - /products, / (catalog)
  // - /products/:slug, /product/:slug (product detail)
  // - /cart (shopping cart)
  // - /checkout (checkout)
  // - /orders/:id/payment (payment instructions)
  // - /orders/:id (order detail & tracking)
  // - /affiliate (affiliate program)
  // - /admin/login (admin login screen)
  // - /admin/* (admin Seller Centre)
  // --------------------------------------------------------------------------
  const syncRouteFromLocation = useCallback(() => {
    const path = window.location.pathname;

    // Reset all primary page views before matching
    setIsAdminView(false);
    setIsAdminLoginView(false);
    setIsAffiliateView(false);
    setIsCartView(false);
    setIsCheckoutView(false);
    setActivePaymentOrderId(null);
    setActiveOrderDetailId(null);
    setActiveProductDetail(null);

    // Process automatic TikTok-style incoming affiliate link (?ref=CODE, ?referral=CODE, ?aff=CODE)
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const hasRefParam = searchParams.get('ref') || searchParams.get('referral') || searchParams.get('aff');
      if (hasRefParam) {
        const attr = processIncomingAffiliateLink(window.location.search, path, affiliateApps);
        if (attr) {
          setActiveReferralCode(attr.referralCode);
        }
      } else {
        const activeAttr = getActiveAffiliateAttribution(affiliateApps);
        if (activeAttr) {
          setActiveReferralCode(activeAttr.referralCode);
        }
      }
    } catch (err) {
      console.warn('Error syncing affiliate attribution:', err);
    }

    if (path === '/admin/login') {
      const stored = currentUser || getStoredUser();
      const adminToken = getStoredAdminToken();
      if (stored && stored.role === 'admin' && adminToken) {
        setIsAdminView(true);
        window.history.replaceState({}, '', '/admin');
      } else {
        setIsAdminLoginView(true);
      }
    } else if (path.startsWith('/admin')) {
      const stored = currentUser || getStoredUser();
      const adminToken = getStoredAdminToken();
      if (stored && stored.role === 'admin' && adminToken) {
        setIsAdminView(true);
      } else {
        // Not authenticated as admin -> redirect to /admin/login
        setIsAdminLoginView(true);
        window.history.replaceState({}, '', '/admin/login');
      }
    } else if (path === '/affiliate' || path.startsWith('/affiliate')) {
      setIsAffiliateView(true);
    } else if (path === '/cart') {
      setIsCartView(true);
    } else if (path === '/checkout') {
      setIsCheckoutView(true);
    } else if (path.startsWith('/orders/') && path.endsWith('/payment')) {
      // /orders/:id/payment
      const orderId = path.replace('/orders/', '').replace('/payment', '').replace(/\/$/, '').trim();
      setActivePaymentOrderId(orderId);
    } else if (path.startsWith('/orders/')) {
      // /orders/:id
      const orderId = path.replace('/orders/', '').replace(/\/$/, '').trim();
      setActiveOrderDetailId(orderId);
    } else if (path.startsWith('/products/') || path.startsWith('/product/')) {
      // /products/:slug or /product/:slug
      const slugOrId = decodeURIComponent(
        path.startsWith('/products/') 
          ? path.replace('/products/', '').replace(/\/$/, '') 
          : path.replace('/product/', '').replace(/\/$/, '')
      ).trim();
      const matched = products.find(p => 
        getProductSlug(p) === slugOrId || 
        p.id === slugOrId || 
        (p.slug && p.slug === slugOrId)
      );
      if (matched) {
        setActiveProductDetail(matched);
      } else {
        // Fallback to home if slug does not exist
        window.history.replaceState({}, '', '/');
      }
    } else if (path === '/products') {
      // Catalog view
      // Keep everything reset (home catalog)
    }
  }, [products]);

  useEffect(() => {
    syncRouteFromLocation();
    const handlePopState = () => {
      syncRouteFromLocation();
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [syncRouteFromLocation]);

  // Navigate to product detail page (/products/:slug)
  const handleNavigateToProduct = (product: Product) => {
    incrementProductViewCount(product.id);
    // Update local product metric immediately
    setProducts(prev => prev.map(p => p.id === product.id ? { ...p, viewCount: (p.viewCount || 0) + 1 } : p));
    const slug = getProductSlug(product);
    window.history.pushState({ productId: product.id }, '', `/products/${slug}`);
    setActiveProductDetail(product);
    setIsAffiliateView(false);
    setIsCartView(false);
    setIsCheckoutView(false);
    setActivePaymentOrderId(null);
    setActiveOrderDetailId(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Navigate to affiliate page
  const handleNavigateToAffiliate = () => {
    window.history.pushState({}, '', '/affiliate');
    setIsAffiliateView(true);
    setActiveProductDetail(null);
    setIsCartView(false);
    setIsCheckoutView(false);
    setActivePaymentOrderId(null);
    setActiveOrderDetailId(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Back from affiliate page
  const handleBackFromAffiliate = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.history.pushState({}, '', '/');
      setIsAffiliateView(false);
    }
  };

  // Submit affiliate application
  const handleAffiliateSubmit = (app: AffiliateApplication) => {
    saveStoredAffiliate(app);
    setAffiliateApps(prev => [app, ...prev]);
    showToast('Pendaftaran affiliate berhasil! Tautan referral Anda sudah aktif.');
  };

  // Back to catalog navigation (/products or /)
  const handleBackToCatalog = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.history.pushState({}, '', '/');
      setActiveProductDetail(null);
      setIsAffiliateView(false);
      setIsCartView(false);
      setIsCheckoutView(false);
      setActivePaymentOrderId(null);
      setActiveOrderDetailId(null);
    }
  };

  // Navigate to hidden admin login page (/admin/login)
  const handleNavigateToAdminLogin = () => {
    const isDevOrPreview = Boolean(
      (import.meta as any).env?.DEV || 
      (import.meta as any).env?.MODE !== 'production' ||
      window.location.hostname === 'localhost' ||
      window.location.hostname.includes('127.0.0.1') ||
      window.location.hostname.includes('webcontainer') ||
      window.location.hostname.includes('run.app') ||
      window.location.hostname.includes('aistudio')
    );

    if (isDevOrPreview) {
      const devAdmin: UserProfile = {
        id: 'admin-dev',
        fullName: 'Administrator (Dev)',
        email: 'admin@tumpang.shop',
        role: 'admin'
      };
      if (!currentUser || currentUser.role !== 'admin') {
        handleLogin(devAdmin);
      }
      window.history.pushState({}, '', '/admin');
      setIsAdminView(true);
      setIsAdminLoginView(false);
      showToast('Masuk ke Admin Dashboard (Mode Dev/Preview)');
    } else {
      const user = currentUser || getStoredUser();
      if (user && user.role === 'admin') {
        window.history.pushState({}, '', '/admin');
        setIsAdminView(true);
        setIsAdminLoginView(false);
      } else {
        window.history.pushState({}, '', '/admin/login');
        setIsAdminLoginView(true);
        setIsAdminView(false);
      }
    }
    setActiveProductDetail(null);
    setIsAffiliateView(false);
    setIsCartView(false);
    setIsCheckoutView(false);
    setActivePaymentOrderId(null);
    setActiveOrderDetailId(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAdminLoginSuccess = (adminUser: UserProfile) => {
    handleLogin(adminUser);
    setIsAdminLoginView(false);
    setIsAdminView(true);
    window.history.pushState({}, '', '/admin');
    showToast(`Selamat datang di Seller Centre, ${adminUser.fullName}!`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBackFromAdminLogin = () => {
    setIsAdminLoginView(false);
    window.history.pushState({}, '', '/');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAdminLogout = () => {
    handleLogout();
    setIsAdminView(false);
    setIsAdminLoginView(false);
    window.history.pushState({}, '', '/');
  };

  // --------------------------------------------------------------------------
  // CALCULATE REAL METRICS: PRODUK TERLARIS & TERPOPULER
  // --------------------------------------------------------------------------
  
  // Real sales calculation: Sum of units sold strictly from COMPLETED / DELIVERED orders
  const salesMap = useMemo(() => {
    const map = new Map<string, number>();
    const completedOrders = orders.filter(o => o.orderStatus === 'COMPLETED' || o.orderStatus === 'DELIVERED');
    for (const order of completedOrders) {
      for (const item of order.items) {
        const current = map.get(item.productId) || 0;
        map.set(item.productId, current + item.quantity);
      }
    }
    return map;
  }, [orders]);

  // Active products only for customer views
  const activeProducts = useMemo(() => {
    return products.filter(p => p.isActive);
  }, [products]);

  // A. Produk Terlaris (Sold units from completed orders > 0)
  const bestSellerProducts = useMemo(() => {
    return activeProducts
      .filter(p => (salesMap.get(p.id) || 0) > 0)
      .sort((a, b) => (salesMap.get(b.id) || 0) - (salesMap.get(a.id) || 0))
      .slice(0, 8);
  }, [activeProducts, salesMap]);

  // B. Produk Terpopuler (Real detail clicks/interactions > 0)
  const mostPopularProducts = useMemo(() => {
    return activeProducts
      .filter(p => (p.viewCount || 0) > 0)
      .sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0))
      .slice(0, 8);
  }, [activeProducts]);

  // C. Semua Produk (Filtered by category, subcategory, search, stock, and user sorting)
  const allFilteredProducts = useMemo(() => {
    let list = activeProducts.filter((p) => {
      const matchesCategory = selectedCategoryId === 'all' || p.categoryId === selectedCategoryId;
      const matchesSubcategory = selectedSubcategoryId === 'all' || p.subcategoryId === selectedSubcategoryId;
      const matchesSearch = !searchQuery.trim() || 
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStock = !inStockOnly || p.stock > 0;
      return matchesCategory && matchesSubcategory && matchesSearch && matchesStock;
    });

    if (sortBy === 'price_asc') {
      list = [...list].sort((a, b) => a.price - b.price);
    } else if (sortBy === 'price_desc') {
      list = [...list].sort((a, b) => b.price - a.price);
    } else if (sortBy === 'name_asc') {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    }

    return list;
  }, [activeProducts, selectedCategoryId, selectedSubcategoryId, searchQuery, inStockOnly, sortBy]);

  // --------------------------------------------------------------------------
  // CART & BUY NOW HANDLERS
  // --------------------------------------------------------------------------
  const handleAddToCart = (
    product: Product, 
    option?: ProductVariationOption, 
    variationName?: string, 
    quantity = 1
  ) => {
    // Validate live stock
    const availableStock = option ? option.stock : product.stock;
    if (availableStock <= 0) {
      showToast(`Maaf, stok "${product.name}" sedang habis.`);
      return;
    }

    const unitPrice = product.price + (option?.priceDelta || 0);
    const cartItemId = option ? `${product.id}_${option.id}` : `${product.id}_base`;

    // Ensure item is marked selected
    setSelectedCartItemIds(prev => prev.includes(cartItemId) ? prev : [...prev, cartItemId]);

    setCartItems((prev) => {
      const existing = prev.find((item) => item.cartItemId === cartItemId);
      if (existing) {
        const nextQty = Math.min(availableStock, existing.quantity + quantity);
        return prev.map((item) =>
          item.cartItemId === cartItemId
            ? { ...item, quantity: nextQty }
            : item
        );
      }
      return [
        ...prev,
        {
          cartItemId,
          product,
          selectedOption: option,
          selectedVariationName: variationName,
          unitPrice,
          quantity: Math.min(availableStock, quantity)
        }
      ];
    });

    showToast(`✓ "${product.name}" (${quantity} ${product.unit}) dimasukkan ke keranjang`);
  };

  // Navigation helpers for customer shopping flow
  const handleNavigateToCart = () => {
    window.history.pushState({}, '', '/cart');
    setIsCartView(true);
    setIsCheckoutView(false);
    setActiveProductDetail(null);
    setIsAffiliateView(false);
    setActivePaymentOrderId(null);
    setActiveOrderDetailId(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNavigateToCheckout = () => {
    window.history.pushState({}, '', '/checkout');
    setIsCheckoutView(true);
    setIsCartView(false);
    setActiveProductDetail(null);
    setIsAffiliateView(false);
    setActivePaymentOrderId(null);
    setActiveOrderDetailId(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNavigateToPaymentInstruction = (orderId: string) => {
    window.history.pushState({}, '', `/orders/${orderId}/payment`);
    setActivePaymentOrderId(orderId);
    setIsCheckoutView(false);
    setIsCartView(false);
    setActiveOrderDetailId(null);
    setActiveProductDetail(null);
    setIsAffiliateView(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNavigateToOrderDetail = (orderId: string) => {
    window.history.pushState({}, '', `/orders/${orderId}`);
    setActiveOrderDetailId(orderId);
    setActivePaymentOrderId(null);
    setIsCheckoutView(false);
    setIsCartView(false);
    setActiveProductDetail(null);
    setIsAffiliateView(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBuyNow = (
    product: Product, 
    option?: ProductVariationOption, 
    variationName?: string, 
    quantity = 1
  ) => {
    handleAddToCart(product, option, variationName, quantity);
    const cartItemId = option ? `${product.id}_${option.id}` : `${product.id}_base`;
    // Select this item specifically for checkout
    setSelectedCartItemIds(prev => prev.includes(cartItemId) ? prev : [...prev, cartItemId]);
    // Immediately direct to full-page /checkout without popup/drawer
    handleNavigateToCheckout();
  };

  const handleToggleSelectCartItem = (cartItemId: string) => {
    setSelectedCartItemIds(prev => 
      prev.includes(cartItemId) 
        ? prev.filter(id => id !== cartItemId) 
        : [...prev, cartItemId]
    );
  };

  const handleToggleSelectAllCart = () => {
    if (selectedCartItemIds.length === cartItems.length) {
      setSelectedCartItemIds([]);
    } else {
      setSelectedCartItemIds(cartItems.map(i => i.cartItemId));
    }
  };

  const handleClearCart = () => {
    if (confirm('Kosongkan semua barang dari keranjang belanja?')) {
      setCartItems([]);
      setSelectedCartItemIds([]);
    }
  };

  const handleUpdateCartQuantity = (cartItemId: string, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveCartItem(cartItemId);
      return;
    }
    setCartItems((prev) =>
      prev.map((item) => (item.cartItemId === cartItemId ? { ...item, quantity: newQty } : item))
    );
  };

  const handleRemoveCartItem = (cartItemId: string) => {
    setCartItems((prev) => prev.filter((item) => item.cartItemId !== cartItemId));
    setSelectedCartItemIds((prev) => prev.filter(id => id !== cartItemId));
  };

  // Order Handlers (Decrements inventory to prevent overselling!)
  const handleOrderCreated = (order: Order, paymentLinkUrl?: string) => {
    saveStoredOrder(order);
    setOrders((prev) => [order, ...prev]);

    // Decrement stock in live inventory
    setProducts((prev) => {
      const updated = prev.map((p) => {
        const matchingItems = order.items.filter((i) => i.productId === p.id);
        if (matchingItems.length === 0) return p;

        let newStock = p.stock;
        let newVariations = p.variations;

        matchingItems.forEach((item) => {
          newStock = Math.max(0, newStock - item.quantity);
          if (newVariations && item.sku) {
            newVariations = newVariations.map((v) => ({
              ...v,
              options: v.options.map((opt) =>
                opt.sku === item.sku
                  ? { ...opt, stock: Math.max(0, opt.stock - item.quantity) }
                  : opt
              )
            }));
          }
        });

        return {
          ...p,
          stock: newStock,
          variations: newVariations,
          updatedAt: new Date().toISOString()
        };
      });

      saveStoredProducts(updated);
      return updated;
    });

    // Remove checked-out items from cart, keeping unselected items
    const checkedOutItemIds = new Set(order.items.map(i => i.productId));
    setCartItems(prev => prev.filter(item => !checkedOutItemIds.has(item.product.id)));
    setSelectedCartItemIds(prev => prev.filter(id => !cartItems.some(c => c.cartItemId === id && checkedOutItemIds.has(c.product.id))));

    // Navigate to full-page payment instruction /orders/:id/payment
    handleNavigateToPaymentInstruction(order.id);

    if (paymentLinkUrl) {
      showToast(`✓ Pesanan ${order.orderNumber} berhasil dibuat! Silakan buka tautan pembayaran resmi.`);
    } else {
      showToast(`✓ Pesanan ${order.orderNumber} berhasil dibuat dengan status Pending!`);
    }
  };

  // Reviews Handler
  const handleReviewSubmit = (review: ProductReview) => {
    saveStoredReview(review);
    setReviews((prev) => [review, ...prev]);
    showToast('✓ Ulasan terverifikasi berhasil dikirim!');
  };

  // Sync state changes with storage
  const handleUpdateProducts = (newProducts: Product[]) => {
    setProducts(newProducts);
    saveStoredProducts(newProducts);
  };

  const handleUpdateOrders = (newOrders: Order[]) => {
    setOrders(newOrders);
    saveStoredOrders(newOrders);
  };

  const handleUpdateCategories = (newCategories: Category[]) => {
    setCategories(newCategories);
    saveStoredCategories(newCategories);
  };

  const handleUpdateConfig = (newConfig: StoreConfig) => {
    setStoreConfig(newConfig);
    saveStoredConfig(newConfig);
  };

  const handleUpdateCampaigns = (newCampaigns: AffiliateCampaign[]) => {
    setCampaigns(newCampaigns);
    saveStoredCampaigns(newCampaigns);
  };

  const handleLogin = (user: UserProfile) => {
    setCurrentUser(user);
    saveStoredUser(user);
    showToast(`Selamat datang, ${user.fullName}!`);
  };

  const handleLogout = async () => {
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.warn('Supabase sign out error:', err);
      }
    }
    setCurrentUser(null);
    saveStoredUser(null);
    showToast('Anda telah keluar dari akun.');
  };

  const totalCartCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800 font-sans selection:bg-emerald-100 selection:text-emerald-900">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white text-xs sm:text-sm font-semibold px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2 border border-slate-700 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Production Warning if Supabase is unconfigured (Requirement 3: Explicit Production Error) */}
      {supabaseProdStatus.isMissingInProduction && !dismissProdWarning && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2.5 text-amber-900 dark:text-amber-200">
          <div className="max-w-7xl mx-auto flex items-start sm:items-center justify-between gap-3 text-xs sm:text-sm">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
              <span>
                <strong>Perhatian Konfigurasi Produksi:</strong> Basis data Supabase belum terhubung (variabel <code className="font-mono bg-amber-500/20 px-1 py-0.5 rounded">VITE_SUPABASE_URL</code> dan <code className="font-mono bg-amber-500/20 px-1 py-0.5 rounded">VITE_SUPABASE_ANON_KEY</code> belum diisi). Data pesanan dan komisi saat ini hanya tersimpan di browser lokal.
              </span>
            </div>
            <button
              onClick={() => setDismissProdWarning(true)}
              className="text-amber-700 dark:text-amber-400 hover:text-amber-950 p-1"
              title="Tutup pemberitahuan"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* PWA Install Banner (renders only when supported, non-intrusive) */}
      {!isAdminView && !isAdminLoginView && (
        <PWAInstallButton variant="banner" />
      )}

      {/* Navbar (Only in customer views) */}
      {!isAdminView && !isAdminLoginView && (
        <Navbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          cartItemCount={totalCartCount}
          onOpenCart={handleNavigateToCart}
          onOpenTracking={() => {
            if (orders.length > 0) {
              handleNavigateToOrderDetail(orders[0].id);
            } else {
              showToast('Belum ada pesanan aktif.');
            }
          }}
          onOpenAuth={() => setIsAuthOpen(true)}
          currentUser={currentUser}
          isAdminView={false}
          onToggleAdminView={() => {}}
        />
      )}

      {/* Main View Router */}
      {isAdminLoginView ? (
        <AdminLoginPage
          onLoginSuccess={handleAdminLoginSuccess}
          onBackToStore={handleBackFromAdminLogin}
        />
      ) : isAdminView ? (
        <AdminDashboard
          currentUser={currentUser}
          products={products}
          categories={categories}
          orders={orders}
          storeConfig={storeConfig}
          affiliates={affiliateApps}
          campaigns={campaigns}
          onUpdateProducts={handleUpdateProducts}
          onUpdateOrders={handleUpdateOrders}
          onUpdateCategories={handleUpdateCategories}
          onUpdateConfig={handleUpdateConfig}
          onUpdateAffiliates={(newApps) => {
            setAffiliateApps(newApps);
            try {
              localStorage.setItem('tumpang_shop_affiliates', JSON.stringify(newApps));
            } catch (err) {
              console.error('Failed to update affiliates locally', err);
            }
          }}
          onUpdateCampaigns={handleUpdateCampaigns}
          onLogout={handleAdminLogout}
          onBackToCustomer={() => {
            setIsAdminView(false);
            window.history.pushState({}, '', '/');
          }}
        />
      ) : isAffiliateView ? (
        /* =================================================================== */
        /* AFFILIATE PROGRAM & REGISTRATION PAGE                               */
        /* =================================================================== */
        <>
          <AffiliatePage
            storeConfig={storeConfig}
            currentUser={currentUser}
            products={products}
            campaigns={campaigns}
            orders={orders}
            affiliates={affiliateApps}
            onBack={handleBackFromAffiliate}
            onSubmitApplication={handleAffiliateSubmit}
            existingApplication={null}
          />
          <Footer
            storeConfig={storeConfig}
            onOpenAffiliate={handleNavigateToAffiliate}
            onOpenAdminLogin={handleNavigateToAdminLogin}
          />
        </>
      ) : isCartView ? (
        /* =================================================================== */
        /* FULL-PAGE SHOPPING CART (/cart)                                     */
        /* =================================================================== */
        <>
          <CartPage
            items={cartItems}
            selectedItemIds={selectedCartItemIds}
            products={products}
            onToggleSelectItem={handleToggleSelectCartItem}
            onToggleSelectAll={handleToggleSelectAllCart}
            onUpdateQuantity={handleUpdateCartQuantity}
            onRemoveItem={handleRemoveCartItem}
            onClearCart={handleClearCart}
            onNavigateToCatalog={handleBackToCatalog}
            onProceedToCheckout={handleNavigateToCheckout}
          />
          <Footer
            storeConfig={storeConfig}
            onOpenAffiliate={handleNavigateToAffiliate}
            onOpenAdminLogin={handleNavigateToAdminLogin}
          />
        </>
      ) : isCheckoutView ? (
        /* =================================================================== */
        /* FULL-PAGE CHECKOUT (/checkout)                                      */
        /* =================================================================== */
        <>
          <CheckoutPage
            items={cartItems.filter(item => selectedCartItemIds.includes(item.cartItemId))}
            storeConfig={storeConfig}
            products={products}
            campaigns={campaigns}
            affiliates={affiliateApps}
            existingOrders={orders}
            activeReferralCode={activeReferralCode}
            onBackToCart={handleNavigateToCart}
            onOrderCreated={handleOrderCreated}
          />
          <Footer
            storeConfig={storeConfig}
            onOpenAffiliate={handleNavigateToAffiliate}
            onOpenAdminLogin={handleNavigateToAdminLogin}
          />
        </>
      ) : activePaymentOrderId ? (
        /* =================================================================== */
        /* FULL-PAGE PAYMENT INSTRUCTIONS (/orders/:id/payment)                */
        /* =================================================================== */
        (() => {
          const matchedOrder = orders.find(o => o.id === activePaymentOrderId || o.orderNumber === activePaymentOrderId);
          if (!matchedOrder) {
            return (
              <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
                <h2 className="text-lg font-bold text-slate-800">Pesanan Tidak Ditemukan</h2>
                <p className="text-xs text-slate-500 mt-1">Data pesanan tidak ditemukan di database toko.</p>
                <button
                  onClick={handleBackToCatalog}
                  className="mt-4 px-4 py-2 bg-[#FE8A00] text-white text-xs font-bold rounded-xl"
                >
                  Kembali ke Beranda
                </button>
              </div>
            );
          }
          return (
            <>
              <PaymentInstructionPage
                order={matchedOrder}
                onNavigateToOrderDetail={handleNavigateToOrderDetail}
                onNavigateToCatalog={handleBackToCatalog}
                onShowToast={showToast}
                onOrderUpdated={(updated) => {
                  handleUpdateOrders(orders.map(o => o.id === updated.id ? updated : o));
                }}
              />
              <Footer
                storeConfig={storeConfig}
                onOpenAffiliate={handleNavigateToAffiliate}
                onOpenAdminLogin={handleNavigateToAdminLogin}
              />
            </>
          );
        })()
      ) : activeOrderDetailId ? (
        /* =================================================================== */
        /* FULL-PAGE ORDER DETAIL & TRACKING (/orders/:id)                     */
        /* =================================================================== */
        (() => {
          const matchedOrder = orders.find(o => o.id === activeOrderDetailId || o.orderNumber === activeOrderDetailId);
          if (!matchedOrder) {
            return (
              <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
                <h2 className="text-lg font-bold text-slate-800">Pesanan Tidak Ditemukan</h2>
                <p className="text-xs text-slate-500 mt-1">Nomor pesanan tidak ditemukan di sistem.</p>
                <button
                  onClick={handleBackToCatalog}
                  className="mt-4 px-4 py-2 bg-[#FE8A00] text-white text-xs font-bold rounded-xl"
                >
                  Kembali ke Beranda
                </button>
              </div>
            );
          }
          return (
            <>
              <OrderDetailPage
                order={matchedOrder}
                onBackToOrders={handleBackToCatalog}
                onNavigateToPayment={handleNavigateToPaymentInstruction}
                onShowToast={showToast}
              />
              <Footer
                storeConfig={storeConfig}
                onOpenAffiliate={handleNavigateToAffiliate}
                onOpenAdminLogin={handleNavigateToAdminLogin}
              />
            </>
          );
        })()
      ) : activeProductDetail ? (
        /* =================================================================== */
        /* FULL-PAGE PRODUCT DETAIL VIEW                                       */
        /* =================================================================== */
        <>
          <ProductDetailPage
            product={activeProductDetail}
            categories={categories}
            allProducts={products}
            storeConfig={storeConfig}
            currentUser={currentUser}
            orders={orders}
            reviews={reviews}
            onBack={handleBackToCatalog}
            onSelectProduct={handleNavigateToProduct}
            onAddToCart={handleAddToCart}
            onBuyNow={handleBuyNow}
            onSubmitReview={handleReviewSubmit}
          />
          <Footer
            storeConfig={storeConfig}
            onOpenAffiliate={handleNavigateToAffiliate}
            onOpenAdminLogin={handleNavigateToAdminLogin}
          />
        </>
      ) : (
        /* =================================================================== */
        /* MAIN MARKETPLACE HOME CATALOG                                       */
        /* =================================================================== */
        <>
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-10">
            {/* Hero Banner Carousel */}
            <BannerCarousel />

            {/* Value Badges */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white p-3.5 rounded-2xl border border-slate-200/70 shadow-2xs flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-orange-50 text-[#FE8A00] flex items-center justify-center shrink-0">
                  <Store className="w-4 h-4" />
                </div>
                <div className="text-left">
                  <div className="text-xs font-bold text-slate-900">Produk Pilihan</div>
                  <div className="text-[10px] text-slate-500">Koleksi bermutu & menarik</div>
                </div>
              </div>

              <div className="bg-white p-3.5 rounded-2xl border border-slate-200/70 shadow-2xs flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="text-left">
                  <div className="text-xs font-bold text-slate-900">Kemudahan Belanja</div>
                  <div className="text-[10px] text-slate-500">Pemesanan praktis & cepat</div>
                </div>
              </div>

              <div className="bg-white p-3.5 rounded-2xl border border-slate-200/70 shadow-2xs flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                  <Truck className="w-4 h-4" />
                </div>
                <div className="text-left">
                  <div className="text-xs font-bold text-slate-900">Pengantaran Cepat</div>
                  <div className="text-[10px] text-slate-500">Langsung ke lokasi tujuan</div>
                </div>
              </div>

              <div className="bg-white p-3.5 rounded-2xl border border-slate-200/70 shadow-2xs flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div className="text-left">
                  <div className="text-xs font-bold text-slate-900">Layanan Terpercaya</div>
                  <div className="text-[10px] text-slate-500">Transaksi aman & nyaman</div>
                </div>
              </div>
            </div>

            {activeProducts.length === 0 ? (
              /* EMPTY CATALOG PROFESSIONAL STATE */
              <div className="bg-white rounded-3xl border border-slate-200/80 p-8 sm:p-14 text-center max-w-2xl mx-auto shadow-xs space-y-5 my-6">
                <div className="w-16 h-16 rounded-2xl bg-orange-50 text-[#FE8A00] flex items-center justify-center mx-auto shadow-xs">
                  <ShoppingBag className="w-8 h-8" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                    Katalog Produk Sedang Dipersiapkan
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-500 leading-relaxed max-w-md mx-auto">
                    Toko kami sedang menyusun dan memperbarui daftar koleksi produk pilihan dan berkualitas. Silakan kunjungi kembali dalam waktu dekat.
                  </p>
                </div>
                <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-center gap-3 text-xs">
                  <span className="text-slate-500 font-medium">Bagi pengelola toko:</span>
                  <button
                    onClick={handleNavigateToAdminLogin}
                    className="px-4 py-2 bg-[#FE8A00] hover:bg-[#e07b00] text-white font-bold rounded-xl transition-all shadow-md shadow-orange-500/20 active:scale-98"
                  >
                    Tambah Produk ke Katalog
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* 1. KATEGORI BELANJA DENGAN FOTO VISUAL & SUBKATEGORI */}
                <CategoryVisualCards
                  categories={categories}
                  products={products}
                  selectedCategoryId={selectedCategoryId}
                  onSelectCategory={(catId) => {
                    setSelectedCategoryId(catId);
                    setSelectedSubcategoryId('all');
                  }}
                  selectedSubcategoryId={selectedSubcategoryId}
                  onSelectSubcategory={setSelectedSubcategoryId}
                />

                {/* 2. BAGIAN A: PRODUK TERLARIS (HANYA DITAMPILKAN JIKA ADA PENJUALAN) */}
                {bestSellerProducts.length > 0 && (
                  <section className="space-y-4 pt-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                          <Flame className="w-5 h-5 text-amber-500" />
                          <span>Produk Terlaris</span>
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                            Pilihan Populer
                          </span>
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Produk paling banyak diminati dan dipesan oleh pelanggan
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                      {bestSellerProducts.map((product, idx) => (
                        <ProductCard
                          key={`bestseller-${product.id}`}
                          product={product}
                          badgeLabel={`Terlaris #${idx + 1}`}
                          badgeColor="amber"
                          soldCount={salesMap.get(product.id) || 0}
                          onSelect={handleNavigateToProduct}
                          onQuickAdd={(p) => handleAddToCart(p)}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {/* 2. BAGIAN B: PRODUK TERPOPULER (HANYA DITAMPILKAN JIKA ADA VIEW) */}
                {mostPopularProducts.length > 0 && (
                  <section className="space-y-4 pt-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                          <TrendingUp className="w-5 h-5 text-blue-600" />
                          <span>Produk Terpopuler</span>
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                            Banyak Dilihat
                          </span>
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Produk yang paling sering dilihat dan diminati oleh pengunjung toko
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                      {mostPopularProducts.map((product) => (
                        <ProductCard
                          key={`popular-${product.id}`}
                          product={product}
                          badgeLabel="Populer"
                          badgeColor="blue"
                          viewCount={product.viewCount || 0}
                          onSelect={handleNavigateToProduct}
                          onQuickAdd={(p) => handleAddToCart(p)}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {/* 2. BAGIAN C: SEMUA PRODUK (KATALOG UMUM) */}
                <section className="space-y-4 pt-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                        <ShoppingBag className="w-5 h-5 text-emerald-700" />
                        <span>Semua Produk</span>
                        {selectedCategoryId !== 'all' && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                            {categories.find(c => c.id === selectedCategoryId)?.name}
                          </span>
                        )}
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Menampilkan {allFilteredProducts.length} produk aktif
                      </p>
                    </div>

                    {/* Sorting & Filter Controls */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 bg-white border border-slate-200/80 rounded-xl px-2.5 py-1.5 text-xs text-slate-700">
                        <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                        <select
                          value={sortBy}
                          onChange={(e) => setSortBy(e.target.value as any)}
                          className="bg-transparent focus:outline-hidden font-medium text-slate-700 text-xs"
                        >
                          <option value="default">Urutkan: Rekomendasi</option>
                          <option value="price_asc">Harga: Termurah</option>
                          <option value="price_desc">Harga: Tertinggi</option>
                          <option value="name_asc">Nama: A — Z</option>
                        </select>
                      </div>

                      <button
                        onClick={() => setInStockOnly(!inStockOnly)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                          inStockOnly
                            ? 'bg-emerald-50 border-emerald-500 text-emerald-800'
                            : 'bg-white border-slate-200/80 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        {inStockOnly ? '✓ Hanya Tersedia' : 'Semua Stok'}
                      </button>
                    </div>
                  </div>

                  {allFilteredProducts.length === 0 ? (
                    <div className="bg-white rounded-3xl border border-slate-200/80 p-12 text-center text-slate-400">
                      <ShoppingBag className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                      <h3 className="text-sm font-bold text-slate-700">Produk Tidak Ditemukan</h3>
                      <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                        Coba sesuaikan kata kunci pencarian, ubah filter stok, atau pilih kategori lainnya.
                      </p>
                      <button
                        onClick={() => {
                          setSearchQuery('');
                          setSelectedCategoryId('all');
                          setSelectedSubcategoryId('all');
                          setInStockOnly(false);
                          setSortBy('default');
                        }}
                        className="mt-4 px-4 py-2 bg-emerald-50 text-emerald-700 font-bold text-xs rounded-xl hover:bg-emerald-100 transition-colors"
                      >
                        Reset Semua Filter
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                      {allFilteredProducts.map((product) => (
                        <ProductCard
                          key={`all-${product.id}`}
                          product={product}
                          onSelect={handleNavigateToProduct}
                          onQuickAdd={(p) => handleAddToCart(p)}
                        />
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
          </main>

          {/* 3. FOOTER MARKETPLACE PROFESIONAL */}
          <Footer
            storeConfig={storeConfig}
            onOpenAffiliate={handleNavigateToAffiliate}
            onOpenAdminLogin={handleNavigateToAdminLogin}
          />
        </>
      )}

      {/* User Authentication Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        currentUser={currentUser}
        onLogin={handleLogin}
        onLogout={handleLogout}
        onSwitchToAdmin={() => {
          setIsAdminView(true);
          window.history.pushState({}, '', '/admin');
        }}
      />
    </div>
  );
}
