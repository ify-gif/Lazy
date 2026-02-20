# LAZY v1.0.0

## What's New

- Stabilized Electron + Next.js startup and packaging pipeline.
- Added deterministic clean build flow to avoid stale artifact reuse.
- Added packaging smoke checks to validate installer and unpacked app outputs.
- Added IPC contract tests for DB and migration behavior.
- Added Playwright core-flow tests for Meeting and Tracker critical UX.
- Added CI quality gates on `main`/`master` and release verification on tag builds.
- Upgraded NSIS installer configuration to professional wizard mode.

## Installer/Packaging Improvements

The Windows installer is now configured to support:

- Wizard-based NSIS install flow (`oneClick=false`)
- Per-machine install (`perMachine=true`) targeting Program Files
- Start Menu and Desktop shortcuts
- Add/Remove Programs registration with uninstaller
- License agreement screen (`LICENSE.txt`)
- Launch app option after install (`runAfterFinish=true`)
- Custom installer/uninstaller/header icons

## Verification Performed

Local release gate executed successfully:

- `npm run lint`
- `npm run typecheck`
- `npm run verify:installer-config`
- `npm run test:ipc-contract`
- `npm run test:e2e-core`
- `npm run electron-build-verified`

Generated artifacts (validated):

- `release/LAZY Setup 1.0.0.exe`
- `release/LAZY Setup 1.0.0.exe.blockmap`
- `release/latest.yml`
- `release/win-unpacked/LAZY.exe`
- `release/win-unpacked/resources/app.asar`

## Known Limitations

- Lint warnings remain for `<img>` usage and one React hook dependency warning; non-blocking for release.
- Clean-machine installer UX and updater behavior still require manual end-to-end validation on a fresh Windows profile.

## Manual Post-Release Smoke Checklist

1. Install from `LAZY Setup 1.0.0.exe` on a clean session.
2. Launch app from Start Menu and Desktop shortcuts.
3. Validate API key setup path.
4. Meeting flow: record, stop, save guard without title, copy guard without title.
5. Tracker flow: generate, save, inline title edit, export, delete.
6. Confirm uninstall entry in Add/Remove Programs and complete uninstall.
7. Validate updater status indicator behavior.

## Rollback Plan

1. Unpublish or mark the `v1.0.0` release as pre-release on GitHub.
2. Re-tag previous stable release (or publish hotfix `v1.0.1`).
3. Ask users to reinstall prior stable installer.
4. Investigate issue using installer logs and app logs, patch, and cut a new tag.
