#!/usr/bin/env bash
# Studio Manager - cài đặt và chạy trên macOS (Apple silicon hoặc Intel).
# Dùng:  bash scripts/setup-mac.sh [dev|build]    (mặc định: build)
set -euo pipefail
MODE="${1:-build}"

echo "==> Kiểm tra Xcode Command Line Tools"
if ! xcode-select -p >/dev/null 2>&1; then
  xcode-select --install || true
  echo "Hãy hoàn tất cài Xcode Command Line Tools trong cửa sổ vừa hiện, rồi chạy lại script này."; exit 1
fi

echo "==> Kiểm tra Node"
if ! command -v node >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then brew install node
  else echo "Chưa có Node. Cài từ https://nodejs.org (bản LTS) rồi chạy lại."; exit 1; fi
fi

echo "==> Kiểm tra Rust"
if ! command -v cargo >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
fi
# shellcheck disable=SC1091
source "$HOME/.cargo/env" 2>/dev/null || true

cd "$(dirname "$0")/../app"
echo "==> Cài thư viện"
npm install

if [ "$MODE" = "dev" ]; then
  npm run tauri dev
else
  npm run tauri build
  echo
  echo "Xong. File cài đặt nằm ở: app/src-tauri/target/release/bundle/dmg/"
  open src-tauri/target/release/bundle/dmg 2>/dev/null || true
fi
