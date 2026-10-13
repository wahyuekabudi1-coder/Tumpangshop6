import React, { useState, useEffect } from 'react';
import { UserProfile } from '../types';
import { 
  supabase, 
  isSupabaseConfigured, 
  ADMIN_PRIMARY_EMAIL, 
  isLocalAdminConfigured, 
  setLocalAdminAuth, 
  verifyLocalAdminPassword, 
  verifyAdminAuthorization 
} from '../lib/supabase';
import { 
  Store, ShieldCheck, Lock, Mail, ArrowLeft, Eye, EyeOff, 
  AlertCircle, CheckCircle2, KeyRound, RefreshCw, Database, Info 
} from 'lucide-react';
import { setStoredAdminToken } from '../lib/affiliateAttribution';


interface AdminLoginPageProps {
  onLoginSuccess: (user: UserProfile) => void;
  onBackToStore: () => void;
}

export default function AdminLoginPage({
  onLoginSuccess,
  onBackToStore,
}: AdminLoginPageProps) {
  // If Supabase is not configured and no local password has been initialized yet, start in initial setup mode
  const [isSetupMode, setIsSetupMode] = useState<boolean>(() => {
    return !isSupabaseConfigured && !isLocalAdminConfigured();
  });

  const [emailOrUsername, setEmailOrUsername] = useState(ADMIN_PRIMARY_EMAIL);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Setup mode states (for first-time local administrator password creation)
  const [setupPassword, setSetupPassword] = useState('');
  const [setupConfirmPassword, setSetupConfirmPassword] = useState('');
  const [showSetupPassword, setShowSetupPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    // If not configured in Supabase and no local admin auth exists, enforce setup mode
    if (!isSupabaseConfigured && !isLocalAdminConfigured()) {
      setIsSetupMode(true);
    }
  }, []);

  // Handler for First-Time or Reset Admin Password Setup (Standalone Mode)
  const handleSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (setupPassword.length < 6) {
      setErrorMessage('Kata sandi administrator minimal harus 6 karakter.');
      return;
    }

    if (setupPassword !== setupConfirmPassword) {
      setErrorMessage('Konfirmasi kata sandi tidak cocok. Harap periksa kembali.');
      return;
    }

    setIsLoading(true);
    try {
      await setLocalAdminAuth(setupPassword);
      setSuccessMessage('Kata sandi administrator berhasil disimpan secara aman di browser.');

      // Automatically log in the administrator
      const adminUser: UserProfile = {
        id: 'admin_primary',
        email: ADMIN_PRIMARY_EMAIL,
        fullName: 'Pengelola Tumpang Shop',
        role: 'admin',
      };

      setTimeout(() => {
        onLoginSuccess(adminUser);
      }, 500);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Gagal menyimpan kata sandi administrator.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handler for Regular Admin Login
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const inputAccount = emailOrUsername.trim().toLowerCase();
    const inputPass = password.trim();

    if (!inputAccount || !inputPass) {
      setErrorMessage('Harap masukkan email/username dan kata sandi admin.');
      return;
    }

    setIsLoading(true);

    try {
      // 1. Authenticate against Backend Admin API with scrypt / secure credentials
      try {
        const backendRes = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emailOrUsername: inputAccount, password: inputPass })
        });
        const backendData = await backendRes.json();

        if (backendRes.ok && backendData.success && backendData.token) {
          setStoredAdminToken(backendData.token);
          onLoginSuccess(backendData.user);
          setIsLoading(false);
          return;
        } else if (backendRes.status === 401) {
          setErrorMessage(backendData.error || 'Email/username atau kata sandi administrator tidak valid.');
          setIsLoading(false);
          return;
        }
      } catch (backendFetchErr) {
        console.warn('[AdminLogin] Backend API unavailable, falling back to Supabase auth:', backendFetchErr);
      }

      // 2. If Supabase Auth is configured, authenticate securely against Supabase
      if (isSupabaseConfigured && supabase) {
        const targetEmail = inputAccount.includes('@') ? inputAccount : `${inputAccount}@tumpangshop.id`;
        const { data, error } = await supabase.auth.signInWithPassword({
          email: targetEmail,
          password: inputPass,
        });

        if (error) {
          setErrorMessage(error.message || 'Email atau kata sandi administrator tidak valid.');
          setIsLoading(false);
          return;
        }

        if (data?.user) {
          // Strictly verify administrator authorization on the backend
          const isAuthorized = await verifyAdminAuthorization(data.user.email || targetEmail, data.user.id);
          const hasAdminClaim = data.user.app_metadata?.role === 'admin' || data.user.app_metadata?.role === 'superadmin';

          if (!isAuthorized && !hasAdminClaim) {
            // Reject customer credentials trying to access Seller Centre
            await supabase.auth.signOut();
            setErrorMessage('Akun ini terdaftar sebagai pelanggan dan tidak memiliki hak akses administrator.');
            setIsLoading(false);
            return;
          }

          const adminUser: UserProfile = {
            id: data.user.id,
            email: data.user.email || ADMIN_PRIMARY_EMAIL,
            fullName: data.user.user_metadata?.full_name || 'Administrator Tumpang Shop',
            role: 'admin',
          };
          onLoginSuccess(adminUser);
          setIsLoading(false);
          return;
        }
      }

      setErrorMessage('Identitas atau kata sandi administrator salah. Periksa kembali akses Anda.');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Terjadi kesalahan sistem saat memproses login.');
    } finally {
      setIsLoading(false);
    }

  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between selection:bg-orange-500 selection:text-white">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-950/60 backdrop-blur-md px-4 sm:px-8 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#FE8A00] flex items-center justify-center text-white shadow-md shadow-orange-500/20">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-base font-black tracking-tight text-white">TUMPANG</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-500/20 text-[#FE8A00] uppercase tracking-wider">
                  SHOP
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium">Seller Centre & Sistem Admin</p>
            </div>
          </div>

          <button
            onClick={onBackToStore}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors border border-slate-800"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Kembali ke Toko</span>
          </button>
        </div>
      </header>

      {/* Main Login Card Area */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md bg-slate-800/90 border border-slate-700/80 rounded-2xl shadow-2xl p-6 sm:p-8 backdrop-blur-sm">
          {/* Title & Icon */}
          <div className="text-center mb-6">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-orange-500/10 border border-orange-500/20 text-[#FE8A00] flex items-center justify-center mb-3">
              {isSetupMode ? <KeyRound className="w-7 h-7" /> : <ShieldCheck className="w-7 h-7" />}
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              {isSetupMode ? 'Inisialisasi Kata Sandi Admin' : 'Masuk Seller Centre'}
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              {isSetupMode 
                ? 'Buat kata sandi pengelola toko untuk mengamankan akses Seller Centre' 
                : 'Akses khusus pengelola operasional dan inventaris Tumpang Shop'}
            </p>
          </div>

          {/* Error Notification */}
          {errorMessage && (
            <div className="mb-5 p-3 rounded-xl bg-rose-950/80 border border-rose-800/70 text-rose-300 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              <div className="flex-1 leading-relaxed">{errorMessage}</div>
            </div>
          )}

          {/* Success Notification */}
          {successMessage && (
            <div className="mb-5 p-3 rounded-xl bg-emerald-950/80 border border-emerald-800/70 text-emerald-300 text-xs flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
              <div className="flex-1 leading-relaxed">{successMessage}</div>
            </div>
          )}

          {isSetupMode ? (
            /* Setup Mode Form */
            <form onSubmit={handleSetupSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  Email Akun Pengelola
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    disabled
                    value={ADMIN_PRIMARY_EMAIL}
                    className="w-full pl-10 pr-3 py-2.5 text-xs sm:text-sm bg-slate-900/60 border border-slate-700/60 rounded-xl text-slate-300 cursor-not-allowed font-mono"
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  Akun utama pengelola yang terdaftar untuk Tumpang Shop.
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  Buat Kata Sandi Baru
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showSetupPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    value={setupPassword}
                    onChange={(e) => setSetupPassword(e.target.value)}
                    placeholder="Minimal 6 karakter"
                    className="w-full pl-10 pr-10 py-2.5 text-xs sm:text-sm bg-slate-900/80 border border-slate-700 rounded-xl focus:border-[#FE8A00] focus:ring-1 focus:ring-[#FE8A00] focus:outline-hidden text-white placeholder-slate-500 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSetupPassword(!showSetupPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors p-1"
                  >
                    {showSetupPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  Ulangi Kata Sandi
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showSetupPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    value={setupConfirmPassword}
                    onChange={(e) => setSetupConfirmPassword(e.target.value)}
                    placeholder="Ketik ulang kata sandi baru"
                    className="w-full pl-10 pr-3 py-2.5 text-xs sm:text-sm bg-slate-900/80 border border-slate-700 rounded-xl focus:border-[#FE8A00] focus:ring-1 focus:ring-[#FE8A00] focus:outline-hidden text-white placeholder-slate-500 transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full mt-2 py-3 bg-[#FE8A00] hover:bg-[#e07b00] disabled:bg-orange-800 disabled:cursor-not-allowed text-white rounded-xl text-xs sm:text-sm font-bold shadow-md shadow-orange-500/20 active:scale-98 transition-all flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <span>Menyimpan Kredensial...</span>
                ) : (
                  <>
                    <KeyRound className="w-4 h-4" />
                    <span>Simpan & Masuk ke Dashboard</span>
                  </>
                )}
              </button>

              {isLocalAdminConfigured() && (
                <button
                  type="button"
                  onClick={() => {
                    setIsSetupMode(false);
                    setErrorMessage(null);
                  }}
                  className="w-full py-2 text-xs text-slate-400 hover:text-white transition-colors"
                >
                  Kembali ke form masuk biasa
                </button>
              )}
            </form>
          ) : (
            /* Regular Login Form */
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  Email atau Username Admin
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    required
                    autoFocus
                    autoComplete="username"
                    value={emailOrUsername}
                    onChange={(e) => setEmailOrUsername(e.target.value)}
                    placeholder={ADMIN_PRIMARY_EMAIL}
                    className="w-full pl-10 pr-3 py-2.5 text-xs sm:text-sm bg-slate-900/80 border border-slate-700 rounded-xl focus:border-[#FE8A00] focus:ring-1 focus:ring-[#FE8A00] focus:outline-hidden text-white placeholder-slate-500 transition-all font-mono"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Kata Sandi
                  </label>
                  {!isSupabaseConfigured && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsSetupMode(true);
                        setErrorMessage(null);
                      }}
                      className="text-[11px] text-[#FE8A00] hover:underline"
                    >
                      Atur Ulang Sandi Lokal
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-10 py-2.5 text-xs sm:text-sm bg-slate-900/80 border border-slate-700 rounded-xl focus:border-[#FE8A00] focus:ring-1 focus:ring-[#FE8A00] focus:outline-hidden text-white placeholder-slate-500 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors p-1"
                    aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full mt-2 py-3 bg-[#FE8A00] hover:bg-[#e07b00] disabled:bg-orange-800 disabled:cursor-not-allowed text-white rounded-xl text-xs sm:text-sm font-bold shadow-md shadow-orange-500/20 active:scale-98 transition-all flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <span>Memverifikasi Akses...</span>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Masuk ke Dashboard</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* Secure Environment Information */}
          <div className="mt-6 pt-5 border-t border-slate-700/80 text-[11px] text-slate-400 leading-relaxed space-y-2.5">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
              <span>Autentikasi terenkripsi dengan proteksi sesi operasional.</span>
            </div>

            <div className="flex items-start gap-2">
              <Database className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
              <span>
                {isSupabaseConfigured ? (
                  <span className="text-emerald-300 font-medium">
                    Terhubung ke backend cloud Supabase (Project: sjhujsvifjdfvzjtyetn).
                  </span>
                ) : (
                  <span className="text-slate-400">
                    Mode Standalone: Kredensial diamankan dengan enkripsi SHA-256 lokal di browser.
                  </span>
                )}
              </span>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-900/70 border border-slate-700/60 text-[10px] text-slate-400">
              <div className="font-semibold text-slate-300 mb-0.5 flex items-center gap-1.5">
                <Info className="w-3 h-3 text-[#FE8A00]" />
                <span>Akun Administrator Terdaftar:</span>
              </div>
              <div className="font-mono text-emerald-300 select-all">{ADMIN_PRIMARY_EMAIL}</div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer Note */}
      <footer className="py-4 text-center text-xs text-slate-500 border-t border-slate-800/60">
        © 2026 Tumpang Shop. Semua hak dilindungi undang-undang.
      </footer>
    </div>
  );
}
