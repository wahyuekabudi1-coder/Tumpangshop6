import React, { useState, useRef, useEffect } from 'react';
import { Category, Product } from '../../types';
import { uploadCategoryImageToStorage, validateImageFile } from '../../lib/supabase';
import { getCategoryPhotoAuto } from '../../data/mockData';
import { 
  ArrowLeft, Check, Upload, Trash2, RefreshCw, AlertTriangle, 
  Sparkles, Layers, FolderTree, Info, Eye, Image as ImageIcon,
  CheckCircle2, AlertCircle
} from 'lucide-react';

interface AdminCategoryFormPageProps {
  categoryToEdit?: Category | null;
  initialParentId?: string | null;
  initialIsSubcategory?: boolean;
  allCategories: Category[];
  products: Product[];
  onSave: (category: Category) => void;
  onCancel: () => void;
  onShowToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export default function AdminCategoryFormPage({
  categoryToEdit,
  initialParentId = null,
  initialIsSubcategory = false,
  allCategories,
  products,
  onSave,
  onCancel,
  onShowToast
}: AdminCategoryFormPageProps) {
  const isEditing = Boolean(categoryToEdit);

  // Filter root main categories (exclude subcategories themselves to prevent deep circular nesting)
  const availableParentCategories = allCategories.filter(c => {
    // Cannot be a subcategory (keep 2-tier structure clean)
    if (c.parentId) return false;
    // Cannot be the category currently being edited (prevent self-parenting)
    if (categoryToEdit && c.id === categoryToEdit.id) return false;
    return true;
  });

  // State management
  const [isSubcategory, setIsSubcategory] = useState<boolean>(
    categoryToEdit ? Boolean(categoryToEdit.parentId) : (initialIsSubcategory || Boolean(initialParentId))
  );
  const [parentId, setParentId] = useState<string>(
    categoryToEdit?.parentId || initialParentId || (availableParentCategories[0]?.id || '')
  );
  const [name, setName] = useState<string>(categoryToEdit?.name || '');
  const [slug, setSlug] = useState<string>(categoryToEdit?.slug || '');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState<boolean>(Boolean(categoryToEdit?.slug));
  const [description, setDescription] = useState<string>(categoryToEdit?.description || '');
  const [imageUrl, setImageUrl] = useState<string>(categoryToEdit?.imageUrl || '');
  const [imagePath, setImagePath] = useState<string>(categoryToEdit?.imagePath || '');
  const [orderIndex, setOrderIndex] = useState<number>(categoryToEdit?.orderIndex ?? 1);
  const [isActive, setIsActive] = useState<boolean>(categoryToEdit?.isActive ?? true);

  // Upload state
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Auto-generate slug when name changes (if user hasn't typed custom slug)
  useEffect(() => {
    if (!slugManuallyEdited && name.trim()) {
      const generated = name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
      setSlug(generated);
    }
  }, [name, slugManuallyEdited]);

  // Statistics for category being edited
  const assignedProductsCount = isEditing && categoryToEdit 
    ? products.filter(p => p.categoryId === categoryToEdit.id || p.subcategoryId === categoryToEdit.id).length 
    : 0;

  const childSubcategoriesCount = isEditing && categoryToEdit && !categoryToEdit.parentId
    ? allCategories.filter(c => c.parentId === categoryToEdit.id).length
    : 0;

  // File upload handler with direct Supabase Storage integration
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);

    // Client-side validation
    const validation = validateImageFile(file);
    if (!validation.valid) {
      setUploadError(validation.error || 'Format atau ukuran berkas tidak valid.');
      onShowToast(validation.error || 'Gagal mengunggah', 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setIsUploading(true);
    try {
      const result = await uploadCategoryImageToStorage(file);
      setImageUrl(result.url);
      setImagePath(result.path);
      onShowToast('Gambar berhasil diunggah ke penyimpanan cloud!');
    } catch (err: any) {
      console.error('Category image upload failed:', err);
      const errMsg = err?.message || 'Gagal mengunggah gambar. Silakan coba lagi.';
      setUploadError(errMsg);
      onShowToast(errMsg, 'error');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveImage = () => {
    setImageUrl('');
    setImagePath('');
    setUploadError(null);
    onShowToast('Gambar kategori dihapus', 'info');
  };

  const handleAutoGeneratePhoto = () => {
    if (!name.trim()) {
      onShowToast('Ketik nama kategori terlebih dahulu agar sistem dapat mencocokkan gambar yang relevan.', 'info');
      return;
    }
    const autoUrl = getCategoryPhotoAuto(name);
    setImageUrl(autoUrl);
    setImagePath('');
    setUploadError(null);
    onShowToast('Gambar ilustrasi kategori dicocokkan otomatis');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      onShowToast('Nama kategori wajib diisi.', 'error');
      return;
    }

    if (isSubcategory && !parentId) {
      onShowToast('Pilih kategori induk untuk subkategori ini.', 'error');
      return;
    }

    // Circular dependency check
    if (isSubcategory && categoryToEdit && parentId === categoryToEdit.id) {
      onShowToast('Kategori tidak dapat menjadi induk bagi dirinya sendiri.', 'error');
      return;
    }

    const finalSlug = (slug.trim() || name.trim())
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');

    // Duplicate slug check (excluding current item)
    const slugConflict = allCategories.find(c => 
      c.slug.toLowerCase() === finalSlug.toLowerCase() && 
      (!categoryToEdit || c.id !== categoryToEdit.id)
    );
    if (slugConflict) {
      onShowToast(`Slug URL "${finalSlug}" sudah digunakan oleh kategori "${slugConflict.name}". Harap gunakan slug yang unik.`, 'error');
      return;
    }

    const categoryData: Category = {
      id: categoryToEdit ? categoryToEdit.id : `cat_${Date.now()}`,
      name: name.trim(),
      slug: finalSlug,
      description: description.trim() || undefined,
      imageUrl: imageUrl.trim() || undefined,
      imagePath: imagePath.trim() || undefined,
      icon: isSubcategory ? 'FolderTree' : 'Package',
      orderIndex: Number(orderIndex) || 1,
      isActive,
      parentId: isSubcategory ? parentId : null,
      createdAt: categoryToEdit ? categoryToEdit.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    onSave(categoryData);
  };

  const selectedParentCategory = allCategories.find(c => c.id === parentId);

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 font-sans pb-20">
      {/* Dedicated Header Topbar */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 sm:px-6 py-3.5 flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
            title="Kembali ke Daftar Kategori"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">Kategori & Subkategori</span>
              <span className="text-slate-300">/</span>
              <h1 className="text-sm sm:text-base font-bold text-slate-900">
                {isEditing ? (isSubcategory ? 'Edit Subkategori' : 'Edit Kategori Utama') : (isSubcategory ? 'Tambah Subkategori Baru' : 'Tambah Kategori Utama')}
              </h1>
            </div>
            <p className="text-[11px] text-slate-500 font-mono mt-0.5">
              {isEditing ? `ID: ${categoryToEdit?.id} • Slug: ${slug || '-'}` : 'Formulir pengelolaan hierarki etalase toko'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
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
            <span>{isEditing ? 'Perbarui Kategori' : 'Simpan Kategori'}</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Form */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        
        {/* Status / Relational Notice if editing */}
        {isEditing && (
          <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 text-xs text-sky-900 flex items-start gap-3">
            <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-bold">Informasi Relasi Data Kategori</div>
              <div className="text-[11px] text-sky-800">
                Kategori ini terhubung dengan <strong>{assignedProductsCount} produk</strong> dalam katalog.
                {!categoryToEdit?.parentId && childSubcategoriesCount > 0 && (
                  <span> Memiliki <strong>{childSubcategoriesCount} subkategori</strong> di bawahnya.</span>
                )}
                <span> Perubahan nama atau status akan otomatis tersinkronisasi pada website customer.</span>
              </div>
            </div>
          </div>
        )}

        <form id="category-form" onSubmit={handleSubmit} className="space-y-6">
          
          {/* 1. Tipe Hierarki (Kategori Utama vs Subkategori) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-2xs space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-900 uppercase tracking-wider block mb-1">
                Tingkat Hierarki Kategori
              </label>
              <p className="text-xs text-slate-500">
                Pilih apakah entri ini merupakan kategori utama atau subkategori di bawah kategori induk
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setIsSubcategory(false)}
                className={`p-4 rounded-xl border text-left transition-all flex items-start gap-3 ${
                  !isSubcategory 
                    ? 'border-orange-500 bg-orange-50/40 ring-1 ring-orange-500 text-slate-900' 
                    : 'border-slate-200 bg-white hover:border-slate-300 text-slate-600'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  !isSubcategory ? 'bg-[#FE8A00] text-white font-bold' : 'bg-slate-100 text-slate-500'
                }`}>
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">Kategori Utama</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Ditampilkan langsung pada kartu etalase depan (contoh: Fashion Pria, Elektronik, Jaket)
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (availableParentCategories.length === 0) {
                    onShowToast('Belum ada kategori utama. Buat minimal 1 kategori utama terlebih dahulu.', 'error');
                    return;
                  }
                  setIsSubcategory(true);
                }}
                className={`p-4 rounded-xl border text-left transition-all flex items-start gap-3 ${
                  isSubcategory 
                    ? 'border-orange-500 bg-orange-50/40 ring-1 ring-orange-500 text-slate-900' 
                    : 'border-slate-200 bg-white hover:border-slate-300 text-slate-600'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  isSubcategory ? 'bg-[#FE8A00] text-white font-bold' : 'bg-slate-100 text-slate-500'
                }`}>
                  <FolderTree className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">Subkategori</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Turunan spesifik di bawah kategori induk (contoh: Jaket Tebal, Jaket Bomber, Jaket Denim)
                  </div>
                </div>
              </button>
            </div>

            {/* Pemilih Kategori Induk jika mode Subkategori */}
            {isSubcategory && (
              <div className="pt-3 border-t border-slate-100 space-y-2">
                <label className="text-xs font-bold text-slate-800 block">
                  Pilih Kategori Induk <span className="text-rose-500">*</span>
                </label>
                {availableParentCategories.length === 0 ? (
                  <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Tidak ada kategori utama yang tersedia sebagai induk. Buat kategori utama terlebih dahulu.</span>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <select
                      value={parentId}
                      onChange={(e) => setParentId(e.target.value)}
                      className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl bg-white focus:outline-hidden focus:border-[#FE8A00]"
                      required
                    >
                      {availableParentCategories.map(parent => (
                        <option key={parent.id} value={parent.id}>
                          📁 {parent.name} (/{parent.slug})
                        </option>
                      ))}
                    </select>
                    {selectedParentCategory && (
                      <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-1">
                        <span>Subkategori ini akan berada di dalam kelompok:</span>
                        <span className="font-bold text-slate-700">{selectedParentCategory.name}</span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 2. Informasi Utama (Nama, Slug, Urutan) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-2xs space-y-4">
            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Identitas Kategori
            </h2>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Nama {isSubcategory ? 'Subkategori' : 'Kategori'} <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={isSubcategory ? "Contoh: Jaket Denim / Jaket Bomber" : "Contoh: Pakaian & Jaket"}
                className="w-full px-3.5 py-2.5 text-xs sm:text-sm border border-slate-200 rounded-xl focus:outline-hidden focus:border-[#FE8A00] bg-slate-50/50 focus:bg-white"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Slug URL <span className="text-slate-400 font-normal">(kebab-case)</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={slug}
                    onChange={(e) => {
                      setSlug(e.target.value);
                      setSlugManuallyEdited(true);
                    }}
                    placeholder="otomatis dari nama"
                    className="w-full px-3.5 py-2.5 text-xs sm:text-sm font-mono border border-slate-200 rounded-xl focus:outline-hidden focus:border-[#FE8A00] bg-slate-50/50 focus:bg-white"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1 font-mono">
                  URL web: /katalog?category={slug || 'slug-kategori'}
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Urutan Tampilan
                </label>
                <input
                  type="number"
                  min="1"
                  max="999"
                  value={orderIndex}
                  onChange={(e) => setOrderIndex(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 text-xs sm:text-sm border border-slate-200 rounded-xl focus:outline-hidden focus:border-[#FE8A00] bg-slate-50/50 focus:bg-white"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Nomor urut kartu/pills di website customer (angka kecil tampil di depan)
                </p>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Deskripsi Singkat <span className="text-slate-400 font-normal">(Opsional)</span>
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Penjelasan singkat varian atau jenis produk dalam kategori ini..."
                className="w-full px-3.5 py-2.5 text-xs sm:text-sm border border-slate-200 rounded-xl focus:outline-hidden focus:border-[#FE8A00] bg-slate-50/50 focus:bg-white resize-y"
              />
            </div>
          </div>

          {/* 3. Upload Gambar Langsung (Supabase Storage) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <ImageIcon className="w-4 h-4 text-[#FE8A00]" />
                  <span>Foto Sampul & Kartu Visual</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Unggah file foto langsung ke penyimpanan Supabase Storage atau gunakan gambar yang ada
                </p>
              </div>

              <button
                type="button"
                onClick={handleAutoGeneratePhoto}
                className="text-xs font-bold text-[#FE8A00] hover:text-[#d97500] hover:bg-orange-50 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1"
                title="Pilih gambar ilustrasi otomatis berdasarkan nama"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Rekomendasi Foto</span>
              </button>
            </div>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleFileSelect}
              className="hidden"
            />

            {uploadError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{uploadError}</span>
              </div>
            )}

            {/* Upload Action Card */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
              
              {/* Upload Dropzone / Trigger */}
              <div 
                onClick={() => !isUploading && fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[180px] ${
                  isUploading 
                    ? 'border-orange-300 bg-orange-50/30 cursor-wait' 
                    : 'border-slate-200 hover:border-orange-400 hover:bg-orange-50/10'
                }`}
              >
                {isUploading ? (
                  <div className="space-y-2">
                    <RefreshCw className="w-8 h-8 text-[#FE8A00] animate-spin mx-auto" />
                    <div className="text-xs font-bold text-slate-700">Mengunggah ke Supabase Storage...</div>
                    <div className="text-[10px] text-slate-400">Menyimpan dan mengoptimalkan gambar</div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="w-10 h-10 rounded-full bg-orange-100 text-[#FE8A00] flex items-center justify-center mx-auto shadow-xs">
                      <Upload className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-800">
                        Klik untuk Unggah Gambar Langsung
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Format didukung: JPG, PNG, WebP, GIF (Maks. 5 MB)
                      </div>
                    </div>
                    <button
                      type="button"
                      className="mt-2 px-3 py-1 bg-white border border-slate-200 hover:border-orange-400 text-slate-700 text-xs font-semibold rounded-lg shadow-2xs"
                    >
                      Pilih dari Komputer / HP
                    </button>
                  </div>
                )}
              </div>

              {/* Preview Card */}
              <div className="space-y-2">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                  <span>Pratinjau Kartu Visual Customer</span>
                  {imageUrl && (
                    <span className="text-emerald-700 flex items-center gap-1 font-semibold text-[10px]">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Tersimpan</span>
                    </span>
                  )}
                </div>

                {imageUrl ? (
                  <div className="relative rounded-2xl overflow-hidden border border-slate-200 aspect-16/9 bg-slate-900 shadow-md group">
                    <img
                      src={imageUrl}
                      alt={name || 'Pratinjau Kategori'}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 opacity-70"
                      onError={(e) => {
                        const target = e.currentTarget;
                        target.onerror = null;
                        target.src = 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&auto=format&fit=crop&q=80';
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-900/40 to-transparent" />
                    
                    {/* Simulated visual card content */}
                    <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between z-10">
                      <span className="w-6 h-6 rounded-md bg-white/90 text-emerald-800 flex items-center justify-center text-xs font-bold">
                        {isSubcategory ? '↳' : '★'}
                      </span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-black/60 text-white">
                        {isSubcategory ? 'Subkategori' : 'Kategori Utama'}
                      </span>
                    </div>

                    <div className="absolute bottom-2.5 left-2.5 right-2.5 z-10">
                      <div className="text-xs sm:text-sm font-extrabold text-white leading-tight line-clamp-1 drop-shadow-xs">
                        {name || 'Nama Kategori'}
                      </div>
                      <div className="text-[10px] text-emerald-300 mt-0.5 font-mono">
                        /{slug || 'slug'}
                      </div>
                    </div>

                    {/* Action overlay */}
                    <div className="absolute top-2 right-2 flex items-center gap-1.5 z-20">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="p-1.5 bg-white/90 hover:bg-white text-slate-700 rounded-lg shadow-sm text-xs"
                        title="Ganti Gambar"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="p-1.5 bg-rose-600/90 hover:bg-rose-600 text-white rounded-lg shadow-sm text-xs"
                        title="Hapus Gambar"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-2xl p-6 text-center text-slate-400 bg-slate-50/50 aspect-16/9 flex flex-col items-center justify-center">
                    <ImageIcon className="w-8 h-8 text-slate-300 mb-1" />
                    <div className="text-xs font-semibold text-slate-500">Belum ada gambar yang diunggah</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Unggah foto atau gunakan tombol rekomendasi foto</div>
                  </div>
                )}

                {imagePath && (
                  <div className="text-[10px] font-mono text-slate-400 truncate">
                    Storage Ref: {imagePath}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 4. Status Publikasi (Aktif / Nonaktif) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-bold text-slate-900 uppercase tracking-wider block">
                  Status Visibilitas
                </label>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tentukan apakah {isSubcategory ? 'subkategori' : 'kategori'} ini tampil di etalase belanja customer
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsActive(!isActive)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-hidden ${
                  isActive ? 'bg-emerald-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    isActive ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className={`p-3 rounded-xl border text-xs ${
              isActive 
                ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900' 
                : 'bg-slate-50 border-slate-200 text-slate-600'
            }`}>
              {isActive ? (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    <strong>Aktif:</strong> {isSubcategory ? 'Subkategori' : 'Kategori'} akan muncul pada pilihan filter belanja customer.
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>
                    <strong>Nonaktif (Draft):</strong> Disembunyikan dari pilihan belanja publik. Data produk dan histori pesanan tetap tersimpan aman.
                  </span>
                </div>
              )}
            </div>
          </div>

        </form>
      </div>
    </div>
  );
}
