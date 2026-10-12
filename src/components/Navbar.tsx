import React from 'react';
import { ShoppingBag, Search, ShieldCheck, User, Truck, Store } from 'lucide-react';
import { UserProfile } from '../types';

interface NavbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  cartItemCount: number;
  onOpenCart: () => void;
  onOpenTracking: () => void;
  onOpenAuth: () => void;
  currentUser: UserProfile | null;
  isAdminView: boolean;
  onToggleAdminView: () => void;
}

export default function Navbar({
  searchQuery,
  onSearchChange,
  cartItemCount,
  onOpenCart,
  onOpenTracking,
  onOpenAuth,
  currentUser,
  isAdminView,
  onToggleAdminView
}: NavbarProps) {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-emerald-900/10 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-3 sm:gap-6">
          {/* Brand Logo */}
          <div 
            onClick={() => {
              if (isAdminView) onToggleAdminView();
            }}
            className="flex items-center gap-2.5 cursor-pointer shrink-0"
          >
            <div className="w-10 h-10 rounded-xl bg-[#FE8A00] flex items-center justify-center text-white shadow-md shadow-orange-500/20">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-lg font-black tracking-tight text-slate-900">TUMPANG</span>
                <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-orange-100 text-[#FE8A00] uppercase tracking-wider">SHOP</span>
              </div>
              <p className="text-[10px] font-medium text-slate-500 hidden sm:block">Pasar Lokal & UMKM Malang</p>
            </div>
          </div>

          {/* Search bar (only in customer view) */}
          {!isAdminView && (
            <div className="flex-1 max-w-md relative hidden md:block">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Cari beras, kopi dampit, sayur segar, keripik tempe..."
                className="w-full pl-10 pr-4 py-2 text-sm bg-slate-100/80 focus:bg-white rounded-full border border-transparent focus:border-[#FE8A00] focus:outline-hidden transition-all text-slate-800 placeholder-slate-400"
              />
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Track Order Button */}
            {!isAdminView && (
              <button
                onClick={onOpenTracking}
                className="flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium text-slate-700 hover:text-[#FE8A00] hover:bg-orange-50 rounded-lg transition-colors"
                title="Lacak Pesanan"
              >
                <Truck className="w-4 h-4 text-[#FE8A00]" />
                <span className="hidden sm:inline">Pesanan Saya</span>
              </button>
            )}

            {/* Admin Switch */}
            <button
              onClick={onToggleAdminView}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors ${
                isAdminView
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
              }`}
              title="Dashboard Admin Toko"
            >
              <ShieldCheck className="w-4 h-4" />
              <span className="hidden sm:inline">{isAdminView ? 'Mode Belanja' : 'Admin'}</span>
            </button>

            {/* User Profile / Login */}
            <button
              onClick={onOpenAuth}
              className="flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium text-slate-700 hover:text-[#FE8A00] hover:bg-orange-50 rounded-lg transition-colors"
              title="Akun Saya"
            >
              <User className="w-4 h-4 text-slate-600" />
              <span className="hidden sm:inline">
                {currentUser ? currentUser.fullName.split(' ')[0] : 'Masuk'}
              </span>
            </button>

            {/* Cart Button */}
            {!isAdminView && (
              <button
                onClick={onOpenCart}
                className="relative flex items-center justify-center p-2.5 bg-[#FE8A00] hover:bg-[#e07b00] text-white rounded-xl shadow-xs transition-colors"
                aria-label="Buka Keranjang"
              >
                <ShoppingBag className="w-5 h-5" />
                {cartItemCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-slate-900 text-white font-black text-[11px] min-w-5 h-5 px-1 rounded-full flex items-center justify-center border-2 border-white shadow-xs">
                    {cartItemCount}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Mobile Search Bar */}
        {!isAdminView && (
          <div className="pb-3 md:hidden">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Cari produk lokal atau kebutuhan harian..."
                className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm bg-slate-100 rounded-full border border-transparent focus:border-emerald-600 focus:bg-white focus:outline-hidden text-slate-800"
              />
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
