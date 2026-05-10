@echo off
echo ===== BACKEND SETUP VERIFICATION =====
echo.

echo 1. Checking Python version...
python --version 2>nul
if errorlevel 1 (
    echo Python NOT found in PATH
) else (
    echo Python found
)
echo.

echo 2. Checking Poetry availability...
poetry --version 2>nul
if errorlevel 1 (
    echo Poetry NOT found in PATH
) else (
    echo Poetry found
)
echo.

echo 3. Current directory:
cd
echo.

echo 4. Checking if poetry.lock and pyproject.toml exist...
if exist poetry.lock (
    echo poetry.lock: FOUND
) else (
    echo poetry.lock: NOT FOUND
)
if exist pyproject.toml (
    echo pyproject.toml: FOUND
) else (
    echo pyproject.toml: NOT FOUND
)
echo.

echo 5. Checking for .venv directory...
if exist .venv (
    echo .venv directory: EXISTS
) else (
    echo .venv directory: NOT FOUND
)
echo.

echo 6. Attempting to list registered routes using Python import...
python -c "import sys; sys.path.insert(0, '.'); from app.main import app; print('Routes found:', len(app.routes)); print('Route details:'); [print(f'  {getattr(r, \"path\", None)} - {list(getattr(r, \"methods\", []))}') for r in app.routes if hasattr(r, 'path')]" 2>&1
if errorlevel 1 (
    echo Failed to import app. This may indicate missing dependencies.
)
echo.

echo 7. Checking for tests directory...
if exist tests (
    echo tests directory: FOUND
) else (
    echo tests directory: NOT FOUND
)
echo.

echo Verification complete.
