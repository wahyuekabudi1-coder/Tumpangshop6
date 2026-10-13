import React, { useState } from 'react';
import { Order, PaymentStatus } from '../types';
import { simulatePaymentSuccessViaBackend } from '../lib/paymentGateway';
import { 
  ArrowLeft, CreditCard, ExternalLink, CheckCircle2, 
  Clock, ShieldCheck, AlertCircle, Copy, ArrowRight, Store,
  Zap, Loader2, Info, TestTube2
} from 'lucide-react';

interface PaymentInstructionPageProps {
  order: Order;
  onNavigateToOrderDetail: (orderId: string) => void;
  onNavigateToCatalog: () => void;
  onShowToast: (msg: string) => void;
  onOrderUpdated?: (order: Order) => void;
}

export default function PaymentInstructionPage({
  order,
  onNavigateToOrderDetail,
  onNavigateToCatalog,
  onShowToast,
  onOrderUpdated
}: PaymentInstructionPageProps) {
  const [currentOrder, setCurrentOrder] = useState<Order>(order);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState<{ success: boolean; message: string } | null>(null);

  // Check if environment is development/preview
  const isDevOrPreview = Boolean(
    (import.meta as any).env?.DEV || 
    (import.meta as any).env?.MODE !== 'production' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname.includes('127.0.0.1') ||
    window.location.hostname.includes('webcontainer') ||
    window.location.hostname.includes('run.app')
  );

  const isPaid = currentOrder.paymentStatus === 'PAID';
  const hasPaymentLink = Boolean(currentOrder.paymentLinkUrl);
  const isSimulatedTest = Boolean(currentOrder.isTestTransaction || currentOrder.paymentGateway === 'ARTOPAY_SIMULATION');

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    onShowToast(`✓ ${label} disalin ke papan klip!`);
  };

  // Handler for development simulation button (TAHAP 2)
  const handleSimulatePaymentSuccess = async () => {
    if (isSimulating || isPaid) return;

    setIsSimulating(true);
    setSimulationResult(null);

    try {
      const res = await simulatePaymentSuccessViaBackend(currentOrder.id, currentOrder.total);

      if (res.success && res.order) {
        setCurrentOrder(res.order);
        if (onOrderUpdated) {
          onOrderUpdated(res.order);
        }
        setSimulationResult({
          success: true,
          message: res.message
        });
        onShowToast('✓ Simulasi pembayaran berhasil diverifikasi backend (SIMULATED/TEST)!');
      } else {
        setSimulationResult({
          success: false,
          message: res.message || 'Simulasi pembayaran gagal diproses oleh server.'
        });
        onShowToast('Gagal memproses simulasi pembayaran.');
      }
    } catch (err: any) {
      console.error('Simulation error:', err);
      setSimulationResult({
        success: false,
        message: err?.message || 'Terjadi kesalahan jaringan saat memproses simulasi.'
      });
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8 sm:py-12">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 space-y-6">
        
        {/* Top Status Card */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-2xs text-center space-y-4">
          <div className={`w-16 h-16 rounded-2xl mx-auto flex items-center justify-center ${
            isPaid 
              ? (isSimulatedTest ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-800') 
              : 'bg-orange-100 text-[#FE8A00]'
          }`}>
            {isPaid ? (
              <CheckCircle2 className="w-8 h-8" />
            ) : (
              <CreditCard className="w-8 h-8" />
            )}
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-center gap-2 mb-2">
              <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase ${
                isPaid 
                  ? 'bg-emerald-100 text-emerald-800' 
                  : 'bg-amber-100 text-amber-900 border border-amber-300'
              }`}>
                {isPaid ? 'Pembayaran Terverifikasi (PAID)' : 'Menunggu Pembayaran (PENDING)'}
              </span>

              {isSimulatedTest && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                  <TestTube2 className="w-3 h-3" />
                  <span>SIMULATED / TEST</span>
                </span>
              )}
            </div>

            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              {isPaid 
                ? (isSimulatedTest ? 'Simulasi Pembayaran Terverifikasi!' : 'Pembayaran Berhasil Dikonfirmasi!') 
                : 'Instruksi Pembayaran Pesanan'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-md mx-auto">
              Nomor Pesanan: <strong className="text-slate-800 font-mono">{currentOrder.orderNumber}</strong>
            </p>
          </div>

          {/* Amount Box with Unique Code Breakdown */}
          <div className="p-4 bg-orange-50/60 rounded-2xl border border-orange-200/60 max-w-md mx-auto space-y-2">
            <div className="text-xs text-slate-500 font-semibold">Total Tagihan Yang Harus Dibayar</div>
            <div className="text-3xl font-black text-[#FE8A00] tracking-tight">
              Rp {currentOrder.total.toLocaleString('id-ID')}
            </div>

            {/* Breakdown itemized */}
            <div className="pt-2 border-t border-orange-200/60 space-y-1 text-left text-xs text-slate-600">
              <div className="flex justify-between">
                <span>Subtotal Produk:</span>
                <span className="font-semibold text-slate-800">Rp {currentOrder.subtotal.toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between">
                <span>Pengiriman Reguler via Udara:</span>
                <span className="font-semibold text-slate-800">Rp {currentOrder.shippingCost.toLocaleString('id-ID')}</span>
              </div>
              {currentOrder.serviceFee > 0 && (
                <div className="flex justify-between">
                  <span>Biaya Layanan:</span>
                  <span className="font-semibold text-slate-800">Rp {currentOrder.serviceFee.toLocaleString('id-ID')}</span>
                </div>
              )}
              {currentOrder.uniqueCode !== undefined && currentOrder.uniqueCode > 0 && (
                <div className="flex justify-between text-orange-950 font-bold bg-orange-100/70 p-1.5 rounded-lg border border-orange-200">
                  <span className="flex items-center gap-1">
                    <span>Kode Unik Verifikasi Server:</span>
                    <span className="text-[10px] px-1 py-0.2 rounded bg-[#FE8A00] text-white">Acak</span>
                  </span>
                  <span>+ Rp {currentOrder.uniqueCode.toLocaleString('id-ID')}</span>
                </div>
              )}
            </div>

            {currentOrder.paymentExpiresAt && !isPaid && (
              <div className="text-[11px] text-slate-500 pt-1 flex items-center justify-center gap-1">
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                <span>Batas Waktu: {new Date(currentOrder.paymentExpiresAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</span>
              </div>
            )}
          </div>

          {/* Simulation Notice if Paid via simulation */}
          {isPaid && isSimulatedTest && (
            <div className="max-w-md mx-auto p-3.5 bg-indigo-50 border border-indigo-200 rounded-2xl text-left text-xs text-indigo-900 space-y-1 animate-in fade-in duration-200">
              <div className="font-bold flex items-center gap-1.5">
                <TestTube2 className="w-4 h-4 text-indigo-700 shrink-0" />
                <span>Hasil Pengujian Simulasi Backend:</span>
              </div>
              <p className="text-indigo-800 text-[11px] leading-relaxed">
                Order ID <strong>{currentOrder.orderNumber}</strong> dengan nominal <strong>Rp {currentOrder.total.toLocaleString('id-ID')}</strong> telah divalidasi dan disimulasikan sebagai pembayaran uji coba (SIMULATED/TEST). Transaksi production tidak diubah.
              </p>
            </div>
          )}

          {/* Payment Link Action Button */}
          {!isPaid && (
            <div className="pt-2 max-w-md mx-auto space-y-3">
              {hasPaymentLink ? (
                <a
                  href={currentOrder.paymentLinkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-4 px-6 rounded-2xl bg-[#FE8A00] hover:bg-[#e07b00] text-white font-bold text-sm shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
                >
                  <span>Bayar via ArtoPay (Payment Link)</span>
                  <ExternalLink className="w-4 h-4" />
                </a>
              ) : (
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-left text-xs text-amber-900 space-y-1.5">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>Adapter ArtoPay Siap Menerima Kredensial API</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed">
                    Struktur pembayaran dan perhitungan backend untuk <strong>ArtoPay</strong> telah siap. Pesanan dicatat di sistem dengan status <strong>Menunggu Pembayaran (PENDING)</strong> beserta kode unik verifikasi.
                  </p>
                </div>
              )}

              {/* TAHAP 2: Tombol Simulasi Pembayaran Berhasil (Dev Only) */}
              {isDevOrPreview && (
                <div className="p-4 rounded-2xl bg-slate-900 text-white text-left space-y-2.5 shadow-md">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
                      <Zap className="w-3.5 h-3.5" />
                      <span>Mode Pengujian Development / Sandbox</span>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      DEV ONLY
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Uji alur checkout dari awal hingga akhir tanpa menunggu pembayaran gateway asli. Backend akan memvalidasi Order ID dan nominal pesanan secara nyata.
                  </p>
                  
                  <button
                    type="button"
                    onClick={handleSimulatePaymentSuccess}
                    disabled={isSimulating}
                    className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-md flex items-center justify-center gap-2 transition-all active:scale-98 disabled:opacity-50"
                  >
                    {isSimulating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Memproses Simulasi di Backend...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                        <span>Simulasikan Pembayaran Berhasil (Uji Coba Backend)</span>
                      </>
                    )}
                  </button>

                  {simulationResult && !simulationResult.success && (
                    <div className="p-2 rounded bg-rose-950/80 border border-rose-800 text-rose-300 text-[11px]">
                      {simulationResult.message}
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={() => onNavigateToOrderDetail(currentOrder.id)}
                className="w-full py-3.5 px-6 rounded-2xl border border-slate-200 hover:border-slate-300 bg-white font-bold text-xs sm:text-sm text-slate-700 hover:text-slate-900 transition-colors flex items-center justify-center gap-2 shadow-2xs"
              >
                <span>Lihat Detail & Status Pesanan</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {isPaid && (
            <div className="pt-2 max-w-md mx-auto space-y-2">
              <button
                onClick={() => onNavigateToOrderDetail(currentOrder.id)}
                className="w-full py-4 px-6 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm shadow-md shadow-emerald-700/20 flex items-center justify-center gap-2 transition-colors"
              >
                <span>Lanjutkan ke Detail & Pelacakan Pesanan</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                onClick={onNavigateToCatalog}
                className="w-full py-2.5 px-4 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs transition-colors"
              >
                Kembali ke Beranda Belanja
              </button>
            </div>
          )}
        </div>

        {/* Payment Policy & Transparency Card */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-5 sm:p-6 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <h2 className="text-sm font-bold text-slate-900">
              Integrasi ArtoPay & Kebijakan Verifikasi Pembayaran
            </h2>
          </div>

          <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 font-bold flex items-center justify-center shrink-0 text-[11px]">1</span>
              <p>
                <strong>Kode Unik Verifikasi (+Rp {currentOrder.uniqueCode || '1–200'}):</strong> Dibuat otomatis oleh server untuk membedakan transaksi yang masuk bersamaan dan disimpan permanen pada pesanan. Nilai transfer harus tepat sesuai tagihan akhir.
              </p>
            </div>

            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 font-bold flex items-center justify-center shrink-0 text-[11px]">2</span>
              <p>
                <strong>Verifikasi Webhook Server-Side:</strong> Status <em>Paid</em> hanya ditetapkan melalui callback webhook resmi ArtoPay yang ditandatangani HMAC-SHA256 menggunakan Private Key. Callback browser saja tidak dianggap sebagai bukti pembayaran.
              </p>
            </div>

            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 font-bold flex items-center justify-center shrink-0 text-[11px]">3</span>
              <p>
                <strong>Pemisahan Status Operasional:</strong> Status pembayaran (<em>Payment Status</em>) dipisahkan dari status pemrosesan kargo (<em>Order Status</em>). Barang impor baru diteruskan ke konfirmasi pemasok setelah pembayaran terverifikasi sah.
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
              onClick={() => copyToClipboard(currentOrder.orderNumber, 'Nomor Pesanan')}
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
