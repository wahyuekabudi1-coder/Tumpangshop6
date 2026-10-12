# Deploy Tumpang Shop tanpa terminal

## A. Upload source ke GitHub lewat browser
1. Buat repository baru bernama `tumpang-shop` di GitHub dan set sebagai **Private**.
2. Di halaman repository, pilih **Add file → Upload files**.
3. Upload isi folder proyek ini (folder `src`, folder `supabase`, `package.json`, `index.html`, `vite.config.ts`, `tsconfig.json`, `postcss.config.js`, `tailwind.config.js`, `vercel.json`, dan file dokumentasi). Jangan upload `node_modules`, `dist`, `.env.local`, atau secret.
4. Klik **Commit changes**.

## B. Deploy lewat Vercel
1. Buka Vercel Dashboard → **Add New → Project**.
2. Import repository `tumpang-shop` dari GitHub.
3. Framework Preset: **Vite**. Build Command: `npm run build`. Output Directory: `dist`.
4. Di **Environment Variables**, masukkan:
   - `VITE_SUPABASE_URL` = `https://sjhujsvifjdfvzjtyetn.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = publishable/anon key proyek Tumpang Shop
5. Klik **Deploy**. Jika ada perubahan environment variable, lakukan redeploy.

## C. Siapkan Supabase melalui Dashboard
1. Pastikan URL Dashboard menunjukkan project ref `sjhujsvifjdfvzjtyetn`.
2. Buka SQL Editor. Buka masing-masing file migrasi lokal, salin seluruh isinya, dan jalankan satu per satu sesuai urutan `01`, `02`, `03`, `04`.
3. Jika satu migrasi gagal, berhenti dan simpan pesan error. Jangan jalankan `DROP SCHEMA`, reset, atau menjalankan file berikutnya sebelum error diperiksa.
4. Verifikasi tabel dan RLS di Table Editor/SQL Editor. Baru jalankan `supabase/seed.sql` secara terpisah.
5. Daftarkan akun admin melalui situs, lalu ubah `target_email` di `scripts/bootstrap_admin.sql` sebelum menjalankannya manual di SQL Editor.

## Batasan & Integritas Transaksi
- Pesanan dibuat dengan status PENDING dan invoice resmi (misal: TP-XXXX).
- Gateway pembayaran belum otomatis menandai status PAID tanpa integrasi endpoint server dan verifikasi webhook resmi dari pihak gateway (Midtrans / Xendit / ArtoPay).
- Jangan menganggap redirect browser sebagai bukti pelunasan transaksi.
- Jangan memasukkan `service_role` key atau secret key payment gateway ke Vercel `VITE_*` environment variables.
- Website tetap berjalan lancar dengan persistensi Local Storage jika Supabase belum terhubung, dan otomatis sinkron ke cloud begitu environment variables diisi.
