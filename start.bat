@echo off
cd /d "%~dp0"
if not exist .env copy .env.example .env >nul
echo Installing dependencies if needed...
if not exist node_modules npm install
if errorlevel 1 goto failed
npm start
pause
goto end
:failed
echo Setup failed. Check that Node.js 18+ and npm are installed.
pause
:end
