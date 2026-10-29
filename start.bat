@echo off
cd /d "%~dp0"
where python >nul 2>nul
if %errorlevel%==0 (
  echo Serving GACS demo at http://localhost:8080  (Ctrl+C to stop)
  start "" http://localhost:8080
  python -m http.server 8080
) else (
  echo Python not found. Opening index.html directly instead.
  start "" "%~dp0index.html"
)
