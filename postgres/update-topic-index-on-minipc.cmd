@echo off
chcp 65001 >nul
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0update-topic-index-on-minipc.ps1"
set EXIT_CODE=%ERRORLEVEL%
if not "%EXIT_CODE%"=="0" pause
exit /b %EXIT_CODE%
