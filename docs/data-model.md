# Mô hình dữ liệu (bản nháp)

| Bảng | Trường chính |
|---|---|
| `clients` | id, tên, điện thoại, email, kênh liên hệ (line/messenger/zalo/email), ghi chú |
| `projects` | id, client_id, tên, loại chụp, ngày chụp, địa điểm, gói, trạng thái pipeline, hạn giao, thư mục NAS |
| `packages` | id, tên, số ảnh chỉnh, giá |
| `assets` | id, project_id, tên gốc, đường dẫn RAW, đường dẫn JPG, checksum, ngày chụp (EXIF), trạng thái lọc (giữ/loại/chưa xem), sao, đường dẫn preview |
| `galleries` | id, project_id, mật khẩu (hash), hết hạn, giới hạn số ảnh, trạng thái gửi |
| `selections` | id, gallery_id, asset_id, thời điểm chọn |
| `invoices` | id, project_id, số hóa đơn, số tiền, hạn, trạng thái (chờ/đã thu/quá hạn) |
| `payments` | id, invoice_id, số tiền, ngày, phương thức |
| `messages` | id, client_id, project_id, kênh, chiều (vào/ra), nội dung, thời điểm |
| `tasks` | id, project_id, bước pipeline, người phụ trách, hạn, xong |
| `staff` | id, tên, vai trò |
| `equipment` | id, tên, số seri, trạng thái, người mượn |

Một `asset` là một cặp RAW + JPG ghép theo tên file; mọi thao tác chọn, loại, xóa áp dụng cho cả cặp.
