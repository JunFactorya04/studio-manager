# Studio Manager – ngữ cảnh cho Claude

Chủ dự án nói tiếng Việt (Đài Loan, múi giờ Asia/Taipei). Trả lời bằng tiếng Việt, ngắn gọn.
Làm trên nhiều máy (Windows, Mac, đám mây): luôn `git pull` trước khi sửa, `git push` khi xong, mỗi tab một commit.

## Dự án
Ứng dụng quản lý studio ảnh: file (RAW+JPG trên NAS + preview đám mây), pipeline dự án, khách chọn ảnh, tin nhắn (LINE/Messenger/Zalo/Email), tài chính, dashboard.
Một codebase cho Windows, macOS, iOS, Android. Tài liệu: `README.md`, `docs/roadmap.md`, `docs/architecture.md`, `docs/data-model.md`, `design/`.

## Công nghệ
Tauri 2 (Rust) + React 18 + TypeScript + Vite, trong `app/`.
- `app/src/store.ts`: dữ liệu cục bộ (localStorage `studio-manager-data-v1`) + actions + seed. Chưa có backend.
- `app/src-tauri/src/media.rs`: quét thẻ nhớ, ghép RAW+JPG, copy kiểm SHA-256, tạo thumbnail.
- `app/src/native.ts`: cầu nối Tauri (chọn thư mục, import).
- `app/src/nav.ts`: View = dashboard | calendar | projects | library | inbox | finance.
- Giao diện: `theme/tokens.css` (màu/chữ Apple), `mac.css` (skin desktop, `min-width:761px`), `widgets.css`, `views.css`. Điện thoại (<761px) giữ kiểu iOS.

## Trạng thái
Xong theo kiểu macOS: khung cửa sổ, Dashboard, Lịch, Dự án (bảng + inspector + Kanban), Thư viện kiểu Photos.
Còn làm: Tin nhắn kiểu Mail 3 cột, Tài chính kiểu Numbers, cập nhật lại test, build lại bản cài.
Sau đó: backend/đồng bộ nhiều máy, tích hợp tin nhắn thật, đăng nhập thật.

## Build
- Mac: `bash scripts/setup-mac.sh` (hoặc `dev`). Cần chạy trên Mac, chưa ký số (mở bằng chuột phải → Mở).
- Windows: `npx tauri build --bundles nsis`. GitHub Actions đang bị khóa do billing.
- Dữ liệu mỗi máy riêng; chuyển bằng Sao lưu/Khôi phục JSON trong Cài đặt.
