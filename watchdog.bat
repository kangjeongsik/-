@echo off
cd /d "%~dp0"
:loop
start /wait cmd /c "npm run server"
timeout /t 3 /nobreak >nul
goto loop
