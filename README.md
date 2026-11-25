# Jebtool Web KeyGen Admin Portal

Web quản trị tạo **Purchase Key** & **Reset Key** ngẫu nhiên không trùng lặp, đồng bộ trực tiếp với Google Sheets & Discord Bot Jebtool.

## Công nghệ sử dụng
- **Frontend:** React 18 + Tailwind CSS 3 + HTML5 (build bằng Vite + làm rối mã nguồn bằng `javascript-obfuscator`, chống mở DevTools / view-source).
- **Backend:** C# `.NET Framework` (`HttpListener` API Server + mã hóa byte-XOR toàn bộ bí mật trong `JebtoolWebKeyServer.exe`).

## Cách chạy nhanh
1. Bấm đúp `start-webkey.bat` → trình duyệt tự mở `http://localhost:5050`.
2. Đăng nhập bằng mật khẩu Admin (mặc định: `Jebtool@2026`).

## Build lại từ mã nguồn
```powershell
# 1. Build & làm rối frontend React + Tailwind
npm install
npm run build

# 2. Tạo file backend\.env.local gồm GAS_WEBAPP_URL và GAS_API_SECRET, rồi biên dịch C# Server
powershell -ExecutionPolicy Bypass -File "backend\build-server.ps1" -AdminPassword "MatKhauMoi"
```
