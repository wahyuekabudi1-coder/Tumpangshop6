import React, { useState } from 'react';
import { CartItem, Order, StoreConfig, Product, AffiliateCampaign, AffiliateApplication } from '../types';
import { DISTRICTS } from '../data/mockData';
import { PAYMENT_GATEWAY_CONFIG, createOfficialPaymentLink } from '../lib/paymentGateway';
import { calculateOrderAffiliateCommission } from '../lib/commissionCalculator';
import { getActiveAffiliateAttribution } from '../lib/affiliateAttribution';
import { 
  ArrowLeft, AlertTriangle, ShieldCheck, Truck, Store, 
  CreditCard, ArrowRight, CheckCircle2, Lock, FileText, Info
} from 'lucide-react';

interface CheckoutPageProps {
  items: CartItem[];
  storeConfig: StoreConfig;
  products: Product[];
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
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [customerDistrict, setCustomerDistrict] = useState(DISTRICTS[0]);
  const [shippingMethod, setShippingMethod] = useState<'INSTANT' | 'REGULAR' | 'PICKUP'>('REGULAR');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const subtotal = items.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);
  const shippingCost = shippingMethod === 'PICKUP' 
    ? 0 
    : shippingMethod === 'INSTANT' 
    ? storeConfig.defaultDeliveryFee * 1.5 
    : storeConfig.defaultDeliveryFee;
  const serviceFee = storeConfig.serviceFee;
  const total = subtotal + shippingCost + serviceFee;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!customerName.trim() || !customerPhone.trim() || !deliveryAddress.trim()) {
      setErrorMsg('Mohon lengkapi Nama Penerima, Nomor WhatsApp, dan Alamat Lengkap Pengiriman.');
      return;
    }

    if (items.length === 0) {
      setErrorMsg('Belum ada produk yang dipilih untuk checkout.');
      return;
    }

    // Re-validate stock strictly for every item to prevent overselling
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

    // Automatic TikTok-style affiliate attribution lookup:
    // Resolves last-click attribution within the 30-day window
    const attribution = getActiveAffiliateAttribution(affiliates);
    const finalReferralCode = attribution?.referralCode || (activeReferralCode ? activeReferralCode.trim().toUpperCase() : '');
    let affiliateSnapshot = undefined;

    if (finalReferralCode) {
      const matchedAffiliate = affiliates.find(a => a.referralCode?.toUpperCase() === finalReferralCode);
      if (matchedAffiliate && matchedAffiliate.status === 'APPROVED') {
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
          finalReferralCode,
          storeConfig,
          products,
          campaigns,
          { id: matchedAffiliate.id, fullName: matchedAffiliate.fullName },
          existingOrders
        );
      }
    }

    const newOrder: Order = {
      id: `ord_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      orderNumber,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      customerEmail: customerEmail.trim() || undefined,
      deliveryAddress: deliveryAddress.trim(),
      customerDistrict,
      deliveryNotes: deliveryNotes.trim() || undefined,
      shippingMethod,
      shippingCost,
      items: items.map(item => ({
        productId: item.product.id,
        name: item.product.name,
        sku: item.selectedOption?.sku || item.product.sku,
        unit: item.product.unit,
        variationInfo: item.selectedOption ? `${item.selectedVariationName}: ${item.selectedOption.name}` : undefined,
        price: item.unitPrice,
        quantity: item.quantity,
        subtotal: item.unitPrice * item.quantity
      })),
      subtotal,
      serviceFee,
      total,
      referralCode: finalReferralCode || undefined,
      affiliateCommission: affiliateSnapshot,
      // Initial status MUST be PENDING per marketplace specifications
      paymentStatus: 'PENDING',
      orderStatus: 'NEW',
      paymentMethod: 'PAYMENT_GATEWAY_LINK',
      paymentGateway: PAYMENT_GATEWAY_CONFIG.gatewayName,
      paymentExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };

    try {
      // Connect to payment gateway provider
      const paymentResult = await createOfficialPaymentLink(newOrder);

      if (paymentResult.success && paymentResult.paymentLinkUrl) {
        newOrder.paymentLinkUrl = paymentResult.paymentLinkUrl;
        newOrder.paymentReference = paymentResult.referenceId;
      }

      setIsSubmitting(false);
      onOrderCreated(newOrder, paymentResult.paymentLinkUrl);
    } catch (err) {
      console.error('Error creating order/payment link:', err);
      setIsSubmitting(false);
      onOrderCreated(newOrder);
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
              className="w-9 h-9 rounded-xl bg-white border border-slate-200 text-slate-700 hover:text-[#FE8A00] hover:border-orange-300 flex items-center justify-center transition-all shadow-2xs"
              title="Kembali ke Keranjang"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Pengiriman & Checkout
              </h1>
              <p className="text-xs text-slate-500">
                Lengkapi alamat pengiriman dan konfirmasi pesanan resmi Anda
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-200">
            <Lock className="w-3.5 h-3.5 text-emerald-600" />
            <span>Enkripsi Aman</span>
          </div>
        </div>

        {errorMsg && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs sm:text-sm text-rose-700 flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          
          {/* Left Form: Customer Info & Shipping Option */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* Section 1: Customer Info */}
            <div className="bg-white rounded-3xl border border-slate-200/80 p-5 sm:p-6 shadow-2xs space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <span className="w-6 h-6 rounded-full bg-orange-100 text-[#FE8A00] font-bold text-xs flex items-center justify-center">1</span>
                <h2 className="text-sm sm:text-base font-bold text-slate-900">
                  Alamat & Kontak Penerima
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">
                    Nama Penerima *
                  </label>
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Contoh: Budi Santoso"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:border-[#FE8A00] focus:ring-1 focus:ring-[#FE8A00] focus:outline-hidden text-slate-900"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">
                    Nomor WhatsApp / HP *
                  </label>
                  <input
                    type="tel"
                    required
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="Contoh: 081234567890"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:border-[#FE8A00] focus:ring-1 focus:ring-[#FE8A00] focus:outline-hidden text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">
                    Email (Opsional untuk Bukti Tagihan)
                  </label>
                  <input
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    placeholder="budi@example.com"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:border-[#FE8A00] focus:ring-1 focus:ring-[#FE8A00] focus:outline-hidden text-slate-900"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">
                    Kecamatan Area Malang
                  </label>
                  <select
                    value={customerDistrict}
                    onChange={(e) => setCustomerDistrict(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:border-[#FE8A00] focus:ring-1 focus:ring-[#FE8A00] focus:outline-hidden bg-white text-slate-900"
                  >
                    {DISTRICTS.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  Alamat Lengkap Pengiriman *
                </label>
                <textarea
                  required
                  rows={2}
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Nama jalan, RT/RW, nomor rumah, patokan..."
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:border-[#FE8A00] focus:ring-1 focus:ring-[#FE8A00] focus:outline-hidden text-slate-900"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">
                  Catatan untuk Penjual / Kurir (Opsional)
                </label>
                <input
                  type="text"
                  value={deliveryNotes}
                  onChange={(e) => setDeliveryNotes(e.target.value)}
                  placeholder="Contoh: Titipkan satpam, jangan tekan bel rumah, bungkus rapat"
                  className="w-full px-3.5 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl focus:border-[#FE8A00] focus:outline-hidden text-slate-900"
                />
              </div>
            </div>

            {/* Section 2: Shipping Method */}
            <div className="bg-white rounded-3xl border border-slate-200/80 p-5 sm:p-6 shadow-2xs space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <span className="w-6 h-6 rounded-full bg-orange-100 text-[#FE8A00] font-bold text-xs flex items-center justify-center">2</span>
                <h2 className="text-sm sm:text-base font-bold text-slate-900">
                  Metode Pengiriman
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label
                  onClick={() => setShippingMethod('REGULAR')}
                  className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between ${
                    shippingMethod === 'REGULAR'
                      ? 'border-[#FE8A00] bg-orange-50/40 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Truck className={`w-4 h-4 ${shippingMethod === 'REGULAR' ? 'text-[#FE8A00]' : 'text-slate-500'}`} />
                    <span className="text-xs font-bold text-slate-900">Kurir Reguler</span>
                  </div>
                  <div className="text-[11px] text-slate-500">Estimasi 1-2 hari</div>
                  <div className="mt-2 text-xs font-black text-slate-900">
                    Rp {storeConfig.defaultDeliveryFee.toLocaleString('id-ID')}
                  </div>
                </label>

                <label
                  onClick={() => setShippingMethod('INSTANT')}
                  className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between ${
                    shippingMethod === 'INSTANT'
                      ? 'border-[#FE8A00] bg-orange-50/40 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Truck className={`w-4 h-4 ${shippingMethod === 'INSTANT' ? 'text-[#FE8A00]' : 'text-slate-500'}`} />
                    <span className="text-xs font-bold text-slate-900">Instan / Kilat</span>
                  </div>
                  <div className="text-[11px] text-slate-500">Sampai di hari yang sama</div>
                  <div className="mt-2 text-xs font-black text-slate-900">
                    Rp {(storeConfig.defaultDeliveryFee * 1.5).toLocaleString('id-ID')}
                  </div>
                </label>

                <label
                  onClick={() => setShippingMethod('PICKUP')}
                  className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between ${
                    shippingMethod === 'PICKUP'
                      ? 'border-[#FE8A00] bg-orange-50/40 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Store className={`w-4 h-4 ${shippingMethod === 'PICKUP' ? 'text-[#FE8A00]' : 'text-slate-500'}`} />
                    <span className="text-xs font-bold text-slate-900">Ambil di Toko</span>
                  </div>
                  <div className="text-[11px] text-slate-500">Outlet Tumpang Shop Malang</div>
                  <div className="mt-2 text-xs font-black text-emerald-600">
                    Gratis (Rp 0)
                  </div>
                </label>
              </div>
            </div>

            {/* Section 3: Official Payment Gateway Info */}
            <div className="bg-white rounded-3xl border border-slate-200/80 p-5 sm:p-6 shadow-2xs space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <span className="w-6 h-6 rounded-full bg-orange-100 text-[#FE8A00] font-bold text-xs flex items-center justify-center">3</span>
                <h2 className="text-sm sm:text-base font-bold text-slate-900">
                  Pembayaran via Official Payment Link
                </h2>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/60 flex items-start gap-3">
                <CreditCard className="w-5 h-5 text-[#FE8A00] shrink-0 mt-0.5" />
                <div className="text-xs text-slate-600 space-y-1">
                  <p className="font-bold text-slate-800">
                    Sistem Pembayaran Terintegrasi (QRIS, VA BCA/Mandiri/BRI, E-Wallet)
                  </p>
                  <p className="leading-relaxed">
                    Setelah pesanan dibuat, sistem membuat nomor pesanan dengan status pembayaran <strong>Pending</strong> dan menyediakan payment link resmi gateway. Status pesanan hanya akan diverifikasi menjadi <strong>Paid</strong> setelah notifikasi resmi gateway tervalidasi.
                  </p>
                </div>
              </div>
            </div>

          </div>

          {/* Right Summary Column */}
          <div className="lg:col-span-5 lg:sticky lg:top-24 space-y-4">
            <div className="bg-white rounded-3xl border border-slate-200/80 p-5 sm:p-6 shadow-2xs space-y-5">
              <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
                Rincian Pesanan ({items.length} produk)
              </h2>

              {/* Items scroll */}
              <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1 divide-y divide-slate-100">
                {items.map((it, idx) => (
                  <div key={idx} className="pt-2 first:pt-0 flex items-center justify-between text-xs text-slate-600">
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      <div className="w-10 h-10 rounded-lg bg-slate-100 overflow-hidden shrink-0 border border-slate-200/60">
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

              {/* Cost breakdown */}
              <div className="space-y-2.5 border-t border-slate-100 pt-3 text-xs sm:text-sm">
                <div className="flex items-center justify-between text-slate-600">
                  <span>Subtotal Produk</span>
                  <span className="font-bold text-slate-900">Rp {subtotal.toLocaleString('id-ID')}</span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span>Ongkos Kirim ({shippingMethod})</span>
                  <span className="font-bold text-slate-900">
                    {shippingCost === 0 ? 'Gratis' : `Rp ${shippingCost.toLocaleString('id-ID')}`}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span>Biaya Layanan & Pemeliharaan</span>
                  <span className="font-bold text-slate-900">Rp {serviceFee.toLocaleString('id-ID')}</span>
                </div>
              </div>

              {/* Grand Total */}
              <div className="border-t border-slate-100 pt-4 flex items-baseline justify-between">
                <div>
                  <div className="text-xs text-slate-500 font-medium">Total Pembayaran</div>
                  <div className="text-2xl font-black text-[#FE8A00] tracking-tight">
                    Rp {total.toLocaleString('id-ID')}
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
                    <span>Memproses Pesanan...</span>
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
                <span>Jaminan transaksi aman & stok terverifikasi</span>
              </div>
            </div>
          </div>

        </form>

      </div>
    </div>
  );
}
