@echo off
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "TARGET=%STARTUP%\FortuneKioskV12.bat"
echo @echo off>"%TARGET%"
echo cd /d "%~dp0">>"%TARGET%"
echo start "" "%~dp0start-kiosk-edge.bat">>"%TARGET%"
echo.
echo Windows startup installed:
echo %TARGET%
pause
