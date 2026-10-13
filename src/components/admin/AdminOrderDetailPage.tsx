import React, { useState } from 'react';
import { Order, Product } from '../../types';
import { 
  ArrowLeft, ChevronRight, CheckCircle2, Clock, AlertTriangle, 
  Plane, CreditCard, DollarSign, User, MapPin, Phone, Mail, 
  ExternalLink, Printer, Share2, Check, X, ShieldAlert, Award, FileText,
  Save, Copy, Info
} from 'lucide-react';
import { getOrderStatusInfo, formatShippingMethod } from '../../lib/orderStatusHelper';

interface AdminOrderDetailPageProps {
  order: Order;
  products: Product[];
  onBack: () => void;
  onUpdateOrderStatus: (orderId: string, status: Order['orderStatus']) => void;
  onUpdatePaymentStatus: (orderId: string, status: Order['paymentStatus']) => void;
  onUpdateCommissionStatus?: (orderId: string, status: 'PENDING' | 'APPROVED' | 'PAID' | 'CANCELLED') => void;
  onUpdateTrackingInfo?: (orderId: string, trackingNumber: string, shippingCarrier?: string, trackingUrl?: string) => void;
  onViewCustomer?: (customerPhoneOrName: string) => void;
}

export default function AdminOrderDetailPage({
  order,
  products,
  onBack,
  onUpdateOrderStatus,
  onUpdatePaymentStatus,
  onUpdateCommissionStatus,
  onUpdateTrackingInfo,
  onViewCustomer
}: AdminOrderDetailPageProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [trackingNumberInput, setTrackingNumberInput] = useState(order.trackingNumber || '');
  const [carrierInput, setCarrierInput] = useState(order.shippingCarrier || 'Kargo Udara Reguler');
  const [trackingUrlInput, setTrackingUrlInput] = useState(order.trackingUrl || '');
  const [isSavingTracking, setIsSavingTracking] = useState(false);
  const [trackingSavedSuccess, setTrackingSavedSuccess] = useState(false);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleSaveTracking = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onUpdateTrackingInfo) return;
    setIsSavingTracking(true);
    onUpdateTrackingInfo(order.id, trackingNumberInput.trim(), carrierInput.trim(), trackingUrlInput.trim());
    setIsSavingTracking(false);
    setTrackingSavedSuccess(true);
    setTimeout(() => setTrackingSavedSuccess(false), 2500);
  };

  const waNumber = order.customerPhone.replace(/[^0-9]/g, '');
  const cleanWa = waNumber.startsWith('0') ? '62' + waNumber.slice(1) : waNumber;
  const statusInfo = getOrderStatusInfo(order.orderStatus);
  const waMessage = encodeURIComponent(
    `Halo kak ${order.customerName}, konfirmasi dari Tumpang Shop terkait pesanan #${order.orderNumber}. ` +
    `Status operasional saat ini: ${statusInfo.label}, status pembayaran: ${order.paymentStatus}. Terima kasih!`
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
              <span className="cursor-pointer hover:underline" onClick={onBack}>Pesanan Impor</span>
              <ChevronRight className="w-3 h-3 text-slate-400" />
              <span className="font-bold text-slate-800">Rincian & Kargo Udara</span>
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
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Status Operasional Pesanan Impor</div>
              <div className="flex items-center gap-2 mt-1">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black border ${statusInfo.badgeBg} ${statusInfo.badgeText} ${statusInfo.badgeBorder}`}>
                  <span className={`w-2 h-2 rounded-full ${statusInfo.dotColor}`} />
                  {statusInfo.label}
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
                  order.paymentStatus === 'REFUNDED' ? 'bg-purple-100 text-purple-800' :
                  order.paymentStatus === 'REJECTED' ? 'bg-rose-100 text-rose-800' :
                  'bg-amber-100 text-amber-800'
                }`}>
                  <CreditCard className="w-3.5 h-3.5" />
                  {order.paymentStatus === 'PAID' ? 'LUNAS (Paid)' :
                   order.paymentStatus === 'WAITING_VERIFICATION' ? 'Menunggu Verifikasi Gateway' :
                   order.paymentStatus === 'REFUNDED' ? 'Refunded' :
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
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                Ubah Alur Status Pesanan
              </label>
              <select
                value={order.orderStatus}
                onChange={(e) => onUpdateOrderStatus(order.id, e.target.value as any)}
                className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-bold text-slate-800 focus:outline-hidden focus:border-[#FE8A00]"
              >
                <option value="NEW">1. Menunggu Pembayaran</option>
                <option value="PAYMENT_VERIFIED">2. Pembayaran Terverifikasi</option>
                <option value="WAITING_SUPPLIER_CONFIRMATION">3. Menunggu Konfirmasi Pemasok</option>
                <option value="SUPPLIER_PROCESSING">4. Diproses Pemasok</option>
                <option value="IN_TRANSIT_AIR">5. Dalam Pengiriman (Kargo Udara)</option>
                <option value="DELIVERED">6. Terkirim (Selesai)</option>
                <option value="CANCELLED">7. Dibatalkan / Refund</option>
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
                <option value="REFUNDED">Refund (Dana Dikembalikan)</option>
                <option value="REJECTED">Ditolak / Dibatalkan</option>
                <option value="EXPIRED">Kedaluwarsa</option>
              </select>
            </div>
          </div>
        </div>

        {/* 2-Column Grid Body */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content (Left 2 cols) */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Air Cargo Tracking & Management Card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Plane className="w-5 h-5 text-[#FE8A00]" />
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">
                      Manajemen Kargo Udara & Nomor Resi AWB
                    </h2>
                    <p className="text-[11px] text-slate-400">
                      Input nomor pelacakan resmi kargo udara setelah pemasok mengirimkan pesanan
                    </p>
                  </div>
                </div>

                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-[#FE8A00]">
                  Estimasi: ~{order.estimatedAirDeliveryDays || 14} hari kalender
                </span>
              </div>

              <form onSubmit={handleSaveTracking} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      Nomor Resi / AWB Kargo Udara
                    </label>
                    <input
                      type="text"
                      value={trackingNumberInput}
                      onChange={(e) => setTrackingNumberInput(e.target.value)}
                      placeholder="Contoh: AWB-ID89234812"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-hidden focus:border-[#FE8A00] font-mono text-xs"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      Ekspedisi / Maskapai Kargo
                    </label>
                    <input
                      type="text"
                      value={carrierInput}
                      onChange={(e) => setCarrierInput(e.target.value)}
                      placeholder="Contoh: Garuda Cargo / SF Express / Air Regular"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-hidden focus:border-[#FE8A00] text-xs"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="font-bold text-slate-700 block mb-1">
                      Tautan Pelacakan Resmi (Tracking URL)
                    </label>
                    <input
                      type="url"
                      value={trackingUrlInput}
                      onChange={(e) => setTrackingUrlInput(e.target.value)}
                      placeholder="https://track.aircargo.com/..."
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-hidden focus:border-[#FE8A00] text-xs"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div className="text-[11px] text-slate-500">
                    {trackingSavedSuccess && (
                      <span className="text-emerald-600 font-bold flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> Data pelacakan berhasil disimpan & dapat dilihat pelanggan!
                      </span>
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled={isSavingTracking}
                    className="px-4 py-2 bg-[#FE8A00] hover:bg-[#e07b00] text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all shadow-xs"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Simpan Data Resi</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Products Table Card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Daftar Produk Impor yang Dipesan ({order.items.length} item)</span>
                </h2>
                <span className="text-xs font-semibold text-slate-500">
                  Total Unit: {order.items.reduce((s, it) => s + it.quantity, 0)} pcs
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/70 text-slate-500 uppercase tracking-wider text-[10px] font-bold border-b border-slate-100">
                    <tr>
                      <th className="py-2.5 px-3">Produk & SKU</th>
                      <th className="py-2.5 px-3">Harga Satuan</th>
                      <th className="py-2.5 px-3">Jumlah</th>
                      <th className="py-2.5 px-3 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {order.items.map((it, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900">{it.name}</div>
                          {it.variationInfo && (
                            <div className="text-[11px] text-[#FE8A00] font-medium">{it.variationInfo}</div>
                          )}
                          <div className="font-mono text-[10px] text-slate-400">{it.sku}</div>
                        </td>
                        <td className="py-3 px-3 font-semibold text-slate-700">
                          Rp {it.price.toLocaleString('id-ID')}
                        </td>
                        <td className="py-3 px-3 font-bold text-slate-900">
                          {it.quantity} {it.unit}
                        </td>
                        <td className="py-3 px-3 font-black text-slate-900 text-right">
                          Rp {it.subtotal.toLocaleString('id-ID')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Total Calculation */}
              <div className="border-t border-slate-200 pt-3 space-y-2 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal Produk:</span>
                  <span className="font-bold text-slate-900">Rp {order.subtotal.toLocaleString('id-ID')}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Pengiriman Reguler via Udara:</span>
                  <span className="font-bold text-slate-900">Rp {order.shippingCost.toLocaleString('id-ID')}</span>
                </div>
                {order.serviceFee > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Biaya Layanan & Pemeliharaan:</span>
                    <span className="font-bold text-slate-900">Rp {order.serviceFee.toLocaleString('id-ID')}</span>
                  </div>
                )}
                {order.discountAmount && order.discountAmount > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Diskon / Potongan:</span>
                    <span className="font-bold">- Rp {order.discountAmount.toLocaleString('id-ID')}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-900 font-black text-sm pt-2 border-t border-slate-100">
                  <span>Total Akhir Pesanan:</span>
                  <span className="text-[#FE8A00] text-base">Rp {order.total.toLocaleString('id-ID')}</span>
                </div>
              </div>
            </div>

            {/* Affiliate Commission Audit (If applicable) */}
            {commissionSnap ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <Award className="w-5 h-5 text-[#FE8A00]" />
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        Audit Komisi Affiliate (Snapshot Permanen)
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        Dihitung otomatis saat pesanan dibuat berdasarkan last-click attribution
                      </p>
                    </div>
                  </div>

                  <span className="font-mono font-black text-sm bg-orange-100 text-[#FE8A00] px-2.5 py-0.5 rounded-lg border border-orange-200">
                    {commissionSnap.referralCode}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-orange-50/50 p-3.5 rounded-xl border border-orange-100 text-xs">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Nama Mitra</span>
                    <div className="font-bold text-slate-900 mt-0.5">{commissionSnap.affiliateName || 'Mitra Terdaftar'}</div>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Total Komisi</span>
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
                         'PENDING'}
                      </span>
                    </div>
                  </div>
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
                    <span>Profil</span>
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
                <h3 className="font-bold text-slate-900">Alamat Tujuan Pengiriman</h3>
              </div>

              <div className="space-y-2.5">
                <div>
                  <div className="text-[11px] text-slate-400 font-bold uppercase">Provinsi & Kota/Kabupaten</div>
                  <div className="font-bold text-slate-900 mt-0.5">
                    {order.customerProvince || 'Jawa Timur'} • {order.customerCity || '-'}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] text-slate-400 font-bold uppercase">Kecamatan & Kode Pos</div>
                  <div className="font-semibold text-slate-800 mt-0.5">
                    {order.customerDistrict} {order.customerPostalCode ? `(${order.customerPostalCode})` : ''}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] text-slate-400 font-bold uppercase">Alamat Lengkap Jalan</div>
                  <div className="text-slate-800 mt-0.5 leading-relaxed bg-slate-50 p-2.5 rounded-xl border border-slate-100 font-medium">
                    {order.deliveryAddress}
                  </div>
                </div>

                {order.deliveryNotes ? (
                  <div>
                    <div className="text-[11px] text-slate-400 font-bold uppercase">Catatan Kurir</div>
                    <div className="text-amber-800 italic mt-0.5 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                      "{order.deliveryNotes}"
                    </div>
                  </div>
                ) : null}

                <div>
                  <div className="text-[11px] text-slate-400 font-bold uppercase">Metode Pengiriman</div>
                  <div className="font-semibold text-slate-800 mt-0.5 flex items-center gap-1.5">
                    <Plane className="w-3.5 h-3.5 text-[#FE8A00]" />
                    <span>{formatShippingMethod(order.shippingMethod)} (Rp {order.shippingCost.toLocaleString('id-ID')})</span>
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
                  <span className="text-slate-400">Gateway:</span>
                  <span className="font-bold text-slate-800">{order.paymentGateway || 'Official Payment Link'}</span>
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
