# Book-Club

Lightweight app to organize book-club events, manage RSVPs, and serve as a practice project for UX/product design, accessibility, and light front-end engineering.

This repo is used as a learning lab: implement small features, run usability tests, improve accessibility, and publish short case studies.

## Features
- Event listing and details
- RSVP flow (mobile-first)
- Basic attendee management
- Docs for personas, practice plan, and accessibility notes

## Quick start (Windows / PowerShell)
Open a terminal in the repo folder and run:

```powershell
cd "C:\Users\Paul\book-club"

# If this project uses Node
if (Test-Path package.json) {
  npm install
  npm run dev   # or `npm start` — check package.json scripts
} else {
  # If static site, open index.html in your browser
  Start-Process index.html
}
```

## Development workflow
- Branch per task: feature/<issue-number>-short-desc
- Keep changes small and focused (one feature/fix per PR)
- Open PRs, add testing steps and accessibility notes
- Use the repository Project board and issues for planning

Helpful Git/GH commands:
```powershell
git checkout -b feature/1-example
git add .
git commit -m "Short summary of change"
git push -u origin feature/1-example
gh pr create --title "Short PR title" --body "What changed and how to test"
```

## Docs & important files
- docs/practice-plan.md — step-by-step practice plan
- docs/personas.md — persona profiles & user stories
- docs/accessibility.md — accessibility checklist and notes
- docs/case-studies/ — place case study markdown files here
- .github/CONTRIBUTING.md — contribution guidelines
- .github/PULL_REQUEST_TEMPLATE.md and .github/ISSUE_TEMPLATE/ — templates for PRs and issues

## Testing & CI
- Run `npm test` if tests exist.
- Add unit and E2E tests (Jest, Playwright/Cypress).
- CI runs via GitHub Actions (add workflows in .github/workflows).

## Accessibility
Prioritize:
- Semantic HTML and correct heading structure
- Keyboard navigation and visible focus
- Sufficient color contrast and meaningful link text

Use Lighthouse or axe DevTools for audits.

## Deployment
Deploy previews via Vercel or Netlify for each PR, or publish a static build to GitHub Pages.

## Contributing
See .github/CONTRIBUTING.md for branch naming, PR size guidance, and review expectations.

## License
See LICENSE in this repo.

## Contact / Maintainer
Repo: https://github.com/paulbenson88/Book-Club