import React, { useState, useRef, useEffect } from 'react';
import { StoreConfig } from '../types';
import { 
  Store, MapPin, Phone, ShieldCheck, 
  ArrowRight, X, FileText, CheckCircle2, Sparkles, Users
} from 'lucide-react';

interface FooterProps {
  storeConfig: StoreConfig;
  onOpenAffiliate?: () => void;
  categories?: any[];
  onSelectCategory?: (categoryId: string) => void;
  onOpenTracking?: () => void;
  onOpenAdminLogin?: () => void;
}

type ModalType = 'privasi' | 'syarat' | null;

export default function Footer({
  storeConfig,
  onOpenAffiliate,
  onOpenAdminLogin,
}: FooterProps) {
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [clickCount, setClickCount] = useState<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up timer when unmounting to avoid memory leaks
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleCopyrightClick = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    setClickCount((prev) => {
      const next = prev + 1;
      // Klik ke-14: reset hitungan menjadi 0 dan sembunyikan kembali akses tersebut
      if (next >= 14) {
        return 0;
      }
      return next;
    });

    // Reset hitungan jika pengguna berhenti berinteraksi selama 5 detik
    timerRef.current = setTimeout(() => {
      setClickCount(0);
    }, 5000);
  };

  const handleAdminLoginClick = () => {
    if (onOpenAdminLogin) {
      onOpenAdminLogin();
    } else {
      window.history.pushState({}, '', '/admin/login');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  const isHiddenAdminVisible = clickCount >= 10 && clickCount <= 13;

  const handleAffiliateClick = () => {
    if (onOpenAffiliate) {
      onOpenAffiliate();
    } else {
      window.history.pushState({}, '', '/affiliate');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  return (
    <footer className="mt-auto bg-slate-900 text-slate-300 border-t border-slate-800">
      {/* 3 Main Sections */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12">
          
          {/* Bagian 1: Tentang Tumpang Shop */}
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#FE8A00] flex items-center justify-center text-white font-extrabold shadow-md shadow-orange-500/20">
                <Store className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-base font-black tracking-tight text-white">TUMPANG</span>
                  <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-orange-500/20 text-[#FE8A00] uppercase tracking-wider">
                    SHOP
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-medium">
                  {storeConfig.storeTagline || 'Pilihan Produk Berkualitas'}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Marketplace belanja online produk pilihan, berkualitas, dan menarik untuk kenyamanan belanja Anda.
            </p>

            <div className="pt-1 flex items-center gap-2 text-[11px] text-slate-400">
              <span className="inline-block w-2 h-2 rounded-full bg-[#FE8A00]" />
              <span>Platform Belanja Online Terpercaya</span>
            </div>
          </div>

          {/* Bagian 2: Program Affiliate */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-orange-500/10 text-[#FE8A00] flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                Program Affiliate
              </h4>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Dapatkan komisi dengan mempromosikan produk Tumpang Shop.
            </p>

            <div>
              <button
                onClick={handleAffiliateClick}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#FE8A00] hover:bg-[#e57c00] text-white text-xs font-bold shadow-md shadow-orange-500/20 hover:shadow-orange-500/30 active:scale-98 transition-all"
              >
                <span>Gabung Affiliate</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <p className="text-[11px] text-slate-400">
              Bagikan link referral ke status WhatsApp atau media sosial Anda untuk mendapatkan komisi.
            </p>
          </div>

          {/* Bagian 3: Bantuan */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-white">
              Bantuan
            </h4>

            {/* Kontak jika tersedia */}
            <div className="space-y-2 text-xs">
              {storeConfig.storeAddress && (
                <div className="flex items-start gap-2.5 text-slate-300">
                  <MapPin className="w-4 h-4 text-[#FE8A00] shrink-0 mt-0.5" />
                  <span className="leading-snug">{storeConfig.storeAddress}</span>
                </div>
              )}

              {storeConfig.storePhone && (
                <div className="flex items-center gap-2.5 text-slate-300">
                  <Phone className="w-4 h-4 text-[#FE8A00] shrink-0" />
                  <span>{storeConfig.storePhone}</span>
                </div>
              )}
            </div>

            {/* Kebijakan Privasi & Syarat Ketentuan */}
            <div className="pt-2 border-t border-slate-800/80 space-y-2 text-xs">
              <div>
                <button
                  onClick={() => setActiveModal('privasi')}
                  className="text-slate-400 hover:text-[#FE8A00] transition-colors text-left flex items-center gap-1.5"
                >
                  <span>Kebijakan Privasi</span>
                </button>
              </div>

              <div>
                <button
                  onClick={() => setActiveModal('syarat')}
                  className="text-slate-400 hover:text-[#FE8A00] transition-colors text-left flex items-center gap-1.5"
                >
                  <span>Syarat & Ketentuan</span>
                </button>
              </div>
            </div>
          </div>

        </div>

        {/* Bottom Bar: Hak Cipta & Brand Identity */}
        <div className="mt-10 pt-6 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center flex-wrap gap-2 text-center sm:text-left">
            <span
              onClick={handleCopyrightClick}
              className="cursor-default select-none transition-colors"
            >
              © 2026 Tumpang Shop. Produk Pilihan & Berkualitas. Semua hak dilindungi undang-undang.
            </span>
            {isHiddenAdminVisible && (
              <button
                type="button"
                onClick={handleAdminLoginClick}
                className="text-[11px] text-slate-400 hover:text-white underline underline-offset-2 ml-1 cursor-pointer transition-colors"
              >
                Masuk Admin
              </button>
            )}
          </div>
          <div className="flex items-center gap-3 text-[11px] text-slate-400">
            <span>Kabupaten Malang</span>
            <span>•</span>
            <span className="text-[#FE8A00] font-medium">Belanja Mudah & Nyaman</span>
          </div>
        </div>
      </div>

      {/* Interactive Modal untuk Kebijakan Privasi & Syarat Ketentuan */}
      {activeModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white text-slate-900 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border border-slate-100 p-6 relative">
            <button
              onClick={() => setActiveModal(null)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors"
              aria-label="Tutup"
            >
              <X className="w-4 h-4" />
            </button>

            {activeModal === 'privasi' && (
              <div className="space-y-3">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-[#FE8A00]" />
                  <span>Kebijakan Privasi Tumpang Shop</span>
                </h3>
                <div className="space-y-2.5 text-xs text-slate-600 leading-relaxed max-h-64 overflow-y-auto pr-1">
                  <p>
                    Tumpang Shop menghargai dan melindungi privasi setiap pelanggan serta mitra affiliate kami.
                  </p>
                  <p>
                    <strong>Penggunaan Data:</strong> Data nama, nomor WhatsApp, dan alamat pengantaran yang Anda berikan hanya digunakan untuk verifikasi transaksi, pemrosesan pesanan, dan pengiriman kurir ke alamat tujuan.
                  </p>
                  <p>
                    <strong>Keamanan Informasi:</strong> Kami tidak pernah menjual, menyewakan, atau membagikan data pribadi Anda kepada pihak ketiga mana pun tanpa persetujuan Anda.
                  </p>
                  <p>
                    <strong>Hak Pengguna:</strong> Anda dapat memperbarui informasi kontak atau mengajukan penghapusan data akun kapan saja melalui admin Tumpang Shop.
                  </p>
                </div>
              </div>
            )}

            {activeModal === 'syarat' && (
              <div className="space-y-3">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-[#FE8A00]" />
                  <span>Syarat & Ketentuan</span>
                </h3>
                <div className="space-y-2.5 text-xs text-slate-600 leading-relaxed max-h-64 overflow-y-auto pr-1">
                  <p>
                    Selamat datang di Tumpang Shop. Dengan mengakses dan bertransaksi di website ini, Anda menyetujui ketentuan berikut:
                  </p>
                  <ol className="list-decimal list-inside space-y-1.5 pl-1">
                    <li>Semua produk yang dijual adalah produk pilihan berkualitas yang diproses secara profesional.</li>
                    <li>Harga yang tertera adalah harga terkini dan dapat disesuaikan menurut ketersediaan stok.</li>
                    <li>Pelanggan wajib mencantumkan nomor telepon aktif dan alamat pengantaran yang jelas agar pesanan dapat diantar dengan lancar.</li>
                    <li>Program Affiliate tunduk pada verifikasi transaksi pesanan yang sah dan selesai.</li>
                  </ol>
                </div>
              </div>
            )}

            <div className="mt-5 pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setActiveModal(null)}
                className="px-5 py-2 bg-[#FE8A00] hover:bg-[#e57c00] text-white rounded-xl text-xs font-bold transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </footer>
  );
}
