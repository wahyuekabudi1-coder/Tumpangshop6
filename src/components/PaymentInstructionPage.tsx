import React from 'react';
import { Order, PaymentStatus } from '../types';
import { 
  ArrowLeft, CreditCard, ExternalLink, CheckCircle2, 
  Clock, ShieldCheck, AlertCircle, Copy, ArrowRight, Store 
} from 'lucide-react';

interface PaymentInstructionPageProps {
  order: Order;
  onNavigateToOrderDetail: (orderId: string) => void;
  onNavigateToCatalog: () => void;
  onShowToast: (msg: string) => void;
}

export default function PaymentInstructionPage({
  order,
  onNavigateToOrderDetail,
  onNavigateToCatalog,
  onShowToast
}: PaymentInstructionPageProps) {
  const isPaid = order.paymentStatus === 'PAID';
  const hasPaymentLink = Boolean(order.paymentLinkUrl);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    onShowToast(`✓ ${label} disalin ke papan klip!`);
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8 sm:py-12">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 space-y-6">
        
        {/* Top Status Card */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-2xs text-center space-y-4">
          <div className={`w-16 h-16 rounded-2xl mx-auto flex items-center justify-center ${
            isPaid ? 'bg-emerald-100 text-emerald-800' : 'bg-orange-100 text-[#FE8A00]'
          }`}>
            {isPaid ? (
              <CheckCircle2 className="w-8 h-8" />
            ) : (
              <CreditCard className="w-8 h-8" />
            )}
          </div>

          <div>
            <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase mb-2 ${
              isPaid 
                ? 'bg-emerald-100 text-emerald-800' 
                : 'bg-amber-100 text-amber-900 border border-amber-300'
            }`}>
              {isPaid ? 'Pembayaran Terverifikasi (PAID)' : 'Menunggu Pembayaran (PENDING)'}
            </span>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              {isPaid ? 'Pembayaran Berhasil Dikonfirmasi!' : 'Instruksi Pembayaran Pesanan'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-md mx-auto">
              Nomor Pesanan: <strong className="text-slate-800 font-mono">{order.orderNumber}</strong>
            </p>
          </div>

          {/* Amount Box */}
          <div className="p-4 bg-orange-50/60 rounded-2xl border border-orange-200/60 max-w-md mx-auto">
            <div className="text-xs text-slate-500 font-semibold mb-1">Total Tagihan Yang Harus Dibayar</div>
            <div className="text-3xl font-black text-[#FE8A00] tracking-tight">
              Rp {order.total.toLocaleString('id-ID')}
            </div>
            {order.paymentExpiresAt && !isPaid && (
              <div className="text-[11px] text-slate-500 mt-1.5 flex items-center justify-center gap-1">
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                <span>Batas Waktu: {new Date(order.paymentExpiresAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</span>
              </div>
            )}
          </div>

          {/* Payment Link Action Button */}
          {!isPaid && (
            <div className="pt-2 max-w-md mx-auto space-y-3">
              {hasPaymentLink ? (
                <a
                  href={order.paymentLinkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-4 px-6 rounded-2xl bg-[#FE8A00] hover:bg-[#e07b00] text-white font-bold text-sm shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
                >
                  <span>Bayar Sekarang (Official Gateway)</span>
                  <ExternalLink className="w-4 h-4" />
                </a>
              ) : (
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-left text-xs text-amber-900 space-y-1.5">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>Integrasi Gateway Menunggu Konfigurasi API</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed">
                    Pesanan Anda telah aman tercatat di sistem toko dengan status <strong>Pending</strong>. Kredensial gateway produksi belum disetup di lingkungan server toko. Penjual akan memvalidasi pembayaran resmi.
                  </p>
                </div>
              )}

              <button
                onClick={() => onNavigateToOrderDetail(order.id)}
                className="w-full py-3.5 px-6 rounded-2xl border border-slate-200 hover:border-slate-300 bg-white font-bold text-xs sm:text-sm text-slate-700 hover:text-slate-900 transition-colors flex items-center justify-center gap-2 shadow-2xs"
              >
                <span>Lihat Detail & Status Pesanan</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {isPaid && (
            <div className="pt-2 max-w-md mx-auto">
              <button
                onClick={() => onNavigateToOrderDetail(order.id)}
                className="w-full py-4 px-6 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm shadow-md shadow-emerald-700/20 flex items-center justify-center gap-2 transition-colors"
              >
                <span>Lihat Detail Pesanan</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Payment Policy & Transparency Card */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-5 sm:p-6 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <h2 className="text-sm font-bold text-slate-900">
              Kebijakan Verifikasi Pembayaran Marketplace
            </h2>
          </div>

          <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 font-bold flex items-center justify-center shrink-0 text-[11px]">1</span>
              <p>
                <strong>Verifikasi Webhook Resmi:</strong> Status pesanan tidak akan diubah menjadi <em>Paid</em> hanya karena pengguna kembali ke website. Sistem hanya mengubah status setelah webhook resmi gateway terverifikasi secara aman.
              </p>
            </div>

            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 font-bold flex items-center justify-center shrink-0 text-[11px]">2</span>
              <p>
                <strong>Pencegahan Pembayaran Ganda:</strong> Tautan pembayaran resmi dikaitkan dengan nomor pesanan tunggal berenkripsi untuk mencegah transaksi dobel.
              </p>
            </div>

            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 font-bold flex items-center justify-center shrink-0 text-[11px]">3</span>
              <p>
                <strong>Stok Terjamin:</strong> Barang pesanan telah diamankan dari inventaris toko saat pesanan dibuat, sehingga Anda tidak perlu khawatir kehabisan stok.
              </p>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between border-t border-slate-100">
            <button
              onClick={onNavigateToCatalog}
              className="text-xs font-bold text-[#FE8A00] hover:text-[#e07b00] flex items-center gap-1.5 transition-colors"
            >
              <Store className="w-4 h-4" />
              <span>Kembali Belanja di Tumpang Shop</span>
            </button>

            <button
              onClick={() => copyToClipboard(order.orderNumber, 'Nomor Pesanan')}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1 transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Salin Nomor Pesanan</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
