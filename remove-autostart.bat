@echo off
set "TARGET=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\FortuneKioskV12.bat"
if exist "%TARGET%" del "%TARGET%"
echo Windows startup entry removed.
pause
