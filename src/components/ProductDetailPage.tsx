import React, { useState, useMemo } from 'react';
import { 
  Product, Category, ProductVariationOption, 
  StoreConfig, UserProfile, Order, ProductReview 
} from '../types';
import { getProductSlug } from '../data/mockData';
import { 
  ArrowLeft, Star, ShoppingBag, Plus, Minus, ShieldCheck, 
  Truck, Store, CheckCircle2, AlertCircle, Share2, Eye, 
  Maximize2, X, ChevronRight, ChevronLeft, MessageSquare, ThumbsUp, 
  Calendar, Award, Tag, Sparkles
} from 'lucide-react';

interface ProductDetailPageProps {
  product: Product;
  categories: Category[];
  allProducts: Product[];
  storeConfig: StoreConfig;
  currentUser: UserProfile | null;
  orders: Order[];
  reviews: ProductReview[];
  onBack: () => void;
  onSelectProduct: (product: Product) => void;
  onAddToCart: (product: Product, option?: ProductVariationOption, variationName?: string, quantity?: number) => void;
  onBuyNow: (product: Product, option?: ProductVariationOption, variationName?: string, quantity?: number) => void;
  onSubmitReview: (review: ProductReview) => void;
}

export default function ProductDetailPage({
  product,
  categories,
  allProducts,
  storeConfig,
  currentUser,
  orders,
  reviews,
  onBack,
  onSelectProduct,
  onAddToCart,
  onBuyNow,
  onSubmitReview
}: ProductDetailPageProps) {
  // Gallery state
  const images = product.images && product.images.length > 0 
    ? product.images 
    : ['https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&auto=format&fit=crop&q=80'];
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const handlePrevImage = () => {
    setActiveImageIndex(prev => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const handleNextImage = () => {
    setActiveImageIndex(prev => (prev === images.length - 1 ? 0 : prev + 1));
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX - touchEndX;
    // Swipe left (next) or right (prev) with a threshold of 40px
    if (diff > 40) {
      handleNextImage();
    } else if (diff < -40) {
      handlePrevImage();
    }
    setTouchStartX(null);
  };

  // Variation state
  const hasVariations = product.variations && product.variations.length > 0;
  const variationName = hasVariations ? product.variations![0].name : undefined;
  const [selectedOption, setSelectedOption] = useState<ProductVariationOption | undefined>(() => {
    return hasVariations ? product.variations![0].options[0] : undefined;
  });

  // Calculate dynamic price, stock, sku
  const currentPrice = product.price + (selectedOption?.priceDelta || 0);
  const currentStock = selectedOption ? selectedOption.stock : product.stock;
  const currentSku = selectedOption?.sku || product.sku;
  const isOutOfStock = currentStock <= 0;

  // Quantity control
  const [quantity, setQuantity] = useState(1);

  // Reviews filtering & form state
  const [reviewSort, setReviewSort] = useState<'newest' | 'highest'>('newest');
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [newRating, setNewRating] = useState(5);
  const [newComment, setNewComment] = useState('');
  const [reviewError, setReviewError] = useState<string | null>(null);

  // Product reviews
  const productReviews = useMemo(() => {
    const list = reviews.filter(r => r.productId === product.id);
    if (reviewSort === 'highest') {
      return [...list].sort((a, b) => b.rating - a.rating);
    }
    return [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [reviews, product.id, reviewSort]);

  // Real review metrics (calculated strictly from genuine recorded reviews)
  const reviewStats = useMemo(() => {
    const count = productReviews.length;
    if (count === 0) return { count: 0, average: 0, distribution: [0, 0, 0, 0, 0] };
    const sum = productReviews.reduce((acc, r) => acc + r.rating, 0);
    const average = Math.round((sum / count) * 10) / 10;
    const dist = [0, 0, 0, 0, 0];
    productReviews.forEach(r => {
      const idx = Math.min(5, Math.max(1, r.rating)) - 1;
      dist[idx] += 1;
    });
    return { count, average, distribution: dist };
  }, [productReviews]);

  // Check if current user has a COMPLETED order containing this product
  const reviewEligibility = useMemo(() => {
    if (!currentUser) {
      return { eligible: false, reason: 'Silakan masuk ke akun Anda terlebih dahulu untuk menulis ulasan.' };
    }
    const completedOrders = orders.filter(o => 
      o.orderStatus === 'COMPLETED' && 
      (o.customerEmail === currentUser.email || o.customerName.toLowerCase() === currentUser.fullName.toLowerCase())
    );
    const matchingOrder = completedOrders.find(o => 
      o.items.some(i => i.productId === product.id)
    );
    if (!matchingOrder) {
      return { 
        eligible: false, 
        reason: 'Hanya pembeli dengan pesanan berstatus Selesai (Completed) untuk produk ini yang dapat memberikan ulasan terverifikasi.' 
      };
    }
    // Check if user already reviewed this order
    const alreadyReviewed = productReviews.some(r => r.userId === currentUser.id && r.orderId === matchingOrder.id);
    if (alreadyReviewed) {
      return { eligible: false, reason: 'Anda sudah mengirimkan ulasan untuk pesanan produk ini.' };
    }
    return { eligible: true, orderId: matchingOrder.id };
  }, [currentUser, orders, product.id, productReviews]);

  // Related products (same category, excluding current product)
  const relatedProducts = useMemo(() => {
    return allProducts
      .filter(p => p.id !== product.id && p.categoryId === product.categoryId && p.isActive)
      .slice(0, 4);
  }, [allProducts, product.id, product.categoryId]);

  const categoryName = categories.find(c => c.id === product.categoryId)?.name || 'Katalog';

  const handleQuantityChange = (val: number) => {
    if (val < 1) return;
    if (val > currentStock) {
      setQuantity(currentStock);
      return;
    }
    setQuantity(val);
  };

  const handleAddToCartClick = () => {
    if (isOutOfStock) return;
    onAddToCart(product, selectedOption, variationName, quantity);
  };

  const handleBuyNowClick = () => {
    if (isOutOfStock) return;
    onBuyNow(product, selectedOption, variationName, quantity);
  };

  const handleSubmitReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) {
      setReviewError('Mohon tuliskan komentar ulasan Anda.');
      return;
    }
    if (!currentUser || !reviewEligibility.eligible) {
      setReviewError('Anda belum memenuhi syarat untuk menulis ulasan produk ini.');
      return;
    }

    const review: ProductReview = {
      id: `rev_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      productId: product.id,
      userId: currentUser.id,
      userName: currentUser.fullName,
      userEmail: currentUser.email,
      orderId: reviewEligibility.orderId,
      isVerifiedPurchase: true,
      rating: newRating,
      comment: newComment.trim(),
      createdAt: new Date().toISOString()
    };

    onSubmitReview(review);
    setNewComment('');
    setReviewError(null);
    setShowReviewForm(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Top Breadcrumbs & Back Bar */}
      <div className="bg-white border-b border-slate-200/80 sticky top-16 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-slate-500 overflow-x-auto whitespace-nowrap scrollbar-none">
            <button 
              onClick={onBack}
              className="flex items-center gap-1.5 font-bold text-emerald-800 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1.5 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Kembali</span>
            </button>
            <span className="text-slate-300">/</span>
            <button onClick={onBack} className="hover:text-emerald-700 transition-colors">
              Beranda
            </button>
            <ChevronRight className="w-3 h-3 text-slate-400" />
            <span className="text-slate-700 font-medium">{categoryName}</span>
            <ChevronRight className="w-3 h-3 text-slate-400" />
            <span className="text-slate-900 font-semibold truncate max-w-[200px] sm:max-w-xs">
              {product.name}
            </span>
          </div>

          <div className="text-[11px] font-mono text-slate-400 hidden sm:block">
            SKU: {currentSku}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-10">
        {/* Main Product Showcase: Left Gallery, Right Details */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          
          {/* ================================================================= */}
          {/* LEFT COLUMN: PHOTO GALLERY (Sticky on desktop)                    */}
          {/* ================================================================= */}
          <div className="lg:col-span-6 space-y-4 lg:sticky lg:top-32 select-none">
            {/* Main Large Photo */}
            <div 
              className="relative aspect-square w-full rounded-3xl overflow-hidden bg-white shadow-xs border border-slate-200 group touch-pan-y"
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              <img
                src={images[activeImageIndex]}
                alt={`${product.name} foto ${activeImageIndex + 1}`}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                onError={(e) => {
                  const target = e.currentTarget;
                  target.onerror = null;
                  target.src = 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&auto=format&fit=crop&q=80';
                }}
              />

              {/* Badges Overlay */}
              <div className="absolute top-4 left-4 flex flex-col gap-2 z-10 pointer-events-none">
                {product.isFeatured && (
                  <span className="px-2.5 py-1 rounded-lg bg-amber-500 text-slate-900 text-xs font-bold uppercase tracking-wider shadow-md">
                    Produk Unggulan
                  </span>
                )}
                {product.originalPrice && product.originalPrice > product.price && (
                  <span className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-xs font-bold uppercase tracking-wider shadow-md">
                    Hemat {Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)}%
                  </span>
                )}
              </div>

              {/* Photo Counter Badge (e.g. 1/5) */}
              <div className="absolute top-4 right-4 z-10">
                <span className="px-3 py-1 rounded-full bg-slate-900/70 text-white text-xs font-bold tracking-wider backdrop-blur-md shadow-md border border-white/10">
                  {activeImageIndex + 1} / {images.length}
                </span>
              </div>

              {/* Prev / Next Navigation Arrows (when > 1 images) */}
              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePrevImage();
                    }}
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/85 hover:bg-white text-slate-800 hover:text-slate-950 shadow-md backdrop-blur-xs flex items-center justify-center transition-all opacity-80 group-hover:opacity-100 hover:scale-110 z-10"
                    aria-label="Foto Sebelumnya"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleNextImage();
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/85 hover:bg-white text-slate-800 hover:text-slate-950 shadow-md backdrop-blur-xs flex items-center justify-center transition-all opacity-80 group-hover:opacity-100 hover:scale-110 z-10"
                    aria-label="Foto Berikutnya"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}

              {/* Lightbox / Zoom Button */}
              <button
                type="button"
                onClick={() => setIsLightboxOpen(true)}
                className="absolute bottom-4 right-4 p-2.5 rounded-full bg-white/90 hover:bg-white text-slate-700 shadow-md backdrop-blur-xs transition-colors flex items-center justify-center z-10"
                title="Perbesar Foto Layar Penuh"
              >
                <Maximize2 className="w-4 h-4" />
              </button>

              {/* Out of Stock Overlay */}
              {isOutOfStock && (
                <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-2xs flex items-center justify-center z-20">
                  <span className="px-4 py-2 bg-rose-600 text-white text-sm font-bold rounded-2xl shadow-lg">
                    Stok Varian Ini Habis
                  </span>
                </div>
              )}
            </div>

            {/* Thumbnail Strip (clickable, indicators, mobile swipe friendly) */}
            {images.length > 1 && (
              <div className="space-y-1.5">
                <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-none snap-x touch-pan-x">
                  {images.map((img, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setActiveImageIndex(idx)}
                      className={`relative w-18 h-18 sm:w-20 sm:h-20 rounded-2xl overflow-hidden border-2 shrink-0 transition-all snap-start ${
                        activeImageIndex === idx 
                          ? 'border-emerald-600 ring-2 ring-emerald-600/30 shadow-md scale-102' 
                          : 'border-slate-200/80 hover:border-slate-300 opacity-70 hover:opacity-100'
                      }`}
                    >
                      <img 
                        src={img} 
                        alt="" 
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover" 
                        onError={(e) => {
                          const target = e.currentTarget;
                          target.onerror = null;
                          target.src = 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=300&auto=format&fit=crop&q=80';
                        }}
                      />
                      {activeImageIndex === idx && (
                        <div className="absolute inset-0 bg-emerald-600/10 pointer-events-none" />
                      )}
                      <span className="absolute bottom-1 right-1 text-[9px] font-bold bg-black/60 text-white px-1.5 py-0.2 rounded-md">
                        {idx + 1}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 text-center sm:hidden">
                  Ketuk foto atau geser layar ponsel untuk berpindah gambar
                </p>
              </div>
            )}

            {/* Local Guarantee Cards */}
            <div className="grid grid-cols-2 gap-3 pt-2 text-xs text-slate-600">
              <div className="p-3 bg-white rounded-2xl border border-slate-200/80 flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <strong className="block text-slate-900 font-bold">100% Produk Asli</strong>
                  <span className="text-[11px] text-slate-500">Hasil bumi Tumpang asli</span>
                </div>
              </div>
              <div className="p-3 bg-white rounded-2xl border border-slate-200/80 flex items-center gap-2.5">
                <Truck className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <strong className="block text-slate-900 font-bold">Pengantaran Cepat</strong>
                  <span className="text-[11px] text-slate-500">Wilayah Malang & sekitar</span>
                </div>
              </div>
            </div>
          </div>

          {/* ================================================================= */}
          {/* RIGHT COLUMN: PRODUCT INFO & VARIANT PURCHASING                   */}
          {/* ================================================================= */}
          <div className="lg:col-span-6 space-y-6">
            
            {/* Title & Category */}
            <div>
              <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 mb-2">
                {categoryName}
              </span>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-snug">
                {product.name}
              </h1>

              {/* Real Metrics Header */}
              <div className="mt-3 flex items-center gap-4 text-xs text-slate-600 flex-wrap">
                {reviewStats.count > 0 ? (
                  <div className="flex items-center gap-1.5 font-bold text-amber-600">
                    <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                    <span>{reviewStats.average}</span>
                    <span className="text-slate-400 font-normal">({reviewStats.count} ulasan terverifikasi)</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <Star className="w-4 h-4 text-slate-300" />
                    <span>Belum ada ulasan</span>
                  </div>
                )}
                <span className="text-slate-300">•</span>
                <div className="text-slate-500">
                  Unit: <strong className="text-slate-700">{product.unit}</strong>
                </div>
                {product.viewCount !== undefined && product.viewCount > 0 && (
                  <>
                    <span className="text-slate-300">•</span>
                    <div className="text-blue-600 font-medium">
                      {product.viewCount} dilihat
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Price Box */}
            <div className="p-5 bg-emerald-50/60 rounded-3xl border border-emerald-200/60">
              <div className="text-xs text-emerald-800 font-semibold mb-1">Harga Resmi Marketplace</div>
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className="text-3xl sm:text-4xl font-black text-emerald-800 tracking-tight">
                  Rp {currentPrice.toLocaleString('id-ID')}
                </span>
                {product.originalPrice && product.originalPrice > currentPrice && (
                  <span className="text-sm sm:text-base text-slate-400 line-through">
                    Rp {product.originalPrice.toLocaleString('id-ID')}
                  </span>
                )}
                <span className="text-xs text-slate-500 font-medium">/ {product.unit}</span>
              </div>
            </div>

            {/* Variant Selector */}
            {hasVariations && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Pilihan {variationName}:
                  </label>
                  <span className="text-xs text-emerald-700 font-semibold">
                    {selectedOption?.name}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2.5">
                  {product.variations![0].options.map((opt) => {
                    const isSelected = selectedOption?.id === opt.id;
                    const optOutOfStock = opt.stock <= 0;

                    return (
                      <button
                        key={opt.id}
                        onClick={() => {
                          setSelectedOption(opt);
                          if (quantity > opt.stock) setQuantity(Math.max(1, opt.stock));
                        }}
                        disabled={optOutOfStock}
                        className={`px-4 py-2.5 rounded-2xl text-xs font-semibold border transition-all flex items-center gap-2 ${
                          isSelected
                            ? 'border-emerald-700 bg-emerald-700 text-white shadow-md shadow-emerald-700/20'
                            : optOutOfStock
                            ? 'border-dashed border-slate-200 text-slate-300 bg-slate-50 cursor-not-allowed'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <span>{opt.name}</span>
                        {opt.priceDelta !== 0 && (
                          <span className={`text-[10px] ${isSelected ? 'text-emerald-100' : 'text-slate-500'}`}>
                            ({opt.priceDelta > 0 ? `+Rp ${opt.priceDelta.toLocaleString('id-ID')}` : `-Rp ${Math.abs(opt.priceDelta).toLocaleString('id-ID')}`})
                          </span>
                        )}
                        {optOutOfStock && (
                          <span className="text-[10px] text-rose-500 font-bold">(Habis)</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quantity Selector & Stock Info */}
            <div className="pt-2 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Jumlah Pembelian:
                </span>
                <span className={`text-xs font-semibold ${isOutOfStock ? 'text-rose-600' : 'text-slate-600'}`}>
                  {isOutOfStock ? 'Stok Habis' : `Tersedia: ${currentStock} ${product.unit}`}
                </span>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-xs">
                  <button
                    onClick={() => handleQuantityChange(quantity - 1)}
                    disabled={isOutOfStock || quantity <= 1}
                    className="p-3 hover:bg-slate-100 text-slate-700 transition-colors disabled:opacity-30"
                    aria-label="Kurangi Jumlah"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input
                    type="number"
                    min="1"
                    max={currentStock}
                    value={isOutOfStock ? 0 : quantity}
                    onChange={(e) => handleQuantityChange(Number(e.target.value))}
                    disabled={isOutOfStock}
                    className="w-14 text-center font-bold text-sm text-slate-900 focus:outline-hidden"
                  />
                  <button
                    onClick={() => handleQuantityChange(quantity + 1)}
                    disabled={isOutOfStock || quantity >= currentStock}
                    className="p-3 hover:bg-slate-100 text-slate-700 transition-colors disabled:opacity-30"
                    aria-label="Tambah Jumlah"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                <div className="text-xs text-slate-500">
                  Subtotal: <strong className="text-emerald-800 text-sm font-black">
                    Rp {((isOutOfStock ? 0 : currentPrice) * quantity).toLocaleString('id-ID')}
                  </strong>
                </div>
              </div>
            </div>

            {/* Action Buttons: Add to Cart & Buy Now */}
            <div className="pt-4 flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleAddToCartClick}
                disabled={isOutOfStock}
                className={`flex-1 py-4 px-6 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 border transition-all ${
                  isOutOfStock
                    ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                    : 'border-orange-500 text-[#FE8A00] bg-orange-50 hover:bg-orange-100 active:scale-[0.99]'
                }`}
              >
                <ShoppingBag className="w-4 h-4" />
                <span>+ Masukkan Keranjang</span>
              </button>

              <button
                onClick={handleBuyNowClick}
                disabled={isOutOfStock}
                className={`flex-1 py-4 px-6 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
                  isOutOfStock
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    : 'bg-[#FE8A00] hover:bg-[#e07b00] text-white shadow-lg shadow-orange-500/25 active:scale-[0.99]'
                }`}
              >
                <span>Beli Sekarang</span>
              </button>
            </div>

            {/* Seller & Store Information Card */}
            <div className="p-4 bg-white rounded-3xl border border-slate-200/80 shadow-xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-black">
                  <Store className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">{storeConfig.storeName}</h4>
                  <p className="text-xs text-slate-500 line-clamp-1">{storeConfig.storeAddress}</p>
                  <span className="inline-block mt-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                    Mitra Resmi UMKM Malang
                  </span>
                </div>
              </div>

              <div className="text-right text-xs">
                <span className={`inline-block px-2.5 py-1 rounded-full font-bold text-[11px] ${
                  storeConfig.isOpen ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                }`}>
                  {storeConfig.isOpen ? 'Buka' : 'Tutup'}
                </span>
              </div>
            </div>

            {/* Product Specifications Table */}
            <div className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-xs space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                Spesifikasi & Informasi Produk
              </h3>
              <div className="divide-y divide-slate-100 text-xs">
                <div className="py-2.5 flex justify-between">
                  <span className="text-slate-500">Kategori</span>
                  <span className="font-semibold text-slate-800">{categoryName}</span>
                </div>
                <div className="py-2.5 flex justify-between">
                  <span className="text-slate-500">Kode SKU</span>
                  <span className="font-mono text-slate-800">{currentSku}</span>
                </div>
                <div className="py-2.5 flex justify-between">
                  <span className="text-slate-500">Satuan Pembelian</span>
                  <span className="font-semibold text-slate-800">{product.unit}</span>
                </div>
                <div className="py-2.5 flex justify-between">
                  <span className="text-slate-500">Lokasi Asal Produk</span>
                  <span className="font-semibold text-slate-800">Kecamatan Tumpang, Kabupaten Malang</span>
                </div>
                <div className="py-2.5 flex justify-between">
                  <span className="text-slate-500">Kondisi</span>
                  <span className="font-semibold text-emerald-700">Baru & Segar Langsung Panen/Produksi</span>
                </div>
              </div>
            </div>

            {/* Full Product Description */}
            <div className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-xs space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                Deskripsi Lengkap
              </h3>
              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                {product.description}
              </p>
            </div>
          </div>
        </div>

        {/* ================================================================= */}
        {/* REVIEWS & RATINGS SECTION                                         */}
        {/* ================================================================= */}
        <section className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-emerald-700" />
                <span>Ulasan Pembeli Terverifikasi</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Ulasan hanya dapat dikirim oleh pembeli yang telah menyelesaikan pesanan resmi
              </p>
            </div>

            <div className="flex items-center gap-2">
              {reviewEligibility.eligible && !showReviewForm && (
                <button
                  onClick={() => setShowReviewForm(true)}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
                >
                  Tulis Ulasan Produk Ini
                </button>
              )}

              {productReviews.length > 0 && (
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-700">
                  <span className="text-slate-400">Urutkan:</span>
                  <select
                    value={reviewSort}
                    onChange={(e) => setReviewSort(e.target.value as any)}
                    className="bg-transparent font-medium text-xs focus:outline-hidden"
                  >
                    <option value="newest">Ulasan Terbaru</option>
                    <option value="highest">Rating Tertinggi</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Rating Summary Bar */}
          {reviewStats.count > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center p-5 bg-slate-50/70 rounded-2xl border border-slate-100">
              <div className="md:col-span-4 text-center md:border-r md:border-slate-200 pr-4">
                <div className="text-4xl sm:text-5xl font-black text-slate-900">
                  {reviewStats.average}
                  <span className="text-lg text-slate-400 font-normal"> / 5.0</span>
                </div>
                <div className="flex justify-center gap-1 my-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star 
                      key={star} 
                      className={`w-4 h-4 ${
                        star <= Math.round(reviewStats.average) 
                          ? 'fill-amber-400 text-amber-400' 
                          : 'text-slate-300'
                      }`} 
                    />
                  ))}
                </div>
                <div className="text-xs text-slate-500">
                  Berdasarkan {reviewStats.count} ulasan pesanan selesai
                </div>
              </div>

              {/* Distribution bars */}
              <div className="md:col-span-8 space-y-1.5 text-xs text-slate-600">
                {[5, 4, 3, 2, 1].map((stars) => {
                  const count = reviewStats.distribution[stars - 1];
                  const percent = reviewStats.count > 0 ? (count / reviewStats.count) * 100 : 0;

                  return (
                    <div key={stars} className="flex items-center gap-2">
                      <span className="w-14 text-right flex items-center justify-end gap-1 font-semibold">
                        <span>{stars}</span>
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                      </span>
                      <div className="flex-1 h-2 rounded-full bg-slate-200 overflow-hidden">
                        <div 
                          className="h-full bg-amber-400 rounded-full transition-all" 
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <span className="w-8 text-slate-400 text-[11px]">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Professional Empty State when no reviews yet */
            <div className="p-8 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 text-slate-500">
              <MessageSquare className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <h4 className="text-sm font-bold text-slate-800">Belum Ada Ulasan untuk Produk Ini</h4>
              <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 leading-relaxed">
                Tumpang Shop menerapkan transparansi penuh tanpa ulasan palsu. Ulasan hanya akan ditampilkan setelah pelanggan yang telah menyelesaikan transaksi membagikan pengalamannya.
              </p>
              {!currentUser && (
                <p className="text-[11px] text-emerald-700 mt-2 font-medium">
                  Sudah pernah berbelanja produk ini? Masuk ke akun Anda untuk memberikan ulasan.
                </p>
              )}
            </div>
          )}

          {/* Review Submission Form (Only for verified buyers) */}
          {showReviewForm && (
            <form onSubmit={handleSubmitReview} className="p-5 bg-emerald-50/50 border border-emerald-200/80 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-900">
                  Kirim Ulasan Pembelian Terverifikasi
                </h4>
                <button
                  type="button"
                  onClick={() => setShowReviewForm(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {reviewError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{reviewError}</span>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Beri Penilaian Bintang:
                </label>
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setNewRating(star)}
                      className="p-1 hover:scale-110 transition-transform"
                    >
                      <Star 
                        className={`w-6 h-6 ${
                          star <= newRating 
                            ? 'fill-amber-400 text-amber-400' 
                            : 'text-slate-300'
                        }`} 
                      />
                    </button>
                  ))}
                  <span className="ml-2 text-xs font-bold text-slate-800 self-center">
                    {newRating} dari 5 Bintang
                  </span>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Pengalaman Anda Menggunakan Produk Ini:
                </label>
                <textarea
                  required
                  rows={3}
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Ceritakan kesegaran, rasa, atau kualitas kemasan produk ini..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:border-emerald-600 focus:outline-hidden bg-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowReviewForm(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-white"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
                >
                  Kirim Ulasan Sekarang
                </button>
              </div>
            </form>
          )}

          {/* Reviews List */}
          {productReviews.length > 0 && (
            <div className="divide-y divide-slate-100 pt-2 space-y-4">
              {productReviews.map((rev) => (
                <div key={rev.id} className="pt-4 first:pt-0 space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <strong className="text-xs sm:text-sm font-bold text-slate-900">
                          {rev.userName}
                        </strong>
                        {rev.isVerifiedPurchase && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Pembelian Terverifikasi</span>
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex gap-0.5">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star 
                              key={star} 
                              className={`w-3.5 h-3.5 ${
                                star <= rev.rating 
                                  ? 'fill-amber-400 text-amber-400' 
                                  : 'text-slate-300'
                              }`} 
                            />
                          ))}
                        </div>
                        <span className="text-[11px] text-slate-400">
                          {new Date(rev.createdAt).toLocaleDateString('id-ID', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </span>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                    {rev.comment}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ================================================================= */}
        {/* RELATED PRODUCTS SECTION                                          */}
        {/* ================================================================= */}
        {relatedProducts.length > 0 && (
          <section className="space-y-4 pt-4 border-t border-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg sm:text-xl font-extrabold text-slate-900">
                  Produk Terkait di Kategori {categoryName}
                </h3>
                <p className="text-xs text-slate-500">
                  Pilihan lain yang mungkin Anda butuhkan
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {relatedProducts.map((relProd) => (
                <div
                  key={relProd.id}
                  onClick={() => {
                    onSelectProduct(relProd);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="group bg-white rounded-2xl border border-slate-200/80 hover:border-emerald-500/40 shadow-xs hover:shadow-md transition-all flex flex-col overflow-hidden cursor-pointer"
                >
                  <div className="aspect-4/3 w-full bg-slate-100 overflow-hidden relative">
                    <img
                      src={relProd.images[0] || ''}
                      alt={relProd.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                  <div className="p-3.5 flex-1 flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] text-emerald-700 font-medium block mb-1">
                        {relProd.unit}
                      </span>
                      <h4 className="text-xs sm:text-sm font-semibold text-slate-800 line-clamp-2 group-hover:text-emerald-700 transition-colors">
                        {relProd.name}
                      </h4>
                    </div>
                    <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-xs sm:text-sm font-bold text-emerald-700">
                        Rp {relProd.price.toLocaleString('id-ID')}
                      </span>
                      <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg group-hover:bg-emerald-700 group-hover:text-white transition-colors">
                        Lihat
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Lightbox / Fullscreen Modal */}
      {isLightboxOpen && (
        <div 
          className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-between p-4 sm:p-6"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Header */}
          <div className="w-full flex items-center justify-between text-white max-w-5xl">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm truncate max-w-[200px] sm:max-w-md">{product.name}</span>
              <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">
                {activeImageIndex + 1} / {images.length}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsLightboxOpen(false)}
              className="p-2 rounded-full bg-white/20 hover:bg-white/40 text-white transition-colors"
              aria-label="Tutup Pratinjau Penuh"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Center Image with Prev / Next */}
          <div className="relative flex-1 w-full max-w-5xl flex items-center justify-center my-4 overflow-hidden">
            <img
              src={images[activeImageIndex]}
              alt={product.name}
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain max-h-[75vh] select-none"
            />

            {images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={handlePrevImage}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/25 hover:bg-white text-white hover:text-slate-900 flex items-center justify-center transition-all"
                  aria-label="Sebelumnya"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button
                  type="button"
                  onClick={handleNextImage}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/25 hover:bg-white text-white hover:text-slate-900 flex items-center justify-center transition-all"
                  aria-label="Berikutnya"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </>
            )}
          </div>

          {/* Bottom Thumbnails */}
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto max-w-full pb-2 scrollbar-none">
              {images.map((img, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setActiveImageIndex(idx)}
                  className={`w-14 h-14 rounded-xl overflow-hidden border-2 shrink-0 transition-all ${
                    activeImageIndex === idx 
                      ? 'border-emerald-400 ring-2 ring-emerald-400/50 scale-105' 
                      : 'border-white/20 opacity-50 hover:opacity-100'
                  }`}
                >
                  <img src={img} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
