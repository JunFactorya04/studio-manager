# Studio Manager

Trình quản lý studio ảnh: từ quản lý file (NAS + cloud) đến dự án, khách chọn ảnh, tin nhắn và tài chính.

## Thư mục

| Thư mục | Nội dung |
|---|---|
| `docs/roadmap.md` | Lộ trình theo giai đoạn và phạm vi MVP |
| `docs/architecture.md` | Kiến trúc lưu trữ NAS + cloud, luồng ảnh RAW + JPG |
| `docs/data-model.md` | Các bảng dữ liệu chính |
| `design/` | Thiết kế 8 màn hình iOS (bản canvas gốc + mã nguồn từng màn hình) |
| `app/` | Ứng dụng Tauri 2 + React: macOS, Windows, iPhone, Android — xem `app/README.md` |

## Trạng thái

- [x] Lộ trình và kiến trúc
- [x] Thiết kế giao diện iPhone (8 màn hình)
- [x] Nền tảng: Tauri 2 + React (desktop và di động từ một mã nguồn)
- [x] Giao diện: Tổng quan, Dự án, Chi tiết dự án, Thư viện, Tin nhắn, Tài chính (dữ liệu mẫu)
- [x] Màn hình đăng nhập kính mờ (nghiêng và phản chiếu theo chuột)
- [ ] Màn hình Nhập ảnh, Khách chọn ảnh
- [ ] Lệnh Rust: nhập ảnh, checksum, tạo preview, đồng bộ cloud
- [ ] Backend và database
