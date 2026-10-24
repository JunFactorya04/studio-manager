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
- `app/src/nav.ts`: View = dashboard | calendar | projects | library | inbox | finance | more | ops | events. `OPS_NAV` = nhóm "Vận hành" trong sidebar; điện thoại vào qua tab "Thêm".
- `app/src/opsStore.ts`: dữ liệu vận hành (localStorage `studio-manager-ops-v1`): sự kiện, điểm chụp (spot), photographer, job, giao ảnh, nhật ký, agent. Hiện là dữ liệu mẫu.
- `app/src/views/OpsOverview.tsx`, `Events.tsx`, `More.tsx`; `components/BriefSheet.tsx` (soạn briefing); `briefPage.ts` (tạo trang briefing HTML một file); `gpx.ts` (đọc GPX: km, độ cao, checkpoint → điểm chụp). `theme/ops.css`.
- Giao diện: `theme/tokens.css` (màu/chữ Apple), `mac.css` (skin desktop, `min-width:761px`), `widgets.css`, `views.css`. Điện thoại (<761px) giữ kiểu iOS.

## Quy chuẩn giao diện
Theo skill `apple-ui-standard` (token, macOS/iOS, 26px control, chạm ≥44px trên điện thoại). Mọi dự án app sau này cũng theo chuẩn này.

## Trạng thái
Xong theo kiểu macOS: khung cửa sổ, Dashboard, Lịch, Dự án, Thư viện, Tin nhắn 3 cột, Tài chính dạng bảng, audit điện thoại.
Vận hành (13 module) làm theo nhóm, nối thật một phần:
- Nhóm 1 xong: 01 Tổng quan, 02 Sự kiện & Spot (gồm trang briefing cho photographer: GPX, PDF/ảnh đính kèm, sơ đồ lộ trình, lịch trình, checklist, kênh liên lạc, thêm vào lịch).
- Còn: Nhóm 2 (05 FTP, 06 hàng đợi xử lý ảnh, 07 giao ảnh), Nhóm 3 (03 Capture One, 04 Studio Agent), Nhóm 4 (08 ảnh bảo vệ/marketing, 09 booking, 10 photographer, 11 báo cáo + CSV, 12 nhật ký, 13 cài đặt). Đưa dữ liệu vận hành vào Sao lưu/Khôi phục.
Việc dở:
- Đưa trang briefing lên Vercel (team geopix, project `studio-brief`, ssoProtection null): chờ người dùng duyệt quyền (`authorize_team_access`), dùng dữ liệu mẫu trước. Briefing có thể chứa mã đặt phòng, chỉ gửi link cho đội.
- Nhập các GPX trong Google Drive (15 file: 墾丁馬, 華航馬, 嘉有喜柿, ZEPRO RUN, Sun Moon Lake…): tải về rồi dùng "Thêm GPX…" (nhận nhiều file).
- Cập nhật test Playwright cũ, build lại bản cài Windows, build .dmg cho Mac.
- Ý tưởng sau: Cmd+K tìm kiếm, menu chuột phải, Hoàn tác khi xóa, phím tắt; backend nhỏ để app tự xuất bản briefing.
Sau đó: backend/đồng bộ nhiều máy, tích hợp tin nhắn thật, đăng nhập thật.

## Build
- Mac: bản chép ở `~/Desktop/studio-manager`; bấm đúp `Mo-Studio.command` (tự `git pull`, rồi chạy `tauri dev`). Cài lần đầu: `bash scripts/setup-mac.sh`. Chưa ký số (mở bằng chuột phải → Mở). Dùng Terminal tab mới, đừng gõ vào tab đang chạy app.
- Làm việc: nhắn trong chat này, máy đám mây sửa và push; Mac chỉ cần bấm `Mo-Studio.command` để xem.
- Xem thử web: `cd app && npm run build && npx vite preview --port 4174`.
- Windows: `npx tauri build --bundles nsis`. GitHub Actions đang bị khóa do billing.
- Dữ liệu mỗi máy riêng; chuyển bằng Sao lưu/Khôi phục JSON trong Cài đặt.
