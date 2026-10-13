import React, { useState } from 'react';
import { CartItem, Order, StoreConfig, Product } from '../types';
import { DISTRICTS } from '../data/mockData';
import { PAYMENT_GATEWAY_CONFIG, createOfficialPaymentLink, checkoutOrderViaBackend } from '../lib/paymentGateway';
import { getActiveAffiliateAttribution } from '../lib/affiliateAttribution';
import { calculateOrderAffiliateCommission } from '../lib/commissionCalculator';
import { 
  X, AlertTriangle, ShieldCheck, Truck, Store, 
  CreditCard, ArrowRight, ExternalLink, Info, CheckCircle2 
} from 'lucide-react';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  storeConfig: StoreConfig;
  products?: Product[];
  onOrderCreated: (order: Order, paymentLinkUrl?: string) => void;
}

export default function CheckoutModal({
  isOpen,
  onClose,
  items,
  storeConfig,
  products = [],
  onOrderCreated
}: CheckoutModalProps) {
  if (!isOpen) return null;

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [customerDistrict, setCustomerDistrict] = useState(DISTRICTS[0]);
  const [shippingMethod] = useState<'AIR_REGULAR'>('AIR_REGULAR');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const subtotal = items.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);
  const shippingCost = storeConfig.airFreightDeliveryFee ?? storeConfig.defaultDeliveryFee;
  const serviceFee = storeConfig.serviceFee;
  const total = subtotal + shippingCost + serviceFee;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !customerPhone.trim() || !deliveryAddress.trim()) {
      setErrorMsg('Mohon lengkapi Nama Penerima, Nomor WhatsApp, dan Alamat Lengkap.');
      return;
    }

    if (items.length === 0) {
      setErrorMsg('Keranjang kosong atau belum ada produk yang dipilih.');
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
          setErrorMsg(`Stok "${item.product.name}" tidak mencukupi (Tersedia: ${availableStock}, Diminta: ${item.quantity}). Mohon sesuaikan jumlah pesanan.`);
          return;
        }
      }
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    const now = new Date();
    const orderNumber = `TS-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${Math.floor(100 + Math.random() * 900)}`;

    const attribution = getActiveAffiliateAttribution();
    let affiliateSnapshot = undefined;

    if (attribution?.referralCode) {
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
        attribution.referralCode,
        storeConfig,
        products,
        [],
        { id: attribution.affiliateId, fullName: attribution.affiliateName }
      );
    }

    try {
      const checkoutResult = await checkoutOrderViaBackend({
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerEmail: customerEmail.trim() || undefined,
        deliveryAddress: deliveryAddress.trim(),
        customerProvince: 'Jawa Timur',
        customerCity: 'Kabupaten Malang',
        customerDistrict,
        customerPostalCode: '65156',
        deliveryNotes: deliveryNotes.trim() || undefined,
        items: items.map(item => ({
          productId: item.product.id,
          selectedOptionId: item.selectedOption?.id,
          quantity: item.quantity
        })),
        referralCode: attribution?.referralCode || undefined,
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
      setErrorMsg(err?.message || 'Gagal memproses pesanan dan perhitungan pembayaran di backend.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-2xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col relative max-h-[92vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 shrink-0">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900">Checkout & Pembuatan Pesanan</h2>
            <p className="text-xs text-slate-500">
              Lengkapi data pengiriman untuk membuat pesanan resmi (Status: Pending)
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors"
            aria-label="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Selected items overview */}
          <div className="bg-slate-50/80 rounded-2xl p-3.5 border border-slate-200/60">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Ringkasan Produk Dipilih ({items.length} jenis)
              </span>
              <span className="text-xs font-bold text-emerald-800">
                Rp {subtotal.toLocaleString('id-ID')}
              </span>
            </div>
            <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
              {items.map((it, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs text-slate-600 bg-white p-2 rounded-xl border border-slate-100">
                  <div className="truncate max-w-[240px] sm:max-w-xs">
                    <span className="font-semibold text-slate-800">{it.product.name}</span>
                    {it.selectedOption && (
                      <span className="text-[10px] text-emerald-700 ml-1">({it.selectedOption.name})</span>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <span>{it.quantity} {it.product.unit} × Rp {it.unitPrice.toLocaleString('id-ID')}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Customer Info */}
          <div className="space-y-3 pt-1">
            <h3 className="text-xs font-bold text-emerald-900 uppercase tracking-wider">
              1. Informasi Penerima
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Nama Penerima *
                </label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Contoh: Budi Santoso"
                  className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl focus:border-emerald-600 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Nomor WhatsApp / HP *
                </label>
                <input
                  type="tel"
                  required
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="Contoh: 081234567890"
                  className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl focus:border-emerald-600 focus:outline-hidden"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Email (Opsional untuk bukti invoice)
                </label>
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="budi@example.com"
                  className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl focus:border-emerald-600 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Kecamatan (Malang) *
                </label>
                <select
                  value={customerDistrict}
                  onChange={(e) => setCustomerDistrict(e.target.value)}
                  className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl focus:border-emerald-600 focus:outline-hidden bg-white"
                >
                  {DISTRICTS.map((dist) => (
                    <option key={dist} value={dist}>{dist}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Alamat Pengiriman Lengkap (RT/RW, Patokan Rumah) *
              </label>
              <textarea
                required
                rows={2}
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                placeholder="Jl. Raya Malangsuko No. 45, RT 03 RW 02, Tumpang..."
                className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl focus:border-emerald-600 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Catatan untuk Toko / Kurir (Opsional)
              </label>
              <input
                type="text"
                value={deliveryNotes}
                onChange={(e) => setDeliveryNotes(e.target.value)}
                placeholder="Titipkan di pos satpam atau tetangga jika sedang keluar"
                className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl focus:border-emerald-600 focus:outline-hidden"
              />
            </div>
          </div>

          {/* Shipping Method */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              2. Metode Pengiriman
            </h3>

            <div className="p-3 rounded-xl border-2 border-orange-500 bg-orange-50/40">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-black text-slate-900">Pengiriman Reguler via Udara</span>
                <span className="text-xs font-bold text-[#FE8A00]">
                  Rp {shippingCost.toLocaleString('id-ID')}
                </span>
              </div>
              <div className="text-[11px] text-slate-600 font-medium">
                Estimasi ~14 hari kalender setelah pembayaran terverifikasi & pesanan dikonfirmasi diproses.
              </div>
              <div className="text-[10px] text-slate-400 mt-1 italic">
                * Estimasi sementara operasional kargo udara dan bea cukai (bukan garansi tanggal pasti).
              </div>
            </div>
          </div>

          {/* Payment Gateway Status Notice (Strict Integrity) */}
          <div className="p-3.5 bg-blue-50/90 border border-blue-200/90 rounded-2xl">
            <div className="flex items-start gap-2.5">
              <CreditCard className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
              <div className="text-xs text-blue-950 leading-relaxed">
                <strong className="block font-bold text-blue-900 mb-0.5">
                  Alur Pembayaran Resmi (Payment Link & Webhook):
                </strong>
                Pesanan akan otomatis dibuat dengan status pembayaran <span className="font-bold bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded">PENDING</span>.
                {!PAYMENT_GATEWAY_CONFIG.isConfigured ? (
                  <p className="mt-1 text-slate-700">
                    <span className="font-semibold text-blue-900">Catatan Gateway:</span> API Payment Link gateway resmi belum dikonfigurasi pada server (.env). Pesanan akan tersimpan aman dengan ID resmi dan status Pending, dapat dilunasi via konfirmasi QRIS toko atau setelah backend webhook gateway aktif.
                  </p>
                ) : (
                  <p className="mt-1 text-slate-700">
                    Pelanggan akan diarahkan ke payment link resmi gateway ({PAYMENT_GATEWAY_CONFIG.gatewayName}). Status akan diverifikasi otomatis menjadi <span className="font-bold text-emerald-700">PAID</span> setelah webhook resmi gateway diterima backend.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Cost Summary */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal Produk ({items.length} jenis):</span>
              <span className="font-semibold text-slate-800">Rp {subtotal.toLocaleString('id-ID')}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Ongkos Kirim:</span>
              <span className="font-semibold text-slate-800">Rp {shippingCost.toLocaleString('id-ID')}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Biaya Penanganan / Layanan:</span>
              <span className="font-semibold text-slate-800">Rp {serviceFee.toLocaleString('id-ID')}</span>
            </div>
            <div className="flex justify-between text-slate-900 font-extrabold text-sm pt-2 border-t border-slate-200">
              <span>Total Pembayaran:</span>
              <span className="text-emerald-800 text-base">Rp {total.toLocaleString('id-ID')}</span>
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-4 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-2xl flex items-center justify-center gap-2 shadow-md shadow-emerald-700/20 active:scale-[0.99] transition-all disabled:opacity-50"
            >
              <span>{isSubmitting ? 'Membuat Pesanan...' : 'Buat Pesanan Sekarang'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
