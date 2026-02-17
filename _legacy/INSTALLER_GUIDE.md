# LAZY - Professional Installer Guide

Your LAZY application now has a professional Windows installer using NSIS (Nullsoft Scriptable Install System) - the same technology used by major applications like WinAMP, Dropbox, and many others.

## What the Installer Does

### For Users:
- ✅ Professional installation wizard with modern UI
- ✅ Installs to Program Files directory
- ✅ Creates Start Menu shortcuts
- ✅ Creates Desktop shortcut
- ✅ Registers in Windows Add/Remove Programs
- ✅ Includes proper uninstaller
- ✅ Custom icon throughout installation
- ✅ License agreement screen
- ✅ Option to launch app after installation

### For You:
- ✅ Single .exe installer file (~8 MB)
- ✅ Professional distribution method
- ✅ Automatic version checking
- ✅ Handles upgrades automatically

## Step 1: Install NSIS

### Download NSIS
1. Go to: https://nsis.sourceforge.io/Download
2. Download **NSIS 3.x** (latest version)
3. Run the installer
4. Install to default location: `C:\Program Files (x86)\NSIS\`

### Verify Installation
Open Command Prompt and run:
```bash
"C:\Program Files (x86)\NSIS\makensis.exe" /VERSION
```

You should see the NSIS version number.

## Step 2: Build the Installer

### Option A: Using the Batch File (Easiest)
Simply double-click:
```
build_installer.bat
```

### Option B: Manual Build
```bash
cd c:\Users\ifeat\Lazy
"C:\Program Files (x86)\NSIS\makensis.exe" installer.nsi
```

### Build Output
After successful build, you'll get:
```
LAZY_Setup_v1.2.0.exe
```

This is your installer! (~8 MB)

## Step 3: Test the Installer

### Install
1. Double-click `LAZY_Setup_v1.2.0.exe`
2. Follow the installation wizard
3. Choose installation directory (default: `C:\Program Files\LAZY`)
4. Accept license agreement
5. Click Install
6. Choose to launch LAZY

### Verify Installation
Check that:
- ✅ LAZY appears in Start Menu
- ✅ Desktop shortcut was created
- ✅ App runs with correct icon
- ✅ All styling is preserved
- ✅ "LAZY" appears in Windows Settings > Apps

### Uninstall
Test uninstallation:
1. Go to Windows Settings > Apps
2. Find "LAZY - Audio Transcription & Work Tracker"
3. Click Uninstall
4. Or use Start Menu > LAZY > Uninstall LAZY

## Distribution

### Single File Distribution
Just share: `LAZY_Setup_v1.2.0.exe`

Users simply:
1. Download the installer
2. Run it
3. Done!

No Python, no dependencies, no configuration needed.

## Installer Features Included

### 1. Version Checking
- Detects if LAZY is already installed
- Offers to uninstall previous version
- Prevents conflicts

### 2. Registry Integration
- Registers in Windows registry
- Appears in Add/Remove Programs
- Stores installation path
- Version information

### 3. Shortcuts Created
- **Start Menu**: `Start > LAZY > LAZY - Audio Transcription & Work Tracker`
- **Desktop**: `LAZY - Audio Transcription & Work Tracker.lnk`
- **Uninstaller**: `Start > LAZY > Uninstall LAZY`

### 4. Professional Uninstaller
- Removes all files
- Removes all registry keys
- Removes all shortcuts
- Cleans up installation directory

## Customizing the Installer

### Change Version Number
Edit `installer.nsi`, line 6:
```nsi
!define APP_VERSION "1.2.0"
```

### Change Installation Directory
Edit `installer.nsi`, line 18:
```nsi
InstallDir "$PROGRAMFILES64\LAZY"
```

### Add More Shortcuts
Add to the `Section "Install"` in `installer.nsi`:
```nsi
CreateShortCut "$QUICKLAUNCH\LAZY.lnk" "$INSTDIR\${APP_EXE}"
```

### Custom Branding
Replace these in `installer.nsi`:
- `!define APP_PUBLISHER "LAZY Team"` - Your company name
- `!define MUI_WELCOMEFINISHPAGE_BITMAP` - Custom welcome image
- `!define MUI_HEADERIMAGE_BITMAP` - Custom header image

## File Structure

After installation, users get:
```
C:\Program Files\LAZY\
├── LAZY.exe                    (Your app)
├── _internal\                  (Dependencies)
│   ├── PyQt6\
│   ├── numpy.libs\
│   ├── styles.qss              (Your styling)
│   └── ... (other libraries)
├── assets\                     (Your resources)
│   ├── lazy_icon.ico
│   ├── icon.png
│   └── landing.html
└── uninstall.exe               (Uninstaller)
```

## Troubleshooting

### NSIS Not Found
**Error:** `'makensis' is not recognized`

**Solution:**
1. Install NSIS from https://nsis.sourceforge.io/Download
2. Or specify full path in `build_installer.bat`:
   ```batch
   "C:\Program Files (x86)\NSIS\makensis.exe" installer.nsi
   ```

### Icon Not Showing
**Error:** Icon doesn't appear in installer

**Solution:**
- Ensure `assets\lazy_icon.ico` exists
- Rebuild the standalone .exe first:
  ```bash
  python -m PyInstaller LAZY.spec --clean -y
  ```

### Installer Too Large
**Current size:** ~8 MB (acceptable)

**To reduce size:**
- Edit `LAZY.spec` to exclude unused libraries
- Use UPX compression (already enabled)

## Advanced: Code Signing (Optional)

To make your installer more trusted:

1. **Get a code signing certificate** (e.g., from Sectigo, DigiCert)
2. **Sign the installer:**
   ```bash
   signtool sign /f certificate.pfx /p password LAZY_Setup_v1.2.0.exe
   ```

This removes the "Unknown Publisher" warning when users run the installer.

## Updating Your App

When you release a new version:

1. **Update code** in your Python files
2. **Rebuild the .exe:**
   ```bash
   python -m PyInstaller LAZY.spec --clean -y
   ```
3. **Update version** in `installer.nsi`:
   ```nsi
   !define APP_VERSION "1.3.0"
   ```
4. **Build new installer:**
   ```bash
   build_installer.bat
   ```
5. **Distribute:** `LAZY_Setup_v1.3.0.exe`

Users who have v1.2.0 installed will be prompted to uninstall it automatically before installing v1.3.0.

## Support Files Included

- ✅ `installer.nsi` - NSIS script (installer configuration)
- ✅ `build_installer.bat` - Automated build script
- ✅ `LICENSE.txt` - Software license (shown during installation)
- ✅ `INSTALLER_GUIDE.md` - This guide

## Summary

You now have a **professional Windows installer** for LAZY:

1. **Build once:** `build_installer.bat`
2. **Distribute:** Share `LAZY_Setup_v1.2.0.exe`
3. **Users install:** Double-click and follow wizard
4. **Everyone wins:** Professional installation experience

Your app will look polished and professional to all users! 🎉
