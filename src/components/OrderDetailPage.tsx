import React from 'react';
import { Order, PaymentStatus } from '../types';
import { 
  ArrowLeft, Truck, Package, CheckCircle2, Clock, 
  AlertCircle, CreditCard, ExternalLink, MapPin, 
  Phone, User, Store, ShieldCheck, Copy 
} from 'lucide-react';

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

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    onShowToast(`✓ ${label} disalin ke papan klip!`);
  };

  const getOrderStatusBadge = (status: Order['orderStatus']) => {
    switch (status) {
      case 'NEW':
        return <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">Menunggu Diproses Penjual</span>;
      case 'PROCESSING':
        return <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800">Sedang Disiapkan Penjual</span>;
      case 'PACKED':
        return <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800">Telah Dikemas & Siap Kirim</span>;
      case 'SHIPPED':
        return <span className="px-3 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800">Dalam Perjalanan Kurir</span>;
      case 'COMPLETED':
        return <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">Pesanan Selesai / Diterima</span>;
      case 'CANCELLED':
        return <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800">Dibatalkan</span>;
      default:
        return <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700">{status}</span>;
    }
  };

  const getPaymentStatusBadge = (status: PaymentStatus) => {
    switch (status) {
      case 'PENDING':
      case 'STANDBY':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
            Pending (Menunggu Pembayaran)
          </span>
        );
      case 'WAITING_VERIFICATION':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
            Menunggu Verifikasi Gateway
          </span>
        );
      case 'PAID':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 inline" />
            Lunas (Verified Paid)
          </span>
        );
      case 'REJECTED':
      case 'EXPIRED':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800">
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

  return (
    <div className="min-h-screen bg-slate-50 py-6 sm:py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-6">
        
        {/* Top Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBackToOrders}
              className="w-9 h-9 rounded-xl bg-white border border-slate-200 text-slate-700 hover:text-[#FE8A00] hover:border-orange-300 flex items-center justify-center transition-all shadow-2xs"
              title="Kembali"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Detail & Status Pesanan
              </h1>
              <p className="text-xs text-slate-500 font-mono">
                {order.orderNumber}
              </p>
            </div>
          </div>

          <button
            onClick={() => copyToClipboard(order.orderNumber, 'Nomor Pesanan')}
            className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white border border-slate-200 transition-colors shadow-2xs"
          >
            <Copy className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Salin No. Pesanan</span>
          </button>
        </div>

        {/* Status Highlights */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-5 sm:p-6 shadow-2xs grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
            <div className="text-xs font-semibold text-slate-500">Status Pembayaran</div>
            <div>{getPaymentStatusBadge(order.paymentStatus)}</div>
            <p className="text-[11px] text-slate-500">
              Metode: <strong className="text-slate-700">{order.paymentGateway || 'Official Gateway Link'}</strong>
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
            <div className="text-xs font-semibold text-slate-500">Status Pesanan</div>
            <div>{getOrderStatusBadge(order.orderStatus)}</div>
            <p className="text-[11px] text-slate-500">
              Dibuat: <strong className="text-slate-700">{new Date(order.createdAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</strong>
            </p>
          </div>
        </div>

        {/* Payment Action if still pending */}
        {!isPaid && (
          <div className="p-4 sm:p-5 rounded-3xl bg-orange-50/80 border border-orange-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-900">Pesanan Belum Dibayar</h3>
              <p className="text-xs text-slate-600">
                Selesaikan transaksi sebesar <strong className="text-[#FE8A00]">Rp {order.total.toLocaleString('id-ID')}</strong> untuk mempercepat proses pengiriman.
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

        {/* Products Ordered */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-5 sm:p-6 shadow-2xs space-y-4">
          <h2 className="text-sm sm:text-base font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
            <Package className="w-4 h-4 text-[#FE8A00]" />
            <span>Produk Yang Dipesan ({order.items.length} item)</span>
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

          {/* Totals */}
          <div className="border-t border-slate-100 pt-3 space-y-2 text-xs sm:text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal Produk</span>
              <span className="font-bold text-slate-900">Rp {order.subtotal.toLocaleString('id-ID')}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Biaya Pengiriman ({order.shippingMethod})</span>
              <span className="font-bold text-slate-900">
                {order.shippingCost === 0 ? 'Gratis' : `Rp ${order.shippingCost.toLocaleString('id-ID')}`}
              </span>
            </div>
            {order.serviceFee > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Biaya Layanan</span>
                <span className="font-bold text-slate-900">Rp {order.serviceFee.toLocaleString('id-ID')}</span>
              </div>
            )}
            <div className="border-t border-slate-100 pt-2 flex justify-between text-base sm:text-lg font-black text-[#FE8A00]">
              <span>Total Pembayaran</span>
              <span>Rp {order.total.toLocaleString('id-ID')}</span>
            </div>
          </div>
        </div>

        {/* Shipping & Delivery Info */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-5 sm:p-6 shadow-2xs space-y-4">
          <h2 className="text-sm sm:text-base font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[#FE8A00]" />
            <span>Informasi Penerima & Pengiriman</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs sm:text-sm">
            <div className="space-y-1">
              <span className="text-xs text-slate-400 font-medium">Penerima</span>
              <p className="font-bold text-slate-900">{order.customerName}</p>
              <p className="text-slate-600 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                <span>{order.customerPhone}</span>
              </p>
              {order.customerEmail && (
                <p className="text-slate-500">{order.customerEmail}</p>
              )}
            </div>

            <div className="space-y-1">
              <span className="text-xs text-slate-400 font-medium">Alamat Pengantaran</span>
              <p className="text-slate-800 leading-relaxed">{order.deliveryAddress}</p>
              <p className="font-semibold text-[#FE8A00]">Kecamatan {order.customerDistrict}</p>
              {order.deliveryNotes && (
                <p className="text-xs text-slate-500 italic mt-1">Catatan: {order.deliveryNotes}</p>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
