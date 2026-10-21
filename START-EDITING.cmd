@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js first: https://nodejs.org/
  pause
  exit /b 1
)
if not exist "node_modules\vite\bin\vite.js" (
  echo Installing dependencies. Internet connection required.
  call npm.cmd install
  if errorlevel 1 (
    echo Installation failed. Check Node.js version and internet connection.
    pause
    exit /b 1
  )
)
echo Starting the game. Keep this window open.
call npm.cmd run dev -- --host 127.0.0.1 --open
pause
