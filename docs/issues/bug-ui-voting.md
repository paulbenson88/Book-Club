```markdown
// filepath: c:\Users\Paul\book-club\docs\issues\bug-ui-voting.md
# Bug: UI for Voting Poll is gone

Summary
The voting poll UI is missing from the event page — users cannot cast votes.

Steps to reproduce
1. Open event page (Book Club → Upcoming event)
2. Expect to see voting poll / choices UI
3. UI area is empty (or hidden)

Expected
Voting UI (choices list, vote button) is visible and usable for attendees.

Actual
Voting area does not render (blank space) or DOM element not present.

Acceptance criteria
- Voting UI displays on event page when poll=open
- Desktop and mobile layouts show choices and a vote action
- Keyboard and screen-reader access to vote control

Suggested debugging steps
- Check console for JS errors on event page load
- Inspect conditional rendering (is poll state false/undefined?)
- Verify front-end receives poll data from Google Sheets / API

Priority: high
Estimate: small
```