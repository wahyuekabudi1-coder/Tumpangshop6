import React, { useState, useMemo } from 'react';
import { AffiliateApplication, Order } from '../../types';
import { getAffiliateClicks } from '../../lib/affiliateAttribution';
import { 
  ArrowLeft, ChevronRight, Award, Phone, Mail, Globe, 
  Copy, Check, ExternalLink, DollarSign, ShoppingBag, Clock,
  MousePointerClick, Share2
} from 'lucide-react';

interface AdminAffiliateDetailPageProps {
  affiliate: AffiliateApplication;
  referralOrders: Order[];
  onBack: () => void;
  onUpdateStatus: (affiliateId: string, status: 'APPROVED' | 'PENDING' | 'REJECTED') => void;
  onViewOrder: (orderId: string) => void;
}

export default function AdminAffiliateDetailPage({
  affiliate,
  referralOrders,
  onBack,
  onUpdateStatus,
  onViewOrder
}: AdminAffiliateDetailPageProps) {
  const [copiedLink, setCopiedLink] = useState(false);

  const promoLink = `${window.location.origin}/?ref=${affiliate.referralCode}`;
  const catalogPromoLink = `${window.location.origin}/products?ref=${affiliate.referralCode}`;

  const handleCopyPromoLink = () => {
    navigator.clipboard.writeText(promoLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const validClicks = useMemo(() => {
    return getAffiliateClicks(affiliate.referralCode);
  }, [affiliate.referralCode]);

  const totalReferralCommission = referralOrders.reduce((sum, ord) => {
    return sum + (ord.affiliateCommission?.totalCommission || 0);
  }, 0);

  const paidCommission = referralOrders.reduce((sum, ord) => {
    if (ord.affiliateCommission?.status === 'PAID') {
      return sum + ord.affiliateCommission.totalCommission;
    }
    return sum;
  }, 0);

  const approvedCommission = referralOrders.reduce((sum, ord) => {
    if (ord.affiliateCommission?.status === 'APPROVED') {
      return sum + ord.affiliateCommission.totalCommission;
    }
    return sum;
  }, 0);

  const pendingCommission = totalReferralCommission - paidCommission - approvedCommission;

  const waNumber = affiliate.phone.replace(/[^0-9]/g, '');
  const cleanWa = waNumber.startsWith('0') ? '62' + waNumber.slice(1) : waNumber;
  const waUrl = `https://wa.me/${cleanWa}?text=${encodeURIComponent(`Halo kak ${affiliate.fullName}, salam dari Tim Kemitraan Tumpang Shop.`)}`;

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 font-sans pb-16">
      {/* Top Header / Sticky Bar */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 sm:px-6 py-3.5 flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 border border-slate-200 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"
            title="Kembali ke Daftar Mitra"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="cursor-pointer hover:underline" onClick={onBack}>Seller Centre</span>
              <ChevronRight className="w-3 h-3 text-slate-400" />
              <span className="cursor-pointer hover:underline" onClick={onBack}>Affiliate</span>
              <ChevronRight className="w-3 h-3 text-slate-400" />
              <span className="font-bold text-slate-800">Rincian Mitra</span>
            </div>
            <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight mt-0.5">
              {affiliate.fullName}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {affiliate.status !== 'APPROVED' ? (
            <button
              type="button"
              onClick={() => onUpdateStatus(affiliate.id, 'APPROVED')}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-2xs transition-colors"
            >
              Setujui Kemitraan
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onUpdateStatus(affiliate.id, 'REJECTED')}
              className="px-3.5 py-1.5 border border-rose-200 hover:bg-rose-50 text-rose-700 text-xs font-bold rounded-lg transition-colors"
            >
              Nonaktifkan / Tolak
            </button>
          )}

          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-1.5 bg-[#FE8A00] hover:bg-[#e07b00] text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-2xs transition-colors"
          >
            <Phone className="w-3.5 h-3.5" />
            <span>Chat WA</span>
          </a>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Komisi Dihasilkan</span>
            <div className="text-xl font-black text-[#FE8A00] mt-1 font-mono">
              Rp {totalReferralCommission.toLocaleString('id-ID')}
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Komisi Disetujui</span>
            <div className="text-xl font-black text-emerald-700 mt-1 font-mono">
              Rp {approvedCommission.toLocaleString('id-ID')}
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Telah Dicairkan</span>
            <div className="text-xl font-black text-blue-700 mt-1 font-mono">
              Rp {paidCommission.toLocaleString('id-ID')}
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Pesanan Teratribusi</span>
            <div className="text-xl font-black text-slate-900 mt-1">
              {referralOrders.length} transaksi
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Klik Valid Terlacak</span>
            <div className="text-xl font-black text-slate-900 mt-1">
              {validClicks.length} klik
            </div>
          </div>
        </div>

        {/* Affiliate Profile & Referral Link Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
            <Award className="w-4 h-4 text-[#FE8A00]" />
            <span>Informasi Mitra & Format Tautan Otomatis</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <span className="text-slate-400 font-bold uppercase text-[10px]">Status Kemitraan</span>
              <div className="mt-1">
                <span className={`inline-block px-2.5 py-0.5 rounded text-xs font-bold ${
                  affiliate.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' : 
                  affiliate.status === 'REJECTED' ? 'bg-rose-100 text-rose-800' :
                  'bg-amber-100 text-amber-800'
                }`}>
                  {affiliate.status === 'APPROVED' ? 'DISETUJUI (Aktif)' : 
                   affiliate.status === 'REJECTED' ? 'DITOLAK / NONAKTIF' : 'MENUNGGU VERIFIKASI'}
                </span>
              </div>
            </div>

            <div>
              <span className="text-slate-400 font-bold uppercase text-[10px]">Kontak WhatsApp</span>
              <div className="font-mono font-bold text-slate-900 mt-0.5">{affiliate.phone}</div>
            </div>

            <div>
              <span className="text-slate-400 font-bold uppercase text-[10px]">Email</span>
              <div className="text-slate-800 mt-0.5">{affiliate.email}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-2">
            <div>
              <span className="text-slate-400 font-bold uppercase text-[10px]">Saluran Promosi Utama</span>
              <div className="text-slate-800 mt-0.5 font-semibold bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                {affiliate.promotionChannel}
              </div>
            </div>

            <div>
              <span className="text-slate-400 font-bold uppercase text-[10px]">Kode & Tautan Toko Utama</span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-mono font-black text-sm text-[#FE8A00] bg-orange-100 px-2.5 py-1 rounded-lg border border-orange-200">
                  {affiliate.referralCode}
                </span>
                <button
                  type="button"
                  onClick={handleCopyPromoLink}
                  className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs flex items-center gap-1.5 transition-colors"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                  <span>{copiedLink ? 'Tersalin' : 'Salin Tautan'}</span>
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Format produk otomatis: <code className="text-slate-600 bg-slate-100 px-1 py-0.5 rounded">/products/slug-produk?ref={affiliate.referralCode}</code>
              </p>
            </div>
          </div>
        </div>

        {/* History of Referral Orders */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Riwayat Transaksi Referral ({referralOrders.length} Pesanan)
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Daftar semua pesanan pembeli yang teratribusi ke mitra {affiliate.referralCode}
              </p>
            </div>
          </div>

          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 text-slate-600 uppercase border-b border-slate-200 font-semibold tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">No. Pesanan & Tanggal</th>
                <th className="py-3 px-4">Total Pesanan</th>
                <th className="py-3 px-4">Komisi Referral</th>
                <th className="py-3 px-4">Status Pesanan</th>
                <th className="py-3 px-4">Status Komisi</th>
                <th className="py-3 px-4 text-right">Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {referralOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    Belum ada transaksi referral yang tercatat untuk mitra ini.
                  </td>
                </tr>
              ) : (
                referralOrders.map(ord => (
                  <tr key={ord.id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-4">
                      <div className="font-mono font-bold text-slate-900">{ord.orderNumber}</div>
                      <div className="text-[10px] text-slate-400">
                        {new Date(ord.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>

                    <td className="py-3 px-4 font-mono font-medium text-slate-800">
                      Rp {ord.total.toLocaleString('id-ID')}
                    </td>

                    <td className="py-3 px-4 font-mono font-bold text-[#FE8A00]">
                      Rp {(ord.affiliateCommission?.totalCommission || 0).toLocaleString('id-ID')}
                    </td>

                    <td className="py-3 px-4">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                        ord.orderStatus === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' :
                        ord.orderStatus === 'CANCELLED' ? 'bg-rose-100 text-rose-800' :
                        'bg-amber-100 text-amber-800'
                      }`}>
                        {ord.orderStatus}
                      </span>
                    </td>

                    <td className="py-3 px-4">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                        ord.affiliateCommission?.status === 'PAID' ? 'bg-emerald-100 text-emerald-800' :
                        ord.affiliateCommission?.status === 'CANCELLED' ? 'bg-rose-100 text-rose-800' :
                        'bg-amber-100 text-amber-800'
                      }`}>
                        {ord.affiliateCommission?.status || 'PENDING'}
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
