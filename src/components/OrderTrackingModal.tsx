import React, { useState } from 'react';
import { Order, PaymentStatus } from '../types';
import { 
  X, Search, Plane, CheckCircle2, Clock, AlertCircle, 
  Package, ExternalLink, CreditCard, ShieldCheck, ArrowRight,
  MapPin, Phone, Copy, Info, AlertTriangle
} from 'lucide-react';
import { getOrderStatusInfo, formatShippingMethod, ORDER_TIMELINE_STEPS, AIR_SHIPPING_DISCLAIMER } from '../lib/orderStatusHelper';

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
    const found = orders.find(
      o => o.orderNumber.toUpperCase().includes(query) || 
           o.id === query || 
           o.customerPhone.includes(query)
    );
    if (found) {
      setSelectedOrder(found);
    }
  };

  const getPaymentStatusBadge = (status: PaymentStatus) => {
    switch (status) {
      case 'PENDING':
      case 'STANDBY':
      case 'UNPAID':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-900 border border-amber-300">
            Pending (Menunggu Pembayaran)
          </span>
        );
      case 'WAITING_VERIFICATION':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200">
            Menunggu Verifikasi Gateway
          </span>
        );
      case 'PAID':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-900 border border-emerald-300 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 inline" />
            Lunas (Verified Paid)
          </span>
        );
      case 'REFUNDED':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-50 text-purple-800 border border-purple-200">
            Refund (Pengembalian Dana)
          </span>
        );
      case 'REJECTED':
      case 'EXPIRED':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-800">
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
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-orange-100 text-[#FE8A00] flex items-center justify-center">
              <Plane className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                Lacak Status Pesanan & Kargo Udara
              </h2>
              <p className="text-xs text-slate-500">
                Cari dengan Nomor Pesanan (TS-...) atau Nomor WhatsApp
              </p>
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
                placeholder="Masukkan Nomor Pesanan (TS-...) atau No. HP..."
                className="w-full pl-10 pr-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl focus:border-[#FE8A00] focus:outline-hidden"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-[#FE8A00] hover:bg-[#e07b00] text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors"
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
              {(() => {
                const sInfo = getOrderStatusInfo(selectedOrder.orderStatus);
                return (
                  <div className="p-4 bg-orange-50/50 border border-orange-200/60 rounded-2xl flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-xs text-slate-500 font-medium">Nomor Pesanan</div>
                      <div className="text-base sm:text-lg font-black text-slate-900">{selectedOrder.orderNumber}</div>
                      <div className="text-[11px] text-slate-500">
                        {new Date(selectedOrder.createdAt).toLocaleString('id-ID')}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${sInfo.badgeBg} ${sInfo.badgeText} ${sInfo.badgeBorder}`}>
                        {sInfo.label}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-600">
                        {formatShippingMethod(selectedOrder.shippingMethod)}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Air Cargo Tracking & Status Info */}
              <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Plane className="w-4 h-4 text-[#FE8A00]" />
                    <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      Jalur Kargo Udara & Estimasi
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-slate-600">
                    Estimasi ~{selectedOrder.estimatedAirDeliveryDays || 14} hari kalender
                  </span>
                </div>

                {selectedOrder.trackingNumber ? (
                  <div className="p-3 bg-slate-50 rounded-xl text-xs space-y-1.5 border border-slate-200">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Nomor Resi / AWB:</span>
                      <span className="font-mono font-black text-sm text-[#FE8A00]">{selectedOrder.trackingNumber}</span>
                    </div>
                    {selectedOrder.shippingCarrier && (
                      <div className="flex justify-between text-slate-600">
                        <span>Ekspedisi / Maskapai:</span>
                        <span className="font-semibold">{selectedOrder.shippingCarrier}</span>
                      </div>
                    )}
                    {selectedOrder.trackingUrl && (
                      <div className="pt-1 text-right">
                        <a
                          href={selectedOrder.trackingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline"
                        >
                          <span>Buka Tautan Pelacakan Maskapai</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-500 leading-relaxed">
                    Resi kargo udara akan otomatis diperbarui begitu barang selesai diproses oleh pemasok dan diserahkan ke kargo.
                  </div>
                )}

                {/* Estimate disclaimer */}
                <div className="text-[11px] text-slate-500 bg-orange-50/40 p-2.5 rounded-xl border border-orange-100 flex items-start gap-1.5 leading-relaxed">
                  <Info className="w-3.5 h-3.5 text-[#FE8A00] shrink-0 mt-0.5" />
                  <span>{AIR_SHIPPING_DISCLAIMER}</span>
                </div>
              </div>

              {/* Payment Gateway Box */}
              <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-[#FE8A00]" />
                    <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      Status Pembayaran Gateway
                    </span>
                  </div>
                  {getPaymentStatusBadge(selectedOrder.paymentStatus)}
                </div>

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
                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#FE8A00] hover:bg-[#e07b00] text-white rounded-xl font-bold transition-all shadow-xs"
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
                      Pembayaran telah berhasil diverifikasi resmi ({selectedOrder.paymentGateway || 'Payment Gateway'}).
                    </span>
                  </div>
                )}
              </div>

              {/* Recipient Details */}
              <div className="p-4 border border-slate-100 rounded-2xl bg-slate-50/50 space-y-2 text-xs">
                <div className="font-bold text-slate-800 text-sm">Rincian Pengiriman</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-600">
                  <div><strong>Penerima:</strong> {selectedOrder.customerName} ({selectedOrder.customerPhone})</div>
                  <div><strong>Wilayah:</strong> {selectedOrder.customerDistrict}, {selectedOrder.customerCity || ''}</div>
                  <div className="sm:col-span-2"><strong>Alamat Lengkap:</strong> {selectedOrder.deliveryAddress}</div>
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
                          <div className="text-[11px] text-[#FE8A00]">{item.variationInfo}</div>
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
                    <span>Pengiriman Reguler via Udara:</span>
                    <span>Rp {selectedOrder.shippingCost.toLocaleString('id-ID')}</span>
                  </div>
                  {selectedOrder.serviceFee > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>Biaya Layanan:</span>
                      <span>Rp {selectedOrder.serviceFee.toLocaleString('id-ID')}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-900 font-black text-sm pt-1 border-t border-slate-100">
                    <span>Total Pesanan:</span>
                    <span className="text-[#FE8A00] text-base">Rp {selectedOrder.total.toLocaleString('id-ID')}</span>
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
                            ? 'border-[#FE8A00] bg-orange-50 text-[#FE8A00] font-bold'
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
