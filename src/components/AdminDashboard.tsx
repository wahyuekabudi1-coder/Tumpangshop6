import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Product, Category, Order, StoreConfig, AffiliateApplication, ProductVariation, ProductVariationOption } from '../types';
import { getCategoryPhotoAuto } from '../data/mockData';
import { uploadProductImageToStorage, getSupabaseConfigStatus } from '../lib/supabase';
import { 
  Package, ShoppingBag, TrendingUp, AlertTriangle, Plus, Trash2, 
  Edit3, Check, X, Store, Settings, Truck, DollarSign, Filter, Search,
  Layers, ArrowUp, ArrowDown, Image as ImageIcon, Sparkles, CheckCircle2,
  AlertCircle, Upload, Star, Loader2, Users, CreditCard, BarChart3,
  ChevronRight, ArrowLeft, Download, RefreshCw, Eye, ExternalLink,
  ChevronDown, CheckSquare, Square, MoreHorizontal, ArrowUpDown, ShieldCheck,
  Calendar, Phone, Mail, MapPin, Percent, HelpCircle
} from 'lucide-react';

export interface AdminDashboardProps {
  products: Product[];
  categories: Category[];
  orders: Order[];
  storeConfig: StoreConfig;
  affiliates: AffiliateApplication[];
  onUpdateProducts: (products: Product[]) => void;
  onUpdateOrders: (orders: Order[]) => void;
  onUpdateCategories: (categories: Category[]) => void;
  onUpdateConfig: (config: StoreConfig) => void;
  onUpdateAffiliates?: (affiliates: AffiliateApplication[]) => void;
  onBackToCustomer: () => void;
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

export default function AdminDashboard({
  products,
  categories,
  orders,
  storeConfig,
  affiliates = [],
  onUpdateProducts,
  onUpdateOrders,
  onUpdateCategories,
  onUpdateConfig,
  onUpdateAffiliates,
  onBackToCustomer
}: AdminDashboardProps) {
  // Navigation & Sub-views (Standalone Pages with URL synchronization)
  const [activeTab, setActiveTab] = useState<AdminTab>(() => {
    const path = window.location.pathname;
    if (path.startsWith('/admin/categories')) return 'categories';
    if (path.startsWith('/admin/orders')) return 'orders';
    if (path.startsWith('/admin/payments')) return 'payments';
    if (path.startsWith('/admin/customers')) return 'customers';
    if (path.startsWith('/admin/affiliates')) return 'affiliates';
    if (path.startsWith('/admin/reports')) return 'reports';
    if (path.startsWith('/admin/settings')) return 'settings';
    if (path.startsWith('/admin/products')) return 'products';
    return 'overview';
  });

  // Dedicated Form Page Views (instead of floating modals)
  // Mode: 'list' | 'product_new' | 'product_edit' | 'category_new' | 'category_edit' | 'order_detail'
  const [formView, setFormView] = useState<'list' | 'product_new' | 'product_edit' | 'category_new' | 'category_edit' | 'order_detail'>(() => {
    const path = window.location.pathname;
    if (path === '/admin/products/new') return 'product_new';
    if (path.startsWith('/admin/products/') && path.endsWith('/edit')) return 'product_edit';
    if (path === '/admin/categories/new') return 'category_new';
    if (path.startsWith('/admin/categories/') && path.endsWith('/edit')) return 'category_edit';
    return 'list';
  });

  const [activeEditingProductId, setActiveEditingProductId] = useState<string | null>(null);
  const [activeEditingCategoryId, setActiveEditingCategoryId] = useState<string | null>(null);
  const [activeDetailOrder, setActiveDetailOrder] = useState<Order | null>(null);

  // Sync internal admin view with Browser History & URL
  const navigateAdmin = (tab: AdminTab, mode: 'list' | 'product_new' | 'product_edit' | 'category_new' | 'category_edit' | 'order_detail' = 'list', targetId?: string) => {
    setActiveTab(tab);
    setFormView(mode);
    if (targetId) {
      if (mode === 'product_edit') setActiveEditingProductId(targetId);
      if (mode === 'category_edit') setActiveEditingCategoryId(targetId);
    }

    let urlPath = `/admin/${tab}`;
    if (tab === 'overview') urlPath = '/admin';
    if (mode === 'product_new') urlPath = '/admin/products/new';
    if (mode === 'product_edit' && targetId) urlPath = `/admin/products/${targetId}/edit`;
    if (mode === 'category_new') urlPath = '/admin/categories/new';
    if (mode === 'category_edit' && targetId) urlPath = `/admin/categories/${targetId}/edit`;
    
    window.history.pushState({}, '', urlPath);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

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
  const [pDescription, setPDescription] = useState('');
  const [pImages, setPImages] = useState<string[]>([]);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [pIsActive, setPIsActive] = useState(true);
  const [pIsFeatured, setPIsFeatured] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
      setPDescription(product.description || '');
      setPImages(product.images && product.images.length > 0 ? product.images : ['https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&auto=format&fit=crop&q=80']);
      setPIsActive(product.isActive);
      setPIsFeatured(product.isFeatured || false);
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
      setPPrice(15000);
      setPOriginalPrice(undefined);
      setPStock(25);
      setPUnit('kg');
      setPCategory(categories[0]?.id || '');
      setPDescription('');
      setPImages(['https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&auto=format&fit=crop&q=80']);
      setPIsActive(true);
      setPIsFeatured(false);
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
  const [cName, setCName] = useState('');
  const [cSlug, setCSlug] = useState('');
  const [cDescription, setCDescription] = useState('');
  const [cImage, setCImage] = useState('');
  const [cOrderIndex, setCOrderIndex] = useState(1);
  const [cIsActive, setCIsActive] = useState(true);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const [reassignTargetCatId, setReassignTargetCatId] = useState<string>('');

  const initCategoryForm = (category?: Category | null) => {
    if (category) {
      setCName(category.name);
      setCSlug(category.slug);
      setCDescription(category.description || '');
      setCImage(category.imageUrl || getCategoryPhotoAuto(category.name));
      setCOrderIndex(category.orderIndex);
      setCIsActive(category.isActive);
    } else {
      setCName('');
      setCSlug('');
      setCDescription('');
      setCImage(getCategoryPhotoAuto('Kategori Baru'));
      setCOrderIndex(categories.length + 1);
      setCIsActive(true);
    }
  };

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
            description: pDescription.trim(),
            images: finalImages,
            isActive: pIsActive,
            isFeatured: pIsFeatured,
            variations: variationsToSave,
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
        description: pDescription.trim(),
        images: finalImages,
        isActive: pIsActive,
        isFeatured: pIsFeatured,
        variations: variationsToSave,
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
  const handleOpenCreateCategory = () => {
    initCategoryForm(null);
    navigateAdmin('categories', 'category_new');
  };

  const handleOpenEditCategory = (cat: Category) => {
    initCategoryForm(cat);
    navigateAdmin('categories', 'category_edit', cat.id);
  };

  const handleToggleCategoryActive = (catId: string) => {
    const updated = categories.map(c => 
      c.id === catId ? { ...c, isActive: !c.isActive, updatedAt: new Date().toISOString() } : c
    );
    onUpdateCategories(updated);
    showToast('Status kategori berhasil diperbarui');
  };

  const handleAutoGenerateCategoryPhoto = () => {
    if (!cName.trim()) {
      alert('Ketik nama kategori terlebih dahulu agar sistem dapat mencocokkan foto yang sesuai.');
      return;
    }
    setCImage(getCategoryPhotoAuto(cName));
  };

  const handleSaveCategoryForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cName.trim()) return;

    const generatedSlug = cSlug.trim() 
      ? cSlug.trim().toLowerCase().replace(/\s+/g, '-')
      : cName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');

    const finalImage = cImage.trim() || getCategoryPhotoAuto(cName);

    if (formView === 'category_edit' && activeEditingCategoryId) {
      const updated = categories.map(c => {
        if (c.id === activeEditingCategoryId) {
          return {
            ...c,
            name: cName.trim(),
            slug: generatedSlug,
            description: cDescription.trim(),
            imageUrl: finalImage,
            orderIndex: Number(cOrderIndex),
            isActive: cIsActive,
            updatedAt: new Date().toISOString()
          };
        }
        return c;
      });
      onUpdateCategories(updated);
      showToast(`Kategori "${cName}" berhasil diperbarui`);
    } else {
      const newCat: Category = {
        id: `cat_${Date.now()}`,
        name: cName.trim(),
        slug: generatedSlug,
        description: cDescription.trim(),
        imageUrl: finalImage,
        icon: 'Package',
        orderIndex: Number(cOrderIndex),
        isActive: cIsActive,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      onUpdateCategories([...categories, newCat]);
      showToast(`Kategori "${cName}" berhasil dibuat`);
    }

    navigateAdmin('categories', 'list');
  };

  const handleRequestDeleteCategory = (cat: Category) => {
    const assignedProducts = products.filter(p => p.categoryId === cat.id);
    if (assignedProducts.length > 0) {
      setDeletingCategory(cat);
      const otherCat = categories.find(c => c.id !== cat.id);
      setReassignTargetCatId(otherCat ? otherCat.id : '');
    } else {
      if (confirm(`Yakin ingin menghapus kategori "${cat.name}"?`)) {
        onUpdateCategories(categories.filter(c => c.id !== cat.id));
        showToast(`Kategori "${cat.name}" telah dihapus`, 'info');
      }
    }
  };

  const handleConfirmReassignAndDeleteCategory = () => {
    if (!deletingCategory) return;
    if (!reassignTargetCatId) {
      alert('Pilih kategori tujuan pemindahan produk terlebih dahulu.');
      return;
    }

    const updatedProducts = products.map(p => {
      if (p.categoryId === deletingCategory.id) {
        return { ...p, categoryId: reassignTargetCatId, updatedAt: new Date().toISOString() };
      }
      return p;
    });
    onUpdateProducts(updatedProducts);

    const updatedCategories = categories.filter(c => c.id !== deletingCategory.id);
    onUpdateCategories(updatedCategories);

    showToast(`Produk dialihkan dan kategori "${deletingCategory.name}" berhasil dihapus.`);
    setDeletingCategory(null);
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
        return { ...o, orderStatus: newStatus, updatedAt: new Date().toISOString() };
      }
      return o;
    });
    onUpdateOrders(updated);
    showToast(`Status pesanan diperbarui menjadi ${newStatus}`);
  };

  const handleUpdatePaymentStatus = (orderId: string, newStatus: Order['paymentStatus']) => {
    const updated = orders.map(o => {
      if (o.id === orderId) {
        return { 
          ...o, 
          paymentStatus: newStatus, 
          paidAt: newStatus === 'PAID' ? (o.paidAt || new Date().toISOString()) : undefined,
          updatedAt: new Date().toISOString() 
        };
      }
      return o;
    });
    onUpdateOrders(updated);
    showToast(`Status pembayaran diperbarui menjadi ${newStatus}`);
  };

  const handleBulkUpdateOrderStatus = (status: Order['orderStatus']) => {
    if (selectedOrderIds.length === 0) return;
    const updated = orders.map(o => 
      selectedOrderIds.includes(o.id) ? { ...o, orderStatus: status, updatedAt: new Date().toISOString() } : o
    );
    onUpdateOrders(updated);
    setSelectedOrderIds([]);
    showToast(`${selectedOrderIds.length} pesanan diubah ke status ${status}`);
  };

  // --------------------------------------------------------------------------
  // AFFILIATE ACTION HANDLERS
  // --------------------------------------------------------------------------
  const handleUpdateAffiliateStatus = (appId: string, status: 'APPROVED' | 'PENDING') => {
    if (!onUpdateAffiliates) return;
    const updated = affiliates.map(a => a.id === appId ? { ...a, status } : a);
    onUpdateAffiliates(updated);
    showToast(`Status pendaftaran affiliate diperbarui menjadi ${status}`);
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Kategori Produk <span className="text-rose-500">*</span></label>
                    <select
                      value={pCategory}
                      onChange={(e) => setPCategory(e.target.value)}
                      className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:border-[#FE8A00]"
                    >
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
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
    return (
      <div className="min-h-screen bg-slate-100/70 text-slate-900 font-sans pb-16">
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigateAdmin('categories', 'list')}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">Kategori Katalog</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                <h1 className="text-sm sm:text-base font-bold text-slate-900">
                  {formView === 'category_edit' ? 'Edit Kategori Visual' : 'Tambah Kategori Baru'}
                </h1>
              </div>
              <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                {formView === 'category_edit' ? `ID: ${activeEditingCategoryId} • slug: ${cSlug}` : 'Kelola kartu visual dan foto kategori belanja'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigateAdmin('categories', 'list')}
              className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
            >
              Batal
            </button>
            <button
              type="submit"
              form="category-form"
              className="px-4 py-1.5 bg-[#FE8A00] hover:bg-[#e07b00] text-white text-xs font-bold rounded-lg transition-colors shadow-xs flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>Simpan Kategori</span>
            </button>
          </div>
        </header>

        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
          <form id="category-form" onSubmit={handleSaveCategoryForm} className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Nama Kategori <span className="text-rose-500">*</span></label>
              <input
                type="text"
                required
                value={cName}
                onChange={(e) => setCName(e.target.value)}
                placeholder="Contoh: Sayuran & Buah Segar"
                className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:border-[#FE8A00]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Slug URL</label>
                <input
                  type="text"
                  value={cSlug}
                  onChange={(e) => setCSlug(e.target.value)}
                  placeholder="otomatis dari nama jika kosong"
                  className="w-full px-3 py-2 text-xs sm:text-sm font-mono border border-slate-200 rounded-lg focus:outline-hidden focus:border-[#FE8A00]"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Urutan Tampilan</label>
                <input
                  type="number"
                  value={cOrderIndex}
                  onChange={(e) => setCOrderIndex(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:border-[#FE8A00]"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700 block">URL Foto Sampul Kategori <span className="text-rose-500">*</span></label>
                <button
                  type="button"
                  onClick={handleAutoGenerateCategoryPhoto}
                  className="text-[11px] font-bold text-[#FE8A00] hover:underline flex items-center gap-1"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Cocokkan Otomatis</span>
                </button>
              </div>
              <input
                type="url"
                required
                value={cImage}
                onChange={(e) => setCImage(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:border-[#FE8A00]"
              />

              {cImage && (
                <div className="mt-3 relative aspect-16/9 rounded-lg overflow-hidden border border-slate-200 max-h-48 bg-slate-100">
                  <img
                    src={cImage}
                    alt="Pratinjau Kategori"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const target = e.currentTarget;
                      target.onerror = null;
                      target.src = 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&auto=format&fit=crop&q=80';
                    }}
                  />
                  <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/60 text-white text-[10px]">
                    Pratinjau Kartu Visual
                  </span>
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Deskripsi Kategori</label>
              <textarea
                rows={3}
                value={cDescription}
                onChange={(e) => setCDescription(e.target.value)}
                placeholder="Rangkuman ragam produk lokal dalam kategori ini..."
                className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:border-[#FE8A00]"
              />
            </div>

            <div className="pt-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-800">
                <input
                  type="checkbox"
                  checked={cIsActive}
                  onChange={(e) => setCIsActive(e.target.checked)}
                  className="w-4 h-4 text-[#FE8A00] rounded focus:ring-[#FE8A00]"
                />
                <span>Kategori Aktif & Ditampilkan di Halaman Depan</span>
              </label>
            </div>
          </form>
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
            </div>
            <p className="text-[10px] text-slate-400 font-medium hidden sm:block">
              Sistem Manajemen Operasional Marketplace UMKM Tumpang
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={onBackToCustomer}
            className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors flex items-center gap-1.5"
            title="Keluar dari Seller Centre ke tampilan pembeli"
          >
            <Store className="w-3.5 h-3.5 text-[#FE8A00]" />
            <span className="hidden sm:inline">Lihat Toko Publik</span>
          </button>
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
                <p className="text-xs text-slate-500">Pantau performa penjualan, pesanan masuk, dan kesehatan inventaris UMKM</p>
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
                  <p className="text-xs text-slate-500">Kelola informasi, harga, stok, dan galeri foto produk UMKM</p>
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
                        <th className="py-3 px-3">Stok</th>
                        <th className="py-3 px-3">Foto</th>
                        <th className="py-3 px-3">Status</th>
                        <th className="py-3 px-3 text-right">Tindakan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedProducts.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-12 text-center text-slate-400">
                            Tidak ada produk yang cocok dengan pencarian atau filter.
                          </td>
                        </tr>
                      ) : (
                        paginatedProducts.map(prod => {
                          const isSelected = selectedProductIds.includes(prod.id);
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
                              <td className="py-3 px-3 text-slate-600 font-medium">
                                {categoryMap.get(prod.categoryId) || 'Umum'}
                              </td>
                              <td className="py-3 px-3 font-bold text-slate-900">
                                Rp {prod.price.toLocaleString('id-ID')}
                                <span className="text-[10px] text-slate-400 font-normal"> / {prod.unit}</span>
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
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                  <h1 className="text-lg font-bold text-slate-900">Kategori Produk</h1>
                  <p className="text-xs text-slate-500">Atur kartu visual etalase, foto sampul, dan hierarki kategori toko</p>
                </div>
                <button
                  onClick={handleOpenCreateCategory}
                  className="px-4 py-2 bg-[#FE8A00] hover:bg-[#e07b00] text-white text-xs font-bold rounded-lg transition-colors shadow-xs flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah Kategori</span>
                </button>
              </div>

              {/* Category Safe Deletion Conflict Modal */}
              {deletingCategory && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3 text-xs">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-bold text-amber-900">Konflik Penghapusan Kategori: "{deletingCategory.name}"</h4>
                      <p className="text-amber-800 text-[11px] mt-0.5">
                        Kategori ini memiliki {products.filter(p => p.categoryId === deletingCategory.id).length} produk aktif. Silakan pilih kategori tujuan untuk memindahkan produk sebelum dihapus:
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={reassignTargetCatId}
                      onChange={(e) => setReassignTargetCatId(e.target.value)}
                      className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                    >
                      {categories.filter(c => c.id !== deletingCategory.id).map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={handleConfirmReassignAndDeleteCategory}
                      className="px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white rounded-lg font-bold"
                    >
                      Pindahkan & Hapus
                    </button>
                    <button
                      onClick={() => setDeletingCategory(null)}
                      className="px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-white"
                    >
                      Batal
                    </button>
                  </div>
                </div>
              )}

              {/* Categories Table View */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/80 text-slate-600 uppercase border-b border-slate-200 font-semibold tracking-wider text-[11px]">
                    <tr>
                      <th className="py-3 px-3 w-16">Urutan</th>
                      <th className="py-3 px-3">Foto Sampul</th>
                      <th className="py-3 px-3">Nama Kategori</th>
                      <th className="py-3 px-3">Slug URL</th>
                      <th className="py-3 px-3">Jumlah Produk</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-3 text-right">Tindakan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[...categories]
                      .sort((a, b) => a.orderIndex - b.orderIndex)
                      .map(cat => {
                        const count = products.filter(p => p.categoryId === cat.id).length;
                        return (
                          <tr key={cat.id} className="hover:bg-slate-50/60 transition-colors">
                            <td className="py-3 px-3 font-bold text-slate-700">#{cat.orderIndex}</td>
                            <td className="py-3 px-3">
                              <img
                                src={cat.imageUrl || getCategoryPhotoAuto(cat.name)}
                                alt={cat.name}
                                referrerPolicy="no-referrer"
                                className="w-12 h-9 rounded-md object-cover border border-slate-200 bg-slate-50"
                              />
                            </td>
                            <td className="py-3 px-3">
                              <div className="font-bold text-slate-900">{cat.name}</div>
                              {cat.description && (
                                <div className="text-[11px] text-slate-400 line-clamp-1">{cat.description}</div>
                              )}
                            </td>
                            <td className="py-3 px-3 font-mono text-[11px] text-slate-500">{cat.slug}</td>
                            <td className="py-3 px-3 font-bold text-slate-700">{count} produk</td>
                            <td className="py-3 px-3">
                              <button
                                onClick={() => handleToggleCategoryActive(cat.id)}
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  cat.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {cat.isActive ? 'Aktif' : 'Nonaktif'}
                              </button>
                            </td>
                            <td className="py-3 px-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => handleOpenEditCategory(cat)}
                                  className="p-1 rounded text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                                  title="Edit Kategori"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleRequestDeleteCategory(cat)}
                                  className="p-1 rounded text-rose-600 hover:text-rose-800 hover:bg-rose-50"
                                  title="Hapus Kategori"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
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
                      <option value="NEW">Baru</option>
                      <option value="PROCESSING">Diproses</option>
                      <option value="PACKED">Dikemas</option>
                      <option value="SHIPPED">Dikirim</option>
                      <option value="COMPLETED">Selesai (Completed)</option>
                      <option value="CANCELLED">Dibatalkan</option>
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
                      <option value="PENDING">Pending</option>
                      <option value="WAITING_VERIFICATION">Verifikasi Gateway</option>
                      <option value="EXPIRED">Kedaluwarsa</option>
                    </select>
                  </div>
                </div>

                {/* Bulk status update bar */}
                {selectedOrderIds.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs bg-orange-50/50 p-2 rounded-lg">
                    <span className="font-semibold text-slate-700">{selectedOrderIds.length} pesanan terpilih</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleBulkUpdateOrderStatus('PACKED')}
                        className="px-2 py-1 bg-white border border-slate-200 rounded font-medium"
                      >
                        Set: Dikemas
                      </button>
                      <button
                        onClick={() => handleBulkUpdateOrderStatus('SHIPPED')}
                        className="px-2 py-1 bg-white border border-slate-200 rounded font-medium"
                      >
                        Set: Dikirim
                      </button>
                      <button
                        onClick={() => handleBulkUpdateOrderStatus('COMPLETED')}
                        className="px-2 py-1 bg-emerald-700 text-white rounded font-medium"
                      >
                        Set: Selesai
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Order Detail Modal / Panel */}
              {activeDetailOrder && (
                <div className="bg-white border-2 border-[#FE8A00] rounded-xl p-5 shadow-sm space-y-4 animate-in fade-in">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <span className="text-xs font-bold text-[#FE8A00] uppercase tracking-wider">Rincian Lengkap Pesanan</span>
                      <h3 className="text-base font-extrabold text-slate-900">{activeDetailOrder.orderNumber}</h3>
                    </div>
                    <button
                      onClick={() => setActiveDetailOrder(null)}
                      className="p-1 rounded-md hover:bg-slate-100 text-slate-500"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                    <div>
                      <div className="text-[11px] text-slate-400 uppercase font-bold">Pelanggan</div>
                      <div className="font-bold text-slate-800 mt-0.5">{activeDetailOrder.customerName}</div>
                      <div className="text-slate-500">{activeDetailOrder.customerPhone}</div>
                      {activeDetailOrder.customerEmail && <div className="text-slate-500">{activeDetailOrder.customerEmail}</div>}
                    </div>

                    <div>
                      <div className="text-[11px] text-slate-400 uppercase font-bold">Alamat Kirim</div>
                      <div className="text-slate-800 mt-0.5 font-medium">{activeDetailOrder.deliveryAddress}</div>
                      <div className="text-slate-500 text-[11px]">Kecamatan: {activeDetailOrder.customerDistrict}</div>
                      {activeDetailOrder.deliveryNotes && (
                        <div className="text-amber-800 text-[11px] italic mt-0.5">Catatan: {activeDetailOrder.deliveryNotes}</div>
                      )}
                    </div>

                    <div>
                      <div className="text-[11px] text-slate-400 uppercase font-bold">Metode & Waktu</div>
                      <div className="text-slate-800 mt-0.5 font-medium">Pengiriman: {activeDetailOrder.shippingMethod}</div>
                      <div className="text-slate-500 text-[11px]">Dibuat: {new Date(activeDetailOrder.createdAt).toLocaleString('id-ID')}</div>
                    </div>
                  </div>

                  {/* Items list */}
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                        <tr>
                          <th className="py-2 px-3">Item Produk</th>
                          <th className="py-2 px-3">SKU</th>
                          <th className="py-2 px-3">Harga</th>
                          <th className="py-2 px-3">Qty</th>
                          <th className="py-2 px-3 text-right">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {activeDetailOrder.items.map((item, idx) => (
                          <tr key={idx}>
                            <td className="py-2 px-3">
                              <span className="font-semibold text-slate-900">{item.name}</span>
                              {item.variationInfo && (
                                <span className="text-[11px] text-slate-400 block font-normal">{item.variationInfo}</span>
                              )}
                            </td>
                            <td className="py-2 px-3 font-mono text-[11px] text-slate-500">{item.sku}</td>
                            <td className="py-2 px-3">Rp {item.price.toLocaleString('id-ID')}</td>
                            <td className="py-2 px-3 font-bold">{item.quantity} {item.unit}</td>
                            <td className="py-2 px-3 text-right font-bold text-slate-900">
                              Rp {item.subtotal.toLocaleString('id-ID')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex justify-end text-xs">
                    <div className="w-64 space-y-1">
                      <div className="flex justify-between text-slate-500">
                        <span>Subtotal Produk:</span>
                        <span>Rp {activeDetailOrder.subtotal.toLocaleString('id-ID')}</span>
                      </div>
                      <div className="flex justify-between text-slate-500">
                        <span>Ongkos Kirim:</span>
                        <span>Rp {activeDetailOrder.shippingCost.toLocaleString('id-ID')}</span>
                      </div>
                      <div className="flex justify-between text-slate-500">
                        <span>Biaya Layanan:</span>
                        <span>Rp {activeDetailOrder.serviceFee.toLocaleString('id-ID')}</span>
                      </div>
                      <div className="flex justify-between font-extrabold text-sm text-slate-900 pt-1 border-t border-slate-200">
                        <span>Total Pembayaran:</span>
                        <span className="text-emerald-700">Rp {activeDetailOrder.total.toLocaleString('id-ID')}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

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
                            <td className="py-3 px-3 font-bold text-slate-900">{o.orderNumber}</td>
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
                                  o.orderStatus === 'COMPLETED' ? 'bg-emerald-50 text-emerald-800 border-emerald-300' :
                                  o.orderStatus === 'CANCELLED' ? 'bg-slate-100 text-slate-600 border-slate-300' :
                                  'bg-amber-50 text-amber-900 border-amber-300'
                                }`}
                              >
                                <option value="NEW">Baru</option>
                                <option value="PROCESSING">Diproses</option>
                                <option value="PACKED">Dikemas</option>
                                <option value="SHIPPED">Dikirim</option>
                                <option value="COMPLETED">Selesai (Completed)</option>
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
                                onClick={() => setActiveDetailOrder(o)}
                                className="px-2 py-1 text-[11px] font-bold text-[#FE8A00] hover:bg-orange-50 rounded transition-colors"
                              >
                                Rincian
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
                      <th className="py-3 px-3 text-right">Pesanan Terakhir</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredCustomers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-400">
                          Belum ada data pelanggan yang tercatat dari pesanan.
                        </td>
                      </tr>
                    ) : (
                      filteredCustomers.map((cust, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/60">
                          <td className="py-3 px-3 font-bold text-slate-900">{cust.name}</td>
                          <td className="py-3 px-3 font-mono text-[11px] text-slate-600">{cust.phone}</td>
                          <td className="py-3 px-3 text-slate-600">{cust.district}</td>
                          <td className="py-3 px-3 font-semibold text-slate-800">{cust.orderCount} kali</td>
                          <td className="py-3 px-3 font-extrabold text-emerald-700">
                            Rp {cust.totalSpend.toLocaleString('id-ID')}
                          </td>
                          <td className="py-3 px-3 text-right text-slate-500 text-[11px]">
                            {new Date(cust.lastOrderDate).toLocaleDateString('id-ID')}
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
          {/* 7. PROGRAM AFFILIATE                                              */}
          {/* ================================================================ */}
          {activeTab === 'affiliates' && (
            <div className="space-y-4 max-w-7xl mx-auto">
              <div>
                <h1 className="text-lg font-bold text-slate-900">Program Affiliate Tumpang Shop</h1>
                <p className="text-xs text-slate-500">Kelola permohonan pendaftaran mitra affiliate dan kode referral promotor</p>
              </div>

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
                        <tr key={app.id} className="hover:bg-slate-50/60">
                          <td className="py-3 px-3 font-bold text-slate-900">{app.fullName}</td>
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
                            {app.status !== 'APPROVED' ? (
                              <button
                                onClick={() => handleUpdateAffiliateStatus(app.id, 'APPROVED')}
                                className="px-2 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-[11px] font-semibold"
                              >
                                Setujui
                              </button>
                            ) : (
                              <button
                                onClick={() => handleUpdateAffiliateStatus(app.id, 'PENDING')}
                                className="px-2 py-1 text-slate-600 hover:bg-slate-100 rounded text-[11px]"
                              >
                                Tinjau Ulang
                              </button>
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Tarif Antar Standar (Rp)</label>
                    <input
                      type="number"
                      value={storeConfig.defaultDeliveryFee}
                      onChange={(e) => onUpdateConfig({ ...storeConfig, defaultDeliveryFee: Number(e.target.value) })}
                      className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:border-[#FE8A00]"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Biaya Layanan Aplikasi (Rp)</label>
                    <input
                      type="number"
                      value={storeConfig.serviceFee}
                      onChange={(e) => onUpdateConfig({ ...storeConfig, serviceFee: Number(e.target.value) })}
                      className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:border-[#FE8A00]"
                    />
                  </div>
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
