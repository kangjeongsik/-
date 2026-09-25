@echo off
title Fortune Kiosk V10
cd /d "%~dp0"
start "Kiosk API" cmd /k npm run server
timeout /t 3 /nobreak >nul
start "Kiosk Web" cmd /k npm run dev -- --host 0.0.0.0
timeout /t 5 /nobreak >nul
start "" chrome.exe --kiosk --disable-pinch --overscroll-history-navigation=0 http://localhost:5173
