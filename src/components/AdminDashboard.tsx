import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { 
  Product, Category, Order, StoreConfig, AffiliateApplication, 
  ProductVariation, ProductVariationOption, UserProfile,
  AffiliateCampaign, CampaignStatus, CampaignConflict, OrderAffiliateSnapshot
} from '../types';
import { getCategoryPhotoAuto } from '../data/mockData';
import { uploadProductImageToStorage, getSupabaseConfigStatus, fetchAdminOrders, updateAdminOrderStatus } from '../lib/supabase';
import { 
  getCampaignPerformance, detectCampaignConflicts, isCampaignActiveAt, 
  getEffectiveProductCommission, syncOrderAffiliateStatus 
} from '../lib/commissionCalculator';
import { getPayoutRequests, updatePayoutRequestStatus, AffiliatePayoutRequest, getStoredAdminToken } from '../lib/affiliateAttribution';
import AdminOrderDetailPage from './admin/AdminOrderDetailPage';
import AdminCampaignFormPage from './admin/AdminCampaignFormPage';
import AdminCustomerDetailPage from './admin/AdminCustomerDetailPage';
import AdminAffiliateDetailPage from './admin/AdminAffiliateDetailPage';
import AdminCategoryFormPage from './admin/AdminCategoryFormPage';
import { 
  Package, ShoppingBag, TrendingUp, AlertTriangle, Plus, Trash2, 
  Edit3, Check, X, Store, Settings, Truck, DollarSign, Filter, Search,
  Layers, ArrowUp, ArrowDown, Image as ImageIcon, Sparkles, CheckCircle2,
  AlertCircle, Upload, Star, Loader2, Users, CreditCard, BarChart3, FolderTree,
  ChevronRight, ArrowLeft, Download, RefreshCw, Eye, ExternalLink,
  ChevronDown, CheckSquare, Square, MoreHorizontal, ArrowUpDown, ShieldCheck,
  Calendar, Phone, Mail, MapPin, Percent, HelpCircle, LogOut, Flame,
  Clock, Tag, Play, CheckCircle, PauseCircle, StopCircle, Award
} from 'lucide-react';

export interface AdminDashboardProps {
  products: Product[];
  categories: Category[];
  orders: Order[];
  storeConfig: StoreConfig;
  affiliates: AffiliateApplication[];
  campaigns?: AffiliateCampaign[];
  currentUser?: UserProfile | null;
  onUpdateProducts: (products: Product[]) => void;
  onUpdateOrders: (orders: Order[]) => void;
  onUpdateCategories: (categories: Category[]) => void;
  onUpdateConfig: (config: StoreConfig) => void;
  onUpdateAffiliates?: (affiliates: AffiliateApplication[]) => void;
  onUpdateCampaigns?: (campaigns: AffiliateCampaign[]) => void;
  onBackToCustomer: () => void;
  onLogout?: () => void;
}

// Navigation Structure Types
export type AdminTab = 
  | 'overview' 
  | 'products' 
  | 'categories' 
  | 'orders' 
  | 'payments' 
  | 'customers' 
  | 'affiliates' 
  | 'reports' 
  | 'settings';

export type AdminViewMode = 
  | 'list' 
  | 'product_new' 
  | 'product_edit' 
  | 'category_new' 
  | 'category_edit' 
  | 'order_detail'
  | 'campaign_new'
  | 'campaign_edit'
  | 'customer_detail'
  | 'affiliate_detail';

