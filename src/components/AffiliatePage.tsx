import React, { useState } from 'react';
import { StoreConfig, UserProfile, AffiliateApplication } from '../types';
import { 
  ArrowLeft, Users, DollarSign, Share2, Sparkles, CheckCircle2, 
  Copy, ShieldCheck, TrendingUp, ChevronRight, Store, ArrowRight, 
  HelpCircle, AlertCircle 
} from 'lucide-react';

interface AffiliatePageProps {
  storeConfig: StoreConfig;
  currentUser: UserProfile | null;
  onBack: () => void;
  onSubmitApplication: (app: AffiliateApplication) => void;
  existingApplication?: AffiliateApplication | null;
}

export default function AffiliatePage({
  storeConfig,
  currentUser,
  onBack,
  onSubmitApplication,
  existingApplication
}: AffiliatePageProps) {
  const [fullName, setFullName] = useState(currentUser?.fullName || '');
  const [phone, setPhone] = useState(currentUser?.phone || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [promotionChannel, setPromotionChannel] = useState('Status WhatsApp & Grup');
  const [notes, setNotes] = useState('');
  const [isSuccess, setIsSuccess] = useState(Boolean(existingApplication));
  const [submittedApp, setSubmittedApp] = useState<AffiliateApplication | null>(existingApplication || null);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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

  const handleCopyLink = () => {
    if (!submittedApp) return;
    const link = `https://tumpangshop.id/?ref=${submittedApp.referralCode}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

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

          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-orange-100 text-[#FE8A00] border border-orange-200">
            Komisi hingga 10%
          </span>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-10">
        {/* Hero Section */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-850 to-slate-900 text-white rounded-3xl p-6 sm:p-10 border border-slate-800 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-[#FE8A00]/15 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-2xl space-y-4">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-[#FE8A00] text-white shadow-md">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Program Kemitraan Tumpang Shop</span>
            </span>

            <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white leading-tight">
              Dapatkan Komisi dengan Mempromosikan Produk Tumpang Shop
            </h1>

            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              Bantu petani dan pelaku usaha UMKM lokal Kecamatan Tumpang menjangkau lebih banyak pembeli, sambil memperoleh penghasilan tambahan dari setiap pesanan yang berhasil.
            </p>
          </div>
        </div>

        {/* Benefits Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-2">
            <div className="w-10 h-10 rounded-xl bg-orange-50 text-[#FE8A00] flex items-center justify-center font-bold">
              <DollarSign className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Komisi Menguntungkan</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Dapatkan komisi 5% hingga 10% untuk setiap transaksi produk lokal yang selesai dari tautan Anda.
            </p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-2">
            <div className="w-10 h-10 rounded-xl bg-orange-50 text-[#FE8A00] flex items-center justify-center font-bold">
              <Share2 className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Mudah Dibagikan</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Bagikan link referral ke status WhatsApp, Instagram, grup arisan, atau tetangga tanpa repot stok barang.
            </p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-2">
            <div className="w-10 h-10 rounded-xl bg-orange-50 text-[#FE8A00] flex items-center justify-center font-bold">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Produk Asli & Diminati</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Kebutuhan pokok harian (beras, sayur lereng Bromo, kopi Dampit) yang selalu dibeli berulang kali.
            </p>
          </div>
        </div>

        {/* Registration Form OR Success Card */}
        {isSuccess && submittedApp ? (
          <div className="bg-white rounded-3xl border border-emerald-200 p-6 sm:p-8 shadow-md space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Pendaftaran Berhasil</span>
                <h2 className="text-lg sm:text-xl font-black text-slate-900">Selamat Bergabung di Affiliate Tumpang Shop!</h2>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              Akun affiliate Anda telah aktif. Gunakan kode atau tautan referral unik di bawah ini untuk mulai mempromosikan produk:
            </p>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Kode Referral Anda
                </span>
                <span className="text-lg font-black text-[#FE8A00] tracking-wide">
                  {submittedApp.referralCode}
                </span>
              </div>

              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Tautan Promosi Anda
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={`https://tumpangshop.id/?ref=${submittedApp.referralCode}`}
                    className="flex-1 px-3 py-2 text-xs sm:text-sm bg-white border border-slate-300 rounded-xl font-mono text-slate-800"
                  />
                  <button
                    onClick={handleCopyLink}
                    className="px-4 py-2 bg-[#FE8A00] hover:bg-[#e57c00] text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-95 shrink-0"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copied ? 'Tersalin!' : 'Salin Link'}</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-3">
              <button
                onClick={onBack}
                className="flex-1 py-3 bg-[#FE8A00] hover:bg-[#e57c00] text-white font-bold rounded-2xl text-xs sm:text-sm transition-colors text-center"
              >
                Mulai Bagikan Produk Sekarang
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-xs space-y-6">
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold text-slate-900">
                Formulir Pendaftaran Affiliate
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Isi data di bawah ini untuk mendapatkan tautan referral resmi Tumpang Shop
              </p>
            </div>

            {errorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Nama Lengkap *
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Contoh: Siti Rahma"
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:border-[#FE8A00] focus:outline-hidden bg-slate-50/50 focus:bg-white transition-all text-xs sm:text-sm"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Nomor WhatsApp / HP *
                  </label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Contoh: 081234567890"
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:border-[#FE8A00] focus:outline-hidden bg-slate-50/50 focus:bg-white transition-all text-xs sm:text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Alamat Email Aktif *
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@email.com"
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:border-[#FE8A00] focus:outline-hidden bg-slate-50/50 focus:bg-white transition-all text-xs sm:text-sm"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Kanal / Rencana Promosi Utama
                </label>
                <select
                  value={promotionChannel}
                  onChange={(e) => setPromotionChannel(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:border-[#FE8A00] focus:outline-hidden bg-slate-50/50 focus:bg-white transition-all text-xs sm:text-sm"
                >
                  <option value="Status WhatsApp & Grup">Status WhatsApp & Grup Komunitas / Keluarga</option>
                  <option value="Instagram / Threads">Instagram & Threads</option>
                  <option value="TikTok">TikTok & Video Pendek</option>
                  <option value="Facebook">Grup Facebook Jual Beli Malang / Tumpang</option>
                  <option value="Langsung / Mulut ke Mulut">Promosi Langsung ke Tetangga & Kerabat</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Catatan Tambahan (Opsional)
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Tuliskan pengalaman atau produk yang paling ingin Anda promosikan..."
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:border-[#FE8A00] focus:outline-hidden bg-slate-50/50 focus:bg-white transition-all text-xs sm:text-sm"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-3.5 bg-[#FE8A00] hover:bg-[#e57c00] text-white font-bold rounded-2xl shadow-md shadow-orange-500/20 active:scale-[0.99] transition-all text-xs sm:text-sm flex items-center justify-center gap-2"
                >
                  <span>Daftar Sekarang Jadi Partner Affiliate</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
