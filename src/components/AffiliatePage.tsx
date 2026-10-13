import React, { useState, useMemo, useEffect } from 'react';
import { StoreConfig, UserProfile, AffiliateApplication, AffiliateCampaign, Product, Order } from '../types';
import { 
  ArrowLeft, DollarSign, Share2, Sparkles, CheckCircle2, 
  Copy, ShieldCheck, ChevronRight, ArrowRight, AlertCircle, 
  Tag, Calendar, Filter, Search, Percent, ExternalLink,
  Flame, Check, Clock, TrendingUp, MousePointerClick, ShoppingBag,
  CreditCard, Wallet, Send, X, MessageCircle, LogIn, LogOut,
  UserCheck, Smartphone, Lock, Eye, EyeOff, KeyRound
} from 'lucide-react';
import { getEffectiveProductCommission, isCampaignActiveAt, getCampaignPerformance } from '../lib/commissionCalculator';
import { 
  getAffiliatePerformanceMetrics, 
  getAffiliateClicks, 
  getPayoutRequests, 
  savePayoutRequest, 
  AffiliatePayoutRequest,
  getStoredAffiliateToken,
  setStoredAffiliateToken,
  clearStoredAffiliateToken
} from '../lib/affiliateAttribution';
import { getProductSlug } from '../data/mockData';
import { getStoredAffiliates } from '../lib/supabase';


interface AffiliatePageProps {
  storeConfig: StoreConfig;
  currentUser: UserProfile | null;
  products?: Product[];
  campaigns?: AffiliateCampaign[];
  orders?: Order[];
  affiliates?: AffiliateApplication[];
  existingApplication?: AffiliateApplication | null;
  onBack: () => void;
  onSubmitApplication: (app: AffiliateApplication) => void;
}

interface ShareModalData {
  title: string;
  url: string;
  productName?: string;
  price?: number;
  unit?: string;
  commissionRate?: number;
}

