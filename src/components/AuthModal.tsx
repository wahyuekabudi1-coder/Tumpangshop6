import React, { useState } from 'react';
import { UserProfile } from '../types';
import { X, User, Lock, Mail, ShieldCheck, LogIn, LogOut, CheckCircle } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  onLogin: (user: UserProfile) => void;
  onLogout: () => void;
  onSwitchToAdmin: () => void;
}

export default function AuthModal({
  isOpen,
  onClose,
  currentUser,
  onLogin,
  onLogout,
  onSwitchToAdmin
}: AuthModalProps) {
  if (!isOpen) return null;

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    const user: UserProfile = {
      id: `usr_${Date.now()}`,
      email: email.trim(),
      fullName: fullName.trim() || email.split('@')[0],
      role: 'customer'
    };

    onLogin(user);
    onClose();
  };

  const handleAdminDemoLogin = () => {
    const adminUser: UserProfile = {
      id: 'admin_master',
      email: 'admin@tumpangshop.id',
      fullName: 'Pengelola Tumpang Shop',
      role: 'admin'
    };
    onLogin(adminUser);
    onSwitchToAdmin();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-2xs flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-slate-100 relative">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors"
          aria-label="Tutup"
        >
          <X className="w-4 h-4" />
        </button>

        {currentUser ? (
          /* Profile Logged In View */
          <div className="p-6">
            <div className="text-center pb-4 border-b border-slate-100">
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-2xl mb-2">
                {currentUser.fullName.charAt(0).toUpperCase()}
              </div>
              <h3 className="text-lg font-bold text-slate-900">{currentUser.fullName}</h3>
              <p className="text-xs text-slate-500">{currentUser.email}</p>
              <span className="inline-block mt-2 px-3 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">
                {currentUser.role === 'admin' ? 'Administrator Toko' : 'Pelanggan Setia'}
              </span>
            </div>

            <div className="pt-4 space-y-2">
              {currentUser.role === 'admin' && (
                <button
                  onClick={() => {
                    onSwitchToAdmin();
                    onClose();
                  }}
                  className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Buka Dashboard Admin</span>
                </button>
              )}

              <button
                onClick={() => {
                  onLogout();
                  onClose();
                }}
                className="w-full py-2.5 border border-rose-200 hover:bg-rose-50 text-rose-700 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                <span>Keluar dari Akun</span>
              </button>
            </div>
          </div>
        ) : (
          /* Login / Register Form */
          <div className="p-6">
            <div className="text-center mb-5">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center mb-2">
                <User className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">
                {mode === 'login' ? 'Masuk ke Tumpang Shop' : 'Daftar Akun Baru'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Akses keranjang dan pantau belanjaan pasar lokal Anda
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              {mode === 'register' && (
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Nama Lengkap</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Contoh: Siti Rahma"
                    className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl focus:border-emerald-600 focus:outline-hidden"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@email.com"
                  className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl focus:border-emerald-600 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Kata Sandi</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl focus:border-emerald-600 focus:outline-hidden"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs transition-colors flex items-center justify-center gap-2 mt-4"
              >
                <LogIn className="w-4 h-4" />
                <span>{mode === 'login' ? 'Masuk Sekarang' : 'Daftar Akun'}</span>
              </button>
            </form>

            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-500">
                {mode === 'login' ? 'Belum punya akun?' : 'Sudah punya akun?'}
              </span>
              <button
                onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                className="font-bold text-emerald-700 hover:underline"
              >
                {mode === 'login' ? 'Daftar di sini' : 'Masuk di sini'}
              </button>
            </div>

            {/* Quick Demo Access */}
            <div className="mt-4 pt-3 border-t border-slate-100">
              <button
                onClick={handleAdminDemoLogin}
                className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <ShieldCheck className="w-4 h-4 text-emerald-700" />
                <span>Masuk Cepat sebagai Admin Pengelola</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
