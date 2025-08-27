```markdown
// filepath: c:\Users\Paul\book-club\docs\issues\bug-start-poll-manual-choice.md
# Bug: Start Poll fails when adding a manual choice

Summary
When the admin adds a manual choice to a poll and clicks "Start Poll", the poll does not start or the manual choice is not included.

Steps to reproduce
1. Open admin poll modal
2. Add a manual choice text
3. Click "Start Poll"
4. Poll either errors or the manual choice is missing from choices

Expected
Manual choice is included and the poll transitions to active state.

Actual
Poll does not start or manual choice excluded; console error may appear.

Acceptance criteria
- Admin can add manual choices and start poll reliably
- Manual choice persists and is visible to voters after start
- No console errors thrown during start action

Suggested fix
- Check manual choice handling code path (ensure it's appended into choices array before start)
- Add unit test for adding manual choice then starting poll

Priority: high
Estimate: smallâ€“medium
```
