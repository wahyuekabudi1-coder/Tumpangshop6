# Memperbaiki struktur repository Tumpang Shop (tanpa terminal)

PENTING: isi ZIP ini sudah berada di root proyek. Saat mengunggah ke GitHub, folder `src` harus berada sejajar dengan `package.json` dan `tsconfig.json`, bukan di dalam folder pembungkus lain.

Struktur yang benar:
- package.json
- tsconfig.json
- vite.config.ts
- index.html
- src/main.tsx
- src/App.tsx

Langkah lewat browser:
1. Ekstrak ZIP ini di komputer.
2. Buka repository GitHub Tumpangshop, pilih Add file → Upload files.
3. Unggah isi folder hasil ekstraksi (termasuk folder `src`, `api` bila ada, `public`, `supabase`, dan file konfigurasi) ke root repository. Jangan unggah folder pembungkus tambahan.
4. Commit perubahan ke branch `main`.
5. Buka Vercel → Deployments. Tunggu build baru yang dipicu oleh commit.

Catatan: file `.env.local` dan secret tidak disertakan. Environment Variables Supabase tetap diatur di Vercel. Build live belum diverifikasi dari sini; periksa log Vercel setelah commit.
