@echo off
echo Starting Revenue AI - Frontend and Backend...
echo.

REM Check if backend venv exists
if not exist "backend\venv" (
    echo Creating backend virtual environment...
    cd backend
    python -m venv venv
    cd ..
    echo Backend venv created.
)

REM Install backend dependencies
echo Installing backend dependencies...
cd backend
call venv\Scripts\activate
pip install -r requirements.txt
cd ..

REM Check if frontend node_modules exists
if not exist "frontend\node_modules" (
    echo Installing frontend dependencies...
    cd frontend
    call npm install
    cd ..
)

REM Start backend server
echo Starting backend server on http://localhost:8000...
start "Backend Server" cmd /k "cd backend && venv\Scripts\activate && python main.py"

REM Wait a moment for backend to start
timeout /t 3 /nobreak >nul

REM Start frontend server
echo Starting frontend server on http://localhost:3000...
cd frontend
start "Frontend Server" cmd /k "npm run dev"
cd ..

echo.
echo ========================================
echo Both servers are starting...
echo Backend: http://localhost:8000
echo Frontend: http://localhost:3000
echo ========================================
echo.
echo Press any key to close this window (servers will continue running)...
pause >nul
