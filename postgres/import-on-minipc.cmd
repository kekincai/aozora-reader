@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0.."
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0import-on-minipc.ps1"
if errorlevel 1 (
  echo.
  echo Import failed. Check the newest log in %~dp0
) else (
  echo.
  echo Import finished successfully.
)
pause
