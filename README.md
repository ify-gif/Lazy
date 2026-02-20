# LAZY

LAZY is a desktop app for capturing meetings and turning them into structured, reusable work output.

Built with Electron + Next.js, it runs locally, stores history in SQLite, and supports a BYOK setup for API usage.

## What It Does

- Records and transcribes meeting sessions
- Generates structured output from transcripts
- Saves meeting history locally
- Supports tracker workflows for follow-up items and story refinement
- Provides desktop packaging and auto-update release metadata

## Stack

- Electron
- Next.js 16 (App Router)
- React 19
- TypeScript
- SQLite (`sqlite3`)
- Playwright (core flow E2E)

## Prerequisites

- Node.js 20+
- npm 10+
- Windows (primary packaging target)

## Setup

```bash
npm ci
```

## Development

```bash
npm run electron-dev
```

This starts Next.js and Electron together using the hardened startup script.

## Build and Package

```bash
npm run electron-build
```

Verified package build + smoke check:

```bash
npm run electron-build-verified
```

Fresh installer build (cleans all prior build artifacts first):

```bash
npm run electron-build-fresh
```

## Quality Gates

Local full release verification:

```bash
npm run release:verify
```

CI verification (no installer packaging step):

```bash
npm run release:verify:ci
```

Included checks:

- `npm run lint`
- `npm run typecheck`
- `npm run test:ipc-contract`
- `npm run test:e2e-core`
- Packaging + smoke (`release:verify` only)

## Testing

IPC/data contract tests:

```bash
npm run test:ipc-contract
```

Core UI flow tests:

```bash
npm run test:e2e-core
```

## Release Artifacts

`electron-builder` outputs to `release/`, including:

- `LAZY Setup <version>.exe`
- `LAZY Setup <version>.exe.blockmap`
- `latest.yml`
- `win-unpacked/`

## Windows Installer (NSIS)

The Windows installer is built with NSIS and configured for a professional install flow:

- Wizard-style installer (not one-click)
- Installs per-machine (Program Files)
- Start Menu shortcut
- Desktop shortcut
- Add/Remove Programs registration
- Uninstaller
- Custom installer/uninstaller icon
- License agreement screen
- Launch option after install

## Project Structure

- `app/` - Next.js UI routes and components
- `main/` - Electron main process and DB service
- `scripts/` - dev startup, cleanup, smoke validation scripts
- `tests/` - Playwright + Node contract tests
- `.github/workflows/` - CI quality and release workflows

## CI/CD

- `Quality Gate` workflow runs on push/PR to `main`/`master`
- `Release` workflow runs on `v*` tags and publishes artifacts
- `Security Audit and Build Check` runs production-focused audit and build checks

## Notes

- App entrypoint is `dist-electron/main.js`
- If dev startup fails on port 3000, stop conflicting process and rerun `npm run electron-dev`
- If Electron cannot find `dist-electron/main.js`, run a clean compile via:

```bash
npm run clean
npm run electron-dev
```

## License

Private project. All rights reserved.
