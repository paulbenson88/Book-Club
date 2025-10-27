# PR: Align name panel fade with Merc, remove slide animations

Summary
- Align the name panel animation with Merc: use the same single fade-in (no pre fade-out), ensuring visual consistency.
- Remove the previous “trade places” slide effect entirely (JS + CSS), keeping the UI simple and stable.
- Keep Edit Name visible during the waiting state; Merc appears immediately after submitting name.

Context
- Addresses polish requested after #48 (Make Submit Name Control More Prominent).
- This PR refines the transition behavior and accessibility feel without altering core logic.

Changes
- pages/voting_poll.html
  - Remove all slide/translateY logic and class handling.
  - On submitName() and editName(), re-trigger the fade-in on `.name-panel` (same pattern used for Merc in `showWaitingMessage`).
  - Preserve fade-in for waiting area and late-join poll reveal.

Behavior
- Name box: fades in (no fade-out first) when switching between submit and edit modes.
- Waiting (Merc) and poll transitions remain fade-only.
- No position shifting or layout jumps.

Accessibility
- Focus behavior maintained (inputs and first actionable control after submit).
- Visual transitions are subtle and do not impair keyboard usage.

Tested
- Manual sanity check in browser:
  - Submit Name → Merc appears with fade; Edit Name remains visible.
  - Click Edit Name → panel becomes editable and fades in.
  - No slide effect present.

Notes
- On merge, this PR will close the remaining polish for #48.

Fixes #48
