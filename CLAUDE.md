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
- `app/src-tauri/src/grade.rs`: chỉnh màu JPG, LUT, sidecar, xem trước/thumbnail (không phụ thuộc Tauri, có test).
- `app/src/opsStore.ts`: dữ liệu vận hành (localStorage `studio-manager-ops-v1`): sự kiện, điểm chụp (spot), photographer, job, giao ảnh, nhật ký, agent. Hiện là dữ liệu mẫu.
- `app/src/views/OpsOverview.tsx`, `Events.tsx`, `More.tsx`; `components/BriefSheet.tsx` (soạn briefing); `briefPage.ts` (tạo trang briefing HTML một file); `gpx.ts` (đọc GPX: km, độ cao, checkpoint → điểm chụp). `theme/ops.css`.
- Giao diện: `theme/tokens.css` (màu/chữ Apple), `mac.css` (skin desktop, `min-width:761px`), `widgets.css`, `views.css`. Điện thoại (<761px) giữ kiểu iOS.

## Quy chuẩn giao diện
Theo skill `apple-ui-standard` (token, macOS/iOS, 26px control, chạm ≥44px trên điện thoại). Mọi dự án app sau này cũng theo chuẩn này.

## Trạng thái
Xong theo kiểu macOS: khung cửa sổ, Dashboard, Lịch, Dự án, Thư viện, Tin nhắn 3 cột, Tài chính dạng bảng, audit điện thoại.
Vận hành (13 module) làm theo nhóm, nối thật một phần:
- Nhóm 1 xong: 01 Tổng quan, 02 Sự kiện & Spot (gồm trang briefing cho photographer: GPX, PDF/ảnh đính kèm, sơ đồ lộ trình, lịch trình, checklist, kênh liên lạc, thêm vào lịch).
- Nhóm 2 xong (chạy thật, chỉ trong app desktop): 05 Nhận ảnh (theo dõi thư mục chụp của spot thuộc sự kiện "Đang diễn ra"), 06 Xử lý ảnh (thu nhỏ JPG theo recipe "…2400px" → thư mục xuất; tự thử lại 3 lần; tạm dừng/thử lại), 07 Giao ảnh (chép có SHA-256 vào `deliveryDir` của sự kiện/<tên spot>). Engine: `app/src/opsEngine.ts`; lệnh Rust: `ops_core.rs` (có cargo test) + `ops.rs`; view `views/OpsPipeline.tsx`. RAW chỉ được đếm (chờ Nhóm 3 Capture One). Dữ liệu vận hành đã nằm trong Sao lưu/Khôi phục. Seed cũ có cờ `demo`, nút "Xóa dữ liệu mẫu".
- Nhóm 3 xong: 03 Capture One (chỉ đọc: tiến trình, file session nếu nhập đường dẫn đầy đủ, số ảnh chụp/xuất, cảnh báo xuất chậm), 04 Studio Agent (máy này: host, Capture One, bộ theo dõi, hàng đợi; heartbeat trong `opsEngine.ts`). Chưa có máy chủ trung tâm nên chưa xem nhiều máy. Điều khiển Capture One chỉ trên Mac qua AppleScript (`c1_*` trong `ops_core.rs`, quyền Tự động hóa khai trong `src-tauri/Info.plist`): mở session, xuất recipe cho bộ sưu tập hiện tại, đọc từ điển lệnh. CHƯA thử trên Mac thật: cú pháp lệnh `process … recipe …` cần xác nhận bằng nút "Đọc từ điển lệnh" rồi sửa nếu lỗi.
- Nhóm 4 xong (`views/OpsAdmin.tsx`): 08 Ảnh chọn lọc (nút "Khóa ảnh" ở Xử lý ảnh, mục tiêu mặc định 20/spot), 09 Booking (chuyển thành khách + dự án báo giá), 10 Photographer, 11 Báo cáo + CSV, 12 Nhật ký + CSV, 13 Cài đặt vận hành (chu kỳ quét, số lần thử, chất lượng JPEG).
- Chỉnh ảnh JPG (thay Capture One cho ảnh JPG, `views/Grade.tsx`, `grade.ts`, `src-tauri/src/grade.rs`): thanh trượt (phơi sáng, tương phản, vùng sáng/tối, điểm trắng/đen, nhiệt độ/sắc, bão hòa, sống động, làm nét, tối góc) + LUT `.cube` 3D; xem trước thật bằng Rust (bản 1600px lưu đệm), giữ nút để xem ảnh gốc; chỉnh của từng ảnh lưu thành `<ảnh>.sm.json` cạnh ảnh (tự lưu, ảnh gốc không đổi); preset (5 mẫu có sẵn + preset tự lưu trong `opsStore.presets`), sao chép/dán một phần theo nhóm, áp nhiều ảnh, xuất JPG hàng loạt. Preset gắn vào điểm chụp (`Spot.presetId`, chọn trong form điểm chụp); engine "Xử lý ảnh" thu nhỏ rồi áp màu, sidecar của ảnh thắng preset của điểm chụp. Thứ tự xử lý cố định: sRGB→tuyến tính→phơi sáng+WB→tông (trên độ sáng)→bão hòa→LUT→tối góc→làm nét. Có test Rust (`cargo test`). Chưa làm: RAW, đường cong, HSL theo dải, chỉnh cục bộ, cắt/xoay. LUT lưu theo đường dẫn trên mỗi máy (không vào sao lưu). CHƯA thử trong app Tauri thật (chỉ test Rust + UI giả lập).
- Khách chọn ảnh + briefing có link thật: máy chủ nhỏ `server/studio-pick/` (Vercel project `studio-pick` team geopix, alias https://studio-pick-geopix.vercel.app, Blob store `studio-pick-blob`, env `STUDIO_KEY` kiểu sensitive). API: `POST /api/publish` (cần header `x-studio-key`), `GET /g/<id>` (trang), `POST /api/pick` (khách gửi lựa chọn), `GET /api/pick?id=` (studio lấy, cần khóa). App: `pickServer.ts`, nút "Đăng lên mạng" ở BriefSheet và Khách chọn ảnh, tự lấy lựa chọn mỗi 30 giây. Khóa nhập ở Cài đặt → Máy chủ chọn ảnh (lưu localStorage, không vào sao lưu). Giới hạn ~4,2 MB/trang (thumbnail 360px khi đăng). Triển khai lại: dán file trong `server/studio-pick` vào `create_deployment` (không có CLI). `galleryPage.ts` vẫn cho tải .html và nhận mã `STUDIO-PICK|…` thủ công.
- Dữ liệu mẫu: seed ops có cờ `demo`; "Xóa dữ liệu mẫu" (Cài đặt vận hành hoặc Cài đặt chính) xóa cả sự kiện/spot/photographer mẫu; bản ghi đã sửa thì được giữ. Vẫn còn là giả: tin nhắn (chưa nối LINE/Zalo/Email thật), đăng nhập, xem trước đám mây, thanh toán.
Việc dở:
- Briefing có thể chứa mã đặt phòng, chỉ gửi link cho đội. Bản demo cũ ở project `studio-brief`.
- Nhập các GPX trong Google Drive (15 file: 墾丁馬, 華航馬, 嘉有喜柿, ZEPRO RUN, Sun Moon Lake…): trong app bấm "Chọn từ Google Drive…" ở BriefSheet (mở hộp thoại bắt đầu ở thư mục Drive for desktop, chọn nhiều file; sau khi đọc xong tự mở bản xem trước có checkpoint trên bản đồ). Cần cài Google Drive cho máy tính.
- Cập nhật test Playwright cũ, build lại bản cài Windows, build .dmg cho Mac.
- Ý tưởng sau: Cmd+K tìm kiếm, menu chuột phải, Hoàn tác khi xóa, phím tắt; backend nhỏ để app tự xuất bản briefing.
Sau đó: backend/đồng bộ nhiều máy, tích hợp tin nhắn thật, đăng nhập thật.

## Hiệu năng (đã tối ưu)
- Nhập ảnh (`media.rs`): chép song song 2 đến 4 luồng, đọc nguồn một lần (băm trong lúc ghi, đọc lại bản chép để kiểm), tiến độ theo dung lượng ≤10 lần/giây, nút dừng (`cancel_import`), tự tìm thẻ có DCIM (`find_cards`), ảnh xem nhanh xoay đúng chiều và tạo song song.
- `Cargo.toml`: `[profile.dev.package."*"] opt-level = 3` vì `tauri dev` chạy debug làm băm SHA-256 và giải mã JPEG chậm hơn khoảng 20 lần.
- `persist.ts`: lưu localStorage trễ 300 ms và xả khi ẩn/đóng cửa sổ, thay vì ghi cả kho dữ liệu mỗi thao tác.

## Build
- Mac: bản chép ở `~/Desktop/studio-manager`; bấm đúp `Mo-Studio.command` (tự `git pull`, rồi chạy `tauri dev`). Cài lần đầu: `bash scripts/setup-mac.sh`. Chưa ký số (mở bằng chuột phải → Mở). Dùng Terminal tab mới, đừng gõ vào tab đang chạy app.
- Làm việc: nhắn trong chat này, máy đám mây sửa và push; Mac chỉ cần bấm `Mo-Studio.command` để xem.
- Xem thử web: `cd app && npm run build && npx vite preview --port 4174`.
- Windows: `npx tauri build --bundles nsis`. GitHub Actions đang bị khóa do billing.
- Dữ liệu mỗi máy riêng; chuyển bằng Sao lưu/Khôi phục JSON trong Cài đặt.
