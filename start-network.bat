@echo off
cd /d "%~dp0"
where python >nul 2>nul
if not %errorlevel%==0 (
  echo Python was not found. Install Python 3 from python.org, then run this file again.
  pause
  exit /b 1
)
echo.
echo Sharing the GACS demo on your network. Others on the same network can open:
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do echo     http://%%a:8080
echo.
echo If Windows asks, allow Python through the firewall (private networks).
echo Press Ctrl+C to stop sharing.
echo.
python -m http.server 8080 --bind 0.0.0.0