export default function AffiliatePage({
  storeConfig,
  currentUser,
  products = [],
  campaigns = [],
  orders = [],
  affiliates = [],
  existingApplication,
  onBack,
  onSubmitApplication
}: AffiliatePageProps) {
  // Registration form state
  const [fullName, setFullName] = useState(currentUser?.fullName || '');
  const [phone, setPhone] = useState(currentUser?.phone || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState('');
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [promotionChannel, setPromotionChannel] = useState('Status WhatsApp & Grup');
  const [notes, setNotes] = useState('');

  // Login form state for approved affiliates
  const [loginInput, setLoginInput] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [authView, setAuthView] = useState<'register' | 'login'>('login');

  // Active affiliate session state (Protected by cryptographically signed backend token)
  const [submittedApp, setSubmittedApp] = useState<AffiliateApplication | null>(() => {
    if (existingApplication && getStoredAffiliateToken()) return existingApplication;
    try {
      const token = getStoredAffiliateToken();
      const saved = localStorage.getItem('tumpang_shop_active_affiliate_profile');
      if (token && saved) return JSON.parse(saved);
    } catch {}
    return null;
  });

  // Backend session verification on mount (Strict Token & Expiration Check)
  useEffect(() => {
    const token = getStoredAffiliateToken();
    if (!token) {
      if (submittedApp) {
        setSubmittedApp(null);
        try { localStorage.removeItem('tumpang_shop_active_affiliate_profile'); } catch {}
      }
      return;
    }

    // Verify token validity with backend
    fetch('/api/affiliates/session', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (!data.success) {
          console.warn('[Affiliate] Session expired or invalid, logging out.');
          clearStoredAffiliateToken();
          setSubmittedApp(null);
          try { localStorage.removeItem('tumpang_shop_active_affiliate_profile'); } catch {}
        } else if (data.affiliate) {
          setSubmittedApp(data.affiliate);
        }
      })
      .catch(() => {
        // Offline or network hiccup; keep current session if token structure is unexpired
      });
  }, []);

  // Sync active profile status if admin modifies it in affiliates list
  useEffect(() => {
    if (submittedApp && affiliates && affiliates.length > 0) {
      const live = affiliates.find(a => 
        a.id === submittedApp.id || 
        a.referralCode?.toUpperCase() === submittedApp.referralCode?.toUpperCase()
      );
      if (live && live.status !== submittedApp.status) {
        const updated = { ...submittedApp, ...live };
        setSubmittedApp(updated);
        try {
          localStorage.setItem('tumpang_shop_active_affiliate_profile', JSON.stringify(updated));
        } catch {}
      }
    }
  }, [affiliates, submittedApp]);


  // Notifications & Copy state
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [copiedNotice, setCopiedNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Share Dialog state
  const [shareModalData, setShareModalData] = useState<ShareModalData | null>(null);
  const [shareTab, setShareTab] = useState<'link' | 'tiktok' | 'instagram' | 'whatsapp' | 'facebook'>('link');

  // Payout / Withdrawal Form state
  const [payoutBank, setPayoutBank] = useState('BCA');
  const [payoutAccountNum, setPayoutAccountNum] = useState('');
  const [payoutAccountName, setPayoutAccountName] = useState(submittedApp?.fullName || currentUser?.fullName || '');
  const [payoutAmount, setPayoutAmount] = useState<number>(0);
  const [payoutError, setPayoutError] = useState<string | null>(null);
  const [payoutList, setPayoutList] = useState<AffiliatePayoutRequest[]>(getPayoutRequests);

  // Dashboard Filters & Navigation Tabs
  const [campaignFilter, setCampaignFilter] = useState<string>('ALL');
  const [minCommissionFilter, setMinCommissionFilter] = useState<number>(0);
  const [productSearch, setProductSearch] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'catalog' | 'performance' | 'orders' | 'payouts' | 'profile'>('catalog');

  const standardCommissionRate = storeConfig?.defaultAffiliateCommissionRate ?? 15;
  const currentReferralCode = submittedApp?.referralCode || 'TS-PARTNER';
  const domain = typeof window !== 'undefined' ? window.location.origin : '';

  // Active campaigns
  const activeCampaigns = useMemo(() => {
    return campaigns.filter(c => {
      if (c.status === 'PAUSED' || c.status === 'ENDED' || c.status === 'DRAFT') return false;
      return isCampaignActiveAt(c, new Date());
    });
  }, [campaigns]);

  // Max commission rate in store
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
      if (campaignFilter === 'CAMPAIGN_ONLY') {
        if (item.effectiveCommission.appliedType !== 'campaign') return false;
      } else if (campaignFilter === 'CUSTOM_ONLY') {
        if (item.effectiveCommission.appliedType !== 'product_custom') return false;
      } else if (campaignFilter !== 'ALL') {
        if (item.effectiveCommission.campaign?.id !== campaignFilter) return false;
      }

      if (minCommissionFilter > 0 && item.effectiveCommission.ratePercent < minCommissionFilter) {
        return false;
      }

      if (productSearch.trim()) {
        const query = productSearch.toLowerCase().trim();
        const matchesName = item.product.name.toLowerCase().includes(query);
        const matchesSku = item.product.sku.toLowerCase().includes(query);
        if (!matchesName && !matchesSku) return false;
      }

      return true;
    });
  }, [productsWithCommissions, campaignFilter, minCommissionFilter, productSearch]);

  // Real operational performance metrics (Strictly genuine data, no dummy figures)
  const metrics = useMemo(() => {
    if (!submittedApp?.referralCode) {
      return {
        referralCode: '',
        validClicksCount: 0,
        attributedOrdersCount: 0,
        validOrdersCount: 0,
        totalSalesVolume: 0,
        pendingCommission: 0,
        approvedCommission: 0,
        paidCommission: 0,
        totalCommission: 0,
        pendingPayoutRequestsAmount: 0,
        processedPayoutsAmount: 0,
        availableBalanceForPayout: 0
      };
    }
    return getAffiliatePerformanceMetrics(submittedApp.referralCode, orders, undefined, payoutList);
  }, [submittedApp, orders, payoutList]);

  // Real attributed orders for this affiliate only (Privacy isolation per Requirement 4)
  const referralOrders = useMemo(() => {
    if (!submittedApp?.referralCode) return [];
    const clean = submittedApp.referralCode.toUpperCase();
    return orders.filter(
      o => o.referralCode?.toUpperCase() === clean || 
           o.affiliateCommission?.referralCode?.toUpperCase() === clean
    );
  }, [orders, submittedApp]);

  // Filtered payouts for this affiliate
  const affiliatePayouts = useMemo(() => {
    if (!submittedApp?.referralCode) return [];
    const clean = submittedApp.referralCode.toUpperCase();
    return payoutList.filter(p => p.referralCode?.toUpperCase() === clean);
  }, [payoutList, submittedApp]);

  // Copy helper
  const copyToClipboard = (link: string, label: string) => {
    navigator.clipboard.writeText(link).then(() => {
      setCopiedLink(link);
      setCopiedNotice(label);
      setTimeout(() => {
        setCopiedLink(null);
        setCopiedNotice(null);
      }, 3000);
    }).catch(() => {
      // Fallback
      setCopiedNotice(label);
      setTimeout(() => setCopiedNotice(null), 3000);
    });
  };

  // Device Native Share (with automatic fallback to custom modal)
  const handleDeviceShare = (data: ShareModalData) => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({
        title: `${data.productName || data.title} — Tumpang Shop`,
        text: `Belanja hemat produk pilihan berkualitas: ${data.productName || data.title} hanya di Tumpang Shop!`,
        url: data.url
      }).catch((err) => {
        // Canceled or not supported on this platform: open modal fallback
        if (err.name !== 'AbortError') {
          setShareModalData(data);
          setShareTab('link');
        }
      });
    } else {
      setShareModalData(data);
      setShareTab('link');
    }
  };

  // Open Promotional Text & Content Generator Modal
  const handleOpenPromoModal = (data: ShareModalData, initialTab: 'link' | 'tiktok' | 'instagram' | 'whatsapp' | 'facebook' = 'link') => {
    setShareModalData(data);
    setShareTab(initialTab);
  };

  // Direct WhatsApp share
  const handleShareToWhatsApp = (productName: string, price: number | undefined, url: string) => {
    const text = `Halo! Yuk cek produk pilihan berkualitas di Tumpang Shop: *${productName}*${price ? ` (Rp ${price.toLocaleString('id-ID')})` : ''}.\nPesan langsung di sini:\n${url}`;
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  // Affiliate Login handler (Strict Authentication: Password Required)
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    const query = loginInput.trim().toUpperCase();
    const pass = loginPassword.trim();

    if (!query) {
      setLoginError('Mohon masukkan Kode Referral, Nomor WhatsApp, atau Email Anda.');
      return;
    }

    if (!pass) {
      setLoginError('Kata sandi wajib diisi untuk masuk ke dashboard.');
      return;
    }

    try {
      const res = await fetch('/api/affiliates/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginInput: query, password: pass })
      });
      const data = await res.json();

      if (res.ok && data.success && data.affiliate) {
        if (data.token) {
          setStoredAffiliateToken(data.token);
        }
        setSubmittedApp(data.affiliate);
        try {
          localStorage.setItem('tumpang_shop_active_affiliate_profile', JSON.stringify(data.affiliate));
        } catch {}
        setActiveTab('catalog');
        setLoginError(null);
        setSuccessToast(`Selamat datang kembali, ${data.affiliate.fullName}!`);
        setTimeout(() => setSuccessToast(null), 3500);
      } else {
        setLoginError(data.error || 'Kata sandi salah atau akun mitra tidak ditemukan.');
      }
    } catch (err: any) {
      setLoginError('Terjadi gangguan jaringan saat menghubungi server autentikasi.');
    }
  };

  // Registration handler (Strict scrypt Password Setup via Backend)
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !phone.trim() || !email.trim()) {
      setErrorMsg('Mohon lengkapi Nama Lengkap, Nomor WhatsApp, dan Email Anda.');
      return;
    }

    if (!registerPassword || registerPassword.length < 6) {
      setErrorMsg('Kata sandi minimal harus 6 karakter untuk keamanan akun mitra.');
      return;
    }

    if (registerPassword !== registerConfirmPassword) {
      setErrorMsg('Konfirmasi kata sandi tidak cocok. Harap periksa kembali.');
      return;
    }

    try {
      const res = await fetch('/api/affiliates/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: fullName.trim(),
          phone: phone.trim(),
          email: email.trim(),
          password: registerPassword,
          promotionChannel,
          notes: notes.trim() || undefined
        })
      });
      const data = await res.json();

      if (res.ok && data.success && data.affiliate) {
        if (data.token) {
          setStoredAffiliateToken(data.token);
        }
        onSubmitApplication(data.affiliate);
        setSubmittedApp(data.affiliate);
        try {
          localStorage.setItem('tumpang_shop_active_affiliate_profile', JSON.stringify(data.affiliate));
        } catch {}
        setActiveTab('catalog');
        setErrorMsg(null);
        setSuccessToast(`Selamat bergabung, ${data.affiliate.fullName}! ID Referral Anda: ${data.affiliate.referralCode}`);
        setTimeout(() => setSuccessToast(null), 4000);
      } else {
        setErrorMsg(data.error || 'Gagal mendaftarkan mitra affiliate.');
      }
    } catch (err: any) {
      setErrorMsg('Terjadi gangguan jaringan saat mendaftarkan akun.');
    }
  };

  // Affiliate Logout / Switch account handler
  const handleLogoutAffiliate = () => {
    clearStoredAffiliateToken();
    setSubmittedApp(null);
    try {
      localStorage.removeItem('tumpang_shop_active_affiliate_profile');
    } catch {}
    setSuccessToast('Anda telah keluar dari akun affiliate.');
    setTimeout(() => setSuccessToast(null), 3000);
  };

  // Payout request submission (Backend authorizes session and recalculates genuine balance)
  const handlePayoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submittedApp) return;

    const token = getStoredAffiliateToken();
    if (!token) {
      setPayoutError('Sesi login affiliate tidak ditemukan. Silakan login kembali.');
      return;
    }

    if (!payoutAccountNum.trim() || !payoutAccountName.trim()) {
      setPayoutError('Mohon lengkapi Nomor Rekening dan Nama Pemilik Rekening.');
      return;
    }

    if (payoutAmount < 50000) {
      setPayoutError('Minimal pencairan dana komisi adalah Rp 50.000.');
      return;
    }

    if (payoutAmount > metrics.availableBalanceForPayout) {
      setPayoutError(`Saldo komisi disetujui yang dapat dicairkan hanya Rp ${metrics.availableBalanceForPayout.toLocaleString('id-ID')}.`);
      return;
    }

    try {
      const res = await fetch('/api/affiliates/payouts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          referralCode: submittedApp.referralCode,
          amount: payoutAmount,
          bankName: payoutBank,
          accountNumber: payoutAccountNum.trim(),
          accountName: payoutAccountName.trim()
        })
      });
      const data = await res.json();

      if (res.ok && data.success && data.payout) {
        setPayoutList(prev => [data.payout, ...prev]);
        savePayoutRequest(data.payout); // local mirror
        setPayoutAmount(0);
        setPayoutAccountNum('');
        setPayoutError(null);
        setSuccessToast(`Pengajuan pencairan dana Rp ${data.payout.amount.toLocaleString('id-ID')} berhasil dikirim ke Admin!`);
        setTimeout(() => setSuccessToast(null), 4000);
      } else {
        setPayoutError(data.error || 'Gagal mengajukan pencairan komisi.');
      }
    } catch (err: any) {
      setPayoutError('Terjadi gangguan jaringan saat mengajukan pencairan komisi.');
    }
  };


  const storeAffiliateLink = `${domain}/?ref=${currentReferralCode}`;

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
            <span className="text-slate-900 font-semibold">Affiliate Hub & Promosi</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
              Komisi Standar {standardCommissionRate}%
            </span>
            {maxCommissionRate > standardCommissionRate && (
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-orange-100 text-[#FE8A00] border border-orange-200">
                Campaign s/d {maxCommissionRate}%
              </span>
            )}
            {submittedApp && (
              <button
                onClick={handleLogoutAffiliate}
                className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200 transition-colors flex items-center gap-1"
                title="Keluar dari akun mitra ini"
              >
                <LogOut className="w-3 h-3" />
                <span className="hidden sm:inline">Keluar Akun</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Hero Section */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-850 to-slate-900 text-white rounded-3xl p-6 sm:p-8 border border-slate-800 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-[#FE8A00]/15 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-3xl space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-[#FE8A00] text-white shadow-md">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Program Kemitraan Affiliate Tumpang Shop</span>
              </span>
              {submittedApp && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Mitra Terdaftar: {submittedApp.fullName}</span>
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white leading-tight">
              Promosikan Produk & Hasilkan Komisi Nyata Tanpa Batas
            </h1>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Setiap tautan yang Anda bagikan mengatribusi pelanggan selama <strong>30 hari penuh</strong>. Pelanggan dapat berbelanja dan langsung checkout tanpa wajib memasukkan kode voucher rumit. Komisi dihitung otomatis dan tersimpan persisten di sistem database.
            </p>

            {submittedApp ? (
              <div className="pt-2 flex flex-wrap items-center gap-3">
                <div className="bg-white/10 backdrop-blur-md px-3.5 py-2 rounded-xl border border-white/20 text-xs">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">ID Referral Anda</span>
                  <span className="font-mono font-bold text-orange-400 text-sm sm:text-base">{submittedApp.referralCode}</span>
                </div>

                <button
                  onClick={() => handleDeviceShare({
                    title: `${storeConfig.storeName} — Belanja Online Mudah`,
                    url: storeAffiliateLink,
                    productName: 'Toko Utama Tumpang Shop'
                  })}
                  className="px-4 py-2.5 bg-white/10 hover:bg-white/20 border border-white/25 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-2"
                >
                  <Share2 className="w-3.5 h-3.5 text-orange-400" />
                  <span>Bagikan Toko</span>
                </button>

                <button
                  onClick={() => copyToClipboard(storeAffiliateLink, `Tautan Toko Utama (${submittedApp.referralCode})`)}
                  className="px-4 py-2.5 bg-[#FE8A00] hover:bg-[#e07b00] text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-2"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Salin Tautan Toko</span>
                </button>
              </div>
            ) : (
              <div className="pt-2 flex flex-wrap items-center gap-3">
                <button
                  onClick={() => {
                    setAuthView('login');
                    setActiveTab('profile');
                  }}
                  className="px-4 py-2.5 bg-[#FE8A00] hover:bg-[#e07b00] text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-2"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Masuk Dashboard Mitra</span>
                </button>
                <button
                  onClick={() => {
                    setAuthView('register');
                    setActiveTab('profile');
                  }}
                  className="px-4 py-2.5 bg-white/10 hover:bg-white/20 border border-white/25 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-2"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>Daftar Menjadi Affiliate Baru</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Global Toast for Link Copy */}
        {copiedNotice && (
          <div className="p-4 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-2xl text-xs flex items-center justify-between shadow-sm animate-fade-in">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <span className="font-bold block">Tautan Promosi Berhasil Disalin!</span>
                <span className="text-slate-600">{copiedNotice}</span>
              </div>
            </div>
            {copiedLink && (
              <span className="font-mono text-[11px] bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-lg max-w-[200px] truncate hidden sm:inline">
                {copiedLink}
              </span>
            )}
          </div>
        )}

        {/* Success Toast */}
        {successToast && (
          <div className="p-4 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-2xl text-xs flex items-center gap-2.5 shadow-sm">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="font-bold">{successToast}</span>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('catalog')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'catalog'
                ? 'bg-orange-50 text-[#FE8A00] border border-orange-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Tag className="w-4 h-4" />
            <span>Katalog & Bagikan Produk ({products.length})</span>
          </button>

          {submittedApp && (
            <>
              <button
                onClick={() => setActiveTab('performance')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                  activeTab === 'performance'
                    ? 'bg-orange-50 text-[#FE8A00] border border-orange-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <TrendingUp className="w-4 h-4" />
                <span>Kinerja & Pendapatan</span>
              </button>

              <button
                onClick={() => setActiveTab('orders')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                  activeTab === 'orders'
                    ? 'bg-orange-50 text-[#FE8A00] border border-orange-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <ShoppingBag className="w-4 h-4" />
                <span>Pesanan Teratribusi ({referralOrders.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('payouts')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                  activeTab === 'payouts'
                    ? 'bg-orange-50 text-[#FE8A00] border border-orange-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Wallet className="w-4 h-4" />
                <span>Pencairan Dana</span>
              </button>
            </>
          )}

          <button
            onClick={() => setActiveTab('profile')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'profile'
                ? 'bg-orange-50 text-[#FE8A00] border border-orange-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>{submittedApp ? 'Profil Kemitraan' : 'Masuk / Daftar Mitra'}</span>
          </button>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* TAB 1: PRODUCT CATALOG WITH 4 ACTIONS (TAHAP 3.2 & 3.3)            */}
        {/* ------------------------------------------------------------------ */}
        {activeTab === 'catalog' && (
          <div className="space-y-8">
            
            {/* Active Campaigns */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div>
                  <h2 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
                    <Flame className="w-5 h-5 text-[#FE8A00]" />
                    <span>Affiliate Campaign Prioritas</span>
                  </h2>
                  <p className="text-xs text-slate-500">
                    Campaign berdurasi terbatas dengan persentase komisi lebih tinggi
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
                    Seluruh produk berlaku dengan <strong>Komisi Standar {standardCommissionRate}%</strong> atau Komisi Khusus Produk.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {activeCampaigns.map(camp => {
                    const campaignLink = `${domain}/?ref=${currentReferralCode}&utm_campaign=${camp.id}`;
                    return (
                      <div key={camp.id} className="bg-white rounded-2xl border border-orange-200 p-4 space-y-3 shadow-xs">
                        <div className="flex justify-between items-start gap-2">
                          <div>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-orange-100 text-[#FE8A00] uppercase">
                              Campaign Spesial
                            </span>
                            <h3 className="font-bold text-slate-900 text-sm mt-1">{camp.name}</h3>
                          </div>
                          <span className="text-lg font-black text-[#FE8A00]">{camp.commissionRate}%</span>
                        </div>
                        <p className="text-xs text-slate-500 line-clamp-2">{camp.description || 'Campaign promosi produk unggulan.'}</p>
                        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                          <button
                            onClick={() => handleDeviceShare({
                              title: `Campaign Promo: ${camp.name}`,
                              url: campaignLink,
                              productName: camp.name,
                              commissionRate: camp.commissionRate
                            })}
                            className="py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                            <span>Bagikan</span>
                          </button>
                          <button
                            onClick={() => copyToClipboard(campaignLink, `Campaign "${camp.name}" (${camp.commissionRate}%)`)}
                            className="py-2 bg-orange-50 hover:bg-[#FE8A00] text-[#FE8A00] hover:text-white border border-orange-200 hover:border-transparent font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            <span>Salin Tautan</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Product Catalog Showcase with 4 Distinct Action Buttons */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-base sm:text-lg font-black text-slate-900">
                    Katalog Produk Promosi
                  </h2>
                  <p className="text-xs text-slate-500">
                    Pilih produk, buat materi promosi, salin tautan unik, atau langsung bagikan ke WhatsApp & media sosial
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                  <div className="relative flex-1 md:w-56">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      placeholder="Cari produk..."
                      className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:border-[#FE8A00]"
                    />
                  </div>

                  <select
                    value={campaignFilter}
                    onChange={(e) => setCampaignFilter(e.target.value)}
                    className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:border-[#FE8A00] text-slate-700 font-medium"
                  >
                    <option value="ALL">Semua Produk</option>
                    <option value="CAMPAIGN_ONLY">Khusus Campaign</option>
                    <option value="CUSTOM_ONLY">Komisi Khusus Produk</option>
                    {activeCampaigns.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.commissionRate}%)</option>
                    ))}
                  </select>

                  <select
                    value={minCommissionFilter}
                    onChange={(e) => setMinCommissionFilter(Number(e.target.value))}
                    className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:border-[#FE8A00] text-slate-700 font-medium"
                  >
                    <option value={0}>Semua %</option>
                    <option value={15}>Min 15%</option>
                    <option value={20}>Min 20%</option>
                    <option value={25}>Min 25%</option>
                  </select>
                </div>
              </div>

              {filteredProducts.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400 space-y-2">
                  <p className="font-semibold text-slate-600">Tidak ada produk yang sesuai dengan filter.</p>
                  <p>Coba reset kata kunci pencarian atau filter Anda.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredProducts.map(({ product, effectiveCommission, commissionAmount }) => {
                    const slug = getProductSlug(product);
                    const productLink = `${domain}/products/${slug}?ref=${currentReferralCode}`;
                    const isCampaign = effectiveCommission.appliedType === 'campaign';
                    const isCustom = effectiveCommission.appliedType === 'product_custom';

                    const sharePayload: ShareModalData = {
                      title: product.name,
                      url: productLink,
                      productName: product.name,
                      price: product.price,
                      unit: product.unit,
                      commissionRate: effectiveCommission.ratePercent
                    };

                    return (
                      <div 
                        key={product.id}
                        className={`p-4 rounded-2xl border transition-all flex flex-col justify-between space-y-3.5 ${
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
                              className="w-16 h-16 rounded-xl object-cover border border-slate-200 bg-slate-50 shrink-0"
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

                            <div className="text-[10px] text-slate-400 pt-0.5 border-t border-slate-200 truncate">
                              {effectiveCommission.sourceLabel}
                            </div>
                          </div>
                        </div>

                        {/* 4 DISTINCT ACTIONS (Per Requirement: Buat Link Promosi, Salin Link, Bagikan, Bagikan ke WhatsApp) */}
                        <div className="space-y-1.5 pt-2 border-t border-slate-100">
                          {/* Row 1: Buat Link Promosi & Bagikan ke WhatsApp */}
                          <div className="grid grid-cols-2 gap-1.5">
                            <button
                              onClick={() => handleOpenPromoModal(sharePayload, 'tiktok')}
                              className="py-2 px-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold text-[11px] rounded-xl transition-all flex items-center justify-center gap-1 shadow-xs active:scale-98"
                              title="Buat Teks Promosi Siap Pakai untuk Media Sosial"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>Buat Promosi</span>
                            </button>

                            <button
                              onClick={() => handleShareToWhatsApp(product.name, product.price, productLink)}
                              className="py-2 px-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] rounded-xl transition-all flex items-center justify-center gap-1 shadow-xs active:scale-98"
                              title="Bagikan Teks & Tautan Langsung ke WhatsApp"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                              <span>Ke WhatsApp</span>
                            </button>
                          </div>

                          {/* Row 2: Salin Link & Bagikan (Device Native Share) */}
                          <div className="grid grid-cols-2 gap-1.5">
                            <button
                              onClick={() => copyToClipboard(productLink, `Produk "${product.name}"`)}
                              className="py-2 px-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[11px] rounded-xl transition-all flex items-center justify-center gap-1 active:scale-98"
                              title="Salin Tautan Produk"
                            >
                              <Copy className="w-3.5 h-3.5 text-slate-600" />
                              <span>Salin Link</span>
                            </button>

                            <button
                              onClick={() => handleDeviceShare(sharePayload)}
                              className="py-2 px-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[11px] rounded-xl transition-all flex items-center justify-center gap-1 active:scale-98"
                              title="Bagikan Lewat Fitur Berbagi Perangkat"
                            >
                              <Share2 className="w-3.5 h-3.5 text-slate-600" />
                              <span>Bagikan</span>
                            </button>
                          </div>
                        </div>

                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* TAB 2: OPERATIONAL PERFORMANCE & REAL METRICS (REQUIREMENT 3 & 4)   */}
        {/* ------------------------------------------------------------------ */}
        {submittedApp && activeTab === 'performance' && (
          <div className="space-y-6">
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-6">
              <div>
                <h2 className="text-base sm:text-lg font-black text-slate-900">
                  Ringkasan Kinerja & Pendapatan Mitra ({submittedApp.referralCode})
                </h2>
                <p className="text-xs text-slate-500">
                  Data real-time dihitung deterministik dari pesanan dan klik tervalidasi milik akun Anda.
                </p>
              </div>

              {/* Real Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-1">
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <MousePointerClick className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-bold uppercase">Klik Valid</span>
                  </div>
                  <span className="text-2xl font-black text-slate-900">{metrics.validClicksCount}</span>
                  <span className="text-[10px] text-slate-400 block">Kunjungan terlacak</span>
                </div>

                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-1">
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <ShoppingBag className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-bold uppercase">Pesanan</span>
                  </div>
                  <span className="text-2xl font-black text-slate-900">{metrics.attributedOrdersCount}</span>
                  <span className="text-[10px] text-slate-400 block">{metrics.validOrdersCount} pesanan valid/lunas</span>
                </div>

                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-1">
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-bold uppercase">Total Penjualan</span>
                  </div>
                  <span className="text-lg sm:text-xl font-black text-slate-900 font-mono">
                    Rp {metrics.totalSalesVolume.toLocaleString('id-ID')}
                  </span>
                  <span className="text-[10px] text-slate-400 block">GMV teratribusi</span>
                </div>

                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-1">
                  <div className="flex items-center gap-1.5 text-amber-700">
                    <Clock className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-bold uppercase">Komisi Pending</span>
                  </div>
                  <span className="text-lg sm:text-xl font-black text-amber-700 font-mono">
                    Rp {metrics.pendingCommission.toLocaleString('id-ID')}
                  </span>
                  <span className="text-[10px] text-slate-400 block">Menunggu verifikasi pembayaran</span>
                </div>

                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-1">
                  <div className="flex items-center gap-1.5 text-emerald-700">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-bold uppercase">Komisi Disetujui</span>
                  </div>
                  <span className="text-lg sm:text-xl font-black text-emerald-700 font-mono">
                    Rp {metrics.approvedCommission.toLocaleString('id-ID')}
                  </span>
                  <span className="text-[10px] text-slate-400 block">Terverifikasi pembayaran</span>
                </div>

                <div className="bg-orange-50/50 p-4 rounded-2xl border border-orange-200 space-y-1">
                  <div className="flex items-center gap-1.5 text-[#FE8A00]">
                    <Wallet className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-bold uppercase">Siap Dicairkan</span>
                  </div>
                  <span className="text-lg sm:text-xl font-black text-[#FE8A00] font-mono">
                    Rp {metrics.availableBalanceForPayout.toLocaleString('id-ID')}
                  </span>
                  <span className="text-[10px] text-slate-500 block">Dapat diajukan penarikan</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* TAB 3: ATTRIBUTED ORDERS (ISOLATED TO ACTIVE AFFILIATE ONLY)       */}
        {/* ------------------------------------------------------------------ */}
        {submittedApp && activeTab === 'orders' && (
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900">
                Daftar Pesanan Teratribusi ({referralOrders.length})
              </h2>
              <p className="text-xs text-slate-500">
                Pesanan yang berasal dari tautan promosi Anda (ID: {submittedApp.referralCode}).
              </p>
            </div>

            {referralOrders.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400 space-y-2">
                <ShoppingBag className="w-10 h-10 mx-auto text-slate-300" />
                <p className="font-semibold text-slate-600">Belum ada pesanan dari tautan promosi Anda.</p>
                <p>Mulai bagikan produk ke status WhatsApp, TikTok, atau Instagram untuk mendapatkan pesanan pertama!</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 font-bold bg-slate-50/50">
                      <th className="p-3">No. Pesanan</th>
                      <th className="p-3">Tanggal</th>
                      <th className="p-3">Total Belanja</th>
                      <th className="p-3">Status Pembayaran</th>
                      <th className="p-3">Estimasi Komisi</th>
                      <th className="p-3">Status Komisi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {referralOrders.map(ord => {
                      const comm = ord.affiliateCommission;
                      const commAmount = comm?.totalCommission || 0;
                      const isPaid = ord.paymentStatus === 'PAID';
                      return (
                        <tr key={ord.id} className="hover:bg-slate-50/50">
                          <td className="p-3 font-mono font-bold text-slate-900">{ord.orderNumber}</td>
                          <td className="p-3 text-slate-500">{new Date(ord.createdAt).toLocaleDateString('id-ID')}</td>
                          <td className="p-3 font-mono text-slate-900 font-bold">Rp {ord.total.toLocaleString('id-ID')}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              isPaid ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                            }`}>
                              {ord.paymentStatus}
                            </span>
                          </td>
                          <td className="p-3 font-mono text-emerald-700 font-bold">
                            Rp {commAmount.toLocaleString('id-ID')}
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              comm?.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                            }`}>
                              {comm?.status || (isPaid ? 'APPROVED' : 'PENDING')}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* TAB 4: PAYOUTS / PENCAIRAN DANA                                    */}
        {/* ------------------------------------------------------------------ */}
        {submittedApp && activeTab === 'payouts' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Wallet className="w-5 h-5 text-[#FE8A00]" />
                <span>Ajukan Pencairan Saldo</span>
              </h3>
              <p className="text-xs text-slate-500">
                Saldo siap ditarik: <strong className="text-emerald-700 font-mono text-sm">Rp {metrics.availableBalanceForPayout.toLocaleString('id-ID')}</strong> (Min. Rp 50.000)
              </p>

              {payoutError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{payoutError}</span>
                </div>
              )}

              <form onSubmit={handlePayoutSubmit} className="space-y-3 text-xs">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Bank / E-Wallet Tujuan</label>
                  <select
                    value={payoutBank}
                    onChange={(e) => setPayoutBank(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:border-[#FE8A00] focus:outline-hidden text-xs bg-slate-50/50"
                  >
                    <option value="BCA">BCA (Bank Central Asia)</option>
                    <option value="BRI">BRI (Bank Rakyat Indonesia)</option>
                    <option value="BNI">BNI (Bank Negara Indonesia)</option>
                    <option value="Mandiri">Bank Mandiri</option>
                    <option value="GoPay">GoPay</option>
                    <option value="OVO">OVO</option>
                    <option value="DANA">DANA</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Nomor Rekening / HP Akun *</label>
                  <input
                    type="text"
                    required
                    value={payoutAccountNum}
                    onChange={(e) => setPayoutAccountNum(e.target.value)}
                    placeholder="Contoh: 1234567890"
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:border-[#FE8A00] focus:outline-hidden text-xs"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Nama Pemilik Rekening *</label>
                  <input
                    type="text"
                    required
                    value={payoutAccountName}
                    onChange={(e) => setPayoutAccountName(e.target.value)}
                    placeholder="Nama sesuai buku tabungan"
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:border-[#FE8A00] focus:outline-hidden text-xs"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Nominal Penarikan (Rp) *</label>
                  <input
                    type="number"
                    required
                    min={50000}
                    step={10000}
                    value={payoutAmount || ''}
                    onChange={(e) => setPayoutAmount(Number(e.target.value))}
                    placeholder="Minimal Rp 50.000"
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:border-[#FE8A00] focus:outline-hidden text-xs font-mono font-bold"
                  />
                </div>

                <button
                  type="submit"
                  disabled={metrics.availableBalanceForPayout < 50000}
                  className="w-full py-3 bg-[#FE8A00] hover:bg-[#e07b00] disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  <span>Kirim Permintaan Pencairan</span>
                </button>
              </form>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
              <h3 className="text-base font-black text-slate-900">Riwayat Penarikan Dana</h3>
              {affiliatePayouts.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400">
                  Belum ada riwayat penarikan dana untuk akun ini.
                </div>
              ) : (
                <div className="space-y-2">
                  {affiliatePayouts.map(p => (
                    <div key={p.id} className="p-3 rounded-xl border border-slate-200 flex justify-between items-center text-xs">
                      <div>
                        <div className="font-mono font-bold text-slate-900">Rp {p.amount.toLocaleString('id-ID')}</div>
                        <div className="text-[10px] text-slate-500">{p.bankName} - {p.accountNumber} ({p.accountName})</div>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        p.status === 'PROCESSED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {p.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* TAB 5: AFFILIATE PROFILE OR REGISTRATION / LOGIN                   */}
        {/* ------------------------------------------------------------------ */}
        {activeTab === 'profile' && (
          <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs max-w-2xl mx-auto space-y-6">
            {submittedApp ? (
              <div className="space-y-6">
                <div className="flex justify-between items-start gap-4 border-b border-slate-100 pb-4">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                      Mitra Terverifikasi & Aktif
                    </span>
                    <h2 className="text-lg font-black text-slate-900 mt-1">Profil Kemitraan Anda</h2>
                  </div>
                  <button
                    onClick={handleLogoutAffiliate}
                    className="px-3 py-1.5 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-xl transition-colors flex items-center gap-1.5"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Ganti Akun / Keluar</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Nama Lengkap</span>
                    <span className="font-bold text-slate-900 text-sm">{submittedApp.fullName}</span>
                  </div>
                  <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">ID Referral Unik</span>
                    <span className="font-mono font-black text-[#FE8A00] text-base">{submittedApp.referralCode}</span>
                  </div>
                  <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Kontak WhatsApp</span>
                    <span className="font-mono text-slate-800">{submittedApp.phone}</span>
                  </div>
                  <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Email Terdaftar</span>
                    <span className="text-slate-800 truncate block">{submittedApp.email}</span>
                  </div>
                </div>

                <button
                  onClick={() => setActiveTab('catalog')}
                  className="w-full py-3 bg-[#FE8A00] hover:bg-[#e07b00] text-white font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-2"
                >
                  <Tag className="w-4 h-4" />
                  <span>Buka Katalog & Mulai Bagikan Produk</span>
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Auth Mode Toggle: Login vs Register */}
                <div className="flex p-1 bg-slate-100 rounded-2xl border border-slate-200">
                  <button
                    onClick={() => {
                      setAuthView('login');
                      setLoginError(null);
                      setErrorMsg(null);
                    }}
                    className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${
                      authView === 'login'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <LogIn className="w-3.5 h-3.5 text-[#FE8A00]" />
                    <span>Masuk Mitra Terdaftar</span>
                  </button>
                  <button
                    onClick={() => {
                      setAuthView('register');
                      setLoginError(null);
                      setErrorMsg(null);
                    }}
                    className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${
                      authView === 'register'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[#FE8A00]" />
                    <span>Daftar Mitra Baru</span>
                  </button>
                </div>

                {/* LOGIN FORM FOR APPROVED AFFILIATES (TAHAP 3.1) */}
                {authView === 'login' ? (
                  <form onSubmit={handleLoginSubmit} className="space-y-4 text-xs">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">Masuk ke Dashboard Affiliate Anda</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Masukkan ID Referral unik Anda (contoh: <strong>TS-PARTNER</strong>), Nomor WhatsApp, atau Email terdaftar untuk membuka dashboard.
                      </p>
                    </div>

                    {loginError && (
                      <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{loginError}</span>
                      </div>
                    )}

                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">
                        ID Referral, Nomor WhatsApp, atau Email *
                      </label>
                      <input
                        type="text"
                        required
                        value={loginInput}
                        onChange={(e) => setLoginInput(e.target.value)}
                        placeholder="Contoh: TS-PARTNER atau 081234567890"
                        className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:border-[#FE8A00] focus:outline-hidden bg-slate-50/50 focus:bg-white text-xs font-medium"
                      />
                    </div>

                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">
                        Kata Sandi Akun Mitra *
                      </label>
                      <div className="relative">
                        <input
                          type={showLoginPassword ? 'text' : 'password'}
                          required
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          placeholder="Masukkan kata sandi akun mitra"
                          className="w-full px-3.5 py-2.5 pr-10 border border-slate-200 rounded-xl focus:border-[#FE8A00] focus:outline-hidden bg-slate-50/50 focus:bg-white text-xs font-medium"
                        />
                        <button
                          type="button"
                          onClick={() => setShowLoginPassword(!showLoginPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full py-3 bg-[#FE8A00] hover:bg-[#e07b00] text-white font-bold rounded-xl shadow-md transition-all text-xs flex items-center justify-center gap-2"
                    >
                      <LogIn className="w-4 h-4" />
                      <span>Masuk ke Dashboard Mitra</span>
                    </button>

                    <p className="text-center text-[11px] text-slate-400">
                      Belum memiliki akun affiliate?{' '}
                      <button
                        type="button"
                        onClick={() => setAuthView('register')}
                        className="text-[#FE8A00] font-bold hover:underline"
                      >
                        Daftar Gratis Sekarang
                      </button>
                    </p>
                  </form>
                ) : (
                  /* REGISTRATION FORM */
                  <form onSubmit={handleRegisterSubmit} className="space-y-4 text-xs">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">Daftar Menjadi Mitra Affiliate Baru</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Dapatkan ID Referral unik instan dan mulai dapatkan komisi 15% dari setiap pesanan yang teratribusi.
                      </p>
                    </div>

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

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="font-semibold text-slate-700 block mb-1">Kata Sandi Akun (min. 6 karakter) *</label>
                        <div className="relative">
                          <input
                            type={showRegisterPassword ? 'text' : 'password'}
                            required
                            minLength={6}
                            value={registerPassword}
                            onChange={(e) => setRegisterPassword(e.target.value)}
                            placeholder="Minimal 6 karakter"
                            className="w-full px-3.5 py-2.5 pr-10 border border-slate-200 rounded-xl focus:border-[#FE8A00] focus:outline-hidden bg-slate-50/50 focus:bg-white text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => setShowRegisterPassword(!showRegisterPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          >
                            {showRegisterPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="font-semibold text-slate-700 block mb-1">Konfirmasi Kata Sandi *</label>
                        <input
                          type={showRegisterPassword ? 'text' : 'password'}
                          required
                          minLength={6}
                          value={registerConfirmPassword}
                          onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                          placeholder="Ketik ulang kata sandi"
                          className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:border-[#FE8A00] focus:outline-hidden bg-slate-50/50 focus:bg-white text-xs"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">Kanal Promosi Utama</label>
                      <select
                        value={promotionChannel}
                        onChange={(e) => setPromotionChannel(e.target.value)}
                        className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:border-[#FE8A00] focus:outline-hidden bg-slate-50/50 focus:bg-white text-xs"
                      >
                        <option value="Status WhatsApp & Grup">Status WhatsApp & Grup Komunitas</option>
                        <option value="TikTok & Video Pendek">TikTok Video, Bio & Live</option>
                        <option value="Instagram / Threads">Instagram Reels, Story & Bio</option>
                        <option value="Facebook">Facebook Grup Jual Beli / Feed</option>
                        <option value="Langsung / Mulut ke Mulut">Promosi Langsung ke Kerabat</option>
                      </select>
                    </div>

                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">Catatan Tambahan (Opsional)</label>
                      <textarea
                        rows={2}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Tuliskan produk atau rencana promosi yang ingin Anda fokuskan..."
                        className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:border-[#FE8A00] focus:outline-hidden bg-slate-50/50 focus:bg-white text-xs"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full py-3 bg-[#FE8A00] hover:bg-[#e07b00] text-white font-bold rounded-xl shadow-md transition-all text-xs flex items-center justify-center gap-2"
                    >
                      <span>Daftar Sekarang & Dapatkan ID Referral</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        )}

      </div>

      {/* ------------------------------------------------------------------ */}
      {/* PROMOTIONAL CONTENT & LINK GENERATOR MODAL (TAHAP 3.2 - 3.4)       */}
      {/* ------------------------------------------------------------------ */}
      {shareModalData && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl relative border border-slate-100 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#FE8A00]" />
                <h3 className="font-bold text-slate-900 text-sm">Buat Link & Teks Promosi</h3>
              </div>
              <button
                onClick={() => setShareModalData(null)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Target Product Summary */}
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between gap-3 text-xs">
              <div className="min-w-0">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Produk Promosi</span>
                <h4 className="font-bold text-slate-800 truncate">{shareModalData.productName || shareModalData.title}</h4>
                {shareModalData.price && (
                  <p className="text-xs font-black text-[#FE8A00]">
                    Rp {shareModalData.price.toLocaleString('id-ID')}
                    {shareModalData.unit && <span className="text-[10px] text-slate-400 font-normal"> / {shareModalData.unit}</span>}
                  </p>
                )}
              </div>
              <div className="text-right shrink-0">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Komisi Anda</span>
                <span className="text-xs font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  {shareModalData.commissionRate || standardCommissionRate}%
                </span>
              </div>
            </div>

            {/* Platform Tabs */}
            <div className="flex gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto text-[11px] font-bold">
              <button
                onClick={() => setShareTab('link')}
                className={`px-3 py-1.5 rounded-lg transition-all whitespace-nowrap ${
                  shareTab === 'link' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tautan Saja
              </button>
              <button
                onClick={() => setShareTab('whatsapp')}
                className={`px-3 py-1.5 rounded-lg transition-all whitespace-nowrap ${
                  shareTab === 'whatsapp' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                WhatsApp
              </button>
              <button
                onClick={() => setShareTab('tiktok')}
                className={`px-3 py-1.5 rounded-lg transition-all whitespace-nowrap ${
                  shareTab === 'tiktok' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                TikTok
              </button>
              <button
                onClick={() => setShareTab('instagram')}
                className={`px-3 py-1.5 rounded-lg transition-all whitespace-nowrap ${
                  shareTab === 'instagram' ? 'bg-white text-pink-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Instagram
              </button>
              <button
                onClick={() => setShareTab('facebook')}
                className={`px-3 py-1.5 rounded-lg transition-all whitespace-nowrap ${
                  shareTab === 'facebook' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Facebook
              </button>
            </div>

            {/* Content Preview & Copy Area */}
            {(() => {
              const pName = shareModalData.productName || shareModalData.title;
              const pPrice = shareModalData.price ? `Rp ${shareModalData.price.toLocaleString('id-ID')}` : '';
              const link = shareModalData.url;

              const captions = {
                link: link,
                tiktok: `🔥 Rekomendasi belanja hemat & berkualitas di Tumpang Shop!\nProduk pilihan: ${pName}${pPrice ? ` (hanya ${pPrice})` : ''}.\nKualitas terjamin dengan kemudahan pemesanan cepat.\n👉 Cek dan beli langsung lewat link di bio sekarang:\n${link}`,
                instagram: `Mau belanja praktis dan terpercaya? Yuk cek ${pName} di Tumpang Shop!${pPrice ? ` Harga spesial ${pPrice}.` : ''}\n✨ Klik link di bio untuk order langsung:\n${link}`,
                whatsapp: `Halo! Saya merekomendasikan produk pilihan berkualitas di Tumpang Shop: *${pName}*${pPrice ? ` (${pPrice})` : ''}.\nBisa langsung diorder lewat tautan resmi ini ya:\n${link}`,
                facebook: `Halo semuanya! Bagi yang sedang mencari ${pName}, sekarang bisa beli langsung di Tumpang Shop dengan harga terbaik ${pPrice}.\n🛒 Pesan langsung di sini (tanpa ribet):\n${link}`
              };

              const currentText = captions[shareTab];

              return (
                <div className="space-y-3">
                  <div className="relative">
                    <textarea
                      readOnly
                      rows={5}
                      value={currentText}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 leading-relaxed focus:outline-hidden"
                    />
                  </div>

                  {/* Actions for this platform */}
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      onClick={() => copyToClipboard(currentText, `Teks promosi untuk ${shareTab.toUpperCase()} berhasil disalin!`)}
                      className="flex-1 py-2.5 bg-[#FE8A00] hover:bg-[#e07b00] text-white font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm active:scale-98"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Salin Teks Promosi</span>
                    </button>

                    {shareTab === 'whatsapp' && (
                      <button
                        onClick={() => {
                          const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(currentText)}`;
                          window.open(waUrl, '_blank', 'noopener,noreferrer');
                        }}
                        className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm active:scale-98"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>Buka WhatsApp</span>
                      </button>
                    )}

                    {shareTab === 'facebook' && (
                      <button
                        onClick={() => {
                          const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`;
                          window.open(fbUrl, '_blank', 'noopener,noreferrer');
                        }}
                        className="py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm active:scale-98"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Buka Facebook</span>
                      </button>
                    )}
                  </div>

                  {/* Mandatory Disclosure Note per instructions */}
                  <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-900 leading-relaxed">
                    <strong>Catatan:</strong> Salin teks promosi di atas untuk diunggah ke akun media sosial Anda. Unggah otomatis memerlukan integrasi API resmi masing-masing platform.
                  </div>
                </div>
              );
            })()}

          </div>
        </div>
      )}

    </div>
  );
}
