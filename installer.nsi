; LAZY Audio Transcription & Work Tracker - NSIS Installer Script
; Modern UI installer with proper uninstall support

!define APP_NAME "LAZY"
!define APP_FULL_NAME "LAZY - Audio Transcription & Work Tracker"
!define APP_VERSION "1.2.5"
!define APP_PUBLISHER "LAZY Team"
!define APP_EXE "LAZY.exe"
!define APP_ICON "assets\lazy_icon.ico"
!define INSTALL_DIR_NAME "LAZY"

; Modern UI
!include "MUI2.nsh"

; Required for registry operations
!include "x64.nsh"

; General Settings
Name "${APP_FULL_NAME}"
OutFile "LAZY_Setup_v${APP_VERSION}.exe"
InstallDir "$PROGRAMFILES64\${INSTALL_DIR_NAME}"
InstallDirRegKey HKLM "Software\${APP_NAME}" "Install_Dir"
RequestExecutionLevel admin

; Modern UI Settings
!define MUI_ABORTWARNING
!define MUI_ICON "${APP_ICON}"
!define MUI_UNICON "${APP_ICON}"
; Uncomment and provide BMP files for custom branding (164x314 pixels for welcome/finish, 150x57 for header)
; !define MUI_WELCOMEFINISHPAGE_BITMAP "assets\welcome.bmp"
; !define MUI_HEADERIMAGE
; !define MUI_HEADERIMAGE_BITMAP "assets\header.bmp"
; !define MUI_HEADERIMAGE_RIGHT

; Pages
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "LICENSE.txt"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Launch ${APP_FULL_NAME}"
!insertmacro MUI_PAGE_FINISH

; Uninstaller Pages
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

; Languages
!insertmacro MUI_LANGUAGE "English"

; Version Information
VIProductVersion "${APP_VERSION}.0"
VIAddVersionKey "ProductName" "${APP_FULL_NAME}"
VIAddVersionKey "CompanyName" "${APP_PUBLISHER}"
VIAddVersionKey "FileVersion" "${APP_VERSION}"
VIAddVersionKey "FileDescription" "${APP_FULL_NAME} Installer"
VIAddVersionKey "LegalCopyright" "© 2025 ${APP_PUBLISHER}"

;--------------------------------
; Installer Section
;--------------------------------

Section "Install"
  SetOutPath "$INSTDIR"

  ; Copy LAZY.exe to the installation directory
  File "dist\LAZY\LAZY.exe"

  ; Copy the entire _internal folder with all dependencies
  File /r "dist\LAZY\_internal"

  ; Write the installation path into the registry
  WriteRegStr HKLM "Software\${APP_NAME}" "Install_Dir" "$INSTDIR"

  ; Write the uninstall keys for Windows
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "DisplayName" "${APP_FULL_NAME}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "Publisher" "${APP_PUBLISHER}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "DisplayIcon" "$INSTDIR\${APP_EXE}"
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "NoModify" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "NoRepair" 1

  ; Create uninstaller
  WriteUninstaller "$INSTDIR\uninstall.exe"

  ; Create Start Menu shortcuts
  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortCut "$SMPROGRAMS\${APP_NAME}\${APP_FULL_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_EXE}" 0
  CreateShortCut "$SMPROGRAMS\${APP_NAME}\Uninstall ${APP_NAME}.lnk" "$INSTDIR\uninstall.exe" "" "$INSTDIR\uninstall.exe" 0

  ; Create Desktop shortcut (optional)
  CreateShortCut "$DESKTOP\${APP_FULL_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_EXE}" 0

  ; Set file associations (optional - uncomment if needed)
  ; WriteRegStr HKCR ".lazy" "" "LAZY.File"
  ; WriteRegStr HKCR "LAZY.File" "" "${APP_FULL_NAME} File"
  ; WriteRegStr HKCR "LAZY.File\DefaultIcon" "" "$INSTDIR\${APP_EXE},0"
  ; WriteRegStr HKCR "LAZY.File\shell\open\command" "" '"$INSTDIR\${APP_EXE}" "%1"'

SectionEnd

;--------------------------------
; Uninstaller Section
;--------------------------------

Section "Uninstall"

  ; Close any running instances of LAZY
  nsExec::ExecToStack 'taskkill /F /IM "${APP_EXE}" /T'
  Sleep 1000

  ; Remove registry keys
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}"
  DeleteRegKey HKLM "Software\${APP_NAME}"

  ; Remove file associations (if they were created)
  ; DeleteRegKey HKCR ".lazy"
  ; DeleteRegKey HKCR "LAZY.File"

  ; Remove files and uninstaller
  Delete "$INSTDIR\${APP_EXE}"
  Delete "$INSTDIR\uninstall.exe"

  ; Remove all files in the installation directory
  RMDir /r "$INSTDIR"

  ; Remove shortcuts
  Delete "$SMPROGRAMS\${APP_NAME}\${APP_FULL_NAME}.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\Uninstall ${APP_NAME}.lnk"
  RMDir "$SMPROGRAMS\${APP_NAME}"
  Delete "$DESKTOP\${APP_FULL_NAME}.lnk"

SectionEnd

;--------------------------------
; Functions
;--------------------------------

Function .onInit
  ; Check if already installed
  ReadRegStr $R0 HKLM "Software\${APP_NAME}" "Install_Dir"
  StrCmp $R0 "" done

  MessageBox MB_OKCANCEL|MB_ICONQUESTION \
    "${APP_FULL_NAME} is already installed. $\n$\nClick 'OK' to remove the previous version or 'Cancel' to cancel this installation." \
    IDOK uninst
  Abort

uninst:
  ; Run the uninstaller
  ExecWait '$R0\uninstall.exe _?=$R0'
  Delete "$R0\uninstall.exe"
  RMDir "$R0"

done:
FunctionEnd
