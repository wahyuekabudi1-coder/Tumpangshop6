import React, { useState, useMemo } from 'react';
import { AffiliateCampaign, CampaignStatus, Product, Category } from '../../types';
import { 
  ArrowLeft, ChevronRight, Check, X, AlertTriangle, 
  Search, Calendar, Percent, ShieldCheck, DollarSign,
  Package, Tag, Sparkles, Filter, Info
} from 'lucide-react';
import { detectCampaignConflicts } from '../../lib/commissionCalculator';

interface AdminCampaignFormPageProps {
  initialCampaign?: AffiliateCampaign | null;
  products: Product[];
  categories: Category[];
  existingCampaigns: AffiliateCampaign[];
  onBack: () => void;
  onSave: (campaign: AffiliateCampaign) => void;
}

export default function AdminCampaignFormPage({
  initialCampaign,
  products,
  categories,
  existingCampaigns,
  onBack,
  onSave
}: AdminCampaignFormPageProps) {
  const isEditing = Boolean(initialCampaign);

  // Form Fields State
  const [name, setName] = useState(initialCampaign?.name || '');
  const [description, setDescription] = useState(initialCampaign?.description || '');
  const [commissionRate, setCommissionRate] = useState<number>(initialCampaign?.commissionRate ?? 20);

  // Helper date formatter
  const toInputDateTime = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return '';
      const pad = (n: number) => n.toString().padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return '';
    }
  };

  const defaultStartDate = useMemo(() => {
    if (initialCampaign?.startDate) return toInputDateTime(initialCampaign.startDate);
    const now = new Date();
    return toInputDateTime(now.toISOString());
  }, [initialCampaign]);

  const defaultEndDate = useMemo(() => {
    if (initialCampaign?.endDate) return toInputDateTime(initialCampaign.endDate);
    const end = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days later
    return toInputDateTime(end.toISOString());
  }, [initialCampaign]);

  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [status, setStatus] = useState<CampaignStatus>(initialCampaign?.status || 'ACTIVE');
  const [budgetLimit, setBudgetLimit] = useState(initialCampaign?.budgetLimit !== undefined ? String(initialCampaign.budgetLimit) : '');
  const [maxOrders, setMaxOrders] = useState(initialCampaign?.maxOrders !== undefined ? String(initialCampaign.maxOrders) : '');

  // Product Selection Scope
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>(() => {
    if (initialCampaign?.productIds && initialCampaign.productIds.length > 0) {
      return initialCampaign.productIds;
    }
    // Default: select all active products
    return products.map(p => p.id);
  });

  const [productSearch, setProductSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // Filtered Products for Picker
  const visibleProducts = useMemo(() => {
    return products.filter(p => {
      const matchCat = categoryFilter === 'ALL' || p.categoryId === categoryFilter;
      const matchSearch = !productSearch.trim() || 
        p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
        p.sku.toLowerCase().includes(productSearch.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [products, categoryFilter, productSearch]);

  const handleToggleProduct = (productId: string) => {
    setSelectedProductIds(prev => 
      prev.includes(productId) 
        ? prev.filter(id => id !== productId) 
        : [...prev, productId]
    );
  };

  const handleSelectAllVisible = () => {
    const visibleIds = visibleProducts.map(p => p.id);
    setSelectedProductIds(prev => Array.from(new Set([...prev, ...visibleIds])));
  };

  const handleDeselectAllVisible = () => {
    const visibleIdSet = new Set(visibleProducts.map(p => p.id));
    setSelectedProductIds(prev => prev.filter(id => !visibleIdSet.has(id)));
  };

  // Live Conflict Checking
  const conflictWarnings = useMemo(() => {
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    if (isNaN(start) || isNaN(end) || selectedProductIds.length === 0) return [];

    const otherCampaigns = existingCampaigns.filter(c => 
      c.id !== initialCampaign?.id && c.status !== 'ENDED' && c.status !== 'DRAFT'
    );
    const conflicts: string[] = [];

    for (const other of otherCampaigns) {
      const oStart = new Date(other.startDate).getTime();
      const oEnd = new Date(other.endDate).getTime();
      const overlaps = start <= oEnd && end >= oStart;
      if (overlaps) {
        const common = selectedProductIds.filter(pid => other.productIds.includes(pid));
        if (common.length > 0) {
          conflicts.push(`Campaign "${other.name}" (${other.commissionRate}%) mencakup ${common.length} produk bertumpuk pada periode yang sama.`);
        }
      }
    }
    return conflicts;
  }, [startDate, endDate, selectedProductIds, existingCampaigns, initialCampaign]);

  // Form Submit Handler
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      alert('Nama campaign wajib diisi.');
      return;
    }
    if (commissionRate < 0 || commissionRate > 100) {
      alert('Persentase komisi harus di antara 0% dan 100%.');
      return;
    }
    if (!startDate || !endDate) {
      alert('Tanggal mulai dan berakhir wajib diisi.');
      return;
    }
    const startTime = new Date(startDate).getTime();
    const endTime = new Date(endDate).getTime();
    if (endTime <= startTime) {
      alert('Tanggal berakhir harus setelah tanggal mulai.');
      return;
    }
    if (selectedProductIds.length === 0) {
      alert('Campaign harus menyertakan minimal 1 produk katalog.');
      return;
    }

    const budgetVal = budgetLimit.trim() ? Number(budgetLimit) : undefined;
    const maxOrdersVal = maxOrders.trim() ? Number(maxOrders) : undefined;

    const campaignToSave: AffiliateCampaign = {
      id: initialCampaign?.id || `camp_${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      productIds: selectedProductIds,
      commissionRate: Number(commissionRate),
      startDate: new Date(startDate).toISOString(),
      endDate: new Date(endDate).toISOString(),
      status,
      budgetLimit: budgetVal && budgetVal > 0 ? budgetVal : undefined,
      maxOrders: maxOrdersVal && maxOrdersVal > 0 ? maxOrdersVal : undefined,
      createdAt: initialCampaign?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    onSave(campaignToSave);
  };

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 font-sans pb-16">
      {/* Top Header / Sticky Bar */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 sm:px-6 py-3.5 flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 border border-slate-200 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"
            title="Kembali ke Daftar Campaign"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="cursor-pointer hover:underline" onClick={onBack}>Seller Centre</span>
              <ChevronRight className="w-3 h-3 text-slate-400" />
              <span className="cursor-pointer hover:underline" onClick={onBack}>Affiliate & Kemitraan</span>
              <ChevronRight className="w-3 h-3 text-slate-400" />
              <span className="font-bold text-slate-800">
                {isEditing ? 'Edit Campaign' : 'Buat Campaign Baru'}
              </span>
            </div>
            <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight mt-0.5">
              {isEditing ? `Edit Campaign: ${initialCampaign?.name}` : 'Buat Affiliate Campaign Baru'}
            </h1>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="px-3.5 py-1.5 border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold rounded-lg text-xs transition-colors"
          >
            Batal
          </button>
          <button
            type="submit"
            form="campaign-form"
            className="px-4 py-1.5 bg-[#FE8A00] hover:bg-[#e07b00] text-white text-xs font-bold rounded-lg transition-colors shadow-2xs flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>{isEditing ? 'Simpan Perubahan' : 'Terbitkan Campaign'}</span>
          </button>
        </div>
      </header>

      {/* Main Form Body */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6">
        <form id="campaign-form" onSubmit={handleSubmit} className="space-y-6">
          {/* Conflict Notification Alert (if any) */}
          {conflictWarnings.length > 0 && (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 text-xs text-amber-900 space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                <span>Peringatan Deteksi Konflik Periode & Produk</span>
              </div>
              <p className="text-amber-800 leading-relaxed">
                Terdapat campaign lain yang aktif pada periode yang sama untuk produk yang Anda pilih. 
                Sistem akan menggunakan <strong>prioritas deterministik</strong> (komisi rate tertinggi) saat pembeli bertransaksi:
              </p>
              <ul className="list-disc list-inside space-y-1 font-semibold text-amber-900 bg-white/70 p-3 rounded-xl border border-amber-200">
                {conflictWarnings.map((msg, i) => (
                  <li key={i}>{msg}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left 7 Columns: Form Configurations */}
            <div className="lg:col-span-7 space-y-6">
              {/* Card 1: Basic Campaign Info */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
                  <Sparkles className="w-4 h-4 text-[#FE8A00]" />
                  <span>Informasi Pokok Campaign</span>
                </h2>

                <div className="space-y-3.5 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Nama Campaign Promosi <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Contoh: Flash Sale Gajian, Promo Panen Raya Apel"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-hidden focus:border-[#FE8A00] font-medium"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Deskripsi / Tujuan Campaign
                    </label>
                    <textarea
                      rows={2}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Catatan internal atau deskripsi untuk mitra affiliate mengenai promo ini..."
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-hidden focus:border-[#FE8A00]"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Status Campaign
                    </label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as CampaignStatus)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-hidden focus:border-[#FE8A00] font-bold bg-white"
                    >
                      <option value="ACTIVE">ACTIVE (Aktif berlaku sesuai tanggal)</option>
                      <option value="SCHEDULED">SCHEDULED (Terjadwal masa datang)</option>
                      <option value="PAUSED">PAUSED (Dijeda sementara)</option>
                      <option value="ENDED">ENDED (Berakhir)</option>
                      <option value="DRAFT">DRAFT (Konsep)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Card 2: Commission Rate & Time Schedule */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
                  <Percent className="w-4 h-4 text-[#FE8A00]" />
                  <span>Persentase Komisi & Jadwal Aktif</span>
                </h2>

                <div className="space-y-4 text-xs">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="font-bold text-slate-700">
                        Persentase Komisi Campaign (%) <span className="text-rose-500">*</span>
                      </label>
                      <span className="font-mono font-black text-sm text-[#FE8A00] bg-orange-50 px-2 py-0.5 rounded-lg border border-orange-200">
                        {commissionRate}%
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="1"
                        max="100"
                        value={commissionRate}
                        onChange={(e) => setCommissionRate(Number(e.target.value))}
                        className="flex-1 accent-[#FE8A00]"
                      />
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={commissionRate}
                        onChange={(e) => setCommissionRate(Math.min(100, Math.max(0, Number(e.target.value))))}
                        className="w-20 px-2.5 py-1.5 border border-slate-200 rounded-xl font-bold text-center font-mono"
                      />
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Komisi ini akan diprioritaskan di atas komisi khusus produk dan komisi standar toko (15%).
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Tanggal Mulai <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="datetime-local"
                        required
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-hidden focus:border-[#FE8A00] font-mono text-[11px]"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Tanggal Berakhir <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="datetime-local"
                        required
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-hidden focus:border-[#FE8A00] font-mono text-[11px]"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 3: Optional Limits (Budget & Order Caps) */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
                  <DollarSign className="w-4 h-4 text-[#FE8A00]" />
                  <span>Batas Anggaran & Kuota Pesanan (Opsional)</span>
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Batas Total Anggaran Komisi (Rp)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={budgetLimit}
                      onChange={(e) => setBudgetLimit(e.target.value)}
                      placeholder="Contoh: 1000000 (Kosong = Tanpa Batas)"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-hidden focus:border-[#FE8A00] font-mono"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      Jika terlampaui, komisi otomatis fallback ke rate default.
                    </p>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Maksimal Kuota Pesanan (Transaksi)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={maxOrders}
                      onChange={(e) => setMaxOrders(e.target.value)}
                      placeholder="Contoh: 100 (Kosong = Tanpa Batas)"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-hidden focus:border-[#FE8A00] font-mono"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      Maksimal jumlah pesanan referral yang berhak menerima komisi promo ini.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right 5 Columns: Product Selection Scope */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Package className="w-4 h-4 text-[#FE8A00]" />
                      <span>Produk yang Tercakup</span>
                    </h2>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Pilih produk yang berlaku untuk komisi campaign ini
                    </p>
                  </div>
                  <span className="font-mono font-bold text-xs bg-orange-100 text-[#FE8A00] px-2.5 py-1 rounded-full">
                    {selectedProductIds.length} / {products.length} terpilih
                  </span>
                </div>

                {/* Filters & Search */}
                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        placeholder="Cari nama atau SKU..."
                        className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs"
                      />
                    </div>
                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-700"
                    >
                      <option value="ALL">Semua Kategori</option>
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                    <span>Aksi Cepat:</span>
                    <div className="flex items-center gap-2 font-semibold">
                      <button
                        type="button"
                        onClick={handleSelectAllVisible}
                        className="text-[#FE8A00] hover:underline"
                      >
                        Pilih Semua Tampil
                      </button>
                      <span>•</span>
                      <button
                        type="button"
                        onClick={handleDeselectAllVisible}
                        className="text-slate-500 hover:underline"
                      >
                        Hapus Pilihan Tampil
                      </button>
                    </div>
                  </div>
                </div>

                {/* Product List Selector */}
                <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl">
                  {visibleProducts.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400">
                      Tidak ada produk yang cocok dengan pencarian / filter.
                    </div>
                  ) : (
                    visibleProducts.map(prod => {
                      const isChecked = selectedProductIds.includes(prod.id);
                      return (
                        <label
                          key={prod.id}
                          className={`p-3 flex items-center justify-between gap-3 text-xs cursor-pointer hover:bg-slate-50 transition-colors ${
                            isChecked ? 'bg-orange-50/40' : ''
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleProduct(prod.id)}
                              className="w-4 h-4 rounded text-[#FE8A00] focus:ring-[#FE8A00] accent-[#FE8A00]"
                            />
                            <img
                              src={prod.images[0] || 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=100&auto=format&fit=crop&q=80'}
                              alt={prod.name}
                              className="w-9 h-9 rounded-lg object-cover border border-slate-200 shrink-0"
                            />
                            <div>
                              <div className="font-bold text-slate-900 line-clamp-1">{prod.name}</div>
                              <div className="text-[10px] text-slate-500 font-mono">
                                Rp {prod.price.toLocaleString('id-ID')} • SKU: {prod.sku}
                              </div>
                            </div>
                          </div>

                          {/* Indicator if product has custom rate */}
                          {prod.useCustomCommission && prod.customCommissionRate !== undefined ? (
                            <span className="shrink-0 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200" title="Produk ini memiliki komisi khusus produk">
                              Khusus: {prod.customCommissionRate}%
                            </span>
                          ) : null}
                        </label>
                      );
                    })
                  )}
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-[11px] text-slate-600 space-y-1">
                  <div className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-slate-400" />
                    <span>Integritas Transaksi & Snapshot:</span>
                  </div>
                  <p>
                    Menyimpan atau memperbarui campaign ini hanya mempengaruhi transaksi masa depan. Pesanan lama yang sudah tercatat tidak akan diubah komisi atau persentasenya.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
