Center the Voting Poll title on voting_poll.html

Description:
The "📚 Voting Poll" heading is left-aligned; center it within the card for visual balance.

Acceptance Criteria:
- The main poll title on pages/voting_poll.html is horizontally centered.
- No layout regressions on mobile.
- Change isolated to voting_poll.html (does not unintentionally center unrelated titles globally across other pages).

Implementation Notes:
- Easiest: add inline style or a page-local CSS rule (e.g., h1.card-title{text-align:center}) in voting_poll.html.
- Avoid modifying global site CSS unless needed.

Testing:
- Open voting_poll.html before and after change and confirm only the title alignment changes.
