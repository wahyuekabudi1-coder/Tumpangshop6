import React from 'react';
import { Order } from '../../types';
import { 
  ArrowLeft, ChevronRight, User, Phone, Mail, MapPin, 
  ShoppingBag, DollarSign, Calendar, ExternalLink, Clock, CheckCircle2
} from 'lucide-react';

interface CustomerSummary {
  phone: string;
  name: string;
  email?: string;
  district: string;
  address: string;
  orderCount: number;
  totalSpend: number;
  lastOrderDate: string;
}

interface AdminCustomerDetailPageProps {
  customer: CustomerSummary;
  customerOrders: Order[];
  onBack: () => void;
  onViewOrder: (orderId: string) => void;
}

export default function AdminCustomerDetailPage({
  customer,
  customerOrders,
  onBack,
  onViewOrder
}: AdminCustomerDetailPageProps) {
  const avgOrderValue = customer.orderCount > 0 
    ? Math.round(customer.totalSpend / customer.orderCount) 
    : 0;

  const waNumber = customer.phone.replace(/[^0-9]/g, '');
  const cleanWa = waNumber.startsWith('0') ? '62' + waNumber.slice(1) : waNumber;
  const waUrl = `https://wa.me/${cleanWa}?text=${encodeURIComponent(`Halo kak ${customer.name}, salam dari Tumpang Shop.`)}`;

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 font-sans pb-16">
      {/* Top Header / Sticky Navigation Bar */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 sm:px-6 py-3.5 flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 border border-slate-200 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"
            title="Kembali ke Direktori Pelanggan"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="cursor-pointer hover:underline" onClick={onBack}>Seller Centre</span>
              <ChevronRight className="w-3 h-3 text-slate-400" />
              <span className="cursor-pointer hover:underline" onClick={onBack}>Pelanggan</span>
              <ChevronRight className="w-3 h-3 text-slate-400" />
              <span className="font-bold text-slate-800">Rincian Pelanggan</span>
            </div>
            <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight mt-0.5">
              {customer.name}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-2xs transition-colors"
          >
            <Phone className="w-3.5 h-3.5" />
            <span>Chat WhatsApp</span>
          </a>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Customer Metrics Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-bold uppercase tracking-wider">Total Belanja (LTV)</span>
              <DollarSign className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-xl font-black text-emerald-700 mt-1 font-mono">
              Rp {customer.totalSpend.toLocaleString('id-ID')}
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-bold uppercase tracking-wider">Frekuensi Pesanan</span>
              <ShoppingBag className="w-4 h-4 text-[#FE8A00]" />
            </div>
            <div className="text-xl font-black text-slate-900 mt-1">
              {customer.orderCount} transaksi
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-bold uppercase tracking-wider">Rata-Rata Keranjang (AOV)</span>
              <ShoppingBag className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-xl font-black text-slate-900 mt-1 font-mono">
              Rp {avgOrderValue.toLocaleString('id-ID')}
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-bold uppercase tracking-wider">Pesanan Terakhir</span>
              <Calendar className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="text-sm font-bold text-slate-800 mt-1.5">
              {new Date(customer.lastOrderDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
            </div>
          </div>
        </div>

        {/* Customer Profile & Info Details */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
            <User className="w-4 h-4 text-[#FE8A00]" />
            <span>Profil & Informasi Kontak</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <span className="text-slate-400 font-bold uppercase text-[10px]">Nomor WhatsApp / HP</span>
              <div className="font-mono font-bold text-slate-900 mt-0.5">{customer.phone}</div>
            </div>

            <div>
              <span className="text-slate-400 font-bold uppercase text-[10px]">Email Pelanggan</span>
              <div className="text-slate-800 mt-0.5">{customer.email || 'Tidak dicantumkan'}</div>
            </div>

            <div>
              <span className="text-slate-400 font-bold uppercase text-[10px]">Wilayah / Kecamatan Utama</span>
              <div className="font-bold text-slate-900 mt-0.5">{customer.district}</div>
            </div>
          </div>

          <div className="pt-2 text-xs">
            <span className="text-slate-400 font-bold uppercase text-[10px]">Alamat Pengiriman Terakhir</span>
            <div className="text-slate-800 mt-1 p-3 bg-slate-50 rounded-xl border border-slate-100 leading-relaxed">
              {customer.address}
            </div>
          </div>
        </div>

        {/* History of Orders by this Customer */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Riwayat Transaksi Pesanan ({customerOrders.length} Pesanan)
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Daftar semua pesanan yang dilakukan oleh pelanggan ini di Tumpang Shop
              </p>
            </div>
          </div>

          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 text-slate-600 uppercase border-b border-slate-200 font-semibold tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">No. Pesanan & Tanggal</th>
                <th className="py-3 px-4">Barang Dipesan</th>
                <th className="py-3 px-4">Total Belanja</th>
                <th className="py-3 px-4">Status Pesanan</th>
                <th className="py-3 px-4">Status Bayar</th>
                <th className="py-3 px-4 text-right">Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customerOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    Belum ada riwayat pesanan tercatat.
                  </td>
                </tr>
              ) : (
                customerOrders.map(ord => (
                  <tr key={ord.id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-4">
                      <div className="font-mono font-bold text-slate-900">{ord.orderNumber}</div>
                      <div className="text-[10px] text-slate-400">
                        {new Date(ord.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>

                    <td className="py-3 px-4 max-w-xs truncate text-slate-700">
                      {ord.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}
                    </td>

                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      Rp {ord.total.toLocaleString('id-ID')}
                    </td>

                    <td className="py-3 px-4">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                        ord.orderStatus === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' :
                        ord.orderStatus === 'CANCELLED' ? 'bg-rose-100 text-rose-800' :
                        ord.orderStatus === 'SHIPPED' ? 'bg-blue-100 text-blue-800' :
                        'bg-amber-100 text-amber-800'
                      }`}>
                        {ord.orderStatus}
                      </span>
                    </td>

                    <td className="py-3 px-4">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                        ord.paymentStatus === 'PAID' ? 'bg-emerald-100 text-emerald-800' :
                        (ord.paymentStatus === 'REJECTED' || ord.paymentStatus === 'EXPIRED') ? 'bg-rose-100 text-rose-800' :
                        'bg-amber-100 text-amber-800'
                      }`}>
                        {ord.paymentStatus}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => onViewOrder(ord.id)}
                        className="px-2.5 py-1 text-[11px] font-bold text-[#FE8A00] hover:bg-orange-50 rounded transition-colors inline-flex items-center gap-1"
                      >
                        <span>Lihat Rincian</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
