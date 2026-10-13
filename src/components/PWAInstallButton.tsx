import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, X, Share, CheckCircle2, Smartphone } from 'lucide-react';

interface PWAInstallButtonProps {
  variant?: 'navbar' | 'banner';
  className?: string;
}

export default function PWAInstallButton({ variant = 'navbar', className = '' }: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [dismissedBanner, setDismissedBanner] = useState(() => {
    try {
      return sessionStorage.getItem('ts_pwa_banner_dismissed') === 'true';
    } catch {
      return false;
    }
  });

  // If already running in standalone mode (installed app), do not render
  if (isInstalled) {
    return null;
  }

  // If neither Chromium prompt nor iOS is available, hide completely (per requirement: only display when supported by browser)
  if (!isInstallable && !isIOS) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      await install();
    } else if (isIOS) {
      setShowIosGuide(true);
    }
  };

  const dismissBanner = () => {
    setDismissedBanner(true);
    try {
      sessionStorage.setItem('ts_pwa_banner_dismissed', 'true');
    } catch {
      // ignore
    }
  };

  if (variant === 'navbar') {
    return (
      <>
        <button
          onClick={handleInstallClick}
          type="button"
          title="Install Aplikasi Tumpang Shop"
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 border ${
            isInstallable
              ? 'bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 border-amber-300 dark:border-amber-600 dark:text-amber-300'
              : 'bg-stone-100 text-stone-700 hover:bg-stone-200 border-stone-200'
          } ${className}`}
        >
          <Download className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
          <span>Pasang Aplikasi</span>
        </button>

        {/* iOS Install Guide Dialog */}
        {showIosGuide && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl relative">
              <button
                onClick={() => setShowIosGuide(false)}
                className="absolute top-4 right-4 text-stone-400 hover:text-stone-700"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600 mb-4">
                <Smartphone className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-stone-900 mb-2">Pasang di iPhone / iPad</h3>
              <p className="text-xs text-stone-600 mb-4 leading-relaxed">
                Untuk pengalaman belanja terbaik dengan akses cepat dari layar utama Anda:
              </p>
              <div className="space-y-3 text-xs text-stone-700 bg-stone-50 p-3.5 rounded-xl border border-stone-200">
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">1</span>
                  <div className="flex items-center gap-1">
                    <span>Ketuk tombol</span>
                    <Share className="w-3.5 h-3.5 text-blue-600 inline mx-0.5" />
                    <span className="font-semibold">Bagikan (Share)</span>
                    <span>di Safari</span>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">2</span>
                  <span>Gulir ke bawah lalu pilih <strong>"Tambah ke Layar Utama" (Add to Home Screen)</strong></span>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">3</span>
                  <span>Ketuk <strong>Tambah (Add)</strong> di pojok kanan atas</span>
                </div>
              </div>
              <button
                onClick={() => setShowIosGuide(false)}
                className="w-full mt-5 py-2.5 bg-[#FE8A00] text-white text-xs font-bold rounded-xl hover:bg-[#e67a00] transition-colors"
              >
                Saya Mengerti
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // Banner variant for mobile bottom / top bar
  if (dismissedBanner) return null;

  return (
    <>
      <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white px-4 py-2.5 shadow-md flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-white/20 p-1 flex-shrink-0 flex items-center justify-center">
            <img src="/pwa-192x192.png" alt="Tumpang Shop" className="w-6 h-6 rounded" />
          </div>
          <div className="min-w-0">
            <p className="font-bold truncate">Pasang Aplikasi Tumpang Shop</p>
            <p className="text-[11px] text-amber-100 truncate">Akses instan, belanja hemat, & lebih cepat</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleInstallClick}
            className="px-3 py-1.5 bg-white text-orange-600 font-bold rounded-lg shadow-sm hover:bg-amber-50 active:scale-95 transition-all text-xs flex items-center gap-1"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Pasang</span>
          </button>
          <button
            onClick={dismissBanner}
            className="p-1 hover:bg-white/20 rounded-lg text-white/80 hover:text-white"
            title="Tutup banner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {showIosGuide && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl relative text-stone-900">
            <button
              onClick={() => setShowIosGuide(false)}
              className="absolute top-4 right-4 text-stone-400 hover:text-stone-700"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600 mb-4">
              <Smartphone className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-stone-900 mb-2">Pasang di iPhone / iPad</h3>
            <p className="text-xs text-stone-600 mb-4 leading-relaxed">
              Untuk membuka toko langsung seperti aplikasi dari layar utama:
            </p>
            <div className="space-y-3 text-xs text-stone-700 bg-stone-50 p-3.5 rounded-xl border border-stone-200">
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">1</span>
                <div>Ketuk ikon <strong>Share</strong> (kotak berpanah ke atas) di menu Safari</div>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">2</span>
                <div>Pilih <strong>"Add to Home Screen" (Tambah ke Layar Utama)</strong></div>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">3</span>
                <div>Ketuk <strong>Add (Tambah)</strong></div>
              </div>
            </div>
            <button
              onClick={() => setShowIosGuide(false)}
              className="w-full mt-5 py-2.5 bg-[#FE8A00] text-white text-xs font-bold rounded-xl hover:bg-[#e67a00] transition-colors"
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </>
  );
}
