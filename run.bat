@echo off
echo ========================================================
echo        GoldLens: MCX Gold Derivatives Intelligence      
echo ========================================================
echo.

echo [1/3] Checking environment...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found in PATH. Please install Python 3.11+.
    pause
    exit /b 1
)

node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found in PATH. Please install Node.js 18+.
    pause
    exit /b 1
)

echo [2/3] Launching FastAPI Backend on http://127.0.0.1:8000...
start "GoldLens Backend" cmd /k "cd backend && python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"

echo [3/3] Launching React Vite Frontend on http://localhost:5173...
start "GoldLens Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo ========================================================
echo  Both services launched!
echo  - Frontend: http://localhost:5173
echo  - Backend API: http://127.0.0.1:8000/docs
echo ========================================================
