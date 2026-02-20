# Branch Protection (main)

Configure `main` in GitHub:

1. Require a pull request before merging.
2. Require approvals: `1`.
3. Dismiss stale approvals when new commits are pushed.
4. Require status checks to pass before merging:
   - `verify`
   - `audit_and_build`
5. Require branches to be up to date before merging.
6. Include administrators.
7. Restrict direct pushes to `main` (recommended).

Optional:
- Require conversation resolution before merge.
- Require signed commits.
