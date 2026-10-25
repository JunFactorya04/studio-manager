@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Dang lay ban moi nhat...
git pull --ff-only
cd app
if not exist node_modules (
  echo Cai thu vien lan dau...
  call npm install
)
echo Mo Studio...
call npm run tauri dev
pause
