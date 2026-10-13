-- ====================================================================
-- Script: scripts/bootstrap_admin.sql
-- Digunakan untuk mendaftarkan akun administrator pertama di Supabase
-- Project Ref: sjhujsvifjdfvzjtyetn
-- Jalankan di: Supabase Dashboard -> SQL Editor
-- ====================================================================

-- Catatan Keamanan:
-- 1. Buat akun user terlebih dahulu di Supabase Dashboard -> Authentication -> Users -> 'Add User'
--    dengan email: tumpanggo@gmail.com dan kata sandi pilihan Anda (jangan bagikan password ini ke publik).
-- 2. Jalankan script SQL di bawah ini untuk memastikan akun tersebut memiliki hak akses penuh administrator:

DO $$
DECLARE
    target_admin_email TEXT := 'tumpanggo@gmail.com';
    matched_user_id UUID;
BEGIN
    -- Cari ID akun dari auth.users jika sudah pernah didaftarkan
    SELECT id INTO matched_user_id FROM auth.users WHERE email = target_admin_email LIMIT 1;

    -- Daftarkan ke tabel public.admin_users
    INSERT INTO public.admin_users (user_id, email, full_name, role)
    VALUES (matched_user_id, target_admin_email, 'Pengelola Toko Tumpang', 'superadmin')
    ON CONFLICT (email) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        role = 'superadmin',
        updated_at = NOW();

    -- Jika user auth ditemukan, set app_metadata role ke 'admin'
    IF matched_user_id IS NOT NULL THEN
        UPDATE auth.users
        SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"role": "admin"}'::jsonb
        WHERE id = matched_user_id;
        
        RAISE NOTICE 'Akun % berhasil dikonfigurasi sebagai Administrator!', target_admin_email;
    ELSE
        RAISE NOTICE 'Email % didaftarkan di daftar admin_users. Buat akun di Auth -> Users untuk mengaktifkan login.', target_admin_email;
    END IF;
END $$;