export default function AdminDashboard({
  products,
  categories,
  orders,
  storeConfig,
  affiliates = [],
  campaigns = [],
  currentUser,
  onUpdateProducts,
  onUpdateOrders,
  onUpdateCategories,
  onUpdateConfig,
  onUpdateAffiliates,
  onUpdateCampaigns,
  onBackToCustomer,
  onLogout
}: AdminDashboardProps) {
  // Authentication Guard: Ensure only users with admin role can access dashboard
  useEffect(() => {
    if (currentUser && currentUser.role !== 'admin') {
      if (onLogout) onLogout();
      else onBackToCustomer();
    }
  }, [currentUser, onLogout, onBackToCustomer]);

  // Primary Tab and Dedicated Form/Detail Page View Modes
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [formView, setFormView] = useState<AdminViewMode>('list');

  // Synchronize orders with backend using authenticated admin session
  useEffect(() => {
    const adminToken = getStoredAdminToken();
    if (adminToken) {
      fetchAdminOrders(adminToken).then(serverOrders => {
        if (serverOrders && serverOrders.length > 0) {
          onUpdateOrders(serverOrders);
        }
      }).catch(err => {
        console.warn('[AdminDashboard] Orders backend fetch notice:', err);
      });
    }
  }, []);

  // Active target IDs for dedicated edit and detail pages
  const [activeEditingProductId, setActiveEditingProductId] = useState<string | null>(null);
  const [activeEditingCategoryId, setActiveEditingCategoryId] = useState<string | null>(null);
  const [activeDetailOrderId, setActiveDetailOrderId] = useState<string | null>(null);
  const [activeDetailOrder, setActiveDetailOrder] = useState<Order | null>(null);
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);
  const [activeDetailCustomerId, setActiveDetailCustomerId] = useState<string | null>(null);
  const [activeDetailAffiliateId, setActiveDetailAffiliateId] = useState<string | null>(null);

  // Toast feedback state
  const [adminToast, setAdminToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setAdminToast({ message, type });
    setTimeout(() => setAdminToast(null), 3000);
  };

  // --------------------------------------------------------------------------
  // PRODUCTS MANAGEMENT STATE
  // --------------------------------------------------------------------------
  const [productSearch, setProductSearch] = useState('');
  const [productCategoryFilter, setProductCategoryFilter] = useState('ALL');
  const [productStockFilter, setProductStockFilter] = useState<'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK'>('ALL');
  const [productStatusFilter, setProductStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [productPage, setProductPage] = useState(1);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const itemsPerPage = 8;

  // Product Form Input Fields (Used in /admin/products/new & /admin/products/:id/edit)
  const [pName, setPName] = useState('');
  const [pSku, setPSku] = useState('');
  const [pPrice, setPPrice] = useState(0);
  const [pOriginalPrice, setPOriginalPrice] = useState<number | undefined>(undefined);
  const [pStock, setPStock] = useState(0);
  const [pUnit, setPUnit] = useState('kg');
  const [pCategory, setPCategory] = useState(categories[0]?.id || '');
  const [pSubcategory, setPSubcategory] = useState('');
  const [pDescription, setPDescription] = useState('');
  const [pImages, setPImages] = useState<string[]>([]);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [pIsActive, setPIsActive] = useState(true);
  const [pIsFeatured, setPIsFeatured] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Custom Product Commission State (Requirement 2)
  const [pUseCustomCommission, setPUseCustomCommission] = useState(false);
  const [pCustomCommissionRate, setPCustomCommissionRate] = useState(15);

  // Variations Editor State
  const [pHasVariations, setPHasVariations] = useState(false);
  const [pVariationName, setPVariationName] = useState('Pilihan / Ukuran');
  const [pVariationOptions, setPVariationOptions] = useState<ProductVariationOption[]>([]);
  const [newVarOptName, setNewVarOptName] = useState('');
  const [newVarOptDelta, setNewVarOptDelta] = useState(0);
  const [newVarOptStock, setNewVarOptStock] = useState(10);

  // Initialize or Reset Product Form
  const initProductForm = (product?: Product | null) => {
    if (product) {
      setPName(product.name);
      setPSku(product.sku);
      setPPrice(product.price);
      setPOriginalPrice(product.originalPrice);
      setPStock(product.stock);
      setPUnit(product.unit);
      setPCategory(product.categoryId);
      setPSubcategory(product.subcategoryId || '');
      setPDescription(product.description || '');
      setPImages(product.images && product.images.length > 0 ? product.images : ['https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&auto=format&fit=crop&q=80']);
      setPIsActive(product.isActive);
      setPIsFeatured(product.isFeatured || false);
      setPUseCustomCommission(product.useCustomCommission || false);
      setPCustomCommissionRate(product.customCommissionRate !== undefined ? product.customCommissionRate : 15);
      if (product.variations && product.variations.length > 0) {
        setPHasVariations(true);
        setPVariationName(product.variations[0].name);
        setPVariationOptions(product.variations[0].options || []);
      } else {
        setPHasVariations(false);
        setPVariationName('Pilihan / Ukuran');
        setPVariationOptions([]);
      }
    } else {
      setPName('');
      setPSku(`PRD-${Date.now().toString().slice(-5)}`);
      setPPrice(25000);
      setPOriginalPrice(undefined);
      setPStock(20);
      setPUnit('pcs');
      const rootCat = categories.find(c => !c.parentId);
      setPCategory(rootCat ? rootCat.id : (categories[0]?.id || ''));
      setPSubcategory('');
      setPDescription('');
      setPImages(['https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=800&auto=format&fit=crop&q=80']);
      setPIsActive(true);
      setPIsFeatured(false);
      setPUseCustomCommission(false);
      setPCustomCommissionRate(storeConfig?.defaultAffiliateCommissionRate || 15);
      setPHasVariations(false);
      setPVariationName('Pilihan / Ukuran');
      setPVariationOptions([]);
    }
    setNewImageUrl('');
  };

  // --------------------------------------------------------------------------
  // CATEGORIES MANAGEMENT STATE
  // --------------------------------------------------------------------------
  const [categorySearch, setCategorySearch] = useState('');
  const [categoryStatusFilter, setCategoryStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [categoryTypeFilter, setCategoryTypeFilter] = useState<string>('ALL');
  const [categoryPage, setCategoryPage] = useState(1);
  const [createCategoryParentId, setCreateCategoryParentId] = useState<string | null>(null);
  const [createCategoryIsSubcategory, setCreateCategoryIsSubcategory] = useState(false);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const [deleteConflictReason, setDeleteConflictReason] = useState<string | null>(null);
  const [reassignTargetCatId, setReassignTargetCatId] = useState<string>('');



  // --------------------------------------------------------------------------
  // ORDERS & PAYMENTS MANAGEMENT STATE
  // --------------------------------------------------------------------------
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<'ALL' | Order['orderStatus']>('ALL');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<'ALL' | Order['paymentStatus']>('ALL');
  const [orderPage, setOrderPage] = useState(1);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);

  // --------------------------------------------------------------------------
  // CUSTOMERS STATE (Aggregated from real orders)
  // --------------------------------------------------------------------------
  const customerList = useMemo(() => {
    const map = new Map<string, { phone: string; name: string; email?: string; district: string; address: string; orderCount: number; totalSpend: number; lastOrderDate: string }>();
    for (const ord of orders) {
      const key = ord.customerPhone || ord.customerName;
      const existing = map.get(key);
      if (existing) {
        existing.orderCount += 1;
        existing.totalSpend += ord.total;
        if (new Date(ord.createdAt) > new Date(existing.lastOrderDate)) {
          existing.lastOrderDate = ord.createdAt;
          existing.district = ord.customerDistrict;
          existing.address = ord.deliveryAddress;
        }
      } else {
        map.set(key, {
          phone: ord.customerPhone,
          name: ord.customerName,
          email: ord.customerEmail,
          district: ord.customerDistrict,
          address: ord.deliveryAddress,
          orderCount: 1,
          totalSpend: ord.total,
          lastOrderDate: ord.createdAt
        });
      }
    }
    return Array.from(map.values());
  }, [orders]);

  const [customerSearch, setCustomerSearch] = useState('');

  // --------------------------------------------------------------------------
  // BROWSER HISTORY & DEDICATED FULL-PAGE ROUTING SYNCHRONIZATION
  // --------------------------------------------------------------------------
  const syncAdminRoute = useCallback(() => {
    const path = window.location.pathname;

    // 1. Products routes (/admin/products/new & /admin/products/:id/edit)
    if (path === '/admin/products/new') {
      setActiveTab('products');
      setFormView('product_new');
      setActiveEditingProductId(null);
      initProductForm(null);
      return;
    }
    if (path.startsWith('/admin/products/') && path.endsWith('/edit')) {
      const prodId = path.replace('/admin/products/', '').replace('/edit', '').replace(/\/$/, '');
      const matched = products.find(p => p.id === prodId);
      setActiveTab('products');
      setFormView('product_edit');
      setActiveEditingProductId(prodId);
      if (matched) initProductForm(matched);
      return;
    }
    if (path === '/admin/products') {
      setActiveTab('products');
      setFormView('list');
      return;
    }

    // 2. Categories routes (/admin/categories/new & /admin/categories/:id/edit)
    if (path === '/admin/categories/new') {
      setActiveTab('categories');
      setFormView('category_new');
      setActiveEditingCategoryId(null);
      return;
    }
    if (path.startsWith('/admin/categories/') && path.endsWith('/edit')) {
      const catId = path.replace('/admin/categories/', '').replace('/edit', '').replace(/\/$/, '');
      setActiveTab('categories');
      setFormView('category_edit');
      setActiveEditingCategoryId(catId);
      return;
    }
    if (path === '/admin/categories') {
      setActiveTab('categories');
      setFormView('list');
      return;
    }

    // 3. Orders routes (/admin/orders/:id)
    if (path.startsWith('/admin/orders/')) {
      const orderId = path.replace('/admin/orders/', '').replace(/\/$/, '').trim();
      if (orderId && orderId !== 'list') {
        const matched = orders.find(o => o.id === orderId || o.orderNumber === orderId);
        setActiveTab('orders');
        setFormView('order_detail');
        setActiveDetailOrderId(orderId);
        if (matched) setActiveDetailOrder(matched);
        return;
      }
    }
    if (path === '/admin/orders') {
      setActiveTab('orders');
      setFormView('list');
      setActiveDetailOrderId(null);
      setActiveDetailOrder(null);
      return;
    }

    // 4. Affiliate Campaigns routes (/admin/affiliate/campaigns/new & :id/edit)
    if (path === '/admin/affiliate/campaigns/new' || path === '/admin/affiliates/campaigns/new') {
      setActiveTab('affiliates');
      setFormView('campaign_new');
      setEditingCampaignId(null);
      return;
    }
    if (
      (path.startsWith('/admin/affiliate/campaigns/') || path.startsWith('/admin/affiliates/campaigns/')) &&
      path.endsWith('/edit')
    ) {
      const campId = path
        .replace('/admin/affiliate/campaigns/', '')
        .replace('/admin/affiliates/campaigns/', '')
        .replace('/edit', '')
        .replace(/\/$/, '');
      setActiveTab('affiliates');
      setFormView('campaign_edit');
      setEditingCampaignId(campId);
      return;
    }

    // 5. Affiliate Partner Detail (/admin/affiliate/:id)
    if (path.startsWith('/admin/affiliate/') || path.startsWith('/admin/affiliates/')) {
      const affId = path
        .replace('/admin/affiliate/', '')
        .replace('/admin/affiliates/', '')
        .replace(/\/$/, '').trim();
      if (affId && !['list', 'campaigns', 'applications', 'transactions', 'settings'].includes(affId)) {
        setActiveTab('affiliates');
        setFormView('affiliate_detail');
        setActiveDetailAffiliateId(affId);
        return;
      }
    }
    if (path === '/admin/affiliates' || path === '/admin/affiliate') {
      setActiveTab('affiliates');
      setFormView('list');
      setActiveDetailAffiliateId(null);
      return;
    }

    // 6. Customers Detail (/admin/customers/:id)
    if (path.startsWith('/admin/customers/')) {
      const custId = decodeURIComponent(path.replace('/admin/customers/', '').replace(/\/$/, '')).trim();
      if (custId && custId !== 'list') {
        setActiveTab('customers');
        setFormView('customer_detail');
        setActiveDetailCustomerId(custId);
        return;
      }
    }
    if (path === '/admin/customers') {
      setActiveTab('customers');
      setFormView('list');
      setActiveDetailCustomerId(null);
      return;
    }

    // 7. General Admin Tabs
    if (path.startsWith('/admin/payments')) {
      setActiveTab('payments');
      setFormView('list');
      return;
    }
    if (path.startsWith('/admin/reports')) {
      setActiveTab('reports');
      setFormView('list');
      return;
    }
    if (path.startsWith('/admin/settings')) {
      setActiveTab('settings');
      setFormView('list');
      return;
    }
    if (path === '/admin' || path === '/admin/overview') {
      setActiveTab('overview');
      setFormView('list');
      return;
    }
  }, [products, categories, orders, campaigns, affiliates]);

  // Navigate function with direct browser URL update
  const navigateAdmin = useCallback((
    tab: AdminTab, 
    mode: AdminViewMode = 'list', 
    targetId?: string
  ) => {
    setActiveTab(tab);
    setFormView(mode);

    if (mode === 'product_edit' && targetId) {
      setActiveEditingProductId(targetId);
      const matched = products.find(p => p.id === targetId);
      if (matched) initProductForm(matched);
    } else if (mode === 'product_new') {
      setActiveEditingProductId(null);
      initProductForm(null);
    }

    if (mode === 'category_edit' && targetId) {
      setActiveEditingCategoryId(targetId);
    } else if (mode === 'category_new') {
      setActiveEditingCategoryId(null);
    }

    if (mode === 'order_detail' && targetId) {
      setActiveDetailOrderId(targetId);
      const matched = orders.find(o => o.id === targetId || o.orderNumber === targetId);
      if (matched) setActiveDetailOrder(matched);
    } else if (mode !== 'order_detail') {
      setActiveDetailOrderId(null);
      setActiveDetailOrder(null);
    }

    if (mode === 'campaign_edit' && targetId) {
      setEditingCampaignId(targetId);
    } else if (mode === 'campaign_new') {
      setEditingCampaignId(null);
    }

    if (mode === 'customer_detail' && targetId) {
      setActiveDetailCustomerId(targetId);
    } else if (mode !== 'customer_detail') {
      setActiveDetailCustomerId(null);
    }

    if (mode === 'affiliate_detail' && targetId) {
      setActiveDetailAffiliateId(targetId);
    } else if (mode !== 'affiliate_detail') {
      setActiveDetailAffiliateId(null);
    }

    let urlPath = `/admin/${tab}`;
    if (tab === 'overview') urlPath = '/admin';
    if (mode === 'product_new') urlPath = '/admin/products/new';
    if (mode === 'product_edit' && targetId) urlPath = `/admin/products/${targetId}/edit`;
    if (mode === 'category_new') urlPath = '/admin/categories/new';
    if (mode === 'category_edit' && targetId) urlPath = `/admin/categories/${targetId}/edit`;
    if (mode === 'order_detail' && targetId) urlPath = `/admin/orders/${targetId}`;
    if (mode === 'campaign_new') urlPath = '/admin/affiliate/campaigns/new';
    if (mode === 'campaign_edit' && targetId) urlPath = `/admin/affiliate/campaigns/${targetId}/edit`;
    if (mode === 'customer_detail' && targetId) urlPath = `/admin/customers/${encodeURIComponent(targetId)}`;
    if (mode === 'affiliate_detail' && targetId) urlPath = `/admin/affiliate/${targetId}`;

    window.history.pushState({}, '', urlPath);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [products, categories, orders]);

  // Synchronize route on initial mount and on browser back/forward buttons (popstate)
  useEffect(() => {
    syncAdminRoute();
    const handlePopState = () => {
      syncAdminRoute();
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [syncAdminRoute]);

  // --------------------------------------------------------------------------
  // METRICS & OVERVIEW CALCULATIONS
  // --------------------------------------------------------------------------
  const totalRevenue = useMemo(() => orders.reduce((sum, o) => sum + o.total, 0), [orders]);
  const paidOrders = useMemo(() => orders.filter(o => o.paymentStatus === 'PAID'), [orders]);
  const paidRevenue = useMemo(() => paidOrders.reduce((sum, o) => sum + o.total, 0), [paidOrders]);
  const completedOrders = useMemo(() => orders.filter(o => o.orderStatus === 'COMPLETED'), [orders]);
  const pendingOrders = useMemo(() => orders.filter(o => o.orderStatus === 'NEW' || o.orderStatus === 'PROCESSING'), [orders]);
  const lowStockCount = useMemo(() => products.filter(p => p.stock > 0 && p.stock <= 5).length, [products]);
  const outOfStockCount = useMemo(() => products.filter(p => p.stock <= 0).length, [products]);

  // Operational conversion rate
  const conversionRate = orders.length > 0 
    ? ((completedOrders.length / orders.length) * 100).toFixed(1)
    : '0.0';

  // --------------------------------------------------------------------------
  // PRODUCT ACTION HANDLERS
  // --------------------------------------------------------------------------
  const handleOpenCreateProduct = () => {
    initProductForm(null);
    navigateAdmin('products', 'product_new');
  };

  const handleOpenEditProduct = (prod: Product) => {
    initProductForm(prod);
    navigateAdmin('products', 'product_edit', prod.id);
  };

  const handleToggleProductStatus = (prodId: string) => {
    const updated = products.map(p => 
      p.id === prodId ? { ...p, isActive: !p.isActive, updatedAt: new Date().toISOString() } : p
    );
    onUpdateProducts(updated);
    showToast('Status produk berhasil diperbarui');
  };

  const handleDeleteProduct = (prodId: string) => {
    const prod = products.find(p => p.id === prodId);
    if (!prod) return;
    if (confirm(`Hapus produk "${prod.name}" secara permanen dari katalog?`)) {
      const updated = products.filter(p => p.id !== prodId);
      onUpdateProducts(updated);
      showToast(`Produk "${prod.name}" telah dihapus`, 'info');
    }
  };

  const handleBulkToggleProductStatus = (targetActive: boolean) => {
    if (selectedProductIds.length === 0) return;
    const updated = products.map(p => 
      selectedProductIds.includes(p.id) ? { ...p, isActive: targetActive, updatedAt: new Date().toISOString() } : p
    );
    onUpdateProducts(updated);
    setSelectedProductIds([]);
    showToast(`${selectedProductIds.length} produk di-${targetActive ? 'aktifkan' : 'nonaktifkan'}`);
  };

  const handleBulkDeleteProducts = () => {
    if (selectedProductIds.length === 0) return;
    if (confirm(`Hapus ${selectedProductIds.length} produk yang dipilih secara permanen?`)) {
      const updated = products.filter(p => !selectedProductIds.includes(p.id));
      onUpdateProducts(updated);
      setSelectedProductIds([]);
      showToast(`${selectedProductIds.length} produk berhasil dihapus`, 'info');
    }
  };

  // Image Upload and Ordering Handlers
  const handleAddImageUrl = () => {
    if (!newImageUrl.trim()) return;
    setPImages(prev => [...prev, newImageUrl.trim()]);
    setNewImageUrl('');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsUploadingPhoto(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const uploadedUrl = await uploadProductImageToStorage(file);
        setPImages(prev => [...prev, uploadedUrl]);
      }
      showToast(`${files.length} foto berhasil diunggah`);
    } catch (err) {
      console.error('Upload failed', err);
      showToast('Gagal mengunggah foto. Silakan coba lagi.', 'error');
    } finally {
      setIsUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSetPrimaryPhoto = (index: number) => {
    if (index === 0) return;
    setPImages(prev => {
      const copy = [...prev];
      const [chosen] = copy.splice(index, 1);
      return [chosen, ...copy];
    });
    showToast('Foto utama katalog diperbarui');
  };

  const handleMovePhoto = (from: number, to: number) => {
    if (to < 0 || to >= pImages.length) return;
    setPImages(prev => {
      const copy = [...prev];
      const [item] = copy.splice(from, 1);
      copy.splice(to, 0, item);
      return copy;
    });
  };

  const handleRemovePhoto = (index: number) => {
    if (pImages.length <= 1) {
      alert('Produk harus memiliki minimal 1 foto utama.');
      return;
    }
    setPImages(prev => prev.filter((_, idx) => idx !== index));
  };

  // Variation handlers
  const handleAddVariationOption = () => {
    if (!newVarOptName.trim()) return;
    const opt: ProductVariationOption = {
      id: `opt_${Date.now()}`,
      name: newVarOptName.trim(),
      priceDelta: Number(newVarOptDelta) || 0,
      stock: Number(newVarOptStock) >= 0 ? Number(newVarOptStock) : 10,
      sku: `${pSku}-${newVarOptName.trim().toUpperCase().replace(/\s+/g, '')}`
    };
    setPVariationOptions(prev => [...prev, opt]);
    setNewVarOptName('');
    setNewVarOptDelta(0);
    setNewVarOptStock(10);
  };

  const handleRemoveVariationOption = (optId: string) => {
    setPVariationOptions(prev => prev.filter(o => o.id !== optId));
  };

  // Submit Product Save
  const handleSaveProductForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pName.trim()) {
      alert('Nama produk tidak boleh kosong.');
      return;
    }

    const finalImages = pImages.filter(img => Boolean(img && img.trim()));
    if (finalImages.length === 0) {
      alert('Produk harus memiliki minimal 1 foto untuk katalog.');
      return;
    }

    const variationsToSave: ProductVariation[] | undefined = pHasVariations && pVariationOptions.length > 0
      ? [{
          id: `var_${Date.now()}`,
          name: pVariationName.trim() || 'Pilihan',
          options: pVariationOptions
        }]
      : undefined;

    // If variations exist, compute total stock from variation options
    const computedStock = variationsToSave
      ? pVariationOptions.reduce((acc, opt) => acc + opt.stock, 0)
      : Number(pStock);

    const validatedCustomRate = pUseCustomCommission 
      ? Math.min(100, Math.max(0, Number(pCustomCommissionRate) || 0)) 
      : undefined;

    if (formView === 'product_edit' && activeEditingProductId) {
      const updated = products.map(p => {
        if (p.id === activeEditingProductId) {
          return {
            ...p,
            name: pName.trim(),
            sku: pSku.trim(),
            price: Number(pPrice),
            originalPrice: pOriginalPrice ? Number(pOriginalPrice) : undefined,
            stock: computedStock,
            unit: pUnit.trim(),
            categoryId: pCategory,
            subcategoryId: pSubcategory ? pSubcategory : undefined,
            description: pDescription.trim(),
            images: finalImages,
            isActive: pIsActive,
            isFeatured: pIsFeatured,
            variations: variationsToSave,
            useCustomCommission: pUseCustomCommission,
            customCommissionRate: validatedCustomRate,
            updatedAt: new Date().toISOString()
          };
        }
        return p;
      });
      onUpdateProducts(updated);
      showToast(`Produk "${pName}" berhasil diperbarui!`);
    } else {
      const newProd: Product = {
        id: `prod_${Date.now()}`,
        name: pName.trim(),
        sku: pSku.trim(),
        price: Number(pPrice),
        originalPrice: pOriginalPrice ? Number(pOriginalPrice) : undefined,
        stock: computedStock,
        unit: pUnit.trim(),
        categoryId: pCategory,
        subcategoryId: pSubcategory ? pSubcategory : undefined,
        description: pDescription.trim(),
        images: finalImages,
        isActive: pIsActive,
        isFeatured: pIsFeatured,
        variations: variationsToSave,
        useCustomCommission: pUseCustomCommission,
        customCommissionRate: validatedCustomRate,
        viewCount: 0,
        salesCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      onUpdateProducts([newProd, ...products]);
      showToast(`Produk baru "${pName}" berhasil ditambahkan ke katalog!`);
    }

    navigateAdmin('products', 'list');
  };

  // --------------------------------------------------------------------------
  // CATEGORIES ACTION HANDLERS
  // --------------------------------------------------------------------------
  const handleOpenCreateCategory = (parentId: string | null = null, isSubcategory = false) => {
    setCreateCategoryParentId(parentId);
    setCreateCategoryIsSubcategory(isSubcategory);
    setActiveEditingCategoryId(null);
    navigateAdmin('categories', 'category_new');
  };

  const handleOpenCreateSubcategory = (targetParentId?: string) => {
    handleOpenCreateCategory(targetParentId || null, true);
  };

  const handleOpenEditCategory = (cat: Category) => {
    setActiveEditingCategoryId(cat.id);
    setCreateCategoryParentId(cat.parentId || null);
    setCreateCategoryIsSubcategory(Boolean(cat.parentId));
    navigateAdmin('categories', 'category_edit', cat.id);
  };

  const handleToggleCategoryActive = (catId: string) => {
    const updated = categories.map(c => 
      c.id === catId ? { ...c, isActive: !c.isActive, updatedAt: new Date().toISOString() } : c
    );
    onUpdateCategories(updated);
    showToast('Status kategori berhasil diperbarui');
  };

  const handleSaveCategoryForm = (categoryData: Category) => {
    const exists = categories.some(c => c.id === categoryData.id);
    const updated = exists 
      ? categories.map(c => c.id === categoryData.id ? categoryData : c)
      : [...categories, categoryData];
    onUpdateCategories(updated);
    showToast(exists ? `Kategori "${categoryData.name}" berhasil diperbarui` : `Kategori "${categoryData.name}" berhasil dibuat`);
    navigateAdmin('categories', 'list');
  };

  const handleRequestDeleteCategory = (cat: Category) => {
    // 1. Relational check: Does this category have child subcategories?
    const childSubcategories = categories.filter(c => c.parentId === cat.id);
    if (childSubcategories.length > 0) {
      setDeletingCategory(cat);
      setDeleteConflictReason(`Kategori "${cat.name}" memiliki ${childSubcategories.length} subkategori aktif (${childSubcategories.map(s => s.name).join(', ')}). Sesuai aturan integritas data relasional, Anda harus memindahkan atau menghapus subkategori terlebih dahulu sebelum menghapus kategori utama ini.`);
      return;
    }

    // 2. Relational check: Does this category or subcategory have assigned products?
    const assignedProducts = products.filter(p => p.categoryId === cat.id || p.subcategoryId === cat.id);
    if (assignedProducts.length > 0) {
      setDeletingCategory(cat);
      setDeleteConflictReason(null);
      const otherCats = categories.filter(c => c.id !== cat.id && !c.parentId);
      setReassignTargetCatId(otherCats[0]?.id || '');
      return;
    }

    // 3. Clean deletion with confirmation
    if (confirm(`Yakin ingin menghapus ${cat.parentId ? 'subkategori' : 'kategori'} "${cat.name}"? Tindakan ini tidak dapat dibatalkan.`)) {
      onUpdateCategories(categories.filter(c => c.id !== cat.id));
      showToast(`${cat.parentId ? 'Subkategori' : 'Kategori'} "${cat.name}" telah dihapus`, 'info');
    }
  };

  const handleConfirmReassignAndDeleteCategory = () => {
    if (!deletingCategory) return;
    if (!reassignTargetCatId) {
      alert('Pilih kategori tujuan pemindahan produk terlebih dahulu.');
      return;
    }

    const updatedProducts = products.map(p => {
      let updated = { ...p };
      if (p.categoryId === deletingCategory.id) {
        updated.categoryId = reassignTargetCatId;
        updated.updatedAt = new Date().toISOString();
      }
      if (p.subcategoryId === deletingCategory.id) {
        updated.subcategoryId = undefined;
        updated.updatedAt = new Date().toISOString();
      }
      return updated;
    });
    onUpdateProducts(updatedProducts);

    const updatedCategories = categories.filter(c => c.id !== deletingCategory.id);
    onUpdateCategories(updatedCategories);

    showToast(`Produk dialihkan dan kategori "${deletingCategory.name}" berhasil dihapus.`);
    setDeletingCategory(null);
    setDeleteConflictReason(null);
  };

  // --------------------------------------------------------------------------
  // ORDER & PAYMENT ACTION HANDLERS
  // --------------------------------------------------------------------------
  const handleUpdateOrderStatus = (orderId: string, newStatus: Order['orderStatus']) => {
    const targetOrder = orders.find(o => o.id === orderId);
    
    // Auto-restore stock if order gets cancelled
    if (targetOrder && targetOrder.orderStatus !== 'CANCELLED' && newStatus === 'CANCELLED') {
      const restoredProducts = products.map(p => {
        const item = targetOrder.items.find(i => i.productId === p.id);
        if (!item) return p;
        let newStock = p.stock + item.quantity;
        let newVars = p.variations;
        if (newVars && item.sku) {
          newVars = newVars.map(v => ({
            ...v,
            options: v.options.map(opt => 
              opt.sku === item.sku ? { ...opt, stock: opt.stock + item.quantity } : opt
            )
          }));
        }
        return { ...p, stock: newStock, variations: newVars, updatedAt: new Date().toISOString() };
      });
      onUpdateProducts(restoredProducts);
    }

    const updated = orders.map(o => {
      if (o.id === orderId) {
        const withStatus = { ...o, orderStatus: newStatus, updatedAt: new Date().toISOString() };
        return syncOrderAffiliateStatus(withStatus);
      }
      return o;
    });
    onUpdateOrders(updated);
    showToast(`Status pesanan diperbarui menjadi ${newStatus}`);

    // Persist to backend server and Supabase via authenticated endpoint
    const adminToken = getStoredAdminToken();
    if (adminToken) {
      updateAdminOrderStatus(orderId, { orderStatus: newStatus }, adminToken).catch(err => {
        console.warn('Backend orderStatus sync notice:', err);
      });
    }
  };

  const handleUpdatePaymentStatus = (orderId: string, newStatus: Order['paymentStatus']) => {
    const updated = orders.map(o => {
      if (o.id === orderId) {
        const withStatus = { 
          ...o, 
          paymentStatus: newStatus, 
          paidAt: newStatus === 'PAID' ? (o.paidAt || new Date().toISOString()) : undefined,
          updatedAt: new Date().toISOString() 
        };
        return syncOrderAffiliateStatus(withStatus);
      }
      return o;
    });
    onUpdateOrders(updated);
    showToast(`Status pembayaran diperbarui menjadi ${newStatus}`);

    // Persist to backend server and Supabase via authenticated endpoint
    const adminToken = getStoredAdminToken();
    if (adminToken) {
      updateAdminOrderStatus(orderId, { paymentStatus: newStatus }, adminToken).catch(err => {
        console.warn('Backend paymentStatus sync notice:', err);
      });
    }
  };

  const handleBulkUpdateOrderStatus = (status: Order['orderStatus']) => {
    if (selectedOrderIds.length === 0) return;
    const updated = orders.map(o => 
      selectedOrderIds.includes(o.id) 
        ? syncOrderAffiliateStatus({ ...o, orderStatus: status, updatedAt: new Date().toISOString() }) 
        : o
    );
    onUpdateOrders(updated);
    const affectedIds = [...selectedOrderIds];
    setSelectedOrderIds([]);
    showToast(`${affectedIds.length} pesanan diubah ke status ${status}`);

    const adminToken = getStoredAdminToken();
    if (adminToken) {
      affectedIds.forEach(id => {
        updateAdminOrderStatus(id, { orderStatus: status }, adminToken).catch(() => {});
      });
    }
  };

  const handleUpdateTrackingInfo = (orderId: string, trackingNumber: string, shippingCarrier?: string, trackingUrl?: string) => {
    const updated = orders.map(o => {
      if (o.id === orderId) {
        return {
          ...o,
          trackingNumber: trackingNumber || undefined,
          shippingCarrier: shippingCarrier || undefined,
          trackingUrl: trackingUrl || undefined,
          updatedAt: new Date().toISOString()
        };
      }
      return o;
    });
    onUpdateOrders(updated);
    showToast('Informasi pelacakan kargo udara berhasil disimpan');

    const adminToken = getStoredAdminToken();
    if (adminToken) {
      updateAdminOrderStatus(orderId, { trackingNumber, shippingCarrier, trackingUrl }, adminToken).catch(err => {
        console.warn('Backend tracking sync notice:', err);
      });
    }
  };

  // --------------------------------------------------------------------------
  // AFFILIATE & CAMPAIGN MANAGEMENT STATE & ACTIONS
  // --------------------------------------------------------------------------
  const [affiliateSubTab, setAffiliateSubTab] = useState<'campaigns' | 'applications' | 'transactions' | 'payouts' | 'settings'>('campaigns');
  const [adminPayouts, setAdminPayouts] = useState<AffiliatePayoutRequest[]>(getPayoutRequests);

  const handleUpdatePayoutStatus = (reqId: string, status: 'PROCESSED' | 'REJECTED') => {
    const updated = updatePayoutRequestStatus(reqId, status);
    setAdminPayouts(updated);
    showToast(`Status pencairan berhasil diperbarui: ${status === 'PROCESSED' ? 'Ditransfer (Selesai)' : 'Ditolak'}`);
  };

  const handleOpenCreateCampaign = () => {
    navigateAdmin('affiliates', 'campaign_new');
  };

  const handleOpenEditCampaign = (camp: AffiliateCampaign) => {
    navigateAdmin('affiliates', 'campaign_edit', camp.id);
  };

  const handleSaveCampaignDirect = (updatedCampaign: AffiliateCampaign) => {
    let nextCampaigns: AffiliateCampaign[];
    if (campaigns.some(c => c.id === updatedCampaign.id)) {
      nextCampaigns = campaigns.map(c => c.id === updatedCampaign.id ? updatedCampaign : c);
    } else {
      nextCampaigns = [updatedCampaign, ...campaigns];
    }

    if (onUpdateCampaigns) {
      onUpdateCampaigns(nextCampaigns);
    }

    // Check conflicts for alert notice
    const detectedConflicts = detectCampaignConflicts(nextCampaigns, products);
    if (detectedConflicts.length > 0) {
      showToast(`Campaign disimpan. Perhatian: Ada produk bertumpuk pada campaign lain. Prioritas deterministik komisi tertinggi berlaku.`, 'info');
    } else {
      showToast(`Campaign "${updatedCampaign.name}" berhasil disimpan!`);
    }

    navigateAdmin('affiliates', 'list');
  };

  const handleToggleCampaignStatus = (campaignId: string) => {
    if (!onUpdateCampaigns) return;
    const target = campaigns.find(c => c.id === campaignId);
    if (!target) return;
    const nextStatus: CampaignStatus = target.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    const updated = campaigns.map(c => c.id === campaignId ? { ...c, status: nextStatus, updatedAt: new Date().toISOString() } : c);
    onUpdateCampaigns(updated);
    showToast(`Status campaign "${target.name}" diubah menjadi ${nextStatus}`);
  };

  const handleEndCampaign = (campaignId: string) => {
    if (!onUpdateCampaigns) return;
    const target = campaigns.find(c => c.id === campaignId);
    if (!target) return;
    if (confirm(`Akhiri campaign "${target.name}" sekarang? Campaign tidak akan aktif lagi.`)) {
      const updated = campaigns.map(c => c.id === campaignId ? { ...c, status: 'ENDED' as CampaignStatus, updatedAt: new Date().toISOString() } : c);
      onUpdateCampaigns(updated);
      showToast(`Campaign "${target.name}" telah diakhiri.`);
    }
  };

  const handleDeleteCampaign = (campaignId: string) => {
    if (!onUpdateCampaigns) return;
    const target = campaigns.find(c => c.id === campaignId);
    if (!target) return;
    if (confirm(`Hapus campaign "${target.name}" secara permanen? Data komisi pada transaksi lama tidak akan terpengaruh.`)) {
      const updated = campaigns.filter(c => c.id !== campaignId);
      onUpdateCampaigns(updated);
      showToast(`Campaign "${target.name}" telah dihapus.`);
    }
  };

  const handleUpdateAffiliateStatus = (appId: string, status: 'APPROVED' | 'PENDING') => {
    if (!onUpdateAffiliates) return;
    const updated = affiliates.map(a => a.id === appId ? { ...a, status } : a);
    onUpdateAffiliates(updated);
    showToast(`Status pendaftaran affiliate diperbarui menjadi ${status}`);
  };

  const handleUpdateCommissionPaymentStatus = (orderId: string, newCommStatus: 'PAID' | 'CANCELLED' | 'APPROVED') => {
    const updated = orders.map(o => {
      if (o.id === orderId && o.affiliateCommission) {
        return {
          ...o,
          affiliateCommission: {
            ...o.affiliateCommission,
            status: newCommStatus
          },
          updatedAt: new Date().toISOString()
        };
      }
      return o;
    });
    onUpdateOrders(updated);
    showToast(`Status komisi pesanan diperbarui menjadi ${newCommStatus}`);
  };

  // --------------------------------------------------------------------------
  // FILTERED DATASETS & PAGINATION
  // --------------------------------------------------------------------------
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchSearch = p.name.toLowerCase().includes(productSearch.toLowerCase()) || 
                          p.sku.toLowerCase().includes(productSearch.toLowerCase());
      const matchCat = productCategoryFilter === 'ALL' || p.categoryId === productCategoryFilter;
      const matchStatus = productStatusFilter === 'ALL' || 
                          (productStatusFilter === 'ACTIVE' && p.isActive) ||
                          (productStatusFilter === 'INACTIVE' && !p.isActive);
      const matchStock = productStockFilter === 'ALL' ||
                         (productStockFilter === 'IN_STOCK' && p.stock > 5) ||
                         (productStockFilter === 'LOW_STOCK' && p.stock > 0 && p.stock <= 5) ||
                         (productStockFilter === 'OUT_OF_STOCK' && p.stock <= 0);
      return matchSearch && matchCat && matchStatus && matchStock;
    });
  }, [products, productSearch, productCategoryFilter, productStatusFilter, productStockFilter]);

  const paginatedProducts = useMemo(() => {
    const start = (productPage - 1) * itemsPerPage;
    return filteredProducts.slice(start, start + itemsPerPage);
  }, [filteredProducts, productPage]);

  const totalProductPages = Math.ceil(filteredProducts.length / itemsPerPage) || 1;

  const categoriesPerPage = 10;
  const filteredCategories = useMemo(() => {
    return categories.filter(c => {
      const matchStatus = categoryStatusFilter === 'ALL' ||
        (categoryStatusFilter === 'ACTIVE' && c.isActive) ||
        (categoryStatusFilter === 'INACTIVE' && !c.isActive);

      let matchType = true;
      if (categoryTypeFilter === 'MAIN_ONLY') {
        matchType = !c.parentId;
      } else if (categoryTypeFilter === 'SUB_ONLY') {
        matchType = Boolean(c.parentId);
      } else if (categoryTypeFilter !== 'ALL') {
        matchType = c.parentId === categoryTypeFilter || c.id === categoryTypeFilter;
      }

      const q = categorySearch.toLowerCase().trim();
      const parentName = c.parentId ? (categories.find(p => p.id === c.parentId)?.name || '') : '';
      const matchSearch = !q ||
        c.name.toLowerCase().includes(q) ||
        c.slug.toLowerCase().includes(q) ||
        (c.description && c.description.toLowerCase().includes(q)) ||
        parentName.toLowerCase().includes(q);

      return matchStatus && matchType && matchSearch;
    }).sort((a, b) => {
      const aParent = a.parentId ? categories.find(p => p.id === a.parentId) : a;
      const bParent = b.parentId ? categories.find(p => p.id === b.parentId) : b;
      const aRootOrder = aParent ? aParent.orderIndex : a.orderIndex;
      const bRootOrder = bParent ? bParent.orderIndex : b.orderIndex;

      if (aRootOrder !== bRootOrder) {
        return aRootOrder - bRootOrder;
      }
      if ((a.parentId || a.id) === (b.parentId || b.id)) {
        if (!a.parentId && b.parentId) return -1;
        if (a.parentId && !b.parentId) return 1;
        return a.orderIndex - b.orderIndex;
      }
      return a.orderIndex - b.orderIndex;
    });
  }, [categories, categoryStatusFilter, categoryTypeFilter, categorySearch]);

  const totalCategoryPages = Math.max(1, Math.ceil(filteredCategories.length / categoriesPerPage));
  const paginatedCategories = useMemo(() => {
    const start = (categoryPage - 1) * categoriesPerPage;
    return filteredCategories.slice(start, start + categoriesPerPage);
  }, [filteredCategories, categoryPage]);

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const matchSearch = o.orderNumber.toLowerCase().includes(orderSearch.toLowerCase()) ||
                          o.customerName.toLowerCase().includes(orderSearch.toLowerCase()) ||
                          o.customerPhone.includes(orderSearch);
      const matchOrderStatus = orderStatusFilter === 'ALL' || o.orderStatus === orderStatusFilter;
      const matchPaymentStatus = paymentStatusFilter === 'ALL' || o.paymentStatus === paymentStatusFilter;
      return matchSearch && matchOrderStatus && matchPaymentStatus;
    });
  }, [orders, orderSearch, orderStatusFilter, paymentStatusFilter]);

  const paginatedOrders = useMemo(() => {
    const start = (orderPage - 1) * itemsPerPage;
    return filteredOrders.slice(start, start + itemsPerPage);
  }, [filteredOrders, orderPage]);

  const totalOrderPages = Math.ceil(filteredOrders.length / itemsPerPage) || 1;

  const filteredCustomers = useMemo(() => {
    return customerList.filter(c => 
      c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
      c.phone.includes(customerSearch) ||
      c.district.toLowerCase().includes(customerSearch.toLowerCase())
    );
  }, [customerList, customerSearch]);

  // Category map for quick lookup
  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach(c => map.set(c.id, c.name));
    return map;
  }, [categories]);

  // ==========================================================================
  // RENDER: SUB-PAGE FORM FOR PRODUCTS (/admin/products/new & :id/edit)
  // ==========================================================================
  if (formView === 'product_new' || formView === 'product_edit') {
    return (
      <div className="min-h-screen bg-slate-100/70 text-slate-900 font-sans pb-16">
        {/* Sticky Back-Office Sub-Header */}
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigateAdmin('products', 'list')}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
              title="Kembali ke Daftar Produk"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">Katalog Produk</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                <h1 className="text-sm sm:text-base font-bold text-slate-900">
                  {formView === 'product_edit' ? 'Edit Produk' : 'Tambah Produk Baru'}
                </h1>
              </div>
              <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                {formView === 'product_edit' ? `ID: ${activeEditingProductId} • SKU: ${pSku}` : 'Lengkapi informasi dasar, harga, stok, dan galeri foto produk'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigateAdmin('products', 'list')}
              className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
            >
              Batal
            </button>
            <button
              type="submit"
              form="product-form"
              className="px-4 py-1.5 bg-[#FE8A00] hover:bg-[#e07b00] text-white text-xs font-bold rounded-lg transition-colors shadow-xs flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>{formView === 'product_edit' ? 'Simpan Perubahan' : 'Terbitkan Produk'}</span>
            </button>
          </div>
        </header>

        {/* Form Body - Structured Two-Column Layout */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
          <form id="product-form" onSubmit={handleSaveProductForm} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left 2-Columns: Main Fields */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Card 1: Informasi Dasar */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
                <div className="border-b border-slate-100 pb-3">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">1. Informasi Dasar</h2>
                  <p className="text-[11px] text-slate-500">Informasi identitas produk untuk pencarian dan etalase marketplace</p>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Nama Produk <span className="text-rose-500">*</span></label>
                  <input
                    type="text"
                    required
                    value={pName}
                    onChange={(e) => setPName(e.target.value)}
                    placeholder="Contoh: Beras Rojo Lele Organik 5kg"
                    className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:border-[#FE8A00] focus:ring-1 focus:ring-[#FE8A00]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Kategori Utama <span className="text-rose-500">*</span>
                    </label>
                    {categories.filter(c => !c.parentId).length === 0 ? (
                      <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 p-2 rounded-lg flex items-center justify-between gap-2">
                        <span>Belum ada kategori utama.</span>
                        <button
                          type="button"
                          onClick={() => handleOpenCreateCategory(null, false)}
                          className="px-2 py-1 bg-[#FE8A00] hover:bg-[#e07b00] text-white rounded font-bold text-[10px] shrink-0"
                        >
                          + Buat Kategori
                        </button>
                      </div>
                    ) : (
                      <select
                        value={pCategory}
                        onChange={(e) => {
                          setPCategory(e.target.value);
                          setPSubcategory('');
                        }}
                        className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:border-[#FE8A00]"
                        required
                      >
                        {categories.filter(c => !c.parentId).map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Subkategori <span className="text-slate-400 font-normal">(Opsional)</span>
                    </label>
                    {categories.filter(c => c.parentId === pCategory && c.isActive).length === 0 ? (
                      <div className="flex items-center justify-between h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-400">
                        <span>Tanpa subkategori</span>
                        <button
                          type="button"
                          onClick={() => handleOpenCreateCategory(pCategory, true)}
                          className="text-[#FE8A00] font-bold hover:underline text-[11px]"
                        >
                          + Tambah
                        </button>
                      </div>
                    ) : (
                      <select
                        value={pSubcategory}
                        onChange={(e) => setPSubcategory(e.target.value)}
                        className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:border-[#FE8A00]"
                      >
                        <option value="">-- Tanpa Subkategori --</option>
                        {categories.filter(c => c.parentId === pCategory && c.isActive).map(sub => (
                          <option key={sub.id} value={sub.id}>↳ {sub.name}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">SKU / Kode Produk <span className="text-rose-500">*</span></label>
                    <input
                      type="text"
                      required
                      value={pSku}
                      onChange={(e) => setPSku(e.target.value)}
                      className="w-full px-3 py-2 text-xs sm:text-sm font-mono border border-slate-200 rounded-lg focus:outline-hidden focus:border-[#FE8A00]"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Deskripsi Lengkap Produk</label>
                  <textarea
                    rows={4}
                    value={pDescription}
                    onChange={(e) => setPDescription(e.target.value)}
                    placeholder="Tuliskan spesifikasi, keunggulan, masa simpan, dan anjuran penyajian produk..."
                    className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:border-[#FE8A00]"
                  />
                </div>
              </div>

              {/* Card 2: Harga & Stok */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
                <div className="border-b border-slate-100 pb-3">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">2. Harga & Inventaris</h2>
                  <p className="text-[11px] text-slate-500">Tentukan harga jual dasar, satuan, dan ketersediaan stok</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Harga Jual (Rp) <span className="text-rose-500">*</span></label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs text-slate-400 font-bold">Rp</span>
                      <input
                        type="number"
                        min="0"
                        required
                        value={pPrice}
                        onChange={(e) => setPPrice(Number(e.target.value))}
                        className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm font-bold border border-slate-200 rounded-lg focus:outline-hidden focus:border-[#FE8A00]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Harga Coret / Asli (Opsional)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs text-slate-400 font-bold">Rp</span>
                      <input
                        type="number"
                        min="0"
                        value={pOriginalPrice || ''}
                        onChange={(e) => setPOriginalPrice(e.target.value ? Number(e.target.value) : undefined)}
                        placeholder="Jika diskon"
                        className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:border-[#FE8A00]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Satuan Produk <span className="text-rose-500">*</span></label>
                    <input
                      type="text"
                      required
                      value={pUnit}
                      onChange={(e) => setPUnit(e.target.value)}
                      placeholder="kg, pcs, ikat, botol..."
                      className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:border-[#FE8A00]"
                    />
                  </div>
                </div>

                {!pHasVariations && (
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Jumlah Stok Utama <span className="text-rose-500">*</span></label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={pStock}
                      onChange={(e) => setPStock(Number(e.target.value))}
                      className="w-full sm:w-48 px-3 py-2 text-xs sm:text-sm font-bold border border-slate-200 rounded-lg focus:outline-hidden focus:border-[#FE8A00]"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">Stok ini divalidasi langsung saat pelanggan memesan dan membayar.</p>
                  </div>
                )}
              </div>

              {/* Card 3: Varian Produk (Optional) */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">3. Varian Produk</h2>
                    <p className="text-[11px] text-slate-500">Ukuran, berat, atau rasa dengan penyesuaian harga dan stok mandiri</p>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={pHasVariations}
                      onChange={(e) => setPHasVariations(e.target.checked)}
                      className="w-4 h-4 text-[#FE8A00] rounded focus:ring-[#FE8A00]"
                    />
                    <span>Aktifkan Varian</span>
                  </label>
                </div>

                {pHasVariations && (
                  <div className="space-y-4 pt-1">
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">Nama Tipe Varian</label>
                      <input
                        type="text"
                        value={pVariationName}
                        onChange={(e) => setPVariationName(e.target.value)}
                        placeholder="Contoh: Ukuran / Kemasan"
                        className="w-full sm:w-64 px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:border-[#FE8A00]"
                      />
                    </div>

                    {/* Quick Add Option */}
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex flex-wrap items-end gap-2.5">
                      <div className="flex-1 min-w-[140px]">
                        <label className="text-[11px] font-semibold text-slate-600 block mb-1">Nama Opsi (cth: 500gr)</label>
                        <input
                          type="text"
                          value={newVarOptName}
                          onChange={(e) => setNewVarOptName(e.target.value)}
                          placeholder="Nama varian"
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
                        />
                      </div>
                      <div className="w-28">
                        <label className="text-[11px] font-semibold text-slate-600 block mb-1">Selisih (+/- Rp)</label>
                        <input
                          type="number"
                          value={newVarOptDelta}
                          onChange={(e) => setNewVarOptDelta(Number(e.target.value))}
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
                        />
                      </div>
                      <div className="w-24">
                        <label className="text-[11px] font-semibold text-slate-600 block mb-1">Stok Opsi</label>
                        <input
                          type="number"
                          min="0"
                          value={newVarOptStock}
                          onChange={(e) => setNewVarOptStock(Number(e.target.value))}
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleAddVariationOption}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-md transition-colors flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Tambah Opsi</span>
                      </button>
                    </div>

                    {/* Options Table */}
                    {pVariationOptions.length === 0 ? (
                      <p className="text-xs text-slate-400 py-2 italic">Belum ada opsi varian yang ditambahkan.</p>
                    ) : (
                      <div className="border border-slate-200 rounded-lg overflow-hidden">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                            <tr>
                              <th className="py-2 px-3">Opsi Varian</th>
                              <th className="py-2 px-3">SKU Opsi</th>
                              <th className="py-2 px-3">Harga Akhir</th>
                              <th className="py-2 px-3">Stok</th>
                              <th className="py-2 px-3 text-right">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {pVariationOptions.map(opt => (
                              <tr key={opt.id}>
                                <td className="py-2 px-3 font-semibold text-slate-900">{opt.name}</td>
                                <td className="py-2 px-3 font-mono text-[11px] text-slate-500">{opt.sku || '-'}</td>
                                <td className="py-2 px-3 font-bold text-slate-800">
                                  Rp {(pPrice + opt.priceDelta).toLocaleString('id-ID')}
                                </td>
                                <td className="py-2 px-3 font-bold text-slate-700">{opt.stock}</td>
                                <td className="py-2 px-3 text-right">
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveVariationOption(opt.id)}
                                    className="text-rose-600 hover:text-rose-800 p-1"
                                    title="Hapus Opsi"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Card 4: Komisi Affiliate Produk (Requirement 2) */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">4. Komisi Affiliate Produk</h2>
                    <p className="text-[11px] text-slate-500">Tentukan apakah produk menggunakan komisi standar toko atau komisi khusus produk</p>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={pUseCustomCommission}
                      onChange={(e) => setPUseCustomCommission(e.target.checked)}
                      className="w-4 h-4 text-[#FE8A00] rounded focus:ring-[#FE8A00]"
                    />
                    <span>Komisi Khusus</span>
                  </label>
                </div>

                {pUseCustomCommission ? (
                  <div className="space-y-3 pt-1">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-semibold text-slate-700 block mb-1">
                          Persentase Komisi Khusus (%) <span className="text-rose-500">*</span>
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.5"
                            required
                            value={pCustomCommissionRate}
                            onChange={(e) => setPCustomCommissionRate(Math.min(100, Math.max(0, Number(e.target.value))))}
                            className="w-full pl-3 pr-8 py-2 text-xs sm:text-sm font-bold border border-slate-200 rounded-lg focus:outline-hidden focus:border-[#FE8A00]"
                          />
                          <span className="absolute right-3 top-2 text-xs text-slate-400 font-bold">%</span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">Nilai persentase valid: 0% hingga 100%.</p>
                      </div>

                      <div className="p-3 bg-blue-50/50 rounded-lg border border-blue-200 text-xs flex flex-col justify-center">
                        <span className="text-slate-500 text-[11px]">Estimasi Komisi Mitra per Unit:</span>
                        <span className="font-extrabold text-blue-700 text-base">
                          Rp {Math.round((Number(pPrice) || 0) * (Number(pCustomCommissionRate) / 100)).toLocaleString('id-ID')}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          (Dihitung dari harga jual Rp {(Number(pPrice) || 0).toLocaleString('id-ID')})
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-600 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-800 block">Menggunakan Komisi Standar Toko</span>
                      <span className="text-[11px] text-slate-500">
                        Produk ini saat ini mendapatkan komisi standar <strong>{storeConfig.defaultAffiliateCommissionRate || 15}%</strong> (atau mengikuti Campaign aktif jika diikutsertakan).
                      </span>
                    </div>
                    <div className="text-right shrink-0 font-bold text-emerald-700 text-xs sm:text-sm pl-3">
                      Rp {Math.round((Number(pPrice) || 0) * ((storeConfig.defaultAffiliateCommissionRate || 15) / 100)).toLocaleString('id-ID')}
                    </div>
                  </div>
                )}
              </div>

            </div>

            {/* Right 1-Column: Gallery & Publishing Controls */}
            <div className="space-y-6">

              {/* Status & Visibilitas */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b border-slate-100 pb-2">
                  Status Publikasi
                </h2>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-800">
                  <input
                    type="checkbox"
                    checked={pIsActive}
                    onChange={(e) => setPIsActive(e.target.checked)}
                    className="w-4 h-4 text-[#FE8A00] rounded focus:ring-[#FE8A00]"
                  />
                  <span>Produk Aktif (Tampil di Katalog)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-800">
                  <input
                    type="checkbox"
                    checked={pIsFeatured}
                    onChange={(e) => setPIsFeatured(e.target.checked)}
                    className="w-4 h-4 text-[#FE8A00] rounded focus:ring-[#FE8A00]"
                  />
                  <span>Sorot sebagai Produk Unggulan</span>
                </label>
              </div>

              {/* Galeri Foto Produk */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">Galeri Foto Produk</h2>
                    <p className="text-[11px] text-slate-500">{pImages.length} foto tercatat</p>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                    Foto #1 = Sampul
                  </span>
                </div>

                {/* Upload Button */}
                <div className="space-y-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept="image/*"
                    multiple
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingPhoto}
                    className="w-full py-2.5 px-3 border border-dashed border-[#FE8A00] bg-orange-50/50 hover:bg-orange-50 text-[#FE8A00] rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2"
                  >
                    {isUploadingPhoto ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Mengunggah ke Supabase Storage...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        <span>Unggah Foto dari Perangkat</span>
                      </>
                    )}
                  </button>

                  {/* Add by URL */}
                  <div className="flex gap-1.5 pt-1">
                    <input
                      type="url"
                      value={newImageUrl}
                      onChange={(e) => setNewImageUrl(e.target.value)}
                      placeholder="Atau tempel URL gambar..."
                      className="flex-1 px-2.5 py-1.5 text-[11px] border border-slate-200 rounded-md focus:outline-hidden focus:border-[#FE8A00]"
                    />
                    <button
                      type="button"
                      onClick={handleAddImageUrl}
                      className="px-2.5 py-1.5 bg-slate-800 text-white text-[11px] font-semibold rounded-md hover:bg-slate-900"
                    >
                      Tambah
                    </button>
                  </div>
                </div>

                {/* Photo List & Order Manager */}
                <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                  {pImages.map((img, idx) => (
                    <div 
                      key={idx} 
                      className={`p-2 rounded-lg border flex items-center gap-3 transition-all ${
                        idx === 0 ? 'border-[#FE8A00] bg-orange-50/30' : 'border-slate-200 bg-white'
                      }`}
                    >
                      <img
                        src={img}
                        alt={`Preview ${idx + 1}`}
                        referrerPolicy="no-referrer"
                        className="w-12 h-12 rounded-md object-cover border border-slate-200 shrink-0 bg-slate-50"
                        onError={(e) => {
                          const target = e.currentTarget;
                          target.onerror = null;
                          target.src = 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&auto=format&fit=crop&q=80';
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-bold text-slate-800">Foto {idx + 1}</span>
                          {idx === 0 && (
                            <span className="text-[10px] font-extrabold text-[#FE8A00] flex items-center gap-0.5">
                              <Star className="w-3 h-3 fill-current" />
                              <span>Sampul</span>
                            </span>
                          )}
                        </div>
                        {idx !== 0 && (
                          <button
                            type="button"
                            onClick={() => handleSetPrimaryPhoto(idx)}
                            className="text-[10px] text-emerald-700 hover:underline font-semibold block mt-0.5"
                          >
                            Jadikan Foto Utama
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleMovePhoto(idx, idx - 1)}
                          className="p-1 rounded text-slate-400 hover:text-slate-700 disabled:opacity-20"
                          title="Naikkan urutan"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === pImages.length - 1}
                          onClick={() => handleMovePhoto(idx, idx + 1)}
                          className="p-1 rounded text-slate-400 hover:text-slate-700 disabled:opacity-20"
                          title="Turunkan urutan"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemovePhoto(idx)}
                          className="p-1 rounded text-rose-500 hover:text-rose-700"
                          title="Hapus foto"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

              </div>

            </div>
          </form>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // RENDER: SUB-PAGE FORM FOR CATEGORIES (/admin/categories/new & :id/edit)
  // ==========================================================================
  if (formView === 'category_new' || formView === 'category_edit') {
    const editingCategory = formView === 'category_edit' && activeEditingCategoryId
      ? categories.find(c => c.id === activeEditingCategoryId) || null
      : null;

    return (
      <AdminCategoryFormPage
        categoryToEdit={editingCategory}
        initialParentId={createCategoryParentId}
        initialIsSubcategory={createCategoryIsSubcategory}
        allCategories={categories}
        products={products}
        onSave={handleSaveCategoryForm}
        onCancel={() => navigateAdmin('categories', 'list')}
        onShowToast={showToast}
      />
    );
  }

  // ==========================================================================
  // RENDER: SUB-PAGE DEDICATED ORDER DETAIL (/admin/orders/:id)
  // ==========================================================================
  if (formView === 'order_detail') {
    const targetOrder = activeDetailOrder || orders.find(o => o.id === activeDetailOrderId || o.orderNumber === activeDetailOrderId);
    if (targetOrder) {
      return (
        <AdminOrderDetailPage
          order={targetOrder}
          products={products}
          onBack={() => navigateAdmin('orders', 'list')}
          onUpdateOrderStatus={handleUpdateOrderStatus}
          onUpdatePaymentStatus={handleUpdatePaymentStatus}
          onUpdateCommissionStatus={handleUpdateCommissionPaymentStatus}
          onUpdateTrackingInfo={handleUpdateTrackingInfo}
          onViewCustomer={(custKey) => navigateAdmin('customers', 'customer_detail', custKey)}
        />
      );
    }
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm max-w-md w-full">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
          <h2 className="text-base font-bold text-slate-900">Pesanan Tidak Ditemukan</h2>
          <p className="text-xs text-slate-500 mt-1 mb-5">
            Pesanan dengan kode/ID "{activeDetailOrderId}" tidak ditemukan atau belum tercatat.
          </p>
          <button
            onClick={() => navigateAdmin('orders', 'list')}
            className="w-full py-2 bg-[#FE8A00] text-white text-xs font-bold rounded-xl shadow-xs"
          >
            Kembali ke Daftar Pesanan
          </button>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // RENDER: SUB-PAGE FORM FOR CAMPAIGNS (/admin/affiliate/campaigns/new & :id/edit)
  // ==========================================================================
  if (formView === 'campaign_new' || formView === 'campaign_edit') {
    const targetCampaign = editingCampaignId ? campaigns.find(c => c.id === editingCampaignId) : null;
    return (
      <AdminCampaignFormPage
        initialCampaign={targetCampaign}
        products={products}
        categories={categories}
        existingCampaigns={campaigns}
        onBack={() => navigateAdmin('affiliates', 'list')}
        onSave={handleSaveCampaignDirect}
      />
    );
  }

  // ==========================================================================
  // RENDER: SUB-PAGE DEDICATED CUSTOMER DETAIL (/admin/customers/:id)
  // ==========================================================================
  if (formView === 'customer_detail') {
    const targetCustomer = customerList.find(c => c.phone === activeDetailCustomerId || c.name === activeDetailCustomerId);
    if (targetCustomer) {
      return (
        <AdminCustomerDetailPage
          customer={targetCustomer}
          customerOrders={orders.filter(o => o.customerPhone === targetCustomer.phone || o.customerName === targetCustomer.name)}
          onBack={() => navigateAdmin('customers', 'list')}
          onViewOrder={(orderId) => navigateAdmin('orders', 'order_detail', orderId)}
        />
      );
    }
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm max-w-md w-full">
          <Users className="w-12 h-12 text-slate-400 mx-auto mb-3" />
          <h2 className="text-base font-bold text-slate-900">Pelanggan Tidak Ditemukan</h2>
          <p className="text-xs text-slate-500 mt-1 mb-5">
            Data pelanggan "{activeDetailCustomerId}" tidak ditemukan dalam catatan transaksi.
          </p>
          <button
            onClick={() => navigateAdmin('customers', 'list')}
            className="w-full py-2 bg-[#FE8A00] text-white text-xs font-bold rounded-xl shadow-xs"
          >
            Kembali ke Direktori Pelanggan
          </button>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // RENDER: SUB-PAGE DEDICATED AFFILIATE PARTNER DETAIL (/admin/affiliate/:id)
  // ==========================================================================
  if (formView === 'affiliate_detail') {
    const targetAffiliate = affiliates.find(a => a.id === activeDetailAffiliateId || a.referralCode === activeDetailAffiliateId);
    if (targetAffiliate) {
      return (
        <AdminAffiliateDetailPage
          affiliate={targetAffiliate}
          referralOrders={orders.filter(o => o.affiliateCommission?.referralCode === targetAffiliate.referralCode || o.referralCode === targetAffiliate.referralCode)}
          onBack={() => navigateAdmin('affiliates', 'list')}
          onUpdateStatus={handleUpdateAffiliateStatus}
          onViewOrder={(orderId) => navigateAdmin('orders', 'order_detail', orderId)}
        />
      );
    }
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm max-w-md w-full">
          <Award className="w-12 h-12 text-slate-400 mx-auto mb-3" />
          <h2 className="text-base font-bold text-slate-900">Mitra Affiliate Tidak Ditemukan</h2>
          <p className="text-xs text-slate-500 mt-1 mb-5">
            Pendaftaran affiliate dengan ID "{activeDetailAffiliateId}" tidak ditemukan.
          </p>
          <button
            onClick={() => navigateAdmin('affiliates', 'list')}
            className="w-full py-2 bg-[#FE8A00] text-white text-xs font-bold rounded-xl shadow-xs"
          >
            Kembali ke Daftar Mitra
          </button>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // MAIN SELLER CENTRE LAYOUT: FIXED SIDEBAR + COMPACT HEADER + WORKSPACE
  // ==========================================================================
  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 font-sans flex flex-col antialiased">
      
      {/* Toast Notification */}
      {adminToast && (
        <div className={`fixed bottom-5 right-5 z-50 text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 border animate-in fade-in slide-in-from-bottom-2 ${
          adminToast.type === 'error' ? 'bg-rose-700 border-rose-600' : 'bg-slate-900 border-slate-800'
        }`}>
          {adminToast.type === 'error' ? <AlertCircle className="w-4 h-4 text-rose-300" /> : <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
          <span>{adminToast.message}</span>
        </div>
      )}

      {/* FIXED TOPBAR (Header Ringkas) */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200/90 h-14 px-4 sm:px-6 flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#FE8A00] flex items-center justify-center text-white font-black text-sm tracking-tighter shadow-xs">
            TS
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm text-slate-900 tracking-tight">TUMPANG SHOP</span>
              <span className="text-[10px] font-bold px-1.5 py-0.2 bg-orange-100 text-[#FE8A00] rounded">
                Seller Centre
              </span>
              <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                {(import.meta as any).env?.DEV || (import.meta as any).env?.MODE !== 'production' ? 'Dev/Preview Mode' : 'Production'}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-medium hidden sm:block">
              Sistem Manajemen Operasional & Katalog Tumpang Shop (Kargo Udara Impor)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {currentUser && (
            <div className="hidden md:flex flex-col text-right pr-2 border-r border-slate-200">
              <span className="text-xs font-bold text-slate-800 flex items-center justify-end gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[#FE8A00]" />
                <span>{currentUser.fullName || 'Administrator'}</span>
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                {currentUser.email}
              </span>
            </div>
          )}

          <button
            onClick={onBackToCustomer}
            className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors flex items-center gap-1.5"
            title="Lihat Toko Publik"
          >
            <Store className="w-3.5 h-3.5 text-[#FE8A00]" />
            <span className="hidden sm:inline">Lihat Toko Publik</span>
          </button>
          {onLogout && (
            <button
              onClick={onLogout}
              className="px-3 py-1.5 rounded-lg border border-rose-200 hover:bg-rose-50 text-rose-700 text-xs font-semibold transition-colors flex items-center gap-1.5"
              title="Keluar dari sesi Admin"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Keluar</span>
            </button>
          )}
        </div>
      </header>

      {/* MAIN CONTAINER: SIDEBAR + CONTENT WORKSPACE */}
      <div className="flex-1 flex overflow-hidden">

        {/* SIDEBAR NAVIGASI TETAP (Standar Marketplace) */}
        <aside className="w-56 sm:w-60 bg-white border-r border-slate-200/90 flex flex-col shrink-0">
          <div className="p-3 space-y-6 flex-1 overflow-y-auto">

            {/* Menu Kelompok 1: Utama */}
            <div className="space-y-1">
              <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Operasional
              </div>
              <button
                onClick={() => navigateAdmin('overview')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'overview' 
                    ? 'bg-orange-50 text-[#FE8A00] font-bold' 
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <TrendingUp className="w-4 h-4 shrink-0" />
                <span>Dashboard</span>
              </button>
            </div>

            {/* Menu Kelompok 2: Katalog */}
            <div className="space-y-1">
              <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Katalog
              </div>
              <button
                onClick={() => navigateAdmin('products')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'products' 
                    ? 'bg-orange-50 text-[#FE8A00] font-bold' 
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Package className="w-4 h-4 shrink-0" />
                  <span>Produk</span>
                </div>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  {products.length}
                </span>
              </button>

              <button
                onClick={() => navigateAdmin('categories')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'categories' 
                    ? 'bg-orange-50 text-[#FE8A00] font-bold' 
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Layers className="w-4 h-4 shrink-0" />
                  <span>Kategori</span>
                </div>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  {categories.length}
                </span>
              </button>
            </div>

            {/* Menu Kelompok 3: Transaksi */}
            <div className="space-y-1">
              <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Penjualan
              </div>
              <button
                onClick={() => navigateAdmin('orders')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'orders' 
                    ? 'bg-orange-50 text-[#FE8A00] font-bold' 
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <ShoppingBag className="w-4 h-4 shrink-0" />
                  <span>Pesanan</span>
                </div>
                {pendingOrders.length > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800">
                    {pendingOrders.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => navigateAdmin('payments')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'payments' 
                    ? 'bg-orange-50 text-[#FE8A00] font-bold' 
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <CreditCard className="w-4 h-4 shrink-0" />
                <span>Pembayaran</span>
              </button>

              <button
                onClick={() => navigateAdmin('customers')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'customers' 
                    ? 'bg-orange-50 text-[#FE8A00] font-bold' 
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Users className="w-4 h-4 shrink-0" />
                <span>Pelanggan</span>
              </button>
            </div>

            {/* Menu Kelompok 4: Pemasaran & Laporan */}
            <div className="space-y-1">
              <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Pertumbuhan
              </div>
              <button
                onClick={() => navigateAdmin('affiliates')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'affiliates' 
                    ? 'bg-orange-50 text-[#FE8A00] font-bold' 
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Percent className="w-4 h-4 shrink-0" />
                  <span>Program Affiliate</span>
                </div>
                {affiliates.length > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600">
                    {affiliates.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => navigateAdmin('reports')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'reports' 
                    ? 'bg-orange-50 text-[#FE8A00] font-bold' 
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <BarChart3 className="w-4 h-4 shrink-0" />
                <span>Laporan</span>
              </button>
            </div>

            {/* Menu Kelompok 5: Konfigurasi */}
            <div className="space-y-1">
              <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Sistem
              </div>
              <button
                onClick={() => navigateAdmin('settings')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'settings' 
                    ? 'bg-orange-50 text-[#FE8A00] font-bold' 
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Settings className="w-4 h-4 shrink-0" />
                <span>Pengaturan</span>
              </button>
            </div>

          </div>

          {/* Toko Status Badge di Sidebar Bawah */}
          <div className="p-3 border-t border-slate-100 bg-slate-50/50">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[11px] text-slate-500 font-medium">Status Toko:</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                storeConfig.isOpen ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
              }`}>
                {storeConfig.isOpen ? 'Buka' : 'Tutup'}
              </span>
            </div>
          </div>
        </aside>

        {/* WORKSPACE AREA (AREA KERJA UTAMA) */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">

          {/* ================================================================ */}
          {/* 1. OVERVIEW / DASHBOARD OPERASIONAL                               */}
          {/* ================================================================ */}
          {activeTab === 'overview' && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div>
                <h1 className="text-lg font-bold text-slate-900">Ringkasan Operasional Marketplace</h1>
                <p className="text-xs text-slate-500">Pantau performa penjualan, pesanan masuk, dan kesehatan inventaris produk</p>
              </div>

              {/* KPI Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="flex items-center justify-between text-slate-500 mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Total Omzet</span>
                    <DollarSign className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="text-xl font-extrabold text-slate-900">
                    Rp {totalRevenue.toLocaleString('id-ID')}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Rp {paidRevenue.toLocaleString('id-ID')} terverifikasi lunas
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="flex items-center justify-between text-slate-500 mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Pesanan Selesai</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="text-xl font-extrabold text-slate-900">
                    {completedOrders.length} <span className="text-xs font-normal text-slate-500">/ {orders.length} pesanan</span>
                  </div>
                  <div className="text-[11px] text-emerald-700 font-semibold mt-1">
                    Konversi sukses: {conversionRate}%
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="flex items-center justify-between text-slate-500 mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Katalog Produk</span>
                    <Package className="w-4 h-4 text-[#FE8A00]" />
                  </div>
                  <div className="text-xl font-extrabold text-slate-900">
                    {products.filter(p => p.isActive).length} <span className="text-xs font-normal text-slate-500">aktif</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Total {products.length} SKU terdaftar
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="flex items-center justify-between text-slate-500 mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Peringatan Stok</span>
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="text-xl font-extrabold text-amber-600">
                    {lowStockCount + outOfStockCount} <span className="text-xs font-normal text-slate-500">item</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    {outOfStockCount} stok habis, {lowStockCount} menipis
                  </div>
                </div>
              </div>

              {/* Two Column Operational Snapshot */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Recent Orders Table */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
                  <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">Pesanan Masuk Terbaru</h2>
                    <button
                      onClick={() => navigateAdmin('orders')}
                      className="text-[11px] font-bold text-[#FE8A00] hover:underline"
                    >
                      Lihat Semua
                    </button>
                  </div>

                  {orders.length === 0 ? (
                    <p className="text-xs text-slate-400 py-8 text-center">Belum ada pesanan yang tercatat.</p>
                  ) : (
                    <div className="divide-y divide-slate-100 text-xs">
                      {orders.slice(0, 5).map(o => (
                        <div key={o.id} className="py-2.5 flex items-center justify-between">
                          <div>
                            <div className="font-bold text-slate-900">{o.orderNumber}</div>
                            <div className="text-slate-500 text-[11px]">{o.customerName} • {o.customerDistrict}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-extrabold text-slate-900">Rp {o.total.toLocaleString('id-ID')}</div>
                            <span className={`inline-block text-[10px] font-bold px-1.5 py-0.2 rounded mt-0.5 ${
                              o.orderStatus === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' :
                              o.orderStatus === 'CANCELLED' ? 'bg-slate-100 text-slate-600' :
                              'bg-amber-100 text-amber-800'
                            }`}>
                              {o.orderStatus}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Critical Stock List */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
                  <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">Peringatan Stok Rendah</h2>
                    <button
                      onClick={() => {
                        setProductStockFilter('LOW_STOCK');
                        navigateAdmin('products');
                      }}
                      className="text-[11px] font-bold text-[#FE8A00] hover:underline"
                    >
                      Kelola Stok
                    </button>
                  </div>

                  {products.filter(p => p.stock <= 5).length === 0 ? (
                    <p className="text-xs text-emerald-600 py-8 text-center font-medium">✓ Seluruh stok produk dalam status aman.</p>
                  ) : (
                    <div className="divide-y divide-slate-100 text-xs">
                      {products.filter(p => p.stock <= 5).slice(0, 5).map(p => (
                        <div key={p.id} className="py-2.5 flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <img
                              src={p.images[0] || ''}
                              alt={p.name}
                              className="w-8 h-8 rounded-md object-cover border border-slate-200 bg-slate-50"
                            />
                            <div>
                              <div className="font-bold text-slate-900 line-clamp-1">{p.name}</div>
                              <div className="text-slate-400 font-mono text-[10px]">SKU: {p.sku}</div>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className={`text-[11px] font-extrabold ${p.stock <= 0 ? 'text-rose-600' : 'text-amber-600'}`}>
                              {p.stock <= 0 ? 'HABIS' : `Sisa ${p.stock} ${p.unit}`}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* 2. DAFTAR PRODUK (TABLE-FIRST BACK-OFFICE PATTERN)                */}
          {/* ================================================================ */}
          {activeTab === 'products' && (
            <div className="space-y-4 max-w-7xl mx-auto">
              
              {/* Header Halaman + Aksi Utama Tunggal */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                  <h1 className="text-lg font-bold text-slate-900">Katalog Produk</h1>
                  <p className="text-xs text-slate-500">Kelola informasi, harga, stok, dan galeri foto produk pilihan</p>
                </div>
                <button
                  onClick={handleOpenCreateProduct}
                  className="px-4 py-2 bg-[#FE8A00] hover:bg-[#e07b00] text-white text-xs font-bold rounded-lg transition-colors shadow-xs flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah Produk Baru</span>
                </button>
              </div>

              {/* Filter & Toolbar Bar */}
              <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs space-y-3">
                <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                  
                  {/* Search Input */}
                  <div className="relative flex-1 max-w-md">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={productSearch}
                      onChange={(e) => {
                        setProductSearch(e.target.value);
                        setProductPage(1);
                      }}
                      placeholder="Cari nama produk atau SKU..."
                      className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 focus:bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:border-[#FE8A00]"
                    />
                  </div>

                  {/* Filter Dropdowns */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <select
                      value={productCategoryFilter}
                      onChange={(e) => {
                        setProductCategoryFilter(e.target.value);
                        setProductPage(1);
                      }}
                      className="px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-700"
                    >
                      <option value="ALL">Semua Kategori</option>
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>

                    <select
                      value={productStockFilter}
                      onChange={(e) => {
                        setProductStockFilter(e.target.value as any);
                        setProductPage(1);
                      }}
                      className="px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-700"
                    >
                      <option value="ALL">Semua Stok</option>
                      <option value="IN_STOCK">Stok Tersedia (&gt;5)</option>
                      <option value="LOW_STOCK">Stok Menipis (1-5)</option>
                      <option value="OUT_OF_STOCK">Stok Habis (0)</option>
                    </select>

                    <select
                      value={productStatusFilter}
                      onChange={(e) => {
                        setProductStatusFilter(e.target.value as any);
                        setProductPage(1);
                      }}
                      className="px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-700"
                    >
                      <option value="ALL">Semua Status</option>
                      <option value="ACTIVE">Aktif (Tayang)</option>
                      <option value="INACTIVE">Nonaktif (Draft)</option>
                    </select>
                  </div>
                </div>

                {/* Bulk Actions Bar if items selected */}
                {selectedProductIds.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs bg-orange-50/50 p-2 rounded-lg">
                    <span className="font-semibold text-slate-700">
                      {selectedProductIds.length} produk terpilih
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleBulkToggleProductStatus(true)}
                        className="px-2.5 py-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded font-medium"
                      >
                        Aktifkan
                      </button>
                      <button
                        onClick={() => handleBulkToggleProductStatus(false)}
                        className="px-2.5 py-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded font-medium"
                      >
                        Nonaktifkan
                      </button>
                      <button
                        onClick={handleBulkDeleteProducts}
                        className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded font-medium"
                      >
                        Hapus Terpilih
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Data Table */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50/80 text-slate-600 uppercase border-b border-slate-200 font-semibold tracking-wider text-[11px]">
                      <tr>
                        <th className="py-3 px-3 w-8">
                          <input
                            type="checkbox"
                            checked={selectedProductIds.length === paginatedProducts.length && paginatedProducts.length > 0}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedProductIds(paginatedProducts.map(p => p.id));
                              } else {
                                setSelectedProductIds([]);
                              }
                            }}
                            className="rounded text-[#FE8A00] focus:ring-[#FE8A00]"
                          />
                        </th>
                        <th className="py-3 px-3">Produk & SKU</th>
                        <th className="py-3 px-3">Kategori</th>
                        <th className="py-3 px-3">Harga</th>
                        <th className="py-3 px-3">Komisi Affiliate</th>
                        <th className="py-3 px-3">Stok</th>
                        <th className="py-3 px-3">Foto</th>
                        <th className="py-3 px-3">Status</th>
                        <th className="py-3 px-3 text-right">Tindakan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedProducts.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-12 text-center text-slate-400">
                            Tidak ada produk yang cocok dengan pencarian atau filter.
                          </td>
                        </tr>
                      ) : (
                        paginatedProducts.map(prod => {
                          const isSelected = selectedProductIds.includes(prod.id);
                          const effCommission = getEffectiveProductCommission(prod, storeConfig, campaigns, new Date(), orders);
                          return (
                            <tr key={prod.id} className={`hover:bg-slate-50/60 transition-colors ${isSelected ? 'bg-orange-50/20' : ''}`}>
                              <td className="py-3 px-3">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedProductIds(prev => [...prev, prod.id]);
                                    } else {
                                      setSelectedProductIds(prev => prev.filter(id => id !== prod.id));
                                    }
                                  }}
                                  className="rounded text-[#FE8A00] focus:ring-[#FE8A00]"
                                />
                              </td>
                              <td className="py-3 px-3">
                                <div className="flex items-center gap-3">
                                  <img
                                    src={prod.images[0] || ''}
                                    alt={prod.name}
                                    referrerPolicy="no-referrer"
                                    className="w-10 h-10 rounded-lg object-cover border border-slate-200 bg-slate-50 shrink-0"
                                    onError={(e) => {
                                      const target = e.currentTarget;
                                      target.onerror = null;
                                      target.src = 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&auto=format&fit=crop&q=80';
                                    }}
                                  />
                                  <div>
                                    <div className="font-bold text-slate-900 line-clamp-1">{prod.name}</div>
                                    <div className="text-[11px] font-mono text-slate-400 mt-0.5">{prod.sku}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 px-3 text-slate-700 font-medium">
                                <div className="font-semibold text-slate-900">{categoryMap.get(prod.categoryId) || 'Umum'}</div>
                                {prod.subcategoryId && categoryMap.get(prod.subcategoryId) && (
                                  <div className="text-[10px] text-orange-600 font-medium flex items-center gap-1 mt-0.5">
                                    <span>↳</span>
                                    <span>{categoryMap.get(prod.subcategoryId)}</span>
                                  </div>
                                )}
                              </td>
                              <td className="py-3 px-3 font-bold text-slate-900">
                                Rp {prod.price.toLocaleString('id-ID')}
                                <span className="text-[10px] text-slate-400 font-normal"> / {prod.unit}</span>
                              </td>
                              <td className="py-3 px-3">
                                {effCommission.appliedType === 'campaign' ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-orange-100 text-[#FE8A00] border border-orange-200">
                                    <Flame className="w-3 h-3" />
                                    <span>Campaign {effCommission.ratePercent}%</span>
                                  </span>
                                ) : effCommission.appliedType === 'product_custom' ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                                    <span>Khusus {effCommission.ratePercent}%</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700">
                                    <span>Standar {effCommission.ratePercent}%</span>
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-3">
                                <span className={`font-extrabold ${
                                  prod.stock <= 0 ? 'text-rose-600' :
                                  prod.stock <= 5 ? 'text-amber-600' : 'text-slate-800'
                                }`}>
                                  {prod.stock}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-slate-500 font-medium">
                                <span className="inline-flex items-center gap-1 text-[11px]">
                                  <ImageIcon className="w-3.5 h-3.5 text-slate-400" />
                                  <span>{prod.images.length}</span>
                                </span>
                              </td>
                              <td className="py-3 px-3">
                                <button
                                  onClick={() => handleToggleProductStatus(prod.id)}
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                                    prod.isActive 
                                      ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' 
                                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                  }`}
                                  title="Klik untuk mengubah status tayang"
                                >
                                  {prod.isActive ? 'Aktif' : 'Nonaktif'}
                                </button>
                              </td>
                              <td className="py-3 px-3 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    onClick={() => handleOpenEditProduct(prod)}
                                    className="p-1 rounded text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                                    title="Edit Produk"
                                  >
                                    <Edit3 className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteProduct(prod.id)}
                                    className="p-1 rounded text-rose-600 hover:text-rose-800 hover:bg-rose-50"
                                    title="Hapus Produk"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Footer */}
                <div className="p-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <div>
                    Menampilkan {paginatedProducts.length} dari {filteredProducts.length} total produk
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      disabled={productPage <= 1}
                      onClick={() => setProductPage(prev => Math.max(1, prev - 1))}
                      className="px-2.5 py-1 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-40"
                    >
                      Sebelumnya
                    </button>
                    <span className="font-semibold text-slate-700 px-2">
                      Hal {productPage} / {totalProductPages}
                    </span>
                    <button
                      disabled={productPage >= totalProductPages}
                      onClick={() => setProductPage(prev => Math.min(totalProductPages, prev + 1))}
                      className="px-2.5 py-1 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-40"
                    >
                      Berikutnya
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* 3. DAFTAR KATEGORI (TABLE & VISUAL CARDS)                         */}
          {/* ================================================================ */}
          {activeTab === 'categories' && (
            <div className="space-y-4 max-w-7xl mx-auto">
              
              {/* Header Halaman + Aksi Utama Kategori & Subkategori */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                  <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <Layers className="w-5 h-5 text-[#FE8A00]" />
                    <span>Kategori & Subkategori Produk</span>
                  </h1>
                  <p className="text-xs text-slate-500">
                    Kelola struktur etalase, foto visual kartu, dan hubungan hierarki kategori &amp; subkategori
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleOpenCreateCategory(null, false)}
                    className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors shadow-2xs flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#FE8A00]" />
                    <span>+ Kategori Utama</span>
                  </button>
                  <button
                    onClick={() => handleOpenCreateSubcategory()}
                    className="px-4 py-2 bg-[#FE8A00] hover:bg-[#e07b00] text-white text-xs font-bold rounded-lg transition-colors shadow-xs flex items-center gap-1.5"
                  >
                    <FolderTree className="w-3.5 h-3.5" />
                    <span>+ Subkategori</span>
                  </button>
                </div>
              </div>

              {/* Filter & Toolbar Bar */}
              <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs space-y-3">
                <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                  
                  {/* Search Input */}
                  <div className="relative flex-1 max-w-md">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={categorySearch}
                      onChange={(e) => {
                        setCategorySearch(e.target.value);
                        setCategoryPage(1);
                      }}
                      placeholder="Cari nama kategori, subkategori, atau slug..."
                      className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 focus:bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:border-[#FE8A00]"
                    />
                    {categorySearch && (
                      <button
                        onClick={() => {
                          setCategorySearch('');
                          setCategoryPage(1);
                        }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Filter Dropdowns */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    
                    {/* Status Filter */}
                    <select
                      value={categoryStatusFilter}
                      onChange={(e) => {
                        setCategoryStatusFilter(e.target.value as any);
                        setCategoryPage(1);
                      }}
                      className="px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-700"
                    >
                      <option value="ALL">Semua Status</option>
                      <option value="ACTIVE">Status: Aktif</option>
                      <option value="INACTIVE">Status: Nonaktif</option>
                    </select>

                    {/* Hierarchy / Parent Filter */}
                    <select
                      value={categoryTypeFilter}
                      onChange={(e) => {
                        setCategoryTypeFilter(e.target.value);
                        setCategoryPage(1);
                      }}
                      className="px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-700"
                    >
                      <option value="ALL">Semua Tingkat Hierarki</option>
                      <option value="MAIN_ONLY">Kategori Utama Saja</option>
                      <option value="SUB_ONLY">Semua Subkategori Saja</option>
                      <optgroup label="Berdasarkan Kategori Induk:">
                        {categories.filter(c => !c.parentId).map(root => (
                          <option key={root.id} value={root.id}>
                            📁 {root.name} &amp; Subnya
                          </option>
                        ))}
                      </optgroup>
                    </select>

                    <span className="text-[11px] text-slate-400 px-1">
                      {filteredCategories.length} data
                    </span>
                  </div>
                </div>
              </div>

              {/* Category Safe Deletion Conflict Notification */}
              {deletingCategory && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3 text-xs animate-in fade-in duration-200">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h4 className="font-bold text-amber-900 text-xs">
                        Peringatan Integritas Data: "{deletingCategory.name}"
                      </h4>
                      {deleteConflictReason ? (
                        <div className="space-y-2 text-amber-800 text-xs">
                          <p>{deleteConflictReason}</p>
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              onClick={() => {
                                setCategoryTypeFilter(deletingCategory.id);
                                setCategoryPage(1);
                                setDeletingCategory(null);
                                setDeleteConflictReason(null);
                              }}
                              className="px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white rounded-lg font-bold"
                            >
                              Tampilkan Subkategori di Tabel
                            </button>
                            <button
                              onClick={() => {
                                setDeletingCategory(null);
                                setDeleteConflictReason(null);
                              }}
                              className="px-3 py-1.5 border border-amber-300 text-amber-900 bg-white rounded-lg hover:bg-amber-100"
                            >
                              Tutup
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2 text-amber-800 text-xs">
                          <p>
                            Kategori ini memiliki <strong>{products.filter(p => p.categoryId === deletingCategory.id || p.subcategoryId === deletingCategory.id).length} produk aktif</strong>. 
                            Untuk mencegah produk menjadi tanpa kategori, pilih kategori pengganti di bawah ini sebelum menghapus:
                          </p>
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <select
                              value={reassignTargetCatId}
                              onChange={(e) => setReassignTargetCatId(e.target.value)}
                              className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                            >
                              {categories
                                .filter(c => c.id !== deletingCategory.id && !c.parentId)
                                .map(c => (
                                  <option key={c.id} value={c.id}>
                                    Pindahkan ke: {c.name}
                                  </option>
                                ))}
                            </select>
                            <button
                              onClick={handleConfirmReassignAndDeleteCategory}
                              className="px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white rounded-lg font-bold"
                            >
                              Pindahkan Produk &amp; Hapus Kategori
                            </button>
                            <button
                              onClick={() => {
                                setDeletingCategory(null);
                                setDeleteConflictReason(null);
                              }}
                              className="px-3 py-1.5 border border-slate-300 text-slate-700 bg-white rounded-lg hover:bg-slate-50"
                            >
                              Batal
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Categories Table View */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50/80 text-slate-600 uppercase border-b border-slate-200 font-semibold tracking-wider text-[11px]">
                      <tr>
                        <th className="py-3 px-3 w-16 text-center">Urutan</th>
                        <th className="py-3 px-3 w-16">Foto</th>
                        <th className="py-3 px-3">Nama Kategori &amp; Hierarki</th>
                        <th className="py-3 px-3">Slug URL</th>
                        <th className="py-3 px-3">Produk</th>
                        <th className="py-3 px-3">Status</th>
                        <th className="py-3 px-3 text-right">Tindakan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedCategories.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-12 text-center text-slate-400">
                            <div className="space-y-2">
                              <p>Tidak ada kategori atau subkategori yang sesuai filter.</p>
                              {(categorySearch || categoryStatusFilter !== 'ALL' || categoryTypeFilter !== 'ALL') && (
                                <button
                                  onClick={() => {
                                    setCategorySearch('');
                                    setCategoryStatusFilter('ALL');
                                    setCategoryTypeFilter('ALL');
                                    setCategoryPage(1);
                                  }}
                                  className="text-xs font-bold text-[#FE8A00] hover:underline"
                                >
                                  Reset Semua Filter
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ) : (
                        paginatedCategories.map(cat => {
                          const directProductsCount = products.filter(p => p.categoryId === cat.id || p.subcategoryId === cat.id).length;
                          const isSub = Boolean(cat.parentId);
                          const parentCat = isSub ? categories.find(p => p.id === cat.parentId) : null;
                          const childSubs = !isSub ? categories.filter(c => c.parentId === cat.id) : [];

                          return (
                            <tr key={cat.id} className={`hover:bg-slate-50/70 transition-colors ${isSub ? 'bg-slate-50/30' : ''}`}>
                              {/* Order Index */}
                              <td className="py-3 px-3 text-center font-bold text-slate-700">
                                #{cat.orderIndex}
                              </td>

                              {/* Photo Thumbnail */}
                              <td className="py-3 px-3">
                                <div className="relative w-12 h-9 rounded-md overflow-hidden border border-slate-200 bg-slate-100 shrink-0">
                                  <img
                                    src={cat.imageUrl || getCategoryPhotoAuto(cat.name)}
                                    alt={cat.name}
                                    referrerPolicy="no-referrer"
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      const target = e.currentTarget;
                                      target.onerror = null;
                                      target.src = 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&auto=format&fit=crop&q=80';
                                    }}
                                  />
                                </div>
                              </td>

                              {/* Name & Hierarchy Structure */}
                              <td className="py-3 px-3">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {isSub && (
                                      <span className="text-slate-400 font-bold select-none text-xs">↳</span>
                                    )}
                                    <span className="font-bold text-slate-900 text-xs">
                                      {cat.name}
                                    </span>
                                    
                                    {isSub ? (
                                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1">
                                        <FolderTree className="w-2.5 h-2.5" />
                                        <span>Subkategori</span>
                                        {parentCat && <span>• Induk: {parentCat.name}</span>}
                                      </span>
                                    ) : (
                                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-50 text-orange-800 border border-orange-200 flex items-center gap-1">
                                        <Layers className="w-2.5 h-2.5" />
                                        <span>Kategori Utama</span>
                                        {childSubs.length > 0 && (
                                          <span>({childSubs.length} sub)</span>
                                        )}
                                      </span>
                                    )}
                                  </div>

                                  {cat.description && (
                                    <div className="text-[11px] text-slate-400 line-clamp-1">
                                      {cat.description}
                                    </div>
                                  )}
                                </div>
                              </td>

                              {/* Slug URL */}
                              <td className="py-3 px-3 font-mono text-[11px] text-slate-500">
                                /{cat.slug}
                              </td>

                              {/* Product Count */}
                              <td className="py-3 px-3">
                                <span className="font-bold text-slate-700 text-xs">
                                  {directProductsCount} produk
                                </span>
                              </td>

                              {/* Status Toggle */}
                              <td className="py-3 px-3">
                                <button
                                  onClick={() => handleToggleCategoryActive(cat.id)}
                                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors ${
                                    cat.isActive 
                                      ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' 
                                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                  }`}
                                  title="Klik untuk mengubah status aktif"
                                >
                                  {cat.isActive ? '● Aktif' : '○ Nonaktif'}
                                </button>
                              </td>

                              {/* Actions */}
                              <td className="py-3 px-3 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  {!isSub && (
                                    <button
                                      onClick={() => handleOpenCreateCategory(cat.id, true)}
                                      className="px-2 py-1 rounded text-[11px] font-semibold text-[#FE8A00] bg-orange-50 hover:bg-orange-100 transition-colors flex items-center gap-1"
                                      title="Tambah subkategori di bawah kategori ini"
                                    >
                                      <Plus className="w-3 h-3" />
                                      <span>Sub</span>
                                    </button>
                                  )}

                                  <button
                                    onClick={() => handleOpenEditCategory(cat)}
                                    className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                                    title="Edit Kategori / Subkategori"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleRequestDeleteCategory(cat)}
                                    className="p-1.5 rounded-lg text-rose-600 hover:text-rose-800 hover:bg-rose-50 transition-colors"
                                    title="Hapus Kategori"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Categories Pagination Controls */}
                <div className="p-3 bg-slate-50/60 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
                  <div>
                    Menampilkan {paginatedCategories.length} dari {filteredCategories.length} kategori
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      disabled={categoryPage <= 1}
                      onClick={() => setCategoryPage(prev => Math.max(1, prev - 1))}
                      className="px-2.5 py-1 border border-slate-200 rounded hover:bg-slate-100 disabled:opacity-40 transition-colors"
                    >
                      Sebelumnya
                    </button>
                    <span className="font-semibold text-slate-700 px-2">
                      Hal {categoryPage} / {totalCategoryPages}
                    </span>
                    <button
                      disabled={categoryPage >= totalCategoryPages}
                      onClick={() => setCategoryPage(prev => Math.min(totalCategoryPages, prev + 1))}
                      className="px-2.5 py-1 border border-slate-200 rounded hover:bg-slate-100 disabled:opacity-40 transition-colors"
                    >
                      Berikutnya
                    </button>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* 4. PESANAN (ORDER MANAGEMENT BACK-OFFICE)                        */}
          {/* ================================================================ */}
          {activeTab === 'orders' && (
            <div className="space-y-4 max-w-7xl mx-auto">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                  <h1 className="text-lg font-bold text-slate-900">Manajemen Pesanan</h1>
                  <p className="text-xs text-slate-500">Kelola status pemenuhan pesanan dari Baru, Dikemas, Dikirim, hingga Selesai</p>
                </div>
              </div>

              {/* Order Filter Bar */}
              <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs space-y-3">
                <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                  <div className="relative flex-1 max-w-md">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={orderSearch}
                      onChange={(e) => {
                        setOrderSearch(e.target.value);
                        setOrderPage(1);
                      }}
                      placeholder="Cari No. Pesanan, nama pembeli, atau No. WhatsApp..."
                      className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 focus:bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:border-[#FE8A00]"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <select
                      value={orderStatusFilter}
                      onChange={(e) => {
                        setOrderStatusFilter(e.target.value as any);
                        setOrderPage(1);
                      }}
                      className="px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-700"
                    >
                      <option value="ALL">Semua Status Pesanan</option>
                      <option value="NEW">1. Menunggu Pembayaran</option>
                      <option value="PAYMENT_VERIFIED">2. Pembayaran Terverifikasi</option>
                      <option value="WAITING_SUPPLIER_CONFIRMATION">3. Konfirmasi Pemasok</option>
                      <option value="SUPPLIER_PROCESSING">4. Diproses Pemasok</option>
                      <option value="IN_TRANSIT_AIR">5. Kargo Udara</option>
                      <option value="DELIVERED">6. Terkirim (Selesai)</option>
                      <option value="CANCELLED">7. Dibatalkan / Refund</option>
                    </select>

                    <select
                      value={paymentStatusFilter}
                      onChange={(e) => {
                        setPaymentStatusFilter(e.target.value as any);
                        setOrderPage(1);
                      }}
                      className="px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-700"
                    >
                      <option value="ALL">Semua Pembayaran</option>
                      <option value="PAID">Lunas (Paid)</option>
                      <option value="PENDING">Pending (Menunggu)</option>
                      <option value="WAITING_VERIFICATION">Verifikasi Gateway</option>
                      <option value="REFUNDED">Refund</option>
                      <option value="EXPIRED">Kedaluwarsa</option>
                    </select>
                  </div>
                </div>

                {/* Bulk status update bar */}
                {selectedOrderIds.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs bg-orange-50/50 p-2 rounded-lg">
                    <span className="font-semibold text-slate-700">{selectedOrderIds.length} pesanan terpilih</span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        onClick={() => handleBulkUpdateOrderStatus('WAITING_SUPPLIER_CONFIRMATION')}
                        className="px-2 py-1 bg-white border border-slate-200 rounded text-[11px] font-medium"
                      >
                        Set: Konfirmasi Pemasok
                      </button>
                      <button
                        onClick={() => handleBulkUpdateOrderStatus('SUPPLIER_PROCESSING')}
                        className="px-2 py-1 bg-white border border-slate-200 rounded text-[11px] font-medium"
                      >
                        Set: Diproses Pemasok
                      </button>
                      <button
                        onClick={() => handleBulkUpdateOrderStatus('IN_TRANSIT_AIR')}
                        className="px-2 py-1 bg-white border border-slate-200 rounded text-[11px] font-medium"
                      >
                        Set: Kargo Udara
                      </button>
                      <button
                        onClick={() => handleBulkUpdateOrderStatus('DELIVERED')}
                        className="px-2 py-1 bg-emerald-700 text-white rounded text-[11px] font-medium"
                      >
                        Set: Terkirim
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Orders Table */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50/80 text-slate-600 uppercase border-b border-slate-200 font-semibold tracking-wider text-[11px]">
                      <tr>
                        <th className="py-3 px-3 w-8">
                          <input
                            type="checkbox"
                            checked={selectedOrderIds.length === paginatedOrders.length && paginatedOrders.length > 0}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedOrderIds(paginatedOrders.map(o => o.id));
                              } else {
                                setSelectedOrderIds([]);
                              }
                            }}
                            className="rounded text-[#FE8A00] focus:ring-[#FE8A00]"
                          />
                        </th>
                        <th className="py-3 px-3">No. Pesanan</th>
                        <th className="py-3 px-3">Pelanggan</th>
                        <th className="py-3 px-3">Kecamatan</th>
                        <th className="py-3 px-3">Total</th>
                        <th className="py-3 px-3">Status Pesanan</th>
                        <th className="py-3 px-3">Status Bayar</th>
                        <th className="py-3 px-3 text-right">Rincian</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedOrders.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-12 text-center text-slate-400">
                            Tidak ada pesanan yang sesuai dengan filter.
                          </td>
                        </tr>
                      ) : (
                        paginatedOrders.map(o => (
                          <tr key={o.id} className="hover:bg-slate-50/60 transition-colors">
                            <td className="py-3 px-3">
                              <input
                                type="checkbox"
                                checked={selectedOrderIds.includes(o.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedOrderIds(prev => [...prev, o.id]);
                                  } else {
                                    setSelectedOrderIds(prev => prev.filter(id => id !== o.id));
                                  }
                                }}
                                className="rounded text-[#FE8A00] focus:ring-[#FE8A00]"
                              />
                            </td>
                            <td 
                              className="py-3 px-3 font-bold text-slate-900 cursor-pointer hover:text-[#FE8A00] transition-colors"
                              onClick={() => navigateAdmin('orders', 'order_detail', o.id)}
                              title="Buka rincian lengkap pesanan"
                            >
                              {o.orderNumber}
                            </td>
                            <td className="py-3 px-3">
                              <div className="font-semibold text-slate-800">{o.customerName}</div>
                              <div className="text-[11px] text-slate-400 font-mono">{o.customerPhone}</div>
                            </td>
                            <td className="py-3 px-3 text-slate-600 max-w-xs truncate">{o.customerDistrict}</td>
                            <td className="py-3 px-3 font-extrabold text-slate-900">
                              Rp {o.total.toLocaleString('id-ID')}
                            </td>
                            <td className="py-3 px-3">
                              <select
                                value={o.orderStatus}
                                onChange={(e) => handleUpdateOrderStatus(o.id, e.target.value as any)}
                                className={`px-2 py-1 border rounded text-[11px] font-semibold ${
                                  o.orderStatus === 'DELIVERED' || o.orderStatus === 'COMPLETED' ? 'bg-emerald-50 text-emerald-800 border-emerald-300' :
                                  o.orderStatus === 'CANCELLED' ? 'bg-rose-50 text-rose-700 border-rose-300' :
                                  o.orderStatus === 'IN_TRANSIT_AIR' || o.orderStatus === 'SHIPPED' ? 'bg-purple-50 text-purple-800 border-purple-300' :
                                  o.orderStatus === 'SUPPLIER_PROCESSING' ? 'bg-indigo-50 text-indigo-800 border-indigo-300' :
                                  o.orderStatus === 'WAITING_SUPPLIER_CONFIRMATION' ? 'bg-sky-50 text-sky-800 border-sky-300' :
                                  o.orderStatus === 'PAYMENT_VERIFIED' ? 'bg-blue-50 text-blue-800 border-blue-300' :
                                  'bg-amber-50 text-amber-900 border-amber-300'
                                }`}
                              >
                                <option value="NEW">Menunggu Bayar</option>
                                <option value="PAYMENT_VERIFIED">Bayar Terverifikasi</option>
                                <option value="WAITING_SUPPLIER_CONFIRMATION">Konfirmasi Pemasok</option>
                                <option value="SUPPLIER_PROCESSING">Diproses Pemasok</option>
                                <option value="IN_TRANSIT_AIR">Kargo Udara</option>
                                <option value="DELIVERED">Terkirim</option>
                                <option value="CANCELLED">Dibatalkan</option>
                              </select>
                            </td>
                            <td className="py-3 px-3">
                              <select
                                value={o.paymentStatus}
                                onChange={(e) => handleUpdatePaymentStatus(o.id, e.target.value as any)}
                                className={`px-2 py-1 border rounded text-[11px] font-semibold ${
                                  o.paymentStatus === 'PAID' ? 'bg-emerald-50 text-emerald-800 border-emerald-300' :
                                  o.paymentStatus === 'PENDING' ? 'bg-amber-50 text-amber-900 border-amber-300' :
                                  'bg-white border-slate-200 text-slate-700'
                                }`}
                              >
                                <option value="PENDING">Pending</option>
                                <option value="WAITING_VERIFICATION">Verifikasi Gateway</option>
                                <option value="PAID">Lunas (Paid)</option>
                                <option value="STANDBY">Standby</option>
                                <option value="UNPAID">Belum Bayar</option>
                                <option value="EXPIRED">Kedaluwarsa</option>
                              </select>
                            </td>
                            <td className="py-3 px-3 text-right">
                              <button
                                onClick={() => navigateAdmin('orders', 'order_detail', o.id)}
                                className="px-2.5 py-1 text-[11px] font-bold text-[#FE8A00] hover:bg-orange-50 rounded transition-colors inline-flex items-center gap-1"
                              >
                                <span>Rincian</span>
                                <ChevronRight className="w-3 h-3" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="p-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <div>Menampilkan {paginatedOrders.length} dari {filteredOrders.length} pesanan</div>
                  <div className="flex items-center gap-1.5">
                    <button
                      disabled={orderPage <= 1}
                      onClick={() => setOrderPage(prev => Math.max(1, prev - 1))}
                      className="px-2.5 py-1 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-40"
                    >
                      Sebelumnya
                    </button>
                    <span className="font-semibold text-slate-700 px-2">Hal {orderPage} / {totalOrderPages}</span>
                    <button
                      disabled={orderPage >= totalOrderPages}
                      onClick={() => setOrderPage(prev => Math.min(totalOrderPages, prev + 1))}
                      className="px-2.5 py-1 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-40"
                    >
                      Berikutnya
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* 5. PEMBAYARAN & PAYMENT GATEWAYS                                 */}
          {/* ================================================================ */}
          {activeTab === 'payments' && (
            <div className="space-y-4 max-w-7xl mx-auto">
              <div>
                <h1 className="text-lg font-bold text-slate-900">Rekonsiliasi Pembayaran</h1>
                <p className="text-xs text-slate-500">Status verifikasi gateway, tautan pembayaran, dan riwayat pelunasan pesanan</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[11px] font-bold uppercase text-slate-400">Total Terbayar (Paid)</span>
                  <div className="text-xl font-black text-emerald-700 mt-1">
                    Rp {paidRevenue.toLocaleString('id-ID')}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{paidOrders.length} transaksi lunas</div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[11px] font-bold uppercase text-slate-400">Menunggu Pelunasan (Pending)</span>
                  <div className="text-xl font-black text-amber-600 mt-1">
                    Rp {orders.filter(o => o.paymentStatus === 'PENDING').reduce((s, o) => s + o.total, 0).toLocaleString('id-ID')}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {orders.filter(o => o.paymentStatus === 'PENDING').length} payment link aktif
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[11px] font-bold uppercase text-slate-400">Kedaluwarsa / Batal</span>
                  <div className="text-xl font-black text-slate-600 mt-1">
                    {orders.filter(o => o.paymentStatus === 'EXPIRED').length} transaksi
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Stok otomatis aman / dibebaskan</div>
                </div>
              </div>

              {/* Transactions Table */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/80 text-slate-600 uppercase border-b border-slate-200 font-semibold tracking-wider text-[11px]">
                    <tr>
                      <th className="py-3 px-3">No. Pesanan</th>
                      <th className="py-3 px-3">Pembeli</th>
                      <th className="py-3 px-3">Nominal</th>
                      <th className="py-3 px-3">Metode / Gateway</th>
                      <th className="py-3 px-3">Status Verifikasi</th>
                      <th className="py-3 px-3">Waktu Bayar</th>
                      <th className="py-3 px-3 text-right">Tindakan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {orders.map(o => (
                      <tr key={o.id} className="hover:bg-slate-50/60">
                        <td className="py-3 px-3 font-bold text-slate-900">{o.orderNumber}</td>
                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-800">{o.customerName}</div>
                          <div className="text-[10px] text-slate-400">{o.customerPhone}</div>
                        </td>
                        <td className="py-3 px-3 font-extrabold text-slate-900">Rp {o.total.toLocaleString('id-ID')}</td>
                        <td className="py-3 px-3 text-slate-600">{o.paymentMethod || 'Payment Gateway'}</td>
                        <td className="py-3 px-3">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            o.paymentStatus === 'PAID' ? 'bg-emerald-100 text-emerald-800' :
                            o.paymentStatus === 'PENDING' ? 'bg-amber-100 text-amber-800' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {o.paymentStatus}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-500 text-[11px]">
                          {o.paidAt ? new Date(o.paidAt).toLocaleString('id-ID') : '-'}
                        </td>
                        <td className="py-3 px-3 text-right">
                          {o.paymentStatus !== 'PAID' ? (
                            <button
                              onClick={() => handleUpdatePaymentStatus(o.id, 'PAID')}
                              className="px-2 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-[11px] font-semibold"
                            >
                              Tandai Lunas
                            </button>
                          ) : (
                            <span className="text-[11px] text-emerald-700 font-bold">Terverifikasi</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* 6. PELANGGAN (CUSTOMER DIRECTORY)                                */}
          {/* ================================================================ */}
          {activeTab === 'customers' && (
            <div className="space-y-4 max-w-7xl mx-auto">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                  <h1 className="text-lg font-bold text-slate-900">Direktori Pelanggan</h1>
                  <p className="text-xs text-slate-500">Daftar pelanggan terdaftar dari transaksi pesanan yang telah dilakukan</p>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="Cari pelanggan..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:border-[#FE8A00]"
                  />
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/80 text-slate-600 uppercase border-b border-slate-200 font-semibold tracking-wider text-[11px]">
                    <tr>
                      <th className="py-3 px-3">Nama Pelanggan</th>
                      <th className="py-3 px-3">No. WhatsApp / HP</th>
                      <th className="py-3 px-3">Wilayah / Kecamatan</th>
                      <th className="py-3 px-3">Total Pesanan</th>
                      <th className="py-3 px-3">Total Belanja</th>
                      <th className="py-3 px-3">Pesanan Terakhir</th>
                      <th className="py-3 px-3 text-right">Tindakan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredCustomers.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-400">
                          Belum ada data pelanggan yang tercatat dari pesanan.
                        </td>
                      </tr>
                    ) : (
                      filteredCustomers.map((cust, idx) => (
                        <tr 
                          key={idx} 
                          className="hover:bg-slate-50/60 cursor-pointer transition-colors"
                          onClick={() => navigateAdmin('customers', 'customer_detail', cust.phone || cust.name)}
                        >
                          <td className="py-3 px-3 font-bold text-slate-900 hover:text-[#FE8A00] transition-colors">{cust.name}</td>
                          <td className="py-3 px-3 font-mono text-[11px] text-slate-600">{cust.phone}</td>
                          <td className="py-3 px-3 text-slate-600">{cust.district}</td>
                          <td className="py-3 px-3 font-semibold text-slate-800">{cust.orderCount} kali</td>
                          <td className="py-3 px-3 font-extrabold text-emerald-700">
                            Rp {cust.totalSpend.toLocaleString('id-ID')}
                          </td>
                          <td className="py-3 px-3 text-slate-500 text-[11px]">
                            {new Date(cust.lastOrderDate).toLocaleDateString('id-ID')}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigateAdmin('customers', 'customer_detail', cust.phone || cust.name);
                              }}
                              className="px-2.5 py-1 text-[11px] font-bold text-[#FE8A00] hover:bg-orange-50 rounded transition-colors inline-flex items-center gap-1"
                            >
                              <span>Rincian</span>
                              <ChevronRight className="w-3 h-3" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* 7. PROGRAM AFFILIATE & CAMPAIGN (REQUIREMENT 1, 3, 4, 6)         */}
          {/* ================================================================ */}
          {activeTab === 'affiliates' && (
            <div className="space-y-6 max-w-7xl mx-auto">
              {/* Header & Sub-tab Navigation */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-4">
                <div>
                  <h1 className="text-lg font-bold text-slate-900">Program Affiliate & Campaign Promosi</h1>
                  <p className="text-xs text-slate-500">Kelola kampanye promosi berjadwal, kuota komisi, mitra referral, dan audit transaksi</p>
                </div>

                {affiliateSubTab === 'campaigns' && (
                  <button
                    onClick={handleOpenCreateCampaign}
                    className="px-4 py-2 bg-[#FE8A00] hover:bg-[#e07b00] text-white text-xs font-bold rounded-lg transition-colors shadow-xs flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Buat Campaign Baru</span>
                  </button>
                )}
              </div>

              {/* Sub-tab Switcher */}
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
                <button
                  onClick={() => setAffiliateSubTab('campaigns')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                    affiliateSubTab === 'campaigns'
                      ? 'bg-orange-50 text-[#FE8A00] border border-orange-200'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <Flame className="w-3.5 h-3.5" />
                  <span>Campaign Promosi ({campaigns.length})</span>
                </button>

                <button
                  onClick={() => setAffiliateSubTab('applications')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                    affiliateSubTab === 'applications'
                      ? 'bg-orange-50 text-[#FE8A00] border border-orange-200'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Mitra Affiliate ({affiliates.length})</span>
                </button>

                <button
                  onClick={() => setAffiliateSubTab('transactions')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                    affiliateSubTab === 'transactions'
                      ? 'bg-orange-50 text-[#FE8A00] border border-orange-200'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  <span>Riwayat Komisi Pesanan ({orders.filter(o => Boolean(o.affiliateCommission)).length})</span>
                </button>

                <button
                  onClick={() => setAffiliateSubTab('payouts')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                    affiliateSubTab === 'payouts'
                      ? 'bg-orange-50 text-[#FE8A00] border border-orange-200'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Pencairan Komisi ({adminPayouts.length})</span>
                </button>

                <button
                  onClick={() => setAffiliateSubTab('settings')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                    affiliateSubTab === 'settings'
                      ? 'bg-orange-50 text-[#FE8A00] border border-orange-200'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>Pengaturan Komisi Standar</span>
                </button>
              </div>

              {/* ------------------------------------------------------------ */}
              {/* SUB-TAB 1: CAMPAIGN PROMOSI (REQUIREMENT 3 & 4)              */}
              {/* ------------------------------------------------------------ */}
              {affiliateSubTab === 'campaigns' && (
                <div className="space-y-6">
                  {/* Real-time Conflict Alert Banner */}
                  {(() => {
                    const conflicts = detectCampaignConflicts(campaigns, products);
                    if (conflicts.length === 0) return null;
                    return (
                      <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl text-xs space-y-2">
                        <div className="flex items-center gap-2 text-amber-900 font-bold">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>Peringatan Konflik Jadwal Campaign ({conflicts.length} Produk Bertumpuk)</span>
                        </div>
                        <p className="text-amber-800 leading-relaxed text-[11px]">
                          Terdapat produk yang didaftarkan pada lebih dari satu campaign yang aktif di periode bersamaan. Sistem menerapkan <strong>prioritas deterministik (campaign dengan komisi tertinggi akan diprioritaskan)</strong> dan tidak menjumlahkan persentase secara otomatis:
                        </p>
                        <div className="divide-y divide-amber-200/60 max-h-40 overflow-y-auto">
                          {conflicts.map((cf, idx) => (
                            <div key={idx} className="py-1.5 text-[11px] text-amber-900">
                              • <strong>{cf.productName}</strong>: {cf.message}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Campaigns Table */}
                  <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50/80 text-slate-600 uppercase border-b border-slate-200 font-semibold tracking-wider text-[11px]">
                        <tr>
                          <th className="py-3 px-3">Nama Campaign</th>
                          <th className="py-3 px-3">Persentase</th>
                          <th className="py-3 px-3">Periode Waktu</th>
                          <th className="py-3 px-3">Produk</th>
                          <th className="py-3 px-3">Performa Nyata</th>
                          <th className="py-3 px-3">Status</th>
                          <th className="py-3 px-3 text-right">Tindakan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {campaigns.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-12 text-center text-slate-400">
                              Belum ada affiliate campaign yang dibuat. Klik tombol <strong>+ Buat Campaign Baru</strong> untuk membuat kampanye promosi pertama.
                            </td>
                          </tr>
                        ) : (
                          campaigns.map(camp => {
                            const perf = getCampaignPerformance(camp, orders);
                            const startStr = new Date(camp.startDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                            const endStr = new Date(camp.endDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

                            return (
                              <tr key={camp.id} className="hover:bg-slate-50/60">
                                <td className="py-3 px-3">
                                  <div className="font-bold text-slate-900">{camp.name}</div>
                                  <div className="text-[11px] text-slate-400 line-clamp-1">{camp.description || 'Tanpa deskripsi'}</div>
                                </td>

                                <td className="py-3 px-3">
                                  <span className="font-black text-sm text-[#FE8A00] font-mono">
                                    {camp.commissionRate}%
                                  </span>
                                </td>

                                <td className="py-3 px-3 text-[11px] text-slate-600">
                                  <div>Mulai: {startStr}</div>
                                  <div>Selesai: {endStr}</div>
                                </td>

                                <td className="py-3 px-3">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                                    <Tag className="w-3 h-3 text-slate-400" />
                                    <span>{camp.productIds.length} Produk</span>
                                  </span>
                                </td>

                                <td className="py-3 px-3 text-[11px]">
                                  <div className="font-semibold text-slate-800">
                                    {perf.usedOrders} {camp.maxOrders ? `/ ${camp.maxOrders}` : ''} Pesanan
                                  </div>
                                  <div className="text-slate-500 font-mono text-[10px]">
                                    Rp {perf.usedCommission.toLocaleString('id-ID')} {camp.budgetLimit ? `/ Rp ${camp.budgetLimit.toLocaleString('id-ID')}` : ''}
                                  </div>
                                  {perf.isBudgetExhausted && (
                                    <span className="text-[10px] font-bold text-rose-600 block">Anggaran Habis</span>
                                  )}
                                  {perf.isQuotaExhausted && (
                                    <span className="text-[10px] font-bold text-rose-600 block">Kuota Habis</span>
                                  )}
                                </td>

                                <td className="py-3 px-3">
                                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                    perf.effectiveStatus === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' :
                                    perf.effectiveStatus === 'SCHEDULED' ? 'bg-blue-100 text-blue-800' :
                                    perf.effectiveStatus === 'PAUSED' ? 'bg-amber-100 text-amber-800' :
                                    perf.effectiveStatus === 'ENDED' ? 'bg-slate-200 text-slate-700' :
                                    'bg-slate-100 text-slate-600'
                                  }`}>
                                    {perf.effectiveStatus === 'ACTIVE' ? 'Aktif' :
                                     perf.effectiveStatus === 'SCHEDULED' ? 'Terjadwal' :
                                     perf.effectiveStatus === 'PAUSED' ? 'Dijeda' :
                                     perf.effectiveStatus === 'ENDED' ? 'Selesai / Berakhir' : 'Draft'}
                                  </span>
                                </td>

                                <td className="py-3 px-3 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      onClick={() => handleToggleCampaignStatus(camp.id)}
                                      className="p-1 rounded text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                                      title={camp.status === 'ACTIVE' ? 'Jeda Campaign' : 'Aktifkan Campaign'}
                                    >
                                      {camp.status === 'ACTIVE' ? <PauseCircle className="w-4 h-4 text-amber-600" /> : <Play className="w-4 h-4 text-emerald-600" />}
                                    </button>

                                    <button
                                      onClick={() => handleOpenEditCampaign(camp)}
                                      className="p-1 rounded text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                                      title="Edit Campaign"
                                    >
                                      <Edit3 className="w-4 h-4" />
                                    </button>

                                    {camp.status !== 'ENDED' && (
                                      <button
                                        onClick={() => handleEndCampaign(camp.id)}
                                        className="p-1 rounded text-slate-600 hover:text-rose-600 hover:bg-slate-100"
                                        title="Akhiri Campaign"
                                      >
                                        <StopCircle className="w-4 h-4 text-slate-400 hover:text-rose-600" />
                                      </button>
                                    )}

                                    <button
                                      onClick={() => handleDeleteCampaign(camp.id)}
                                      className="p-1 rounded text-slate-600 hover:text-rose-600 hover:bg-slate-100"
                                      title="Hapus Campaign"
                                    >
                                      <Trash2 className="w-4 h-4 text-slate-400 hover:text-rose-600" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ------------------------------------------------------------ */}
              {/* SUB-TAB 2: MITRA AFFILIATE (APPLICATIONS)                    */}
              {/* ------------------------------------------------------------ */}
              {affiliateSubTab === 'applications' && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50/80 text-slate-600 uppercase border-b border-slate-200 font-semibold tracking-wider text-[11px]">
                      <tr>
                        <th className="py-3 px-3">Nama Mitra</th>
                        <th className="py-3 px-3">Kontak (WA & Email)</th>
                        <th className="py-3 px-3">Kanal Promosi</th>
                        <th className="py-3 px-3">Kode Referral</th>
                        <th className="py-3 px-3">Status</th>
                        <th className="py-3 px-3 text-right">Tindakan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {affiliates.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-slate-400">
                            Belum ada pendaftaran affiliate yang masuk.
                          </td>
                        </tr>
                      ) : (
                        affiliates.map(app => (
                          <tr 
                            key={app.id} 
                            className="hover:bg-slate-50/60 cursor-pointer transition-colors"
                            onClick={() => navigateAdmin('affiliates', 'affiliate_detail', app.id)}
                          >
                            <td className="py-3 px-3 font-bold text-slate-900 hover:text-[#FE8A00] transition-colors">{app.fullName}</td>
                            <td className="py-3 px-3">
                              <div className="text-slate-800 font-mono text-[11px]">{app.phone}</div>
                              <div className="text-slate-400 text-[10px]">{app.email}</div>
                            </td>
                            <td className="py-3 px-3 text-slate-600 max-w-xs truncate">{app.promotionChannel}</td>
                            <td className="py-3 px-3 font-mono font-bold text-[#FE8A00]">{app.referralCode}</td>
                            <td className="py-3 px-3">
                              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                app.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                              }`}>
                                {app.status === 'APPROVED' ? 'Disetujui' : 'Menunggu Review'}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigateAdmin('affiliates', 'affiliate_detail', app.id);
                                  }}
                                  className="px-2 py-1 text-[11px] font-bold text-[#FE8A00] hover:bg-orange-50 rounded transition-colors inline-flex items-center gap-1"
                                >
                                  <span>Rincian</span>
                                  <ChevronRight className="w-3 h-3" />
                                </button>
                                {app.status !== 'APPROVED' ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleUpdateAffiliateStatus(app.id, 'APPROVED');
                                    }}
                                    className="px-2 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-[11px] font-semibold"
                                  >
                                    Setujui
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleUpdateAffiliateStatus(app.id, 'PENDING');
                                    }}
                                    className="px-2 py-1 text-slate-600 hover:bg-slate-100 rounded text-[11px]"
                                  >
                                    Tinjau Ulang
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ------------------------------------------------------------ */}
              {/* SUB-TAB 3: RIWAYAT KOMISI TRANSAKSI (AUDIT & INTEGRITY)     */}
              {/* ------------------------------------------------------------ */}
              {affiliateSubTab === 'transactions' && (
                <div className="space-y-4">
                  <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl text-xs text-slate-600 leading-relaxed">
                    <p className="font-bold text-slate-900 mb-1">Integritas Komisi Transaksi & Immutability Snapshot</p>
                    <p>
                      Setiap komisi pesanan dikalkulasikan di backend saat pesanan dibuat dan disimpan sebagai snapshot permanen. 
                      Perubahan persentase komisi toko atau campaign di masa mendatang <strong>tidak akan mengubah nominal pada transaksi lama</strong>.
                    </p>
                  </div>

                  <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50/80 text-slate-600 uppercase border-b border-slate-200 font-semibold tracking-wider text-[11px]">
                        <tr>
                          <th className="py-3 px-3">No. Pesanan & Tanggal</th>
                          <th className="py-3 px-3">Mitra Referral</th>
                          <th className="py-3 px-3">Rincian Komisi Produk</th>
                          <th className="py-3 px-3">Total Komisi</th>
                          <th className="py-3 px-3">Status Komisi</th>
                          <th className="py-3 px-3 text-right">Tindakan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {orders.filter(o => Boolean(o.affiliateCommission)).length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-12 text-center text-slate-400">
                              Belum ada transaksi dengan kode referral yang tercatat.
                            </td>
                          </tr>
                        ) : (
                          orders.filter(o => Boolean(o.affiliateCommission)).map(ord => {
                            const snap = ord.affiliateCommission!;
                            return (
                              <tr key={ord.id} className="hover:bg-slate-50/60">
                                <td className="py-3 px-3">
                                  <div className="font-mono font-bold text-slate-900">{ord.orderNumber}</div>
                                  <div className="text-[10px] text-slate-400">
                                    {new Date(ord.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                  </div>
                                </td>

                                <td className="py-3 px-3">
                                  <div className="font-mono font-bold text-[#FE8A00]">{snap.referralCode}</div>
                                  <div className="text-[10px] text-slate-500">{snap.affiliateName || 'Mitra Partner'}</div>
                                </td>

                                <td className="py-3 px-3 max-w-md">
                                  <div className="space-y-1">
                                    {snap.itemsCommission.map((it, idx) => (
                                      <div key={idx} className="text-[11px] flex items-center justify-between gap-2 border-b border-slate-100 pb-0.5">
                                        <span className="truncate text-slate-700">
                                          {it.quantity}× {it.productName}
                                        </span>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                                            it.appliedType === 'campaign' ? 'bg-orange-100 text-[#FE8A00]' :
                                            it.appliedType === 'product_custom' ? 'bg-blue-100 text-blue-800' :
                                            'bg-slate-100 text-slate-700'
                                          }`}>
                                            {it.appliedType === 'campaign' ? `Camp (${it.ratePercent}%)` :
                                             it.appliedType === 'product_custom' ? `Khusus (${it.ratePercent}%)` :
                                             `Std (${it.ratePercent}%)`}
                                          </span>
                                          <span className="font-mono font-bold text-slate-900">
                                            Rp {it.commissionAmount.toLocaleString('id-ID')}
                                          </span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </td>

                                <td className="py-3 px-3 font-mono font-bold text-sm text-[#FE8A00]">
                                  Rp {snap.totalCommission.toLocaleString('id-ID')}
                                </td>

                                <td className="py-3 px-3">
                                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                    snap.status === 'PAID' ? 'bg-emerald-100 text-emerald-800' :
                                    snap.status === 'APPROVED' ? 'bg-blue-100 text-blue-800' :
                                    snap.status === 'CANCELLED' ? 'bg-rose-100 text-rose-800' :
                                    'bg-amber-100 text-amber-800'
                                  }`}>
                                    {snap.status === 'PAID' ? 'Lunas / Ditransfer' :
                                     snap.status === 'APPROVED' ? 'Disetujui' :
                                     snap.status === 'CANCELLED' ? 'Dibatalkan' : 'Pending'}
                                  </span>
                                </td>

                                <td className="py-3 px-3 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    {snap.status !== 'PAID' && snap.status !== 'CANCELLED' && (
                                      <button
                                        onClick={() => handleUpdateCommissionPaymentStatus(ord.id, 'PAID')}
                                        className="px-2 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-[10px] font-semibold"
                                      >
                                        Tandai Cair
                                      </button>
                                    )}

                                    {snap.status !== 'CANCELLED' && (
                                      <button
                                        onClick={() => handleUpdateCommissionPaymentStatus(ord.id, 'CANCELLED')}
                                        className="px-2 py-1 text-rose-600 hover:bg-rose-50 rounded text-[10px]"
                                        title="Batalkan Komisi"
                                      >
                                        Batalkan
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ------------------------------------------------------------ */}
              {/* SUB-TAB 4: PENCAIRAN KOMISI DANA MITRA                        */}
              {/* ------------------------------------------------------------ */}
              {affiliateSubTab === 'payouts' && (
                <div className="space-y-4">
                  <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl text-xs text-slate-600 leading-relaxed">
                    <p className="font-bold text-slate-900 mb-1">Verifikasi & Penyaluran Pencairan Dana Mitra</p>
                    <p>
                      Daftar permohonan penarikan saldo komisi yang diajukan oleh mitra affiliate. Periksa rekening bank/e-wallet mitra dan klik <strong>Setujui & Tandai Ditransfer</strong> setelah transfer selesai.
                    </p>
                  </div>

                  <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50/80 text-slate-600 uppercase border-b border-slate-200 font-semibold tracking-wider text-[11px]">
                        <tr>
                          <th className="py-3 px-3">Tanggal Pengajuan</th>
                          <th className="py-3 px-3">ID Referral Mitra</th>
                          <th className="py-3 px-3">Rekening / E-Wallet</th>
                          <th className="py-3 px-3">Jumlah Penarikan</th>
                          <th className="py-3 px-3">Status</th>
                          <th className="py-3 px-3 text-right">Tindakan Admin</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {adminPayouts.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-12 text-center text-slate-400">
                              Belum ada pengajuan pencairan dana dari mitra affiliate.
                            </td>
                          </tr>
                        ) : (
                          adminPayouts.map(req => (
                            <tr key={req.id} className="hover:bg-slate-50/50">
                              <td className="py-3 px-3 text-slate-500 font-mono">
                                {new Date(req.createdAt).toLocaleDateString('id-ID', { dateStyle: 'medium' })}
                              </td>
                              <td className="py-3 px-3">
                                <span className="font-mono font-bold text-[#FE8A00] bg-orange-50 px-2 py-0.5 rounded border border-orange-200">
                                  {req.referralCode}
                                </span>
                              </td>
                              <td className="py-3 px-3">
                                <div className="font-bold text-slate-900">{req.bankName} - {req.accountNumber}</div>
                                <div className="text-[11px] text-slate-500">a.n. {req.accountName}</div>
                              </td>
                              <td className="py-3 px-3 font-mono font-bold text-sm text-slate-900">
                                Rp {req.amount.toLocaleString('id-ID')}
                              </td>
                              <td className="py-3 px-3">
                                <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                  req.status === 'PROCESSED' ? 'bg-emerald-100 text-emerald-800' :
                                  req.status === 'REJECTED' ? 'bg-rose-100 text-rose-800' :
                                  'bg-amber-100 text-amber-800'
                                }`}>
                                  {req.status === 'PROCESSED' ? 'Ditransfer (Selesai)' :
                                   req.status === 'REJECTED' ? 'Ditolak' : 'Menunggu Admin'}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-right">
                                {req.status === 'PENDING' ? (
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      onClick={() => handleUpdatePayoutStatus(req.id, 'PROCESSED')}
                                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-semibold transition-colors"
                                    >
                                      Setujui & Transfer
                                    </button>
                                    <button
                                      onClick={() => handleUpdatePayoutStatus(req.id, 'REJECTED')}
                                      className="px-2 py-1 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded text-[11px] font-semibold transition-colors"
                                    >
                                      Tolak
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-[11px] text-slate-400 italic">Sudah diproses</span>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ------------------------------------------------------------ */}
              {/* SUB-TAB 5: PENGATURAN KOMISI STANDAR (REQUIREMENT 1)        */}
              {/* ------------------------------------------------------------ */}
              {affiliateSubTab === 'settings' && (
                <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4 max-w-xl">
                  <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
                    Pengaturan Komisi Standar Toko
                  </h2>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1 text-xs">
                      Komisi Standar Toko (%) <span className="text-[#FE8A00] font-bold">(Default 15%)</span>
                    </label>
                    <div className="relative max-w-xs">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={storeConfig.defaultAffiliateCommissionRate ?? 15}
                        onChange={(e) => {
                          const val = Math.min(100, Math.max(0, Number(e.target.value)));
                          onUpdateConfig({ ...storeConfig, defaultAffiliateCommissionRate: val });
                        }}
                        className="w-full pl-3 pr-8 py-2 text-xs sm:text-sm font-bold border border-slate-200 rounded-lg focus:outline-hidden focus:border-[#FE8A00]"
                      />
                      <span className="absolute right-3 top-2 text-xs text-slate-400 font-bold">%</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Komisi dasar yang berlaku untuk produk yang tidak memiliki komisi khusus atau campaign aktif.
                    </p>
                  </div>

                  <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-[11px] text-amber-800 space-y-1">
                    <p className="font-bold">Ketentuan Integritas Transaksi:</p>
                    <p>
                      Perubahan persentase ini akan disimpan dan berlaku untuk pesanan baru di masa mendatang. 
                      Sistem <strong>tidak akan mengubah persentase atau nominal komisi pesanan lama</strong> yang sudah memiliki snapshot transaksi.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================================================================ */}
          {/* 8. LAPORAN OPERASIONAL & PERFORMA                                */}
          {/* ================================================================ */}
          {activeTab === 'reports' && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div>
                <h1 className="text-lg font-bold text-slate-900">Laporan Penjualan & Inventaris</h1>
                <p className="text-xs text-slate-500">Rangkuman analitik performa operasional marketplace</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Produk Terlaris Berdasarkan Pesanan Selesai</h3>
                  <div className="divide-y divide-slate-100 text-xs">
                    {products
                      .filter(p => (p.salesCount || 0) > 0 || completedOrders.some(o => o.items.some(i => i.productId === p.id)))
                      .slice(0, 5)
                      .map(p => (
                        <div key={p.id} className="py-2.5 flex items-center justify-between">
                          <span className="font-semibold text-slate-900">{p.name}</span>
                          <span className="font-bold text-emerald-700">
                            {completedOrders.reduce((sum, o) => {
                              const item = o.items.find(i => i.productId === p.id);
                              return sum + (item ? item.quantity : 0);
                            }, 0)} {p.unit} terjual
                          </span>
                        </div>
                      ))}
                    {completedOrders.length === 0 && (
                      <p className="text-slate-400 py-4 text-center">Belum ada pesanan dengan status selesai.</p>
                    )}
                  </div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Sebaran Kecamatan Pengiriman</h3>
                  <div className="divide-y divide-slate-100 text-xs">
                    {Array.from(new Set(orders.map(o => o.customerDistrict))).map((dist, idx) => {
                      const count = orders.filter(o => o.customerDistrict === dist).length;
                      return (
                        <div key={idx} className="py-2.5 flex items-center justify-between">
                          <span className="font-medium text-slate-800">{dist || 'Tumpang'}</span>
                          <span className="font-bold text-slate-900">{count} pesanan</span>
                        </div>
                      );
                    })}
                    {orders.length === 0 && (
                      <p className="text-slate-400 py-4 text-center">Belum ada data pengiriman.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* 9. PENGATURAN TOKO & MARKETPLACE                                  */}
          {/* ================================================================ */}
          {activeTab === 'settings' && (
            <div className="space-y-4 max-w-3xl mx-auto">
              <div>
                <h1 className="text-lg font-bold text-slate-900">Pengaturan Toko Tumpang Shop</h1>
                <p className="text-xs text-slate-500">Konfigurasi operasional, tarif antar kurir lokal, dan biaya layanan</p>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4 text-xs">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Nama Toko / Marketplace</label>
                  <input
                    type="text"
                    value={storeConfig.storeName}
                    onChange={(e) => onUpdateConfig({ ...storeConfig, storeName: e.target.value })}
                    className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:border-[#FE8A00]"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Tagline</label>
                  <input
                    type="text"
                    value={storeConfig.storeTagline}
                    onChange={(e) => onUpdateConfig({ ...storeConfig, storeTagline: e.target.value })}
                    className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:border-[#FE8A00]"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Alamat Sentra Operasional</label>
                  <input
                    type="text"
                    value={storeConfig.storeAddress}
                    onChange={(e) => onUpdateConfig({ ...storeConfig, storeAddress: e.target.value })}
                    className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:border-[#FE8A00]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      Tarif Pengiriman Reguler via Udara (Rp)
                    </label>
                    <input
                      type="number"
                      value={storeConfig.airFreightDeliveryFee ?? storeConfig.defaultDeliveryFee}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        onUpdateConfig({ 
                          ...storeConfig, 
                          defaultDeliveryFee: val,
                          airFreightDeliveryFee: val 
                        });
                      }}
                      className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:border-[#FE8A00]"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Tarif resmi kargo udara untuk seluruh pesanan</p>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      Estimasi Hari Kalender (~ Hari)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="60"
                      value={storeConfig.airFreightEstimatedDays ?? 14}
                      onChange={(e) => onUpdateConfig({ 
                        ...storeConfig, 
                        airFreightEstimatedDays: Number(e.target.value) || 14 
                      })}
                      className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:border-[#FE8A00]"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Estimasi operasional kargo udara (default 14 hari)</p>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Biaya Layanan Aplikasi (Rp)</label>
                    <input
                      type="number"
                      value={storeConfig.serviceFee}
                      onChange={(e) => onUpdateConfig({ ...storeConfig, serviceFee: Number(e.target.value) })}
                      className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:border-[#FE8A00]"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Biaya sistem/pemeliharaan</p>
                  </div>
                </div>

                <div className="p-3 bg-amber-50/70 rounded-xl border border-amber-200 text-[11px] text-amber-900 leading-relaxed">
                  <strong>Catatan Operasional Model Bisnis Impor:</strong> Estimasi 14 hari kalender adalah estimasi sementara yang dapat diubah sesuai data operasional pemasok luar negeri, prosedur bea cukai, atau rute kargo udara. Sistem tidak menjanjikan tanggal pasti kepada pembeli sebelum nomor AWB diterbitkan.
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <label className="font-semibold text-slate-700 block mb-1">
                    Komisi Standar Affiliate Toko (%) <span className="text-[#FE8A00] font-bold">(Default 15%)</span>
                  </label>
                  <div className="relative max-w-xs">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={storeConfig.defaultAffiliateCommissionRate ?? 15}
                      onChange={(e) => onUpdateConfig({ 
                        ...storeConfig, 
                        defaultAffiliateCommissionRate: Math.min(100, Math.max(0, Number(e.target.value))) 
                      })}
                      className="w-full pl-3 pr-8 py-2 text-xs sm:text-sm font-bold border border-slate-200 rounded-lg focus:outline-hidden focus:border-[#FE8A00]"
                    />
                    <span className="absolute right-3 top-2 text-xs text-slate-400 font-bold">%</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Komisi dasar yang diterima mitra affiliate jika produk tidak memiliki komisi khusus atau campaign aktif. Transaksi lama dengan snapshot komisi tidak akan terpengaruh.
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-800">
                    <input
                      type="checkbox"
                      checked={storeConfig.isOpen}
                      onChange={(e) => {
                        onUpdateConfig({ ...storeConfig, isOpen: e.target.checked });
                        showToast(`Status toko diubah ke: ${e.target.checked ? 'Buka' : 'Tutup'}`);
                      }}
                      className="w-4 h-4 text-[#FE8A00] rounded focus:ring-[#FE8A00]"
                    />
                    <span>Toko Sedang Buka & Menerima Pesanan Pelanggan</span>
                  </label>
                </div>
              </div>

              {/* Supabase & Cloud Database Status */}
              {(() => {
                const dbStatus = getSupabaseConfigStatus();
                return (
                  <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-bold text-slate-900 text-sm">Status Database Supabase</h3>
                        <p className="text-slate-500 text-[11px]">Koneksi cloud database untuk sinkronisasi katalog, pesanan, dan pengguna</p>
                      </div>
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        dbStatus.isConfigured 
                          ? 'bg-emerald-100 text-emerald-800' 
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {dbStatus.isConfigured ? 'Terhubung (Cloud Sync)' : 'Mode Mandiri (Local Storage)'}
                      </span>
                    </div>

                    {dbStatus.isConfigured ? (
                      <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg text-emerald-900 space-y-1">
                        <div className="font-semibold flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                          Kredensial Supabase terdeteksi aktif
                        </div>
                        <div className="text-[11px] font-mono text-emerald-800 truncate">
                          URL: {dbStatus.url}
                        </div>
                      </div>
                    ) : (
                      <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-lg text-amber-900 space-y-2">
                        <div className="font-semibold flex items-center gap-1.5 text-amber-950">
                          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                          Environment variable Supabase belum dikonfigurasi
                        </div>
                        <p className="text-[11px] text-amber-800 leading-relaxed">
                          Aplikasi saat ini beroperasi menggunakan <strong>Local Storage</strong> internal yang aman dan mandiri.
                          Untuk mengaktifkan sinkronisasi database cloud di Vercel atau production:
                        </p>
                        <div className="bg-white/80 p-2.5 rounded border border-amber-200 font-mono text-[11px] space-y-1 text-slate-700">
                          <div>• <span className="text-amber-900 font-semibold">VITE_SUPABASE_URL</span> = https://[project-ref].supabase.co</div>
                          <div>• <span className="text-amber-900 font-semibold">VITE_SUPABASE_ANON_KEY</span> = [anon-public-key]</div>
                        </div>
                        <p className="text-[10px] text-slate-500">
                          Isi kedua variabel di atas pada dashboard Vercel (Project Settings &rarr; Environment Variables).
                        </p>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
