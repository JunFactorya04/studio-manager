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

- [x] Lộ trình, kiến trúc, thiết kế 8 màn hình
- [x] Ứng dụng Tauri 2 + React chạy trên Windows, macOS (và iPhone, Android từ cùng mã nguồn)
- [x] Đăng nhập kính mờ; nút cửa sổ kiểu macOS trên Windows
- [x] Tổng quan: số liệu, lịch chụp hôm nay và 7 ngày tới, việc cần xử lý
- [x] Dự án: tạo, sửa, xóa, chuyển bước, hóa đơn, ghi thu, lịch sử
- [x] Thư viện và Nhập ảnh: quét thẻ, ghép RAW + JPG, chép vào NAS có kiểm tra SHA-256, ảnh xem nhanh, lọc Giữ/Loại/sao
- [x] Khách chọn ảnh: giới hạn số ảnh, watermark, gửi lựa chọn, xuất danh sách cho Lightroom
- [x] Tin nhắn: hộp thư theo khách, mẫu trả lời, chép sẵn để dán vào LINE/Messenger/Zalo/Email
- [x] Tài chính: doanh thu theo kỳ, hóa đơn, chi phí, lợi nhuận, xuất CSV
- [x] Cài đặt: tên studio, thư mục NAS, mẫu tên file, sao lưu và khôi phục dữ liệu

## Bước tiếp theo

- [ ] Máy chủ và database dùng chung cho nhiều máy, đăng nhập thật
- [ ] Link chọn ảnh cho khách trên điện thoại (preview có watermark trên Cloudflare R2)
- [ ] Kết nối thẳng LINE Official Account, Messenger, Zalo OA
- [ ] Sao lưu bản gốc lên cloud (3-2-1), thanh toán ECPay / NewebPay

## Dữ liệu

Hiện dữ liệu (dự án, khách, hóa đơn, tin nhắn) lưu trên từng máy. Vào Tổng quan → Cài đặt → Sao lưu dữ liệu để tải file JSON dự phòng.
Ảnh gốc luôn nằm trên NAS, app chỉ lưu đường dẫn.
