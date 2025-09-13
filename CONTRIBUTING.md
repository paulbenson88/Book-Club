# Contributing (short)

- Branch: feature/<issue-number>-short-desc
- Make small PRs. Link the related issue.
- Add testing steps to PR description.
- Use @<github-username> for reviewer requests.

## Pull Requests

- Keep PRs focused and small where possible.
- Reference any related issues.
- Follow conventional commits in titles when possible (feat:, fix:, chore:, docs:, etc.).

### Closing issues automatically

- Include a closing keyword in the PR description (e.g., "Closes #42", "Fixes #42"). When the PR is merged into `main`, the linked issue will auto-close.
- If you merge directly to `main` without a PR, add a quick comment to the issue with the commit link and close it manually.
```markdown
// filepath: c:\Users\Paul\book-club\CONTRIBUTING.md
# Contributing (short)

- Branch: feature/<issue-number>-short-desc
- Make small PRs. Link the related issue.
- Add testing steps to PR description.
- Use @<github-username> for reviewer requests.

Quick commands (PowerShell):
```powershell
git checkout -b feature/123-rsvp
git add .
git commit -m "Add RSVP form"
git push -u origin feature/123-rsvp
```
```