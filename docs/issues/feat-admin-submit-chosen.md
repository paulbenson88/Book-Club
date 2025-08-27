```markdown
// filepath: c:\Users\Paul\book-club\docs\issues\feat-admin-submit-chosen.md
# Feature: Admin finalize chosen book and update lists automatically

Summary
After voting, admin should click a button to finalize the chosen book. The chosen book is removed from the suggestions pool and automatically appended to the books-read list (with month/year).

User story
As an admin, I want to finalize the chosen book so it cannot be chosen again and appears in books-read.

Acceptance criteria
- "Finalize book" button appears when poll closed
- On finalize: the chosen book is removed from the suggestions source (Google Sheets) and added to books-read (with date)
- Successful finalize shows confirmation and updates front-end lists
Notes
- If using Google Sheets, implement Sheets API update (or use a mock for now)
Priority: medium
Estimate: mediumâ€“large (depending on integration)
```
