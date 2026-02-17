# LAZY - Build Instructions

## Your Standalone Application is Ready!

Your LAZY application has been built as a standalone Windows executable with the custom icon embedded.

### Location of Your .exe File

```
C:\Users\ifeat\Lazy\dist\LAZY\LAZY.exe
```

The entire `dist\LAZY\` folder contains your application and all its dependencies.

## How to Run Your Standalone Application

### Option 1: Run Directly
Simply double-click `LAZY.exe` in the `dist\LAZY\` folder.

### Option 2: Create Desktop Shortcut
1. Navigate to `C:\Users\ifeat\Lazy\dist\LAZY\`
2. Right-click on `LAZY.exe`
3. Select "Create shortcut"
4. Drag the shortcut to your Desktop

### Option 3: Move to a Different Location
You can move the **entire** `LAZY` folder (from `dist\LAZY\`) anywhere you want:
- `C:\Program Files\LAZY\`
- `C:\Users\ifeat\Desktop\LAZY\`
- Or any other location

**Important:** Always keep all files in the `LAZY` folder together. The .exe needs the other files to run.

## About the Icon

The icon has been embedded into the executable and should now display correctly:
- ✓ In the Windows taskbar
- ✓ In the window title bar
- ✓ In the Alt+Tab switcher
- ✓ In Task Manager
- ✓ In File Explorer

## Rebuilding the Application

If you make changes to the code and want to rebuild:

```bash
cd c:\Users\ifeat\Lazy
python -m PyInstaller LAZY.spec --clean
```

The new .exe will be created in `dist\LAZY\LAZY.exe`

## Distribution

To share your application with others:
1. Zip the entire `dist\LAZY\` folder
2. Send the zip file
3. Users can extract it anywhere and run `LAZY.exe`

No Python installation required on their system!

## File Size

Your executable is approximately **8.1 MB** and includes:
- Your Python code
- PyQt6 libraries
- All dependencies (sounddevice, numpy, keyring, etc.)
- The assets folder (icons, HTML, etc.)

## Troubleshooting

### Icon Not Showing
- Make sure you're running `LAZY.exe` from the `dist\LAZY\` folder
- The icon file must exist in `dist\LAZY\assets\lazy_icon.ico`

### Application Won't Start
- Check that all files in the `dist\LAZY\` folder are present
- Try running from Command Prompt to see error messages:
  ```bash
  cd "C:\Users\ifeat\Lazy\dist\LAZY"
  LAZY.exe
  ```

### Missing Assets
- Make sure the `assets` folder is in the same directory as `LAZY.exe`
- If missing, rebuild using the command above
