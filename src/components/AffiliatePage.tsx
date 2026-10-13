import React, { useState, useMemo } from 'react';
import { StoreConfig, UserProfile, AffiliateApplication, AffiliateCampaign, Product, Order } from '../types';
import { 
  ArrowLeft, DollarSign, Share2, Sparkles, CheckCircle2, 
  Copy, ShieldCheck, ChevronRight, ArrowRight, AlertCircle, 
  Tag, Calendar, Filter, Search, Percent, ExternalLink,
  Flame, Check, Clock, TrendingUp
} from 'lucide-react';
import { getEffectiveProductCommission, isCampaignActiveAt, getCampaignPerformance } from '../lib/commissionCalculator';
import { getProductSlug } from '../data/mockData';

interface AffiliatePageProps {
  storeConfig: StoreConfig;
  currentUser: UserProfile | null;
  products?: Product[];
  campaigns?: AffiliateCampaign[];
  orders?: Order[];
  existingApplication?: AffiliateApplication | null;
  onBack: () => void;
  onSubmitApplication: (app: AffiliateApplication) => void;
}

export default function AffiliatePage({
  storeConfig,
  currentUser,
  products = [],
  campaigns = [],
  orders = [],
  existingApplication,
  onBack,
  onSubmitApplication
}: AffiliatePageProps) {
  const [fullName, setFullName] = useState(currentUser?.fullName || '');
  const [phone, setPhone] = useState(currentUser?.phone || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [promotionChannel, setPromotionChannel] = useState('Status WhatsApp & Grup');
  const [notes, setNotes] = useState('');
  const [isSuccess, setIsSuccess] = useState(Boolean(existingApplication));
  const [submittedApp, setSubmittedApp] = useState<AffiliateApplication | null>(existingApplication || null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [copiedNotice, setCopiedNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Affiliate Dashboard Filters
  const [campaignFilter, setCampaignFilter] = useState<string>('ALL');
  const [minCommissionFilter, setMinCommissionFilter] = useState<number>(0);
  const [productSearch, setProductSearch] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'campaigns_and_products' | 'earnings' | 'registration'>('campaigns_and_products');

  const standardCommissionRate = storeConfig?.defaultAffiliateCommissionRate ?? 15;

  // Active campaigns (filtered to only currently active time window and not paused/ended)
  const activeCampaigns = useMemo(() => {
    return campaigns.filter(c => {
      if (c.status === 'PAUSED' || c.status === 'ENDED' || c.status === 'DRAFT') return false;
      return isCampaignActiveAt(c, new Date());
    });
  }, [campaigns]);

  // Max commission in store
  const maxCommissionRate = useMemo(() => {
    let max = standardCommissionRate;
    for (const c of activeCampaigns) {
      if (c.commissionRate > max) max = c.commissionRate;
    }
    for (const p of products) {
      if (p.useCustomCommission && (p.customCommissionRate || 0) > max) {
        max = p.customCommissionRate || 0;
      }
    }
    return max;
  }, [standardCommissionRate, activeCampaigns, products]);

  // Affiliate referral code
  const currentReferralCode = submittedApp?.referralCode || 'TS-PARTNER';

  // Products with effective commissions
  const productsWithCommissions = useMemo(() => {
    return products.map(prod => {
      const comm = getEffectiveProductCommission(prod, storeConfig, campaigns, new Date(), orders);
      const commissionAmount = Math.round(prod.price * (comm.ratePercent / 100));
      return {
        product: prod,
        effectiveCommission: comm,
        commissionAmount
      };
    });
  }, [products, storeConfig, campaigns, orders]);

  // Filtered products list
  const filteredProducts = useMemo(() => {
    return productsWithCommissions.filter(item => {
      // Campaign filter
      if (campaignFilter === 'CAMPAIGN_ONLY') {
        if (item.effectiveCommission.appliedType !== 'campaign') return false;
      } else if (campaignFilter === 'CUSTOM_ONLY') {
        if (item.effectiveCommission.appliedType !== 'product_custom') return false;
      } else if (campaignFilter !== 'ALL') {
        if (item.effectiveCommission.campaign?.id !== campaignFilter) return false;
      }

      // Min commission rate filter
      if (minCommissionFilter > 0 && item.effectiveCommission.ratePercent < minCommissionFilter) {
        return false;
      }

      // Product search filter
      if (productSearch.trim()) {
        const query = productSearch.toLowerCase().trim();
        const matchesName = item.product.name.toLowerCase().includes(query);
        const matchesSku = item.product.sku.toLowerCase().includes(query);
        if (!matchesName && !matchesSku) return false;
      }

      return true;
    });
  }, [productsWithCommissions, campaignFilter, minCommissionFilter, productSearch]);

  // Real earnings analytics from orders for current referral code
  const referralOrders = useMemo(() => {
    if (!submittedApp?.referralCode) return [];
    return orders.filter(o => o.referralCode === submittedApp.referralCode || o.affiliateCommission?.referralCode === submittedApp.referralCode);
  }, [orders, submittedApp]);

  const earningsSummary = useMemo(() => {
    let totalCommission = 0;
    let pendingCommission = 0;
    let approvedCommission = 0;
    let paidCommission = 0;
    let validOrderCount = 0;

    for (const ord of referralOrders) {
      if (ord.orderStatus === 'CANCELLED' || ord.paymentStatus === 'REJECTED' || ord.paymentStatus === 'EXPIRED') {
        continue;
      }
      validOrderCount++;
      const commAmount = ord.affiliateCommission?.totalCommission || 0;
      totalCommission += commAmount;

      const commStatus = ord.affiliateCommission?.status || 'PENDING';
      if (commStatus === 'PAID') {
        paidCommission += commAmount;
      } else if (commStatus === 'APPROVED' || ord.orderStatus === 'COMPLETED' || ord.paymentStatus === 'PAID') {
        approvedCommission += commAmount;
      } else {
        pendingCommission += commAmount;
      }
    }

    return {
      totalCommission,
      pendingCommission,
      approvedCommission,
      paidCommission,
      validOrderCount
    };
  }, [referralOrders]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !phone.trim() || !email.trim()) {
      setErrorMsg('Mohon lengkapi Nama, Nomor WhatsApp, dan Email Anda.');
      return;
    }

    const cleanName = fullName.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    const randomSuffix = Math.floor(10 + Math.random() * 90);
    const referralCode = `TS-${cleanName || 'MITRA'}${randomSuffix}`;

    const newApp: AffiliateApplication = {
      id: `aff_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      fullName: fullName.trim(),
      phone: phone.trim(),
      email: email.trim(),
      promotionChannel,
      notes: notes.trim() || undefined,
      status: 'APPROVED',
      referralCode,
      createdAt: new Date().toISOString()
    };

    onSubmitApplication(newApp);
    setSubmittedApp(newApp);
    setIsSuccess(true);
    setErrorMsg(null);
  };

  const copyToClipboard = (link: string, label: string) => {
    navigator.clipboard.writeText(link).then(() => {
      setCopiedLink(link);
      setCopiedNotice(label);
      setTimeout(() => {
        setCopiedLink(null);
        setCopiedNotice(null);
      }, 3000);
    });
  };

  const domain = window.location.origin;

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Top Header / Breadcrumb Bar */}
      <div className="bg-white border-b border-slate-200/80 sticky top-16 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <button 
              onClick={onBack}
              className="flex items-center gap-1.5 font-bold text-slate-800 hover:text-[#FE8A00] bg-slate-100 hover:bg-orange-50 px-3 py-1.5 rounded-xl transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Kembali</span>
            </button>
            <span className="text-slate-300">/</span>
            <button onClick={onBack} className="hover:text-[#FE8A00] transition-colors">
              Beranda
            </button>
            <ChevronRight className="w-3 h-3 text-slate-400" />
            <span className="text-slate-900 font-semibold">Program Affiliate</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
              Komisi Standar {standardCommissionRate}%
            </span>
            {maxCommissionRate > standardCommissionRate && (
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-orange-100 text-[#FE8A00] border border-orange-200">
                Campaign hingga {maxCommissionRate}%
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Hero Section */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-850 to-slate-900 text-white rounded-3xl p-6 sm:p-10 border border-slate-800 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-[#FE8A00]/15 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-3xl space-y-4">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-[#FE8A00] text-white shadow-md">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Program Kemitraan Tumpang Shop</span>
            </span>

            <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white leading-tight">
              Promosikan Produk Pilihan & Dapatkan Komisi Hingga {maxCommissionRate}%
            </h1>

            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              Dapatkan komisi standar <strong>{standardCommissionRate}%</strong> dari setiap transaksi, plus bonus komisi spesial pada program <strong>Affiliate Campaign</strong> dan komisi khusus produk pilihan.
            </p>

            {submittedApp && (
              <div className="pt-2 flex flex-wrap items-center gap-3">
                <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-xl border border-white/20 text-xs">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Kode Referral Anda</span>
                  <span className="font-mono font-bold text-orange-400 text-base">{submittedApp.referralCode}</span>
                </div>
                <button
                  onClick={() => copyToClipboard(`${domain}/?ref=${submittedApp.referralCode}`, `Tautan Toko Utama (${submittedApp.referralCode})`)}
                  className="px-4 py-2.5 bg-[#FE8A00] hover:bg-[#e07b00] text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-2"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Salin Tautan Toko Utama</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Global Toast Notification for Link Copy */}
        {copiedNotice && (
          <div className="p-4 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-2xl text-xs flex items-center justify-between shadow-sm animate-fade-in">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <span className="font-bold block">Tautan Promosi Berhasil Disalin!</span>
                <span className="text-slate-600">{copiedNotice}</span>
              </div>
            </div>
            <span className="font-mono text-[11px] bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-lg">
              {copiedLink}
            </span>
          </div>
        )}

        {/* Tab Navigation if user is already registered */}
        {submittedApp && (
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
            <button
              onClick={() => setActiveTab('campaigns_and_products')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === 'campaigns_and_products'
                  ? 'bg-orange-50 text-[#FE8A00] border border-orange-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Tag className="w-4 h-4" />
              <span>Katalog & Campaign ({productsWithCommissions.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('earnings')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === 'earnings'
                  ? 'bg-orange-50 text-[#FE8A00] border border-orange-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              <span>Pendapatan Komisi ({referralOrders.length} Pesanan)</span>
            </button>
            <button
              onClick={() => setActiveTab('registration')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === 'registration'
                  ? 'bg-orange-50 text-[#FE8A00] border border-orange-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Profil Kemitraan</span>
            </button>
          </div>
        )}

        {/* VIEW 1: CAMPAIGNS & PRODUCTS */}
        {(!submittedApp || activeTab === 'campaigns_and_products') && (
          <div className="space-y-8">
            
            {/* 1. SECTION: CAMPAIGN AKTIF */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div>
                  <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                    <Flame className="w-5 h-5 text-[#FE8A00]" />
                    <span>Affiliate Campaign Aktif</span>
                  </h2>
                  <p className="text-xs text-slate-500">
                    Campaign dengan persentase komisi prioritas tertinggi untuk produk-produk terpilih
                  </p>
                </div>
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-orange-100 text-[#FE8A00]">
                  {activeCampaigns.length} Campaign Berlangsung
                </span>
              </div>

              {activeCampaigns.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-xs text-slate-500">
                  <p className="font-semibold text-slate-700">Belum ada campaign khusus yang sedang aktif saat ini.</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Seluruh produk tetap berlaku dengan <strong>Komisi Standar {standardCommissionRate}%</strong> atau Komisi Khusus Produk.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {activeCampaigns.map(camp => {
                    const perf = getCampaignPerformance(camp, orders);
                    const campaignLink = `${domain}/?ref=${currentReferralCode}&campaign=${camp.id}`;
                    return (
                      <div 
                        key={camp.id} 
                        className="bg-white rounded-2xl border-2 border-orange-200 p-5 shadow-xs space-y-4 flex flex-col justify-between relative overflow-hidden"
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-orange-500 text-white tracking-wider">
                              Komisi {camp.commissionRate}%
                            </span>
                            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                              Aktif
                            </span>
                          </div>

                          <h3 className="font-black text-slate-900 text-base">{camp.name}</h3>
                          <p className="text-xs text-slate-600 line-clamp-2">{camp.description || 'Campaign spesial mitra Tumpang Shop'}</p>

                          <div className="pt-2 border-t border-slate-100 space-y-1.5 text-[11px] text-slate-500">
                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5 text-slate-400" />
                                <span>Berlaku hingga:</span>
                              </span>
                              <span className="font-semibold text-slate-700">
                                {new Date(camp.endDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>

                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-1">
                                <Tag className="w-3.5 h-3.5 text-slate-400" />
                                <span>Produk Termasuk:</span>
                              </span>
                              <span className="font-semibold text-slate-700">
                                {camp.productIds.length} Produk
                              </span>
                            </div>

                            {camp.budgetLimit && (
                              <div className="flex items-center justify-between">
                                <span>Sisa Anggaran:</span>
                                <span className="font-bold text-slate-800">
                                  Rp {(perf.remainingBudget || 0).toLocaleString('id-ID')}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={() => copyToClipboard(campaignLink, `Campaign "${camp.name}" (Komisi ${camp.commissionRate}%)`)}
                          className="w-full py-2.5 bg-orange-50 hover:bg-[#FE8A00] text-[#FE8A00] hover:text-white border border-orange-200 hover:border-transparent font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-2xs"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>Salin Link Promosi Campaign</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 2. SECTION: KATALOG PRODUK & KOMISI BERLAKU */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-base sm:text-lg font-black text-slate-900">
                    Katalog Produk & Komisi yang Berlaku
                  </h2>
                  <p className="text-xs text-slate-500">
                    Periksa persentase komisi riil dan salin tautan promosi untuk setiap produk
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                  {/* Search */}
                  <div className="relative flex-1 md:w-60">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      placeholder="Cari nama produk..."
                      className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:border-[#FE8A00]"
                    />
                  </div>

                  {/* Campaign filter */}
                  <select
                    value={campaignFilter}
                    onChange={(e) => setCampaignFilter(e.target.value)}
                    className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:border-[#FE8A00] text-slate-700 font-medium"
                  >
                    <option value="ALL">Semua Produk</option>
                    <option value="CAMPAIGN_ONLY">Khusus Ikut Campaign</option>
                    <option value="CUSTOM_ONLY">Komisi Khusus Produk</option>
                    {activeCampaigns.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.commissionRate}%)</option>
                    ))}
                  </select>

                  {/* Min commission filter */}
                  <select
                    value={minCommissionFilter}
                    onChange={(e) => setMinCommissionFilter(Number(e.target.value))}
                    className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:border-[#FE8A00] text-slate-700 font-medium"
                  >
                    <option value={0}>Semua Persentase</option>
                    <option value={15}>Minimal 15%</option>
                    <option value={20}>Minimal 20%</option>
                    <option value={25}>Minimal 25%</option>
                  </select>
                </div>
              </div>

              {/* Product List */}
              {filteredProducts.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400 space-y-2">
                  <p className="font-semibold text-slate-600">Tidak ada produk yang sesuai dengan filter.</p>
                  <p>Coba reset filter atau pencarian Anda.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredProducts.map(({ product, effectiveCommission, commissionAmount }) => {
                    const slug = getProductSlug(product);
                    const productLink = `${domain}/?ref=${currentReferralCode}&product=${slug}`;
                    const isCampaign = effectiveCommission.appliedType === 'campaign';
                    const isCustom = effectiveCommission.appliedType === 'product_custom';

                    return (
                      <div 
                        key={product.id}
                        className={`p-4 rounded-2xl border transition-all flex flex-col justify-between space-y-3 ${
                          isCampaign 
                            ? 'bg-orange-50/20 border-orange-200 hover:border-[#FE8A00]' 
                            : isCustom 
                            ? 'bg-blue-50/20 border-blue-200 hover:border-blue-400' 
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="space-y-3">
                          <div className="flex items-start gap-3">
                            <img
                              src={product.images[0] || ''}
                              alt={product.name}
                              className="w-14 h-14 rounded-xl object-cover border border-slate-200 bg-slate-50 shrink-0"
                              onError={(e) => {
                                const target = e.currentTarget;
                                target.onerror = null;
                                target.src = 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&auto=format&fit=crop&q=80';
                              }}
                            />
                            <div className="min-w-0 flex-1">
                              <h4 className="font-bold text-slate-900 text-xs sm:text-sm line-clamp-1">{product.name}</h4>
                              <div className="text-[11px] text-slate-400 font-mono mt-0.5">SKU: {product.sku}</div>
                              <div className="text-xs font-black text-slate-900 mt-1">
                                Rp {product.price.toLocaleString('id-ID')}
                                <span className="text-[10px] text-slate-400 font-normal"> / {product.unit}</span>
                              </div>
                            </div>
                          </div>

                          {/* Commission Tag */}
                          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-slate-600">Komisi Berlaku:</span>
                              <span className={`font-black px-2 py-0.5 rounded text-[11px] ${
                                isCampaign 
                                  ? 'bg-[#FE8A00] text-white' 
                                  : isCustom 
                                  ? 'bg-blue-600 text-white' 
                                  : 'bg-slate-200 text-slate-800'
                              }`}>
                                {effectiveCommission.ratePercent}%
                              </span>
                            </div>

                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-slate-500">Estimasi / Unit:</span>
                              <span className="font-bold text-emerald-700 font-mono">
                                Rp {commissionAmount.toLocaleString('id-ID')}
                              </span>
                            </div>

                            <div className="text-[10px] text-slate-400 pt-0.5 border-t border-slate-200">
                              {effectiveCommission.sourceLabel}
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => copyToClipboard(productLink, `Produk "${product.name}" (${effectiveCommission.ratePercent}% = Rp ${commissionAmount.toLocaleString('id-ID')})`)}
                          className="w-full py-2 bg-slate-100 hover:bg-[#FE8A00] text-slate-700 hover:text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 active:scale-98"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          <span>Salin Link Promosi</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

        {/* VIEW 2: EARNINGS ANALYTICS */}
        {submittedApp && activeTab === 'earnings' && (
          <div className="space-y-6">
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-6">
              <div>
                <h2 className="text-lg font-black text-slate-900">
                  Ringkasan Pendapatan Mitra ({submittedApp.referralCode})
                </h2>
                <p className="text-xs text-slate-500">
                  Dihitung otomatis dari pesanan yang dibuat menggunakan kode referral Anda
                </p>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-1">
                  <span className="text-[11px] font-bold text-slate-500 uppercase block">Total Transaksi</span>
                  <span className="text-2xl font-black text-slate-900">{earningsSummary.validOrderCount}</span>
                  <span className="text-[11px] text-slate-400 block">Pesanan terdaftar</span>
                </div>

                <div className="bg-orange-50/40 p-4 rounded-2xl border border-orange-200 space-y-1">
                  <span className="text-[11px] font-bold text-[#FE8A00] uppercase block">Total Komisi</span>
                  <span className="text-2xl font-black text-[#FE8A00]">
                    Rp {earningsSummary.totalCommission.toLocaleString('id-ID')}
                  </span>
                  <span className="text-[11px] text-slate-500 block">Akumulasi komisi</span>
                </div>

                <div className="bg-emerald-50/40 p-4 rounded-2xl border border-emerald-200 space-y-1">
                  <span className="text-[11px] font-bold text-emerald-700 uppercase block">Disetujui / Selesai</span>
                  <span className="text-2xl font-black text-emerald-700">
                    Rp {earningsSummary.approvedCommission.toLocaleString('id-ID')}
                  </span>
                  <span className="text-[11px] text-slate-500 block">Siap ditransfer admin</span>
                </div>

                <div className="bg-amber-50/40 p-4 rounded-2xl border border-amber-200 space-y-1">
                  <span className="text-[11px] font-bold text-amber-700 uppercase block">Menunggu (Pending)</span>
                  <span className="text-2xl font-black text-amber-700">
                    Rp {earningsSummary.pendingCommission.toLocaleString('id-ID')}
                  </span>
                  <span className="text-[11px] text-slate-500 block">Pesanan dalam proses</span>
                </div>
              </div>

              {/* Order history table */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Riwayat Transaksi Pesanan Referral
                  </h3>
                </div>

                <div className="divide-y divide-slate-100 text-xs">
                  {referralOrders.length === 0 ? (
                    <div className="p-8 text-center text-slate-400">
                      Belum ada transaksi pesanan yang menggunakan kode referral ini.
                    </div>
                  ) : (
                    referralOrders.map(ord => (
                      <div key={ord.id} className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 hover:bg-slate-50/50">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-900">{ord.orderNumber}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-100 text-slate-600">
                              {new Date(ord.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                              ord.orderStatus === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' :
                              ord.orderStatus === 'CANCELLED' ? 'bg-rose-100 text-rose-800' :
                              'bg-amber-100 text-amber-800'
                            }`}>
                              {ord.orderStatus}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Customer: {ord.customerName} • Total Belanja: Rp {ord.total.toLocaleString('id-ID')}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-[11px] text-slate-400">Komisi Snapshot:</div>
                          <div className="font-mono font-bold text-[#FE8A00] text-sm">
                            Rp {(ord.affiliateCommission?.totalCommission || 0).toLocaleString('id-ID')}
                          </div>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            ord.affiliateCommission?.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' :
                            ord.affiliateCommission?.status === 'CANCELLED' ? 'bg-rose-100 text-rose-800' :
                            'bg-amber-100 text-amber-800'
                          }`}>
                            {ord.affiliateCommission?.status || 'PENDING'}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 3: REGISTRATION / PROFILE */}
        {(!submittedApp || activeTab === 'registration') && (
          <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-xs space-y-6 max-w-2xl mx-auto">
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold text-slate-900">
                {submittedApp ? 'Profil Kemitraan Affiliate Anda' : 'Formulir Pendaftaran Mitra Affiliate'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {submittedApp ? 'Detail akun dan kode referral resmi Anda' : 'Daftarkan diri Anda sekarang untuk mulai mempromosikan produk lokal berkualitas'}
              </p>
            </div>

            {submittedApp ? (
              <div className="space-y-4">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                  <div>
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                      Nama Lengkap Mitra
                    </span>
                    <span className="font-bold text-slate-900">{submittedApp.fullName}</span>
                  </div>
                  <div>
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                      WhatsApp & Email
                    </span>
                    <span className="font-mono text-slate-800 text-xs">{submittedApp.phone} • {submittedApp.email}</span>
                  </div>
                  <div>
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                      Kanal Promosi
                    </span>
                    <span className="text-slate-700 text-xs">{submittedApp.promotionChannel}</span>
                  </div>
                  <div>
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                      Kode Referral Resmi
                    </span>
                    <span className="text-lg font-black text-[#FE8A00] font-mono">{submittedApp.referralCode}</span>
                  </div>
                </div>

                <button
                  onClick={() => setActiveTab('campaigns_and_products')}
                  className="w-full py-3 bg-[#FE8A00] hover:bg-[#e07b00] text-white font-bold rounded-xl text-xs transition-colors"
                >
                  Buka Katalog & Mulai Bagikan Produk
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4 text-xs">
                {errorMsg && (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Nama Lengkap *</label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Contoh: Siti Rahma"
                      className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:border-[#FE8A00] focus:outline-hidden bg-slate-50/50 focus:bg-white text-xs"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Nomor WhatsApp *</label>
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Contoh: 081234567890"
                      className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:border-[#FE8A00] focus:outline-hidden bg-slate-50/50 focus:bg-white text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Email Aktif *</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nama@email.com"
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:border-[#FE8A00] focus:outline-hidden bg-slate-50/50 focus:bg-white text-xs"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Kanal / Rencana Promosi Utama</label>
                  <select
                    value={promotionChannel}
                    onChange={(e) => setPromotionChannel(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:border-[#FE8A00] focus:outline-hidden bg-slate-50/50 focus:bg-white text-xs"
                  >
                    <option value="Status WhatsApp & Grup">Status WhatsApp & Grup Komunitas / Keluarga</option>
                    <option value="Instagram / Threads">Instagram & Threads</option>
                    <option value="TikTok">TikTok & Video Pendek</option>
                    <option value="Facebook">Grup Facebook Jual Beli Malang / Tumpang</option>
                    <option value="Langsung / Mulut ke Mulut">Promosi Langsung ke Tetangga & Kerabat</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Catatan Tambahan (Opsional)</label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Tuliskan pengalaman atau produk yang paling ingin Anda promosikan..."
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:border-[#FE8A00] focus:outline-hidden bg-slate-50/50 focus:bg-white text-xs"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full py-3.5 bg-[#FE8A00] hover:bg-[#e07b00] text-white font-bold rounded-2xl shadow-md transition-all text-xs sm:text-sm flex items-center justify-center gap-2"
                  >
                    <span>Daftar Sekarang & Aktifkan Kode Referral</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
