## Summary
- Describe what changed and why.

## Validation
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run test:ipc-contract`
- [ ] `npm run test:e2e-core`
- [ ] If release-impacting: `npm run electron-build-verified`

## Risk Check
- [ ] No packaging/startup path regression (`dist-electron/main.js` path still valid)
- [ ] No data migration risk (if DB code changed, migration added/tested)
- [ ] UI behavior verified for both Meeting and Tracker flows
