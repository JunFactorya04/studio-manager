# Kiến trúc

## Nguyên tắc
Bản gốc (RAW + JPG) nằm trên NAS trong studio. Cloud chỉ giữ preview, metadata và dữ liệu khách.

```
Thẻ SD ──► Ứng dụng local (máy studio) ──► NAS (bản gốc)
                    │
                    ├─► Preview + watermark ──► Cloud storage (Cloudflare R2) ──► Gallery khách
                    └─► Metadata, trạng thái ──► Backend + database ──► App iPhone / Mac
```

## Thành phần
| Thành phần | Vai trò |
|---|---|
| Ứng dụng local | Theo dõi thư mục nhập, ghép cặp RAW + JPG, checksum, tạo preview, đồng bộ |
| NAS | Lưu bản gốc, RAID 1 / SHR, có UPS |
| Cloud storage | Preview cho khách; bản sao lưu lạnh của bản gốc |
| Backend | Dự án, khách, lựa chọn ảnh, hóa đơn, tin nhắn |
| App iPhone / Mac | Giao diện quản lý (xem `design/`) |
| Gallery khách | Web trên điện thoại, chọn ảnh bằng tim |

## Quy trình ảnh
1. Nhập từ thẻ vào `NAS/<năm>/<MM-DD>_<dự án>/01_RAW`.
2. Xác minh số file và checksum trước khi báo an toàn xóa thẻ.
3. Tạo preview có watermark, đẩy lên cloud.
4. Chọn lọc trên máy local (không làm trực tiếp trên NAS).
5. Lightroom catalog trên SSD local; XMP lưu cạnh ảnh.
6. Xuất bản giao vào `04_Export`.
7. Khách chọn trên preview; bản full qua signed URL có thời hạn sau khi thanh toán.

## Sao lưu 3-2-1
- Bản 1: NAS.
- Bản 2: ổ ngoài hoặc NAS thứ hai, đặt nơi khác.
- Bản 3: cloud (R2 hoặc Backblaze B2).
- Kiểm thử khôi phục định kỳ.

## Câu hỏi còn mở
- Nền tảng app: SwiftUI hay Tauri + React.
- Dung lượng ảnh mỗi năm để chọn NAS.
- Kênh tin nhắn chính của khách.
