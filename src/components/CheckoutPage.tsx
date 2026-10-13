import React, { useState } from 'react';
import { CartItem, Order, StoreConfig, Product, AffiliateCampaign, AffiliateApplication } from '../types';
import { INDONESIA_PROVINCES, DISTRICTS } from '../data/mockData';
import { PAYMENT_GATEWAY_CONFIG, createOfficialPaymentLink, checkoutOrderViaBackend } from '../lib/paymentGateway';
import { calculateOrderAffiliateCommission } from '../lib/commissionCalculator';
import { getActiveAffiliateAttribution } from '../lib/affiliateAttribution';
import { 
  ArrowLeft, AlertTriangle, ShieldCheck, Plane, 
  CreditCard, ArrowRight, CheckCircle2, Lock, 
  MapPin, User, Phone, Mail, Clock, Info, CheckSquare, Square
} from 'lucide-react';

interface CheckoutPageProps {
  items: CartItem[];
  storeConfig: StoreConfig;
  products?: Product[];
  campaigns?: AffiliateCampaign[];
  affiliates?: AffiliateApplication[];
  existingOrders?: Order[];
  activeReferralCode?: string;
  onBackToCart: () => void;
  onOrderCreated: (order: Order, paymentLinkUrl?: string) => void;
}

export default function CheckoutPage({
  items,
  storeConfig,
  products = [],
  campaigns = [],
  affiliates = [],
  existingOrders = [],
  activeReferralCode = '',
  onBackToCart,
  onOrderCreated
}: CheckoutPageProps) {
  // Recipient form state
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerProvince, setCustomerProvince] = useState(INDONESIA_PROVINCES[0] || 'Jawa Timur');
  const [customerCity, setCustomerCity] = useState('Kabupaten Malang');
  const [customerDistrict, setCustomerDistrict] = useState(DISTRICTS[0] || 'Kecamatan Tumpang');
  const [customerPostalCode, setCustomerPostalCode] = useState('65156');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [isDataReviewed, setIsDataReviewed] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Subtotal and air delivery calculation
  const subtotal = items.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);
  const airFreightFee = storeConfig.airFreightDeliveryFee ?? storeConfig.defaultDeliveryFee;
  const shippingCost = airFreightFee;
  const serviceFee = storeConfig.serviceFee || 0;
  const discountAmount = 0; // Valid discount if promotional voucher active
  const total = subtotal + shippingCost + serviceFee - discountAmount;

  // Configurable estimated days (defaults to 14 calendar days)
  const estimatedDays = storeConfig.airFreightEstimatedDays ?? 14;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!customerName.trim()) {
      setErrorMsg('Mohon masukkan Nama Lengkap Penerima.');
      return;
    }
    if (!customerPhone.trim()) {
      setErrorMsg('Mohon masukkan Nomor WhatsApp / HP aktif penerima.');
      return;
    }
    if (!customerProvince.trim() || !customerCity.trim() || !customerDistrict.trim()) {
      setErrorMsg('Mohon lengkapi Provinsi, Kota/Kabupaten, dan Kecamatan pengiriman.');
      return;
    }
    if (!customerPostalCode.trim()) {
      setErrorMsg('Mohon masukkan Kode Pos wilayah pengiriman.');
      return;
    }
    if (!deliveryAddress.trim() || deliveryAddress.trim().length < 8) {
      setErrorMsg('Mohon isi Alamat Lengkap Pengiriman (nama jalan, nomor rumah, RT/RW, atau patokan).');
      return;
    }
    if (!isDataReviewed) {
      setErrorMsg('Mohon beri centang konfirmasi bahwa Anda telah memeriksa kebenaran alamat dan data penerima.');
      return;
    }

    if (items.length === 0) {
      setErrorMsg('Belum ada produk yang dipilih untuk checkout.');
      return;
    }

    // Strictly validate live stock for all selected products
    for (const item of items) {
      const liveProduct = products.find(p => p.id === item.product.id);
      if (liveProduct) {
        let availableStock = liveProduct.stock;
        if (item.selectedOption) {
          const opt = liveProduct.variations?.[0]?.options.find(o => o.id === item.selectedOption?.id);
          if (opt) availableStock = opt.stock;
        }
        if (availableStock < item.quantity) {
          setErrorMsg(`Stok "${item.product.name}" tidak mencukupi (Tersedia: ${availableStock}, Diminta: ${item.quantity}). Mohon kembali ke keranjang untuk menyesuaikan.`);
          return;
        }
      }
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    const now = new Date();
    const orderNumber = `TS-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${Math.floor(100 + Math.random() * 900)}`;

    // Automatic TikTok-style affiliate attribution lookup in background
    // Customer does not have to enter any referral codes
    const attribution = getActiveAffiliateAttribution(affiliates);
    const finalReferralCode = attribution?.referralCode || (activeReferralCode ? activeReferralCode.trim().toUpperCase() : '');
    let affiliateSnapshot = undefined;

    if (finalReferralCode) {
      const matchedAffiliate = affiliates.find(
        a => (a.referralCode?.toUpperCase() === finalReferralCode || a.id?.toUpperCase() === finalReferralCode) &&
             a.status === 'APPROVED'
      );
      if (matchedAffiliate) {
        const canonicalCode = matchedAffiliate.referralCode;
        const itemsForCommission = items.map(item => ({
          productId: item.product.id,
          name: item.product.name,
          sku: item.selectedOption?.sku || item.product.sku,
          price: item.unitPrice,
          quantity: item.quantity,
          subtotal: item.unitPrice * item.quantity
        }));

        affiliateSnapshot = calculateOrderAffiliateCommission(
          itemsForCommission,
          canonicalCode,
          storeConfig,
          products,
          campaigns,
          { id: matchedAffiliate.id, fullName: matchedAffiliate.fullName },
          existingOrders
        );
      }
    }

    try {
      const checkoutResult = await checkoutOrderViaBackend({
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerEmail: customerEmail.trim() || undefined,
        deliveryAddress: deliveryAddress.trim(),
        customerProvince: customerProvince.trim(),
        customerCity: customerCity.trim(),
        customerDistrict: customerDistrict.trim(),
        customerPostalCode: customerPostalCode.trim(),
        deliveryNotes: deliveryNotes.trim() || undefined,
        items: items.map(item => ({
          productId: item.product.id,
          selectedOptionId: item.selectedOption?.id,
          quantity: item.quantity
        })),
        referralCode: finalReferralCode || undefined,
        affiliateCommission: affiliateSnapshot || undefined,
        clientCatalogProducts: products,
        storeConfig
      });

      const finalOrder = checkoutResult.order;
      if (affiliateSnapshot) {
        finalOrder.affiliateCommission = affiliateSnapshot;
      }

      setIsSubmitting(false);
      onOrderCreated(finalOrder, checkoutResult.paymentLinkUrl);
    } catch (err: any) {
      console.error('Error in checkoutOrderViaBackend:', err);
      setErrorMsg(err?.message || 'Gagal memproses kalkulasi pesanan di server.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-6 sm:py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        
        {/* Top Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBackToCart}
              className="w-10 h-10 rounded-2xl bg-white border border-slate-200 text-slate-700 hover:text-[#FE8A00] hover:border-orange-300 flex items-center justify-center transition-all shadow-2xs"
              title="Kembali ke Keranjang"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <span>Checkout & Pengiriman Udara</span>
              </h1>
              <p className="text-xs text-slate-500">
                Pemesanan barang impor diproses langsung dari pemasok dan dikirim via kargo udara
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-200">
              <Lock className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden sm:inline">Enkripsi Aman & Guest Checkout</span>
              <span className="sm:hidden">Aman</span>
            </div>
          </div>
        </div>

        {/* Guest checkout transparency banner */}
        <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4 flex items-start gap-3 text-xs text-amber-900">
          <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-bold text-amber-950">Kemudahan Belanja Fleksibel:</span>
            <p className="text-amber-800 leading-relaxed">
              Anda tidak wajib login atau memiliki akun untuk menyelesaikan pesanan. Detail pesanan dan tautan pelacakan pengiriman akan langsung diberikan begitu pesanan selesai dibuat.
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs sm:text-sm text-rose-700 flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          
          {/* Left Column: Form & Shipping */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* Section 1: Destination and Contact Form */}
            <div className="bg-white rounded-3xl border border-slate-200/80 p-5 sm:p-6 shadow-2xs space-y-5">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <span className="w-6 h-6 rounded-full bg-orange-100 text-[#FE8A00] font-black text-xs flex items-center justify-center">1</span>
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-slate-900">
                    Alamat Tujuan & Kontak Penerima
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Pastikan nama dan nomor WhatsApp aktif untuk koordinasi serah terima kargo
                  </p>
                </div>
              </div>

              {/* Name & Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">
                    Nama Lengkap Penerima <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Contoh: Budi Santoso"
                      className="w-full pl-10 pr-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:border-[#FE8A00] focus:ring-1 focus:ring-[#FE8A00] focus:outline-hidden text-slate-900"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">
                    Nomor WhatsApp / HP Aktif <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      required
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="Contoh: 081234567890"
                      className="w-full pl-10 pr-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:border-[#FE8A00] focus:ring-1 focus:ring-[#FE8A00] focus:outline-hidden text-slate-900"
                    />
                  </div>
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  Alamat Email (Opsional, untuk e-invoice & bukti tagihan)
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    placeholder="budi@example.com"
                    className="w-full pl-10 pr-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:border-[#FE8A00] focus:ring-1 focus:ring-[#FE8A00] focus:outline-hidden text-slate-900"
                  />
                </div>
              </div>

              {/* Province & City */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">
                    Provinsi Tujuan <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={customerProvince}
                    onChange={(e) => setCustomerProvince(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:border-[#FE8A00] focus:ring-1 focus:ring-[#FE8A00] focus:outline-hidden bg-white text-slate-900"
                  >
                    {INDONESIA_PROVINCES.map((prov) => (
                      <option key={prov} value={prov}>{prov}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">
                    Kota / Kabupaten Tujuan <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={customerCity}
                    onChange={(e) => setCustomerCity(e.target.value)}
                    placeholder="Contoh: Kabupaten Malang / Kota Surabaya"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:border-[#FE8A00] focus:ring-1 focus:ring-[#FE8A00] focus:outline-hidden text-slate-900"
                  />
                </div>
              </div>

              {/* District & Postal Code */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">
                    Kecamatan <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={customerDistrict}
                    onChange={(e) => setCustomerDistrict(e.target.value)}
                    placeholder="Contoh: Kecamatan Tumpang"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:border-[#FE8A00] focus:ring-1 focus:ring-[#FE8A00] focus:outline-hidden text-slate-900"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">
                    Kode Pos <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={customerPostalCode}
                    onChange={(e) => setCustomerPostalCode(e.target.value)}
                    placeholder="Contoh: 65156"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:border-[#FE8A00] focus:ring-1 focus:ring-[#FE8A00] focus:outline-hidden text-slate-900"
                  />
                </div>
              </div>

              {/* Detailed Address */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  Alamat Lengkap Pengiriman <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Nama jalan, RT/RW, nomor gedung/rumah, kelurahan/desa, patokan lokasi..."
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:border-[#FE8A00] focus:ring-1 focus:ring-[#FE8A00] focus:outline-hidden text-slate-900"
                />
              </div>

              {/* Delivery Notes */}
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">
                  Catatan untuk Pengirim / Kurir (Opsional)
                </label>
                <input
                  type="text"
                  value={deliveryNotes}
                  onChange={(e) => setDeliveryNotes(e.target.value)}
                  placeholder="Contoh: Titipkan di pos satpam, hubungi sebelum antar"
                  className="w-full px-3.5 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl focus:border-[#FE8A00] focus:outline-hidden text-slate-900"
                />
              </div>
            </div>

            {/* Section 2: Single Shipping Method: Pengiriman Reguler via Udara */}
            <div className="bg-white rounded-3xl border border-slate-200/80 p-5 sm:p-6 shadow-2xs space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <span className="w-6 h-6 rounded-full bg-orange-100 text-[#FE8A00] font-black text-xs flex items-center justify-center">2</span>
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-slate-900">
                    Metode Pengiriman
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Satu metode pengiriman resmi khusus produk impor berbasis pesanan
                  </p>
                </div>
              </div>

              {/* Active Single Shipping Card */}
              <div className="p-4 sm:p-5 rounded-2xl border-2 border-orange-500 bg-orange-50/30 relative">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-orange-100 text-[#FE8A00] flex items-center justify-center shrink-0 mt-0.5">
                      <Plane className="w-5 h-5" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-black text-slate-900">
                          Pengiriman Reguler via Udara
                        </h3>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-orange-100 text-[#FE8A00]">
                          Metode Aktif
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                        <Clock className="w-3.5 h-3.5 text-[#FE8A00]" />
                        <span>Estimasi: Sekitar {estimatedDays} hari kalender</span>
                      </div>
                      
                      <p className="text-[11px] text-slate-500">
                        Dihitung setelah pembayaran diverifikasi dan pesanan dikonfirmasi untuk diproses oleh pemasok.
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-xs text-slate-400 font-medium">Tarif Tetap</div>
                    <div className="text-sm sm:text-base font-black text-slate-900">
                      Rp {shippingCost.toLocaleString('id-ID')}
                    </div>
                  </div>
                </div>

                {/* Transparency and Logistics Disclaimer Box */}
                <div className="mt-4 pt-3.5 border-t border-orange-200/70 bg-white/70 p-3 rounded-xl text-[11px] text-slate-600 space-y-1.5 leading-relaxed">
                  <div className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-amber-600" />
                    <span>Transparansi Estimasi Logistik Impor & Kargo Udara:</span>
                  </div>
                  <p>
                    Estimasi <strong>sekitar {estimatedDays} hari kalender</strong> merupakan perkiraan waktu operasional pengiriman udara. Waktu tiba aktual dapat berubah tergantung pada:
                  </p>
                  <ul className="list-disc list-inside space-y-0.5 text-slate-500 pl-1">
                    <li>Kesiapan stok dan pemrosesan dari gudang pemasok luar negeri.</li>
                    <li>Prosedur pemeriksaan kepabeanan & bea cukai Republik Indonesia.</li>
                    <li>Jadwal penerbangan kargo udara internasional dan cuaca logistik.</li>
                  </ul>
                  <p className="text-[10px] text-amber-800 italic pt-1">
                    * Catatan: Tumpang Shop tidak menjanjikan tanggal kedatangan pasti sebelum barang lolos inspeksi kargo dan nomor resi AWB aktif diterbitkan.
                  </p>
                </div>
              </div>
            </div>

            {/* Section 3: Data Inspection & Confirmation Step */}
            <div className="bg-white rounded-3xl border border-slate-200/80 p-5 sm:p-6 shadow-2xs space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <span className="w-6 h-6 rounded-full bg-orange-100 text-[#FE8A00] font-black text-xs flex items-center justify-center">3</span>
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-slate-900">
                    Periksa & Konfirmasi Data Penerima
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Verifikasi alamat Anda sebelum pesanan dikirimkan ke pemasok
                  </p>
                </div>
              </div>

              {/* Summary Card for Verification */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 text-xs space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-700">
                  <div>
                    <span className="text-slate-400 block text-[10px] font-bold uppercase">Penerima</span>
                    <span className="font-bold text-slate-900">{customerName || '(Belum diisi)'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] font-bold uppercase">No. WhatsApp / HP</span>
                    <span className="font-mono font-bold text-slate-900">{customerPhone || '(Belum diisi)'}</span>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-slate-400 block text-[10px] font-bold uppercase">Wilayah Pengantaran</span>
                    <span className="text-slate-800">
                      {customerDistrict}, {customerCity}, {customerProvince} {customerPostalCode}
                    </span>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-slate-400 block text-[10px] font-bold uppercase">Alamat Lengkap</span>
                    <span className="text-slate-800 font-medium">
                      {deliveryAddress || '(Alamat jalan belum diisi)'}
                    </span>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-200">
                  <label className="flex items-start gap-2.5 cursor-pointer text-xs font-semibold text-slate-800">
                    <input
                      type="checkbox"
                      checked={isDataReviewed}
                      onChange={(e) => setIsDataReviewed(e.target.checked)}
                      className="w-4 h-4 mt-0.5 text-[#FE8A00] rounded focus:ring-[#FE8A00] border-slate-300"
                    />
                    <span>
                      Saya menyatakan bahwa alamat tujuan pengiriman dan data penerima di atas telah diperiksa dengan benar dan siap menerima pengiriman reguler via udara.
                    </span>
                  </label>
                </div>
              </div>
            </div>

            {/* Official Gateway Info */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/70 flex items-start gap-3">
              <CreditCard className="w-5 h-5 text-[#FE8A00] shrink-0 mt-0.5" />
              <div className="text-xs text-slate-600 space-y-1">
                <p className="font-bold text-slate-800">
                  Sistem Pembayaran Terverifikasi Resmi
                </p>
                <p className="leading-relaxed">
                  Setelah pesanan dibuat, sistem membuat nomor pesanan dengan status <strong>Menunggu Pembayaran (Pending)</strong>. Pesanan baru akan diteruskan ke pemasok untuk konfirmasi setelah pembayaran berhasil diverifikasi gateway.
                </p>
              </div>
            </div>

          </div>

          {/* Right Summary Column */}
          <div className="lg:col-span-5 lg:sticky lg:top-24 space-y-4">
            <div className="bg-white rounded-3xl border border-slate-200/80 p-5 sm:p-6 shadow-2xs space-y-5">
              <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center justify-between">
                <span>Rincian Pembayaran</span>
                <span className="text-xs font-normal text-slate-400">({items.length} produk)</span>
              </h2>

              {/* Items scroll */}
              <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1 divide-y divide-slate-100">
                {items.map((it, idx) => (
                  <div key={idx} className="pt-2.5 first:pt-0 flex items-center justify-between text-xs text-slate-600">
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 overflow-hidden shrink-0 border border-slate-200/60">
                        <img 
                          src={it.product.images[0] || 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=100&auto=format&fit=crop&q=80'} 
                          alt={it.product.name}
                          className="w-full h-full object-cover" 
                        />
                      </div>
                      <div className="truncate">
                        <span className="font-bold text-slate-800 block truncate">{it.product.name}</span>
                        {it.selectedOption && (
                          <span className="text-[10px] text-[#FE8A00] block">Varian: {it.selectedOption.name}</span>
                        )}
                        <span className="text-[11px] text-slate-400">
                          {it.quantity} {it.product.unit} × Rp {it.unitPrice.toLocaleString('id-ID')}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0 font-bold text-slate-900">
                      Rp {(it.unitPrice * it.quantity).toLocaleString('id-ID')}
                    </div>
                  </div>
                ))}
              </div>

              {/* Transparent Cost Breakdown */}
              <div className="space-y-2.5 border-t border-slate-100 pt-3 text-xs sm:text-sm">
                <div className="flex items-center justify-between text-slate-600">
                  <span>Subtotal Produk</span>
                  <span className="font-bold text-slate-900">Rp {subtotal.toLocaleString('id-ID')}</span>
                </div>
                
                <div className="flex items-center justify-between text-slate-600">
                  <div>
                    <span>Pengiriman Reguler via Udara</span>
                    <span className="block text-[10px] text-slate-400">Estimasi ~{estimatedDays} hari kalender</span>
                  </div>
                  <span className="font-bold text-slate-900">Rp {shippingCost.toLocaleString('id-ID')}</span>
                </div>

                {serviceFee > 0 && (
                  <div className="flex items-center justify-between text-slate-600">
                    <span>Biaya Layanan & Pemeliharaan</span>
                    <span className="font-bold text-slate-900">Rp {serviceFee.toLocaleString('id-ID')}</span>
                  </div>
                )}

                {discountAmount > 0 && (
                  <div className="flex items-center justify-between text-emerald-700">
                    <span>Diskon / Potongan</span>
                    <span className="font-bold">- Rp {discountAmount.toLocaleString('id-ID')}</span>
                  </div>
                )}
              </div>

              {/* Grand Total */}
              <div className="border-t border-slate-100 pt-4 flex items-baseline justify-between">
                <div>
                  <div className="text-xs text-slate-500 font-medium">Total Akhir Pembayaran</div>
                  <div className="text-2xl font-black text-[#FE8A00] tracking-tight">
                    Rp {total.toLocaleString('id-ID')}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    * Total final transparan, tidak ada biaya tersembunyi
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || items.length === 0}
                className={`w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
                  isSubmitting || items.length === 0
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    : 'bg-[#FE8A00] hover:bg-[#e07b00] text-white shadow-lg shadow-orange-500/25 active:scale-[0.99]'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>Memproses Pesanan Kargo...</span>
                  </>
                ) : (
                  <>
                    <span>Buat Pesanan Sekarang</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Jaminan transaksi aman & data tersertifikasi</span>
              </div>
            </div>
          </div>

        </form>

      </div>
    </div>
  );
}
