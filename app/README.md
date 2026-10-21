# Studio Manager — ứng dụng

Một mã nguồn chạy trên macOS, Windows, iPhone và Android (Tauri 2 + React + TypeScript).
Màn hình rộng hiện sidebar kiểu macOS; màn hình điện thoại chuyển sang thanh tab nổi kiểu iOS.

Hiện dùng dữ liệu mẫu trong `src/data.ts`, chưa nối backend.

## Cài đặt lần đầu

1. Cài [Node.js](https://nodejs.org) 20 trở lên.
2. Cài Rust: https://www.rust-lang.org/tools/install
3. Trên Mac: cài Xcode (App Store) để build cho Mac và iPhone.
   Trên Windows: cài "Microsoft C++ Build Tools" và WebView2 (Windows 11 có sẵn).
4. Trong thư mục `app/`:

```bash
npm install
```

## Chạy

| Việc | Lệnh |
|---|---|
| Xem nhanh trên trình duyệt | `npm run dev` rồi mở http://localhost:1420 |
| Chạy app desktop (Mac / Windows) | `npm run tauri dev` |
| Đóng gói app desktop | `npm run tauri build` |
| Chuẩn bị iPhone (chỉ trên Mac, một lần) | `npm run tauri ios init` |
| Chạy trên iPhone / simulator | `npm run tauri ios dev` |
| Chuẩn bị Android (một lần, cần Android Studio) | `npm run tauri android init` |
| Chạy trên Android | `npm run tauri android dev` |

## Cấu trúc

```
src/
  App.tsx          sidebar (desktop) + thanh tab (điện thoại), điều hướng
  data.ts          dữ liệu mẫu: dự án, tin nhắn, hóa đơn, NAS
  views/           Tổng quan, Dự án, Chi tiết dự án, Thư viện, Tin nhắn, Tài chính
  components/      Icon, Header
  styles.css       giao diện, chế độ tối, bố cục điện thoại (dưới 760px)
src-tauri/
  src/lib.rs       nơi thêm lệnh Rust: nhập ảnh, checksum, tạo preview
  tauri.conf.json  cửa sổ, titlebar macOS, đóng gói
```

## Việc tiếp theo

- [ ] Màn hình Nhập ảnh và Khách chọn ảnh
- [ ] Lệnh Rust: quét thẻ SD, ghép cặp RAW + JPG, checksum, chép vào NAS
- [ ] Backend và database (xem `../docs/data-model.md`)
