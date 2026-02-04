@echo off
REM Build LAZY Installer using NSIS
REM
REM Prerequisites:
REM 1. NSIS must be installed (download from https://nsis.sourceforge.io/Download)
REM 2. The standalone .exe must be built (run: python -m PyInstaller LAZY.spec --clean -y)

echo ================================================
echo Building LAZY Installer
echo ================================================
echo.

REM Check if NSIS is installed
where makensis >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: NSIS is not installed or not in PATH
    echo.
    echo Please install NSIS from: https://nsis.sourceforge.io/Download
    echo After installation, add NSIS to your PATH or run this from the NSIS installation directory
    echo.
    pause
    exit /b 1
)

REM Check if dist\LAZY\LAZY.exe exists
if not exist "dist\LAZY\LAZY.exe" (
    echo ERROR: Standalone executable not found!
    echo.
    echo Please build the standalone .exe first by running:
    echo python -m PyInstaller LAZY.spec --clean -y
    echo.
    pause
    exit /b 1
)

REM Build the installer
echo Building installer with NSIS...
echo.
makensis installer.nsi

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ================================================
    echo SUCCESS! Installer created successfully!
    echo ================================================
    echo.
    echo Installer location: LAZY_Setup_v1.2.5.exe
    echo.
    echo You can now distribute this installer to users.
    echo.
) else (
    echo.
    echo ================================================
    echo ERROR: Failed to build installer
    echo ================================================
    echo.
)

pause
