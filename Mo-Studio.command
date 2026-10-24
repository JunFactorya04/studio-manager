#!/bin/bash
# Bấm đúp file này trên Mac để cập nhật code mới nhất và mở Studio Manager.
cd "$(dirname "$0")"
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
echo "Đang lấy bản mới nhất..."
git pull --ff-only || echo "(Không cập nhật được, dùng bản hiện có)"
cd app
[ -d node_modules ] || npm install
echo "Đang mở Studio Manager... (đóng cửa sổ Terminal này để tắt app)"
npm run tauri dev
