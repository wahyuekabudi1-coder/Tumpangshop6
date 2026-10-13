import React from 'react';
import { Order, PaymentStatus } from '../types';
import { 
  ArrowLeft, Plane, Package, CheckCircle2, Clock, 
  AlertCircle, CreditCard, ExternalLink, MapPin, 
  Phone, User, ShieldCheck, Copy, Info, Check, AlertTriangle
} from 'lucide-react';
import { 
  getOrderStatusInfo, formatShippingMethod, 
  ORDER_TIMELINE_STEPS, AIR_SHIPPING_DISCLAIMER 
} from '../lib/orderStatusHelper';

interface OrderDetailPageProps {
  order: Order;
  onBackToOrders: () => void;
  onNavigateToPayment: (orderId: string) => void;
  onShowToast: (msg: string) => void;
}

export default function OrderDetailPage({
  order,
  onBackToOrders,
  onNavigateToPayment,
  onShowToast
}: OrderDetailPageProps) {
  const isPaid = order.paymentStatus === 'PAID';
  const statusInfo = getOrderStatusInfo(order.orderStatus);
  const estimatedDays = order.estimatedAirDeliveryDays || 14;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    onShowToast(`✓ ${label} disalin ke papan klip!`);
  };

  const getPaymentStatusBadge = (status: PaymentStatus) => {
    switch (status) {
      case 'PENDING':
      case 'STANDBY':
      case 'UNPAID':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 inline-flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            <span>Menunggu Pembayaran (Pending)</span>
          </span>
        );
      case 'WAITING_VERIFICATION':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200 inline-flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-blue-600" />
            <span>Menunggu Verifikasi Gateway</span>
          </span>
        );
      case 'PAID':
        return (
          <span className="inline-flex items-center gap-1.5 flex-wrap">
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Pembayaran Terverifikasi (Lunas)</span>
            </span>
            {order.isTestTransaction && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                SIMULATED / TEST
              </span>
            )}
          </span>
        );
      case 'REFUNDED':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-purple-50 text-purple-800 border border-purple-200">
            Pengembalian Dana (Refunded)
          </span>
        );
      case 'REJECTED':
      case 'EXPIRED':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-800 border border-rose-200">
            Kedaluwarsa / Dibatalkan
          </span>
        );
      default:
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
            {status}
          </span>
        );
    }
  };

  // Determine current timeline progress index
  const activeStep = statusInfo.stepIndex;

  return (
    <div className="min-h-screen bg-slate-50 py-6 sm:py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-6">
        
        {/* Top Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBackToOrders}
              className="w-10 h-10 rounded-2xl bg-white border border-slate-200 text-slate-700 hover:text-[#FE8A00] hover:border-orange-300 flex items-center justify-center transition-all shadow-2xs"
              title="Kembali"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  Status & Pelacakan Pesanan
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-[#FE8A00]">
                  Impor via Kargo Udara
                </span>
              </div>
              <p className="text-xs text-slate-500 font-mono">
                Nomor Pesanan: <strong className="text-slate-800">{order.orderNumber}</strong>
              </p>
            </div>
          </div>

          <button
            onClick={() => copyToClipboard(order.orderNumber, 'Nomor Pesanan')}
            className="text-xs font-bold text-slate-700 hover:text-[#FE8A00] flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 transition-colors shadow-2xs"
          >
            <Copy className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Salin No. Pesanan</span>
          </button>
        </div>

        {/* 6-Step Operational Timeline Bar */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-5 sm:p-6 shadow-2xs space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900">
                Alur Operasional Pesanan Impor
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Proses pemesanan dari verifikasi pembayaran hingga pengiriman udara ke tangan Anda
              </p>
            </div>
            
            {/* Status Badge */}
            <span className={`px-3 py-1 rounded-full text-xs font-black border ${statusInfo.badgeBg} ${statusInfo.badgeText} ${statusInfo.badgeBorder}`}>
              {statusInfo.label}
            </span>
          </div>

          {order.orderStatus === 'CANCELLED' ? (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
              <div>
                <strong className="block font-bold">Pesanan Ini Dibatalkan</strong>
                <span>Pesanan telah dibatalkan atau dalam proses pengembalian dana penuh ke pembeli.</span>
              </div>
            </div>
          ) : (
            <div className="pt-2">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                {ORDER_TIMELINE_STEPS.map((step) => {
                  const isPassed = activeStep >= step.step;
                  const isCurrent = activeStep === step.step;
                  return (
                    <div 
                      key={step.key} 
                      className={`p-2.5 rounded-2xl border text-center transition-all ${
                        isCurrent 
                          ? 'border-orange-500 bg-orange-50/50 shadow-xs ring-1 ring-orange-500/30'
                          : isPassed
                          ? 'border-emerald-200 bg-emerald-50/40 text-emerald-900'
                          : 'border-slate-100 bg-slate-50/60 text-slate-400'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full mx-auto mb-1 flex items-center justify-center text-[10px] font-black ${
                        isCurrent 
                          ? 'bg-[#FE8A00] text-white'
                          : isPassed
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-200 text-slate-500'
                      }`}>
                        {isPassed && !isCurrent ? '✓' : step.step}
                      </div>
                      <div className={`text-[11px] font-bold leading-tight ${
                        isCurrent ? 'text-slate-900 font-black' : isPassed ? 'text-emerald-950 font-bold' : 'text-slate-500'
                      }`}>
                        {step.title}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Status Explanation Box */}
              <div className="mt-4 p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 text-xs text-slate-700 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-[#FE8A00] shrink-0 mt-0.5" />
                <div className="space-y-0.5 leading-relaxed">
                  <span className="font-bold text-slate-900">{statusInfo.label}:</span>{' '}
                  <span>{statusInfo.description}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Tracking & Air Cargo Details (If tracking info is available) */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-5 sm:p-6 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-orange-100 text-[#FE8A00] flex items-center justify-center">
                <Plane className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900">
                  Detail Pengiriman Reguler via Udara
                </h3>
                <p className="text-[11px] text-slate-400">
                  Estimasi sekitar {estimatedDays} hari kalender setelah konfirmasi diproses
                </p>
              </div>
            </div>

            <div className="text-right">
              <span className="text-xs font-black text-slate-900">
                Rp {order.shippingCost.toLocaleString('id-ID')}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
              <span className="text-slate-400 font-bold uppercase text-[10px]">Metode Logistik</span>
              <div className="font-bold text-slate-900 text-sm">
                {formatShippingMethod(order.shippingMethod)}
              </div>
              <div className="text-[11px] text-slate-500">
                Ekspedisi / Maskapai: <strong>{order.shippingCarrier || 'Kargo Udara Reguler Internasional'}</strong>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
              <span className="text-slate-400 font-bold uppercase text-[10px]">Nomor Pelacakan / AWB</span>
              {order.trackingNumber ? (
                <div className="space-y-1">
                  <div className="font-mono font-black text-base text-[#FE8A00] flex items-center gap-2">
                    <span>{order.trackingNumber}</span>
                    <button
                      onClick={() => copyToClipboard(order.trackingNumber!, 'Nomor Pelacakan')}
                      className="text-slate-400 hover:text-slate-700"
                      title="Salin Resi"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {order.trackingUrl && (
                    <a
                      href={order.trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline"
                    >
                      <span>Buka Pelacakan Kargo</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              ) : (
                <div>
                  <span className="font-medium text-slate-500 italic block">
                    Belum diterbitkan (dalam proses verifikasi pemasok & manifes kargo)
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Nomor resi otomatis aktif begitu barang diserahkan ke kargo udara.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Air Shipping Transparency Notice */}
          <div className="p-3.5 rounded-2xl bg-orange-50/60 border border-orange-200/70 text-[11px] text-slate-700 space-y-1 leading-relaxed">
            <div className="font-bold text-slate-900 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-[#FE8A00]" />
              <span>Transparansi Jadwal & Ketentuan Estimasi:</span>
            </div>
            <p>{AIR_SHIPPING_DISCLAIMER}</p>
          </div>
        </div>

        {/* Payment Box & Actions */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-5 sm:p-6 shadow-2xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-[#FE8A00]" />
                <span>Status & Rincian Pembayaran</span>
              </h3>
              <p className="text-xs text-slate-400">
                Gerbang transaksi resmi Tumpang Shop
              </p>
            </div>
            <div>
              {getPaymentStatusBadge(order.paymentStatus)}
            </div>
          </div>

          {!isPaid && (
            <div className="p-4 sm:p-5 rounded-2xl bg-orange-50/80 border border-orange-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-900">
                  Pembayaran Belum Diselesaikan
                </h4>
                <p className="text-xs text-slate-600">
                  Selesaikan pembayaran sebesar <strong className="text-[#FE8A00]">Rp {order.total.toLocaleString('id-ID')}</strong> agar pesanan Anda segera diteruskan ke pemasok luar negeri.
                </p>
              </div>
              <button
                onClick={() => onNavigateToPayment(order.id)}
                className="py-2.5 px-5 rounded-xl bg-[#FE8A00] hover:bg-[#e07b00] text-white font-bold text-xs sm:text-sm shadow-md shadow-orange-500/20 shrink-0 flex items-center justify-center gap-2 transition-all active:scale-95"
              >
                <CreditCard className="w-4 h-4" />
                <span>Instruksi / Bayar Sekarang</span>
              </button>
            </div>
          )}

          {isPaid && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                Pembayaran telah terverifikasi resmi oleh sistem. Pesanan sedang diproses dalam jalur kargo udara.
              </span>
            </div>
          )}
        </div>

        {/* Products Ordered */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-5 sm:p-6 shadow-2xs space-y-4">
          <h2 className="text-sm sm:text-base font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
            <Package className="w-4 h-4 text-[#FE8A00]" />
            <span>Produk Impor yang Dipesan ({order.items.length} item)</span>
          </h2>

          <div className="divide-y divide-slate-100">
            {order.items.map((it, idx) => (
              <div key={idx} className="py-3 first:pt-0 flex items-center justify-between gap-3 text-xs sm:text-sm">
                <div>
                  <h4 className="font-bold text-slate-900">{it.name}</h4>
                  {it.variationInfo && (
                    <span className="text-xs text-[#FE8A00] font-medium">{it.variationInfo}</span>
                  )}
                  <p className="text-xs text-slate-400">
                    {it.quantity} {it.unit} × Rp {it.price.toLocaleString('id-ID')}
                  </p>
                </div>
                <div className="font-black text-slate-900 text-right">
                  Rp {(it.price * it.quantity).toLocaleString('id-ID')}
                </div>
              </div>
            ))}
          </div>

          {/* Transparent Totals */}
          <div className="border-t border-slate-100 pt-3 space-y-2 text-xs sm:text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal Produk</span>
              <span className="font-bold text-slate-900">Rp {order.subtotal.toLocaleString('id-ID')}</span>
            </div>
            
            <div className="flex justify-between text-slate-600">
              <span>Pengiriman Reguler via Udara (~{estimatedDays} hari kalender)</span>
              <span className="font-bold text-slate-900">
                Rp {order.shippingCost.toLocaleString('id-ID')}
              </span>
            </div>

            {order.serviceFee > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Biaya Layanan & Pemeliharaan</span>
                <span className="font-bold text-slate-900">Rp {order.serviceFee.toLocaleString('id-ID')}</span>
              </div>
            )}

            {order.discountAmount && order.discountAmount > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Diskon / Potongan</span>
                <span className="font-bold">- Rp {order.discountAmount.toLocaleString('id-ID')}</span>
              </div>
            )}

            <div className="border-t border-slate-100 pt-2 flex justify-between text-base sm:text-lg font-black text-[#FE8A00]">
              <span>Total Akhir Pembayaran</span>
              <span>Rp {order.total.toLocaleString('id-ID')}</span>
            </div>
          </div>
        </div>

        {/* Recipient & Address Information */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-5 sm:p-6 shadow-2xs space-y-4">
          <h2 className="text-sm sm:text-base font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[#FE8A00]" />
            <span>Alamat Tujuan Pengiriman Kargo</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs sm:text-sm">
            <div className="space-y-1.5">
              <span className="text-[10px] text-slate-400 font-bold uppercase">Penerima & Kontak</span>
              <p className="font-bold text-slate-900">{order.customerName}</p>
              <p className="text-slate-600 flex items-center gap-1.5 font-mono">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                <span>{order.customerPhone}</span>
              </p>
              {order.customerEmail && (
                <p className="text-slate-500">{order.customerEmail}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <span className="text-[10px] text-slate-400 font-bold uppercase">Alamat Lengkap</span>
              <p className="text-slate-800 leading-relaxed font-medium">{order.deliveryAddress}</p>
              <p className="text-slate-600">
                {order.customerDistrict}, {order.customerCity ? `${order.customerCity}, ` : ''}
                {order.customerProvince ? `${order.customerProvince} ` : ''}
                {order.customerPostalCode ? `(${order.customerPostalCode})` : ''}
              </p>
              {order.deliveryNotes && (
                <p className="text-xs text-amber-800 bg-amber-50 p-2 rounded-lg italic">
                  Catatan: {order.deliveryNotes}
                </p>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
