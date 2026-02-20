# LAZY Release Playbook

## 1) Prepare on Main

1. Land all release changes on `main`.
2. Bump version:

```bash
npm version <X.Y.Z> --no-git-tag-version
git add package.json package-lock.json
git commit -m "chore: bump version to <X.Y.Z>"
git push origin main
```

## 2) Verify Locally

Run the full local gate:

```bash
npm run release:verify
```

## 3) Tag and Trigger Release

Always tag from the latest remote `main`:

```bash
git checkout main
git fetch origin
git reset --hard origin/main
git tag v<X.Y.Z>
git push origin v<X.Y.Z>
```

## 4) Watch CI

In GitHub Actions, open the `Release` workflow run for `v<X.Y.Z>` and wait for success.

## 5) Validate Release Assets

In GitHub Releases, confirm these assets exist and match version:

- `latest.yml`
- `LAZY-Setup-<X.Y.Z>.exe`
- `LAZY-Setup-<X.Y.Z>.exe.blockmap`
- `latest-mac.yml`
- macOS `.dmg`
- macOS `.zip`

## 6) Validate In-App Update (No Uninstall)

On a machine with older installed LAZY:

1. Open app
2. `Check for updates`
3. `Download`
4. `Restart Now`
5. Confirm app version is updated

## 7) If Release Fails

1. Do not keep re-tagging stale commits.
2. Fix workflow/config on `main`.
3. Tag the next version (`v<X.Y.Z+1>`).

## 8) Guardrails

- Keep `package.json` version and Git tag aligned.
- Tag only from synced `origin/main`.
- Keep repo secret `GH_TOKEN` configured.
- Keep branch protection enabled; relax only temporarily for urgent pipeline fixes.
