import React from 'react';
import { CartItem, Product } from '../types';
import { 
  Trash2, Plus, Minus, ShoppingBag, ArrowRight, 
  CheckSquare, Square, Store, ArrowLeft, ShieldCheck, AlertCircle 
} from 'lucide-react';

interface CartPageProps {
  items: CartItem[];
  selectedItemIds: string[];
  products: Product[];
  onToggleSelectItem: (cartItemId: string) => void;
  onToggleSelectAll: () => void;
  onUpdateQuantity: (cartItemId: string, newQty: number) => void;
  onRemoveItem: (cartItemId: string) => void;
  onClearCart: () => void;
  onNavigateToCatalog: () => void;
  onProceedToCheckout: () => void;
}

export default function CartPage({
  items,
  selectedItemIds,
  products,
  onToggleSelectItem,
  onToggleSelectAll,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  onNavigateToCatalog,
  onProceedToCheckout
}: CartPageProps) {
  // Filter selected items
  const selectedItems = items.filter(item => selectedItemIds.includes(item.cartItemId));
  const subtotal = selectedItems.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);
  const totalItemCount = items.reduce((acc, item) => acc + item.quantity, 0);
  const selectedCount = selectedItems.reduce((acc, item) => acc + item.quantity, 0);
  const isAllSelected = items.length > 0 && selectedItemIds.length === items.length;

  return (
    <div className="min-h-screen bg-slate-50 py-6 sm:py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        
        {/* Breadcrumb / Top Bar */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onNavigateToCatalog}
              className="w-9 h-9 rounded-xl bg-white border border-slate-200 text-slate-700 hover:text-[#FE8A00] hover:border-orange-300 flex items-center justify-center transition-all shadow-2xs"
              title="Kembali Belanja"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                Keranjang Belanja
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-orange-100 text-[#FE8A00]">
                  {totalItemCount} barang
                </span>
              </h1>
              <p className="text-xs text-slate-500">
                Pilih produk yang ingin Anda beli dan periksa jumlah sebelum ke checkout
              </p>
            </div>
          </div>

          {items.length > 0 && (
            <button
              onClick={onClearCart}
              className="text-xs font-medium text-slate-400 hover:text-rose-600 transition-colors hidden sm:block"
            >
              Kosongkan Keranjang
            </button>
          )}
        </div>

        {items.length === 0 ? (
          /* Empty State */
          <div className="bg-white rounded-3xl border border-slate-200/80 p-12 sm:p-16 text-center max-w-xl mx-auto shadow-2xs">
            <div className="w-20 h-20 rounded-full bg-orange-50 text-[#FE8A00] flex items-center justify-center mx-auto mb-4">
              <ShoppingBag className="w-10 h-10" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Wah, keranjang belanjamu kosong!</h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-2 max-w-sm mx-auto leading-relaxed">
              Yuk jelajahi aneka koleksi produk pilihan dan berkualitas yang tersedia di Tumpang Shop.
            </p>
            <button
              onClick={onNavigateToCatalog}
              className="mt-6 px-6 py-3 rounded-2xl bg-[#FE8A00] hover:bg-[#e07b00] text-white font-bold text-sm shadow-md shadow-orange-500/20 inline-flex items-center gap-2 transition-all active:scale-95"
            >
              <Store className="w-4 h-4" />
              <span>Mulai Belanja Sekarang</span>
            </button>
          </div>
        ) : (
          /* Cart Grid: Left Items List, Right Sticky Order Summary */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
            
            {/* Left Items Column */}
            <div className="lg:col-span-8 space-y-4">
              
              {/* Select All Bar */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 flex items-center justify-between shadow-2xs">
                <button
                  onClick={onToggleSelectAll}
                  className="flex items-center gap-3 text-xs sm:text-sm font-bold text-slate-800 hover:text-[#FE8A00] transition-colors"
                >
                  {isAllSelected ? (
                    <CheckSquare className="w-5 h-5 text-[#FE8A00]" />
                  ) : (
                    <Square className="w-5 h-5 text-slate-300" />
                  )}
                  <span>Pilih Semua ({items.length} produk)</span>
                </button>

                <button
                  onClick={onClearCart}
                  className="text-xs font-semibold text-rose-500 hover:text-rose-700 sm:hidden"
                >
                  Hapus Semua
                </button>
              </div>

              {/* Items List */}
              <div className="bg-white rounded-2xl border border-slate-200/80 divide-y divide-slate-100 shadow-2xs overflow-hidden">
                {items.map((item) => {
                  const isSelected = selectedItemIds.includes(item.cartItemId);
                  const liveProduct = products.find(p => p.id === item.product.id);
                  let currentStock = liveProduct?.stock ?? item.product.stock;
                  if (item.selectedOption && liveProduct?.variations) {
                    const opt = liveProduct.variations[0]?.options.find(o => o.id === item.selectedOption?.id);
                    if (opt) currentStock = opt.stock;
                  }
                  const isOutOfStock = currentStock <= 0;
                  const itemSubtotal = item.unitPrice * item.quantity;

                  return (
                    <div 
                      key={item.cartItemId}
                      className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
                        isSelected ? 'bg-orange-50/20' : 'bg-white'
                      }`}
                    >
                      {/* Checkbox + Image + Info */}
                      <div className="flex items-start gap-3.5 flex-1 min-w-0">
                        <button
                          type="button"
                          onClick={() => onToggleSelectItem(item.cartItemId)}
                          className="mt-2 text-slate-400 hover:text-[#FE8A00] transition-colors shrink-0"
                          aria-label="Pilih barang"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-5 h-5 text-[#FE8A00]" />
                          ) : (
                            <Square className="w-5 h-5 text-slate-300" />
                          )}
                        </button>

                        <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-xl bg-slate-100 overflow-hidden shrink-0 border border-slate-200/60">
                          <img
                            src={item.product.images[0] || 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=300&auto=format&fit=crop&q=80'}
                            alt={item.product.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              const target = e.currentTarget;
                              target.onerror = null;
                              target.src = 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=300&auto=format&fit=crop&q=80';
                            }}
                          />
                        </div>

                        <div className="flex-1 min-w-0 space-y-1">
                          <h3 className="text-sm font-bold text-slate-900 leading-snug line-clamp-2">
                            {item.product.name}
                          </h3>

                          {item.selectedOption && (
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-[11px] font-semibold text-slate-700">
                              <span>{item.selectedVariationName || 'Varian'}:</span>
                              <span className="text-[#FE8A00]">{item.selectedOption.name}</span>
                            </div>
                          )}

                          <div className="text-xs text-slate-600 font-medium">
                            <span className="font-bold text-slate-900">
                              Rp {item.unitPrice.toLocaleString('id-ID')}
                            </span>
                            <span className="text-slate-400 ml-1">/ {item.product.unit}</span>
                          </div>

                          {isOutOfStock ? (
                            <p className="text-[11px] font-bold text-rose-600 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />
                              <span>Stok Habis (Tersedia: 0)</span>
                            </p>
                          ) : (
                            <p className="text-[11px] text-slate-500">
                              Tersedia: <span className="font-medium text-slate-700">{currentStock} {item.product.unit}</span>
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Quantity Controls & Subtotal */}
                      <div className="flex items-center justify-between sm:justify-end gap-4 pl-9 sm:pl-0 shrink-0">
                        <div className="text-right sm:text-right">
                          <div className="text-[10px] text-slate-400 font-medium">Subtotal</div>
                          <div className="text-sm font-black text-[#FE8A00]">
                            Rp {itemSubtotal.toLocaleString('id-ID')}
                          </div>
                        </div>

                        {/* Counter */}
                        <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
                          <button
                            onClick={() => onUpdateQuantity(item.cartItemId, item.quantity - 1)}
                            className="p-2 hover:bg-slate-200 text-slate-700 transition-colors"
                            aria-label="Kurangi kuantitas"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-9 text-center font-bold text-xs text-slate-900">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => onUpdateQuantity(item.cartItemId, item.quantity + 1)}
                            disabled={item.quantity >= currentStock}
                            className="p-2 hover:bg-slate-200 text-slate-700 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                            aria-label="Tambah kuantitas"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Remove */}
                        <button
                          onClick={() => onRemoveItem(item.cartItemId)}
                          className="p-2 text-slate-400 hover:text-rose-600 transition-colors rounded-lg hover:bg-rose-50"
                          title="Hapus barang"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Secure note */}
              <div className="flex items-center gap-2 p-3.5 rounded-2xl bg-orange-50/50 border border-orange-100 text-xs text-slate-600">
                <ShieldCheck className="w-4 h-4 text-[#FE8A00] shrink-0" />
                <span>Transaksi terlindungi. Stok diverifikasi otomatis secara langsung dengan inventaris pedagang.</span>
              </div>
            </div>

            {/* Right Summary Column (Sticky) */}
            <div className="lg:col-span-4 lg:sticky lg:top-24 space-y-4">
              <div className="bg-white rounded-3xl border border-slate-200/80 p-5 sm:p-6 shadow-2xs space-y-5">
                <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
                  Ringkasan Belanja
                </h2>

                <div className="space-y-3 text-xs sm:text-sm">
                  <div className="flex items-center justify-between text-slate-600">
                    <span>Total Produk Dipilih</span>
                    <span className="font-bold text-slate-900">{selectedCount} barang</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-600">
                    <span>Subtotal Produk</span>
                    <span className="font-bold text-slate-900">
                      Rp {subtotal.toLocaleString('id-ID')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-500 text-xs">
                    <span>Ongkos Kirim & Layanan</span>
                    <span className="italic">Dihitung di Checkout</span>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-4 flex items-baseline justify-between">
                  <div>
                    <div className="text-xs text-slate-500 font-medium">Total Tagihan</div>
                    <div className="text-xl sm:text-2xl font-black text-[#FE8A00] tracking-tight">
                      Rp {subtotal.toLocaleString('id-ID')}
                    </div>
                  </div>
                </div>

                <button
                  onClick={onProceedToCheckout}
                  disabled={selectedItems.length === 0}
                  className={`w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
                    selectedItems.length === 0
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      : 'bg-[#FE8A00] hover:bg-[#e07b00] text-white shadow-lg shadow-orange-500/25 active:scale-[0.99]'
                  }`}
                >
                  <span>Lanjut ke Checkout</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                {selectedItems.length === 0 && (
                  <p className="text-center text-[11px] text-slate-400 font-medium">
                    Centang minimal 1 produk untuk melanjutkan checkout
                  </p>
                )}
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
