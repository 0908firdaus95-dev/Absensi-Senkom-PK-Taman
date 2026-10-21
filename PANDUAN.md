# SENKOM PK TAMAN — paket awal absensi online

## Isi paket
- `index.html`: halaman login, anggota, dan pengurus.
- `style.css`: tampilan hitam, merah, dan panel kaca transparan.
- `app.js`: alur login, absensi, rekap, tambah anggota, dan ekspor CSV.
- `manifest.json`: metadata PWA.
- `logo-senkom.png`, `icon-192.png`, `icon-512.png`: logo yang Anda kirim dan ikon instalasi aplikasi.
- `sw.js`: cache tampilan agar file aplikasi dapat dibuka kembali saat koneksi buruk.
- `Code.gs`: backend Google Apps Script yang menyimpan akun dan absensi ke Google Spreadsheet.

## A. Siapkan Google Spreadsheet
1. Masuk ke https://sheets.google.com lalu buat spreadsheet baru bernama **Database SENKOM PK TAMAN**.
2. Dari alamat spreadsheet, salin ID yang berada di antara `/d/` dan `/edit`.
3. Buka **Ekstensi > Apps Script**.
4. Hapus kode contoh dan tempel seluruh isi `Code.gs`.
5. Ganti `PASTE_SPREADSHEET_ID_HERE` dengan ID spreadsheet tadi.
6. Klik Simpan.
7. Pada pilihan fungsi di atas editor, pilih `setup`, lalu klik **Run/Jalankan**. Setujui izin Google yang diminta.
8. Kembali ke spreadsheet. Tab `Users`, `Attendance`, dan `Settings` akan dibuat otomatis.
9. Buka tab `Settings`, temukan nilai `INITIAL_ADMIN_PASSWORD`. Username awal adalah `admin`. Catat password tersebut secara aman, lalu hapus baris `INITIAL_ADMIN_PASSWORD` dari tab Settings. Jangan bagikan password admin.
10. Di Apps Script klik **Deploy > New deployment > Web app**.
11. Pilih **Execute as: Me**. Untuk situs publik, pilih **Who has access: Anyone** hanya jika kebijakan akun/organisasi mengizinkan. Klik Deploy dan salin URL yang berakhiran `/exec`.
12. Setelah mengubah kode backend, buat versi baru melalui **Deploy > Manage deployments > Edit > New version > Deploy**.

## B. Hubungkan website dengan Spreadsheet
1. Buka `app.js` dengan editor teks.
2. Ganti `PASTE_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE` pada baris pertama konfigurasi `API_URL` dengan URL `/exec` dari langkah A.
3. Simpan semua file dalam satu folder.
4. Unggah folder ke hosting statis yang mendukung HTTPS dan service worker (misalnya GitHub Pages atau Firebase Hosting). `manifest.json` dan `sw.js` tidak bekerja dengan baik jika hanya membuka file langsung memakai `file://`.
5. Buka URL website, masuk dengan akun admin, lalu buat akun anggota dari panel pengurus.

## C. Hak akses dan alur
- `admin`: dapat melihat semua rekap, rentang tanggal, persentase hadir, daftar anggota, dan menambahkan anggota.
- `member`: hanya dapat mengirim absensi dan melihat riwayat absensinya sendiri.
- Setiap anggota hanya dapat mengirim satu catatan absensi per tanggal. Koreksi dilakukan oleh pengurus melalui spreadsheet.
- Status `Ijin` mewajibkan alasan.
- Area `Lokasi pengganti (scan QR)` mewajibkan kode QR. Versi ini menerima kode hasil scan/ketikan; kamera scanner belum disertakan.
- Data akun dan kehadiran berada di Google Spreadsheet; bukan hanya `localStorage`.
- Rekap CSV dapat diunduh dari panel pengurus.

## D. Catatan penting sebelum dipakai sungguhan
1. **Uji koneksi browser ke Apps Script.** Jika browser menampilkan `Failed to fetch` atau error CORS, jangan menonaktifkan keamanan browser. Apps Script lintas-domain dapat memiliki keterbatasan CORS. Solusi produksi yang lebih kuat adalah backend perantara yang mendukung CORS (misalnya Cloud Run/Cloud Functions) atau menyajikan aplikasi melalui Apps Script HTML Service dengan `google.script.run`.
2. Web App Apps Script publik berarti endpoint dapat dijangkau publik. Gunakan password kuat, batasi penyebaran URL, tinjau izin Spreadsheet, dan jangan menyimpan data sensitif yang tidak diperlukan.
3. SHA-256 bersalt dalam contoh ini lebih baik daripada menyimpan password teks biasa, tetapi belum setara dengan sistem autentikasi khusus seperti Firebase Authentication. Untuk penerapan skala besar, gunakan penyedia identitas dan backend yang sesuai.
4. Sesi disimpan dalam Script Cache dan berakhir setelah sekitar 6 jam; cache dapat terhapus lebih awal sehingga pengguna mungkin perlu login lagi.
5. Kode QR hanya memvalidasi bahwa kode diisi; kode lokasi belum diverifikasi terhadap daftar kode resmi dan lokasi GPS. Untuk benar-benar membuktikan lokasi, tambahkan tabel kode lokasi yang diizinkan dan/atau geofence GPS dengan persetujuan pengguna.
6. PWA ini meng-cache tampilan saja. Pengiriman absensi dan pembaruan data tetap memerlukan internet. Perubahan `sw.js` perlu nama cache versi baru agar perangkat menerima pembaruan lebih cepat.
7. Logo SENKOM dari gambar yang Anda kirim sudah dipasang di header dan ikon PWA 192x192 serta 512x512 sudah disertakan.
