import React from 'react';
import { Category, Product } from '../types';
import { getCategoryPhotoAuto } from '../data/mockData';
import { Package, Apple, Coffee, Beef, Cookie, Sparkles, Layers } from 'lucide-react';

interface CategoryVisualCardsProps {
  categories: Category[];
  products: Product[];
  selectedCategoryId: string;
  onSelectCategory: (categoryId: string) => void;
}

// Icon mapper for categories
function getCategoryIcon(iconName?: string) {
  switch (iconName?.toLowerCase()) {
    case 'apple':
      return <Apple className="w-4 h-4" />;
    case 'coffee':
      return <Coffee className="w-4 h-4" />;
    case 'beef':
      return <Beef className="w-4 h-4" />;
    case 'cookie':
      return <Cookie className="w-4 h-4" />;
    default:
      return <Package className="w-4 h-4" />;
  }
}

export default function CategoryVisualCards({
  categories,
  products,
  selectedCategoryId,
  onSelectCategory
}: CategoryVisualCardsProps) {
  // Sort active categories by orderIndex
  const activeCategories = [...categories]
    .filter(c => c.isActive)
    .sort((a, b) => a.orderIndex - b.orderIndex);

  const totalActiveProducts = products.filter(p => p.isActive).length;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <span>Kategori Belanja</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-[#FE8A00]">
              Pasar Tumpang
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Jelajahi aneka ragam sembako, sayuran lereng Bromo, hingga karya UMKM lokal
          </p>
        </div>

        {selectedCategoryId !== 'all' && (
          <button
            onClick={() => onSelectCategory('all')}
            className="text-xs font-bold text-[#FE8A00] hover:text-[#e07b00] bg-orange-50 hover:bg-orange-100 px-3 py-1.5 rounded-xl transition-colors"
          >
            Lihat Semua Kategori
          </button>
        )}
      </div>

      {/* Visual Cards Carousel / Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 sm:gap-4">
        {/* "Semua Produk" Card */}
        <button
          onClick={() => onSelectCategory('all')}
          className={`group text-left p-3 rounded-2xl border transition-all flex flex-col justify-between relative overflow-hidden h-[150px] sm:h-[160px] ${
            selectedCategoryId === 'all'
              ? 'border-orange-500 bg-[#FE8A00] text-white shadow-md shadow-orange-500/20 ring-2 ring-orange-400'
              : 'border-slate-200/80 bg-white hover:border-orange-400 hover:shadow-md text-slate-800'
          }`}
        >
          {/* Subtle Background Pattern */}
          <div className={`absolute -right-4 -bottom-4 w-20 h-20 rounded-full opacity-10 pointer-events-none ${
            selectedCategoryId === 'all' ? 'bg-white' : 'bg-orange-800'
          }`} />

          <div className="flex items-center justify-between z-10">
            <span className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs ${
              selectedCategoryId === 'all'
                ? 'bg-orange-600 text-white'
                : 'bg-orange-100 text-[#FE8A00] group-hover:scale-110 transition-transform'
            }`}>
              <Layers className="w-4 h-4" />
            </span>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
              selectedCategoryId === 'all' ? 'bg-orange-600 text-orange-100' : 'bg-slate-100 text-slate-600'
            }`}>
              {totalActiveProducts}
            </span>
          </div>

          <div className="z-10 mt-auto">
            <div className={`text-xs sm:text-sm font-extrabold line-clamp-1 ${
              selectedCategoryId === 'all' ? 'text-white' : 'text-slate-900'
            }`}>
              Semua Produk
            </div>
            <div className={`text-[10px] line-clamp-1 mt-0.5 ${
              selectedCategoryId === 'all' ? 'text-orange-100' : 'text-slate-500'
            }`}>
              Seluruh etalase toko
            </div>
          </div>
        </button>

        {/* Dynamic Category Visual Cards */}
        {activeCategories.map((cat) => {
          const count = products.filter(p => p.categoryId === cat.id && p.isActive).length;
          const isSelected = selectedCategoryId === cat.id;
          const categoryPhoto = cat.imageUrl || getCategoryPhotoAuto(cat.name);

          return (
            <button
              key={cat.id}
              onClick={() => onSelectCategory(cat.id)}
              className={`group text-left rounded-2xl border transition-all flex flex-col justify-between relative overflow-hidden h-[150px] sm:h-[160px] ${
                isSelected
                  ? 'border-orange-500 ring-2 ring-orange-500 shadow-md shadow-orange-500/20'
                  : 'border-slate-200/80 bg-white hover:border-orange-400 hover:shadow-md'
              }`}
            >
              {/* Category Background Image with Gradient Overlay */}
              <div className="absolute inset-0 bg-slate-900 overflow-hidden">
                <img
                  src={categoryPhoto}
                  alt={cat.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 opacity-60"
                  onError={(e) => {
                    // Safe fallback if external photo fails - replace with secondary guaranteed fallback
                    const target = e.currentTarget;
                    target.onerror = null;
                    target.src = 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&auto=format&fit=crop&q=80';
                  }}
                />
                <div className={`absolute inset-0 bg-gradient-to-t ${
                  isSelected 
                    ? 'from-orange-950/95 via-orange-900/70 to-transparent' 
                    : 'from-slate-950/90 via-slate-900/50 to-transparent'
                }`} />
              </div>

              {/* Top Row: Icon + Count */}
              <div className="relative z-10 p-3 flex items-center justify-between w-full">
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs backdrop-blur-md shadow-xs ${
                  isSelected 
                    ? 'bg-emerald-500 text-white' 
                    : 'bg-white/90 text-emerald-800'
                }`}>
                  {getCategoryIcon(cat.icon)}
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-black/50 text-white/90 backdrop-blur-md">
                  {count} produk
                </span>
              </div>

              {/* Bottom Row: Category Name */}
              <div className="relative z-10 p-3 pt-0 mt-auto">
                <h3 className="text-xs sm:text-sm font-extrabold text-white leading-tight drop-shadow-xs line-clamp-2">
                  {cat.name}
                </h3>
                {isSelected && (
                  <span className="inline-block mt-1 text-[9px] font-bold uppercase tracking-wider text-emerald-300">
                    ● Terpilih
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
