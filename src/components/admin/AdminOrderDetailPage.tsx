import React, { useState } from 'react';
import { Order, Product } from '../../types';
import { 
  ArrowLeft, ChevronRight, CheckCircle2, Clock, AlertTriangle, 
  Truck, CreditCard, DollarSign, User, MapPin, Phone, Mail, 
  ExternalLink, Printer, Share2, Check, X, ShieldAlert, Award, FileText
} from 'lucide-react';

interface AdminOrderDetailPageProps {
  order: Order;
  products: Product[];
  onBack: () => void;
  onUpdateOrderStatus: (orderId: string, status: Order['orderStatus']) => void;
  onUpdatePaymentStatus: (orderId: string, status: Order['paymentStatus']) => void;
  onUpdateCommissionStatus?: (orderId: string, status: 'PENDING' | 'APPROVED' | 'PAID' | 'CANCELLED') => void;
  onViewCustomer?: (customerPhoneOrName: string) => void;
}

export default function AdminOrderDetailPage({
  order,
  products,
  onBack,
  onUpdateOrderStatus,
  onUpdatePaymentStatus,
  onUpdateCommissionStatus,
  onViewCustomer
}: AdminOrderDetailPageProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [statusNote, setStatusNote] = useState('');

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handlePrint = () => {
    window.print();
  };

  const waNumber = order.customerPhone.replace(/[^0-9]/g, '');
  const cleanWa = waNumber.startsWith('0') ? '62' + waNumber.slice(1) : waNumber;
  const waMessage = encodeURIComponent(
    `Halo kak ${order.customerName}, konfirmasi dari Tumpang Shop terkait pesanan #${order.orderNumber}. ` +
    `Status pesanan saat ini: ${order.orderStatus}, status pembayaran: ${order.paymentStatus}. Terima kasih!`
  );
  const waUrl = `https://wa.me/${cleanWa}?text=${waMessage}`;

  const commissionSnap = order.affiliateCommission;

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 font-sans pb-16">
      {/* Top Header / Sticky Navigation Bar */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 border border-slate-200 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"
            title="Kembali ke Daftar Pesanan"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="cursor-pointer hover:underline" onClick={onBack}>Seller Centre</span>
              <ChevronRight className="w-3 h-3 text-slate-400" />
              <span className="cursor-pointer hover:underline" onClick={onBack}>Pesanan</span>
              <ChevronRight className="w-3 h-3 text-slate-400" />
              <span className="font-bold text-slate-800">Rincian Pesanan</span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                {order.orderNumber}
              </h1>
              <span className="text-xs text-slate-500 font-mono">
                ID: {order.id}
              </span>
            </div>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopyLink}
            className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Share2 className="w-3.5 h-3.5 text-slate-500" />}
            <span>{copiedLink ? 'Tautan Disalin' : 'Salin URL'}</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
          >
            <Printer className="w-3.5 h-3.5 text-slate-500" />
            <span>Cetak Invoice</span>
          </button>

          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-2xs transition-colors"
          >
            <Phone className="w-3.5 h-3.5" />
            <span>Hubungi via WhatsApp</span>
          </a>
        </div>
      </header>

      {/* Main Page Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Status Banner Summary */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Status Operasional Pesanan</div>
              <div className="flex items-center gap-2 mt-1">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                  order.orderStatus === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' :
                  order.orderStatus === 'SHIPPED' ? 'bg-blue-100 text-blue-800' :
                  order.orderStatus === 'PACKED' ? 'bg-indigo-100 text-indigo-800' :
                  order.orderStatus === 'PROCESSING' ? 'bg-amber-100 text-amber-800' :
                  order.orderStatus === 'CANCELLED' ? 'bg-rose-100 text-rose-800' :
                  'bg-orange-100 text-[#FE8A00]'
                }`}>
                  <span className="w-2 h-2 rounded-full bg-current" />
                  {order.orderStatus === 'NEW' ? 'Pesanan Baru' :
                   order.orderStatus === 'PROCESSING' ? 'Diproses Penjual' :
                   order.orderStatus === 'PACKED' ? 'Sedang Dikemas' :
                   order.orderStatus === 'SHIPPED' ? 'Dalam Pengiriman' :
                   order.orderStatus === 'COMPLETED' ? 'Pesanan Selesai' :
                   'Pesanan Dibatalkan'}
                </span>
                <span className="text-xs text-slate-400">• Dibuat: {new Date(order.createdAt).toLocaleString('id-ID')}</span>
              </div>
            </div>

            <div className="border-l border-slate-200 pl-4">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Status Pembayaran</div>
              <div className="flex items-center gap-2 mt-1">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                  order.paymentStatus === 'PAID' ? 'bg-emerald-100 text-emerald-800' :
                  order.paymentStatus === 'WAITING_VERIFICATION' ? 'bg-blue-100 text-blue-800' :
                  order.paymentStatus === 'EXPIRED' ? 'bg-slate-100 text-slate-700' :
                  order.paymentStatus === 'REJECTED' ? 'bg-rose-100 text-rose-800' :
                  'bg-amber-100 text-amber-800'
                }`}>
                  <CreditCard className="w-3.5 h-3.5" />
                  {order.paymentStatus === 'PAID' ? 'LUNAS (Paid)' :
                   order.paymentStatus === 'WAITING_VERIFICATION' ? 'Menunggu Verifikasi Gateway' :
                   order.paymentStatus === 'EXPIRED' ? 'Kedaluwarsa' :
                   order.paymentStatus === 'REJECTED' ? 'Ditolak' :
                   'Menunggu Pembayaran (Pending)'}
                </span>
                {order.paidAt && (
                  <span className="text-xs text-emerald-700 font-medium">
                    (Lunas: {new Date(order.paidAt).toLocaleTimeString('id-ID')})
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Quick Status Control Selectors */}
          <div className="flex flex-wrap items-center gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Ubah Status Pesanan</label>
              <select
                value={order.orderStatus}
                onChange={(e) => onUpdateOrderStatus(order.id, e.target.value as any)}
                className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-bold text-slate-800 focus:outline-hidden focus:border-[#FE8A00]"
              >
                <option value="NEW">Baru</option>
                <option value="PROCESSING">Diproses</option>
                <option value="PACKED">Dikemas</option>
                <option value="SHIPPED">Dikirim</option>
                <option value="COMPLETED">Selesai (Completed)</option>
                <option value="CANCELLED">Dibatalkan</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Ubah Status Bayar</label>
              <select
                value={order.paymentStatus}
                onChange={(e) => onUpdatePaymentStatus(order.id, e.target.value as any)}
                className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-bold text-slate-800 focus:outline-hidden focus:border-[#FE8A00]"
              >
                <option value="PENDING">Pending (Menunggu)</option>
                <option value="WAITING_VERIFICATION">Verifikasi Gateway</option>
                <option value="PAID">Lunas (Paid)</option>
                <option value="EXPIRED">Kedaluwarsa</option>
                <option value="FAILED">Gagal</option>
              </select>
            </div>
          </div>
        </div>

        {/* 2-Column Grid Body */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content (Left 2 cols) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Products Table Card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Daftar Produk yang Dipesan ({order.items.length} item)</span>
                </h2>
                <span className="text-xs font-semibold text-slate-500">
                  Total Unit: {order.items.reduce((s, it) => s + it.quantity, 0)} pcs
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200 text-[11px] uppercase tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3">Produk</th>
                      <th className="py-2.5 px-3">SKU / Varian</th>
                      <th className="py-2.5 px-3 text-right">Harga Satuan</th>
                      <th className="py-2.5 px-3 text-center">Jumlah</th>
                      <th className="py-2.5 px-3 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {order.items.map((it, idx) => {
                      const matchedProd = products.find(p => p.id === it.productId);
                      const img = matchedProd?.images?.[0] || 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=200&auto=format&fit=crop&q=80';
                      return (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-3">
                              <img
                                src={img}
                                alt={it.name}
                                className="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0"
                              />
                              <div>
                                <div className="font-bold text-slate-900 line-clamp-1">{it.name}</div>
                                {it.variationInfo && (
                                  <div className="text-[11px] text-[#FE8A00] font-semibold">{it.variationInfo}</div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3 font-mono text-[11px] text-slate-500">
                            {it.sku || matchedProd?.sku || '-'}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-medium text-slate-700">
                            Rp {it.price.toLocaleString('id-ID')}
                          </td>
                          <td className="py-3 px-3 text-center font-bold text-slate-900">
                            {it.quantity}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                            Rp {(it.price * it.quantity).toLocaleString('id-ID')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Financial Calculation Breakdown */}
              <div className="pt-4 border-t border-slate-200 flex flex-col items-end gap-1.5 text-xs">
                <div className="flex items-center justify-between w-64 text-slate-600">
                  <span>Subtotal Produk:</span>
                  <span className="font-mono font-medium">Rp {order.subtotal.toLocaleString('id-ID')}</span>
                </div>
                <div className="flex items-center justify-between w-64 text-slate-600">
                  <span>Ongkos Kirim ({order.shippingMethod}):</span>
                  <span className="font-mono font-medium">Rp {order.shippingCost.toLocaleString('id-ID')}</span>
                </div>
                {order.serviceFee ? (
                  <div className="flex items-center justify-between w-64 text-slate-600">
                    <span>Biaya Layanan:</span>
                    <span className="font-mono font-medium">Rp {order.serviceFee.toLocaleString('id-ID')}</span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between w-64 pt-2 border-t border-slate-200 text-sm font-black text-slate-900">
                  <span>Total Tagihan:</span>
                  <span className="font-mono text-[#FE8A00] text-base">Rp {order.total.toLocaleString('id-ID')}</span>
                </div>
              </div>
            </div>

            {/* Affiliate Referral Snapshot & Commission Audit Card */}
            {commissionSnap ? (
              <div className="bg-white rounded-2xl border-2 border-orange-200 p-5 shadow-2xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-orange-100 pb-3">
                  <div className="flex items-center gap-2">
                    <Award className="w-5 h-5 text-[#FE8A00]" />
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        Audit Komisi Affiliate (Snapshot Permanen)
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        Dihitung otomatis saat pesanan dibuat. Nilai tidak dapat diubah oleh konfigurasi baru.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Kode Referral:</span>
                    <span className="font-mono font-black text-sm bg-orange-100 text-[#FE8A00] px-2.5 py-0.5 rounded-lg border border-orange-200">
                      {commissionSnap.referralCode}
                    </span>
                  </div>
                </div>

                {/* Mitra info & overall commission status */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-orange-50/50 p-3.5 rounded-xl border border-orange-100 text-xs">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Nama Mitra Affiliate</span>
                    <div className="font-bold text-slate-900 mt-0.5">{commissionSnap.affiliateName || 'Mitra Terdaftar'}</div>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Total Komisi Transaksi</span>
                    <div className="font-mono font-black text-base text-[#FE8A00] mt-0.5">
                      Rp {commissionSnap.totalCommission.toLocaleString('id-ID')}
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Status Hak Komisi</span>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className={`inline-block px-2.5 py-0.5 rounded text-[11px] font-bold ${
                        commissionSnap.status === 'PAID' ? 'bg-emerald-100 text-emerald-800' :
                        commissionSnap.status === 'APPROVED' ? 'bg-blue-100 text-blue-800' :
                        commissionSnap.status === 'CANCELLED' ? 'bg-rose-100 text-rose-800' :
                        'bg-amber-100 text-amber-800'
                      }`}>
                        {commissionSnap.status === 'PAID' ? 'LUNAS / DICAIRKAN' :
                         commissionSnap.status === 'APPROVED' ? 'DISETUJUI' :
                         commissionSnap.status === 'CANCELLED' ? 'DIBATALKAN' :
                         'PENDING (Menunggu)'}
                      </span>

                      {/* Quick action for commission */}
                      {onUpdateCommissionStatus && commissionSnap.status !== 'PAID' && commissionSnap.status !== 'CANCELLED' && (
                        <button
                          type="button"
                          onClick={() => onUpdateCommissionStatus(order.id, 'PAID')}
                          className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold"
                          title="Tandai komisi sudah ditransfer ke mitra"
                        >
                          Cairkan
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Per-item commission calculation list */}
                <div className="space-y-2">
                  <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                    Rincian Perhitungan Komisi per Item:
                  </div>

                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                    {commissionSnap.itemsCommission.map((itemCom, idx) => (
                      <div key={idx} className="p-3 text-xs flex flex-wrap items-center justify-between gap-2 hover:bg-slate-50">
                        <div>
                          <div className="font-bold text-slate-900">{itemCom.productName}</div>
                          <div className="text-[11px] text-slate-500">
                            {itemCom.quantity} unit • Subtotal: Rp {itemCom.subtotal.toLocaleString('id-ID')}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            itemCom.appliedType === 'campaign' ? 'bg-orange-100 text-[#FE8A00]' :
                            itemCom.appliedType === 'product_custom' ? 'bg-blue-100 text-blue-800' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {itemCom.appliedType === 'campaign' ? `Campaign Promosi (${itemCom.ratePercent}%)` :
                             itemCom.appliedType === 'product_custom' ? `Komisi Khusus Produk (${itemCom.ratePercent}%)` :
                             `Komisi Standar Toko (${itemCom.ratePercent}%)`}
                          </span>

                          <div className="text-right">
                            <span className="font-mono font-black text-slate-900 text-xs">
                              Rp {itemCom.commissionAmount.toLocaleString('id-ID')}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : order.referralCode ? (
              <div className="bg-amber-50 rounded-2xl border border-amber-200 p-4 text-xs text-amber-900 flex items-center justify-between">
                <div>
                  <span className="font-bold">Kode Referral Terdeteksi: </span>
                  <span className="font-mono font-bold text-[#FE8A00]">{order.referralCode}</span>
                  <p className="text-[11px] text-amber-800 mt-0.5">
                    Pesanan ini mencatat kode referral namun belum memiliki kalkulasi snapshot komisi.
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          {/* Sidebar / Customer & Delivery Info (Right col) */}
          <div className="space-y-6">
            {/* Customer Details Card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4 text-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-bold text-slate-900 flex items-center gap-1.5">
                  <User className="w-4 h-4 text-slate-500" />
                  <span>Informasi Pelanggan</span>
                </h3>
                {onViewCustomer && (
                  <button
                    type="button"
                    onClick={() => onViewCustomer(order.customerPhone || order.customerName)}
                    className="text-[11px] font-bold text-[#FE8A00] hover:underline flex items-center gap-1"
                  >
                    <span>Profil Pelanggan</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                )}
              </div>

              <div className="space-y-2.5">
                <div>
                  <div className="text-[11px] text-slate-400 font-bold uppercase">Nama Lengkap</div>
                  <div className="font-bold text-slate-900 text-sm mt-0.5">{order.customerName}</div>
                </div>

                <div>
                  <div className="text-[11px] text-slate-400 font-bold uppercase">Nomor WhatsApp / HP</div>
                  <div className="font-mono font-bold text-slate-800 mt-0.5 flex items-center justify-between">
                    <span>{order.customerPhone}</span>
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-emerald-700 hover:underline flex items-center gap-1"
                    >
                      <span>Chat WA</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                </div>

                {order.customerEmail ? (
                  <div>
                    <div className="text-[11px] text-slate-400 font-bold uppercase">Email Pelanggan</div>
                    <div className="text-slate-700 mt-0.5">{order.customerEmail}</div>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Delivery Address Card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4 text-xs">
              <div className="flex items-center gap-1.5 border-b border-slate-100 pb-3">
                <MapPin className="w-4 h-4 text-slate-500" />
                <h3 className="font-bold text-slate-900">Alamat & Pengiriman</h3>
              </div>

              <div className="space-y-2.5">
                <div>
                  <div className="text-[11px] text-slate-400 font-bold uppercase">Wilayah / Kecamatan</div>
                  <div className="font-bold text-slate-900 mt-0.5">{order.customerDistrict}</div>
                </div>

                <div>
                  <div className="text-[11px] text-slate-400 font-bold uppercase">Alamat Lengkap Tujuan</div>
                  <div className="text-slate-800 mt-0.5 leading-relaxed bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    {order.deliveryAddress}
                  </div>
                </div>

                {order.deliveryNotes ? (
                  <div>
                    <div className="text-[11px] text-slate-400 font-bold uppercase">Catatan Kurir / Toko</div>
                    <div className="text-amber-800 italic mt-0.5 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                      "{order.deliveryNotes}"
                    </div>
                  </div>
                ) : null}

                <div>
                  <div className="text-[11px] text-slate-400 font-bold uppercase">Metode Pengiriman</div>
                  <div className="font-semibold text-slate-800 mt-0.5 flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-slate-500" />
                    <span>{order.shippingMethod} (Rp {order.shippingCost.toLocaleString('id-ID')})</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Payment & System Tracking */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-3 text-xs">
              <div className="flex items-center gap-1.5 border-b border-slate-100 pb-3">
                <CreditCard className="w-4 h-4 text-slate-500" />
                <h3 className="font-bold text-slate-900">Metode & Waktu Transaksi</h3>
              </div>

              <div className="space-y-2 text-slate-600">
                <div className="flex justify-between">
                  <span className="text-slate-400">Metode Pembayaran:</span>
                  <span className="font-bold text-slate-800">{order.paymentMethod || 'Midtrans / Online Payment'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Tanggal Dibuat:</span>
                  <span>{new Date(order.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Terakhir Diperbarui:</span>
                  <span>{order.updatedAt ? new Date(order.updatedAt).toLocaleTimeString('id-ID') : '-'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
