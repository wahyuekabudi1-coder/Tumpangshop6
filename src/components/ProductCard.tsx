import React from 'react';
import { Product } from '../types';
import { Plus, Tag, Eye, TrendingUp, CheckCircle2 } from 'lucide-react';

interface ProductCardProps {
  product: Product;
  onSelect: (product: Product) => void;
  onQuickAdd: (product: Product) => void;
  badgeLabel?: string;
  badgeColor?: 'emerald' | 'amber' | 'blue';
  soldCount?: number;
  viewCount?: number;
}

export default function ProductCard({ 
  product, 
  onSelect, 
  onQuickAdd,
  badgeLabel,
  badgeColor = 'emerald',
  soldCount,
  viewCount
}: ProductCardProps) {
  const hasVariations = product.variations && product.variations.length > 0;
  const isOutOfStock = product.stock <= 0;

  return (
    <div className="group bg-white rounded-2xl border border-slate-200/80 hover:border-orange-500/40 shadow-xs hover:shadow-md transition-all flex flex-col overflow-hidden">
      {/* Image Container */}
      <div 
        onClick={() => onSelect(product)}
        className="relative aspect-4/3 w-full bg-slate-100 overflow-hidden cursor-pointer"
      >
        <img
          src={product.images[0] || 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&auto=format&fit=crop&q=80'}
          alt={product.name}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
          onError={(e) => {
            const target = e.currentTarget;
            target.onerror = null;
            target.src = 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&auto=format&fit=crop&q=80';
          }}
        />

        {/* Custom Section Badge */}
        {badgeLabel && (
          <span className={`absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider shadow-xs ${
            badgeColor === 'amber' 
              ? 'bg-amber-500 text-slate-900' 
              : badgeColor === 'blue' 
              ? 'bg-blue-600 text-white' 
              : 'bg-emerald-600 text-white'
          }`}>
            {badgeLabel}
          </span>
        )}

        {product.isFeatured && !badgeLabel && (
          <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-amber-500 text-slate-900 text-[10px] font-bold uppercase tracking-wider shadow-xs">
            Unggulan
          </span>
        )}

        {isOutOfStock && (
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-2xs flex items-center justify-center">
            <span className="px-3 py-1 bg-rose-600 text-white text-xs font-bold rounded-full">
              Habis
            </span>
          </div>
        )}

        <button 
          onClick={(e) => {
            e.stopPropagation();
            onSelect(product);
          }}
          className="absolute bottom-2.5 right-2.5 w-8 h-8 rounded-full bg-white/90 hover:bg-white text-slate-700 shadow-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          title="Lihat Detail"
        >
          <Eye className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="p-3.5 sm:p-4 flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 mb-1 flex-wrap">
            <Tag className="w-3 h-3 text-[#FE8A00]" />
            <span>{product.unit}</span>
            <span className="text-slate-300">•</span>
            <span className={product.stock <= 5 ? 'text-rose-600 font-semibold' : 'text-slate-500'}>
              Stok: {product.stock}
            </span>
            {soldCount !== undefined && soldCount > 0 && (
              <>
                <span className="text-slate-300">•</span>
                <span className="text-slate-700 font-bold bg-slate-100 px-1.5 py-0.2 rounded">
                  Terjual {soldCount}
                </span>
              </>
            )}
            {viewCount !== undefined && viewCount > 0 && (
              <>
                <span className="text-slate-300">•</span>
                <span className="text-slate-600 font-medium bg-slate-100 px-1.5 py-0.2 rounded">
                  {viewCount} dilihat
                </span>
              </>
            )}
          </div>

          <h3 
            onClick={() => onSelect(product)}
            className="text-xs sm:text-sm font-semibold text-slate-800 line-clamp-2 hover:text-[#FE8A00] cursor-pointer transition-colors"
          >
            {product.name}
          </h3>
        </div>

        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
          <div>
            <div className="text-[10px] text-slate-400 font-medium">Harga mulai</div>
            <div className="text-sm sm:text-base font-black text-[#FE8A00]">
              Rp {product.price.toLocaleString('id-ID')}
            </div>
          </div>

          <button
            onClick={() => hasVariations ? onSelect(product) : onQuickAdd(product)}
            disabled={isOutOfStock}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 shrink-0 transition-all ${
              isOutOfStock
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : hasVariations
                ? 'bg-orange-50 text-[#FE8A00] hover:bg-orange-100'
                : 'bg-[#FE8A00] hover:bg-[#e07b00] text-white shadow-xs'
            }`}
          >
            {hasVariations ? (
              'Pilih Varian'
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" />
                <span>+ Keranjang</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
