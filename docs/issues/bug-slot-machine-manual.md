```markdown
// filepath: c:\Users\Paul\book-club\docs\issues\bug-slot-machine-manual.md
# Bug / Improvement: Replace manual choice with searchable dropdown for slot machine

Summary
Manual-choice input for the slot machine causes start issues and is error prone. Replace it with a dropdown + search of submissions to overwrite a slot.

User story
As an admin, I want a searchable dropdown of submitted books to pick from instead of typing manual choices so I avoid typos and ensure valid submissions.

Acceptance criteria
- The slot machine UI shows a "Choose submission" dropdown per slot
- Dropdown supports search/filter over all submissions
- Selecting a submission overwrites the slot selection
- Accessibility: dropdown is keyboard searchable and screen-reader friendly

Notes / Implementation hints
- Use an existing searchable select component (e.g., downshift, react-select) or a lightweight custom filter
- Populate options from current submissions data source
Priority: medium
Estimate: medium
```
