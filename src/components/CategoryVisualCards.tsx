import React from 'react';
import { Category, Product } from '../types';
import { getCategoryPhotoAuto } from '../data/mockData';
import { Package, Apple, Coffee, Beef, Cookie, Layers, FolderTree, Tag } from 'lucide-react';

interface CategoryVisualCardsProps {
  categories: Category[];
  products: Product[];
  selectedCategoryId: string;
  onSelectCategory: (categoryId: string) => void;
  selectedSubcategoryId?: string;
  onSelectSubcategory?: (subcategoryId: string) => void;
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
  onSelectCategory,
  selectedSubcategoryId = 'all',
  onSelectSubcategory
}: CategoryVisualCardsProps) {
  // Main Categories: only active root categories (no parentId)
  const activeMainCategories = [...categories]
    .filter(c => !c.parentId && c.isActive)
    .sort((a, b) => a.orderIndex - b.orderIndex);

  // If no main categories have been added by admin yet, do not render category section
  if (activeMainCategories.length === 0) {
    return null;
  }

  const totalActiveProducts = products.filter(p => p.isActive).length;

  // Selected main category details & its active subcategories
  const selectedMainCategory = categories.find(c => c.id === selectedCategoryId);
  const activeSubcategories = selectedCategoryId !== 'all'
    ? [...categories]
        .filter(c => c.parentId === selectedCategoryId && c.isActive)
        .sort((a, b) => a.orderIndex - b.orderIndex)
    : [];

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <span>Kategori Produk</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-[#FE8A00]">
              Pilihan
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Jelajahi aneka ragam kategori produk pilihan dan berkualitas di Tumpang Shop
          </p>
        </div>

        {selectedCategoryId !== 'all' && (
          <button
            onClick={() => {
              onSelectCategory('all');
              if (onSelectSubcategory) onSelectSubcategory('all');
            }}
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
          onClick={() => {
            onSelectCategory('all');
            if (onSelectSubcategory) onSelectSubcategory('all');
          }}
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

        {/* Dynamic Main Category Visual Cards */}
        {activeMainCategories.map((cat) => {
          const count = products.filter(p => p.categoryId === cat.id && p.isActive).length;
          const isSelected = selectedCategoryId === cat.id;
          const categoryPhoto = cat.imageUrl || getCategoryPhotoAuto(cat.name);

          return (
            <button
              key={cat.id}
              onClick={() => {
                onSelectCategory(cat.id);
                if (onSelectSubcategory) onSelectSubcategory('all');
              }}
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
                    ? 'bg-[#FE8A00] text-white' 
                    : 'bg-white/90 text-orange-900'
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
                  <span className="inline-block mt-1 text-[9px] font-bold uppercase tracking-wider text-orange-300">
                    ● Terpilih
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Subcategory Pills Bar (Shown when a Main Category with Subcategories is selected) */}
      {selectedCategoryId !== 'all' && activeSubcategories.length > 0 && onSelectSubcategory && (
        <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 sm:p-4 shadow-2xs space-y-2.5 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
              <FolderTree className="w-3.5 h-3.5 text-[#FE8A00]" />
              <span>Subkategori {selectedMainCategory?.name}:</span>
            </div>
            <span className="text-[11px] text-slate-400">
              {activeSubcategories.length} pilihan varian
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* "Semua Subkategori" pill */}
            <button
              type="button"
              onClick={() => onSelectSubcategory('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                selectedSubcategoryId === 'all'
                  ? 'bg-[#FE8A00] text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200/70 text-slate-700'
              }`}
            >
              <span>Semua {selectedMainCategory?.name}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                selectedSubcategoryId === 'all' ? 'bg-orange-700 text-white' : 'bg-slate-200 text-slate-600'
              }`}>
                {products.filter(p => p.categoryId === selectedCategoryId && p.isActive).length}
              </span>
            </button>

            {/* Individual Subcategory pills */}
            {activeSubcategories.map(subcat => {
              const subCount = products.filter(p => p.subcategoryId === subcat.id && p.isActive).length;
              const isSubSelected = selectedSubcategoryId === subcat.id;
              return (
                <button
                  key={subcat.id}
                  type="button"
                  onClick={() => onSelectSubcategory(subcat.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    isSubSelected
                      ? 'bg-orange-500 text-white font-bold shadow-xs'
                      : 'bg-white border border-slate-200 hover:border-orange-300 hover:bg-orange-50/20 text-slate-700'
                  }`}
                >
                  {subcat.imageUrl && (
                    <img 
                      src={subcat.imageUrl} 
                      alt="" 
                      className="w-4 h-4 rounded-full object-cover shrink-0" 
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  )}
                  <span>{subcat.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    isSubSelected ? 'bg-orange-700 text-white' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {subCount}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
