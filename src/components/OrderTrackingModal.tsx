import React, { useState } from 'react';
import { Order, PaymentStatus } from '../types';
import { 
  X, Search, Truck, CheckCircle2, Clock, AlertCircle, 
  Package, ExternalLink, CreditCard, ShieldCheck, ArrowRight 
} from 'lucide-react';

interface OrderTrackingModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: Order[];
}

export default function OrderTrackingModal({
  isOpen,
  onClose,
  orders
}: OrderTrackingModalProps) {
  if (!isOpen) return null;

  const [searchNumber, setSearchNumber] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(orders[0] || null);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchNumber.trim().toUpperCase();
    if (!query) return;
    const found = orders.find(o => o.orderNumber.toUpperCase().includes(query) || o.id === query);
    if (found) {
      setSelectedOrder(found);
    }
  };

  const getOrderStatusBadge = (status: Order['orderStatus']) => {
    switch (status) {
      case 'NEW':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">Menunggu Diproses</span>;
      case 'PROCESSING':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800">Sedang Disiapkan</span>;
      case 'PACKED':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800">Siap Dikirim</span>;
      case 'SHIPPED':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800">Dalam Perjalanan Kurir</span>;
      case 'COMPLETED':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">Selesai / Diterima</span>;
      case 'CANCELLED':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800">Dibatalkan</span>;
      default:
        return null;
    }
  };

  const getPaymentStatusBadge = (status: PaymentStatus) => {
    switch (status) {
      case 'PENDING':
      case 'STANDBY':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
            Pending (Menunggu Pembayaran)
          </span>
        );
      case 'WAITING_VERIFICATION':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
            Menunggu Verifikasi Gateway
          </span>
        );
      case 'PAID':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 inline" />
            Lunas (Verified Paid)
          </span>
        );
      case 'REJECTED':
      case 'EXPIRED':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800">
            Kedaluwarsa / Ditolak
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-2xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col relative max-h-[92vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-emerald-700" />
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">Lacak Status Pesanan & Pembayaran</h2>
              <p className="text-xs text-slate-500">Cari nomor pesanan Anda (contoh: TS-2026...)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors"
            aria-label="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Input */}
        <div className="p-4 border-b border-slate-100 bg-white">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchNumber}
                onChange={(e) => setSearchNumber(e.target.value)}
                placeholder="Masukkan Nomor Pesanan (TS-...)"
                className="w-full pl-10 pr-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl focus:border-emerald-600 focus:outline-hidden"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors"
            >
              Cari
            </button>
          </form>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {orders.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <Package className="w-12 h-12 mx-auto mb-2 text-slate-300" />
              <p className="text-sm font-semibold text-slate-600">Belum ada riwayat pesanan</p>
              <p className="text-xs text-slate-400 mt-1">Lakukan pemesanan pertama Anda di katalog Tumpang Shop.</p>
            </div>
          ) : selectedOrder ? (
            <div className="space-y-4">
              {/* Order Card Header */}
              <div className="p-4 bg-emerald-50/60 border border-emerald-200/60 rounded-2xl flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs text-emerald-800 font-medium">Nomor Pesanan</div>
                  <div className="text-base sm:text-lg font-black text-slate-900">{selectedOrder.orderNumber}</div>
                  <div className="text-[11px] text-slate-500">
                    {new Date(selectedOrder.createdAt).toLocaleString('id-ID')}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {getOrderStatusBadge(selectedOrder.orderStatus)}
                  <span className="text-[11px] font-semibold text-slate-600">
                    Metode: {selectedOrder.shippingMethod === 'INSTANT' ? 'Kurir Prioritas' : selectedOrder.shippingMethod === 'PICKUP' ? 'Ambil di Toko' : 'Kurir Reguler'}
                  </span>
                </div>
              </div>

              {/* Payment Gateway Box */}
              <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-emerald-700" />
                    <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      Status Pembayaran Gateway
                    </span>
                  </div>
                  {getPaymentStatusBadge(selectedOrder.paymentStatus)}
                </div>

                {/* Gateway Payment Link or Instructions */}
                {selectedOrder.paymentStatus !== 'PAID' && (
                  <div className="p-3 bg-slate-50 rounded-xl text-xs space-y-2 border border-slate-100">
                    {selectedOrder.paymentLinkUrl ? (
                      <div>
                        <p className="text-slate-600 mb-2">
                          Silakan selesaikan pembayaran melalui Payment Link resmi dari gerbang pembayaran berikut:
                        </p>
                        <a
                          href={selectedOrder.paymentLinkUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold transition-all"
                        >
                          <span>Buka Payment Link Gateway</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    ) : (
                      <div className="text-slate-600 leading-relaxed">
                        <div className="font-semibold text-slate-800 mb-1 flex items-center gap-1.5">
                          <ShieldCheck className="w-4 h-4 text-amber-600" />
                          <span>Status Transaksi: Pending (Menunggu Pembayaran)</span>
                        </div>
                        <p>
                          Pesanan tercatat aman di sistem Tumpang Shop. Gerbang Payment Gateway resmi berjalan dengan verifikasi webhook server-side yang aman.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {selectedOrder.paymentStatus === 'PAID' && (
                  <div className="p-3 bg-emerald-50 text-emerald-900 rounded-xl text-xs flex items-center gap-2 border border-emerald-200">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>
                      Pembayaran telah berhasil diverifikasi oleh backend webhook resmi gateway ({selectedOrder.paymentGateway || 'Payment Gateway'}).
                    </span>
                  </div>
                )}
              </div>

              {/* Recipient Details */}
              <div className="p-4 border border-slate-100 rounded-2xl bg-slate-50/50 space-y-2 text-xs">
                <div className="font-bold text-slate-800 text-sm">Rincian Pengiriman</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-600">
                  <div><strong>Penerima:</strong> {selectedOrder.customerName} ({selectedOrder.customerPhone})</div>
                  <div><strong>Kecamatan:</strong> {selectedOrder.customerDistrict}</div>
                  <div className="sm:col-span-2"><strong>Alamat:</strong> {selectedOrder.deliveryAddress}</div>
                  {selectedOrder.deliveryNotes && (
                    <div className="sm:col-span-2 text-amber-800 bg-amber-50 p-2 rounded-lg">
                      <strong>Catatan:</strong> {selectedOrder.deliveryNotes}
                    </div>
                  )}
                </div>
              </div>

              {/* Items List */}
              <div className="border border-slate-100 rounded-2xl p-4 space-y-2">
                <div className="font-bold text-slate-800 text-sm">Daftar Produk ({selectedOrder.items.length})</div>
                <div className="divide-y divide-slate-100">
                  {selectedOrder.items.map((item, idx) => (
                    <div key={idx} className="py-2 flex justify-between items-center text-xs">
                      <div>
                        <div className="font-semibold text-slate-800">{item.name}</div>
                        {item.variationInfo && (
                          <div className="text-[11px] text-emerald-700">{item.variationInfo}</div>
                        )}
                        <div className="text-slate-500">
                          {item.quantity} x Rp {item.price.toLocaleString('id-ID')} ({item.unit})
                        </div>
                      </div>
                      <div className="font-bold text-slate-900">
                        Rp {item.subtotal.toLocaleString('id-ID')}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-3 border-t border-slate-200 space-y-1 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal:</span>
                    <span>Rp {selectedOrder.subtotal.toLocaleString('id-ID')}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Ongkir:</span>
                    <span>Rp {selectedOrder.shippingCost.toLocaleString('id-ID')}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Biaya Layanan:</span>
                    <span>Rp {selectedOrder.serviceFee.toLocaleString('id-ID')}</span>
                  </div>
                  <div className="flex justify-between text-slate-900 font-black text-sm pt-1 border-t border-slate-100">
                    <span>Total Pesanan:</span>
                    <span className="text-emerald-800 text-base">Rp {selectedOrder.total.toLocaleString('id-ID')}</span>
                  </div>
                </div>
              </div>

              {/* All Orders Selector */}
              {orders.length > 1 && (
                <div className="pt-2">
                  <div className="text-xs font-semibold text-slate-600 mb-2">Riwayat Pesanan Lainnya:</div>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {orders.map((o) => (
                      <button
                        key={o.id}
                        onClick={() => setSelectedOrder(o)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-medium border shrink-0 transition-all ${
                          selectedOrder.id === o.id
                            ? 'border-emerald-600 bg-emerald-50 text-emerald-800 font-bold'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {o.orderNumber}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
