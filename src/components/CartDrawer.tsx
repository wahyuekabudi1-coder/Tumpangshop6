import React from 'react';
import { CartItem } from '../types';
import { X, Trash2, Plus, Minus, ShoppingBag, ArrowRight, CheckSquare, Square } from 'lucide-react';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  selectedItemIds: string[];
  onToggleSelectItem: (cartItemId: string) => void;
  onToggleSelectAll: () => void;
  onUpdateQuantity: (cartItemId: string, newQty: number) => void;
  onRemoveItem: (cartItemId: string) => void;
  onClearCart?: () => void;
  onCheckout: () => void;
}

export default function CartDrawer({
  isOpen,
  onClose,
  items,
  selectedItemIds,
  onToggleSelectItem,
  onToggleSelectAll,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  onCheckout
}: CartDrawerProps) {
  if (!isOpen) return null;

  // Selected items calculation
  const selectedItems = items.filter(item => selectedItemIds.includes(item.cartItemId));
  const subtotal = selectedItems.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);
  const totalItemCount = items.reduce((acc, item) => acc + item.quantity, 0);
  const isAllSelected = items.length > 0 && selectedItemIds.length === items.length;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-2xs flex justify-end">
      <div className="bg-white w-full max-w-md h-full flex flex-col shadow-2xl relative animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shadow-xs">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Keranjang Belanja</h2>
              <p className="text-xs text-slate-500">
                {totalItemCount} barang ({items.length} varian)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors"
            aria-label="Tutup Keranjang"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Select All Bar (if items exist) */}
        {items.length > 0 && (
          <div className="px-5 py-2.5 bg-slate-50/90 border-b border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <button
              onClick={onToggleSelectAll}
              className="flex items-center gap-2 hover:text-emerald-700 font-medium transition-colors"
            >
              {isAllSelected ? (
                <CheckSquare className="w-4 h-4 text-emerald-600" />
              ) : (
                <Square className="w-4 h-4 text-slate-400" />
              )}
              <span>Pilih Semua ({items.length})</span>
            </button>

            {onClearCart && (
              <button
                onClick={onClearCart}
                className="text-slate-400 hover:text-rose-600 transition-colors text-[11px]"
              >
                Kosongkan Keranjang
              </button>
            )}
          </div>
        )}

        {/* Item List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 divide-y divide-slate-100">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-3 text-slate-300">
                <ShoppingBag className="w-8 h-8" />
              </div>
              <p className="text-sm font-semibold text-slate-700">Keranjang Anda masih kosong</p>
              <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
                Jelajahi dan pilih aneka produk pilihan dan berkualitas di Tumpang Shop.
              </p>
            </div>
          ) : (
            items.map((item) => {
              const isSelected = selectedItemIds.includes(item.cartItemId);
              const maxStock = item.selectedOption ? item.selectedOption.stock : item.product.stock;

              return (
                <div key={item.cartItemId} className="py-4 first:pt-0 last:pb-0 flex gap-3 items-start">
                  {/* Item selection checkbox */}
                  <button
                    onClick={() => onToggleSelectItem(item.cartItemId)}
                    className="pt-2 text-slate-400 hover:text-emerald-600 transition-colors"
                    aria-label={`Pilih ${item.product.name}`}
                  >
                    {isSelected ? (
                      <CheckSquare className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-300" />
                    )}
                  </button>

                  {/* Thumbnail */}
                  <img
                    src={item.product.images[0] || 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&auto=format&fit=crop&q=80'}
                    alt={item.product.name}
                    className="w-16 h-16 sm:w-18 sm:h-18 rounded-xl object-cover border border-slate-100 shrink-0 bg-slate-50"
                  />

                  {/* Info and controls */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-xs sm:text-sm font-semibold text-slate-900 line-clamp-1">
                          {item.product.name}
                        </h4>
                        <button
                          onClick={() => onRemoveItem(item.cartItemId)}
                          className="text-slate-400 hover:text-rose-500 p-1 transition-colors shrink-0"
                          title="Hapus item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {item.selectedOption && (
                        <span className="inline-block mt-0.5 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                          {item.selectedVariationName || 'Pilihan'}: {item.selectedOption.name}
                        </span>
                      )}

                      <div className="text-xs font-bold text-slate-900 mt-1">
                        Rp {item.unitPrice.toLocaleString('id-ID')}
                        <span className="text-[10px] text-slate-400 font-normal ml-1">/ {item.product.unit}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-2 pt-1">
                      {/* Quantity buttons */}
                      <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
                        <button
                          onClick={() => onUpdateQuantity(item.cartItemId, item.quantity - 1)}
                          className="p-1 sm:p-1.5 hover:bg-slate-200 text-slate-700 transition-colors"
                          aria-label="Kurangi"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="px-2 text-xs font-bold text-slate-800 min-w-6 text-center">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => onUpdateQuantity(item.cartItemId, item.quantity + 1)}
                          disabled={item.quantity >= maxStock}
                          className="p-1 sm:p-1.5 hover:bg-slate-200 text-slate-700 transition-colors disabled:opacity-30"
                          aria-label="Tambah"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="text-right">
                        <div className="text-xs font-extrabold text-emerald-800">
                          Rp {(item.unitPrice * item.quantity).toLocaleString('id-ID')}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Checkout Summary */}
        {items.length > 0 && (
          <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50/70">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>Produk Dipilih ({selectedItems.length} jenis):</span>
              <span className="font-semibold text-slate-800">
                Rp {subtotal.toLocaleString('id-ID')}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500 mb-3">
              <span>Estimasi Pengiriman:</span>
              <span className="text-slate-600">Dihitung saat checkout</span>
            </div>

            <div className="flex items-center justify-between text-base font-bold text-slate-900 pt-2 border-t border-slate-200 mb-4">
              <span>Total Dipilih:</span>
              <span className="text-emerald-800 text-lg font-black">
                Rp {subtotal.toLocaleString('id-ID')}
              </span>
            </div>

            <button
              onClick={() => {
                if (selectedItems.length === 0) return;
                onClose();
                onCheckout();
              }}
              disabled={selectedItems.length === 0}
              className="w-full py-3.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-2xl flex items-center justify-center gap-2 shadow-md shadow-emerald-700/20 active:scale-[0.99] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span>Lanjut ke Checkout ({selectedItems.length})</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
