@echo off
chcp 65001 >nul
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0update-topic-index-on-minipc.ps1"
set EXIT_CODE=%ERRORLEVEL%
echo.
if "%EXIT_CODE%"=="0" (
  echo Topic index rebuild finished successfully.
) else (
  echo Topic index rebuild stopped or failed. Run this file again to resume.
)
pause
exit /b %EXIT_CODE%
