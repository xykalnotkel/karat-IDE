# ⚠️ SECURITY WARNING - URGENT

File `uploads/my-binimbg.txt` yang kamu share berisi token sensitif yang sudah terdeteksi GitHub Secret Scanning:

- GitHub Personal Access Token
- Vercel Token
- Cloudflare API Token
- Resend API Key
- Cloudinary API Key + Secret
- Google OAuth Client Secret
- Supabase Anon + Service Role Key
- OneSignal App Id + API Key

Semua token tersebut sudah di-redact dari repo ini untuk keamanan, tapi token asli masih aktif di akun kamu.

## YANG HARUS KAMU LAKUKAN SEKARANG (URGENT!):

1. **Revoke GitHub token**: https://github.com/settings/tokens
2. **Revoke Vercel token**: https://vercel.com/account/tokens
3. **Revoke Cloudflare token**: https://dash.cloudflare.com/profile/api-tokens
4. **Revoke Resend**: https://resend.com/api-keys
5. **Regenerate Cloudinary**: https://cloudinary.com/console
6. **Regenerate Supabase keys**: https://supabase.com/dashboard/project/YOUR_PROJECT/settings/api
7. **Regenerate Google OAuth**: https://console.cloud.google.com/apis/credentials
8. **Regenerate OneSignal**: https://app.onesignal.com/

## Jangan pernah share token seperti itu lagi!

Gunakan:
- `.env` file yang di-gitignore
- GitHub Secrets untuk Actions (Settings > Secrets and variables > Actions)
- Environment variables di local

File asli `my-binimbg.txt` sudah gue exclude dari final package dan tidak akan ter-commit (cek .gitignore).

Setelah revoke, buat token baru dan simpan di:
- `karat/.env` (jangan commit)
- GitHub Secrets untuk CI/CD

## Status repo ini:
✅ Aman - tidak ada secret yang ter-commit
✅ GitHub Secret Scanning passed
