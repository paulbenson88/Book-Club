# PR: Show Live Total Vote Counts Per Book

Summary
- Adds a small numeric badge next to each book title showing the total number of votes.
- Works for both the main poll (multi-select) and the runoff (single-select) phases.
- Updates in real-time via existing Firebase votes subscriptions; no extra reads.
- Accessible: badge has aria-live and an aria-label that pluralizes “vote(s)”.

Files changed
- pages/voting_poll.html
  - Adds minimal CSS for a small rounded “pill” badge: `.vote-count-badge`.
  - Injects a badge next to book titles in both poll and runoff renderers.
  - Updates counts in:
    - updateVoters(book) for regular poll (re-used by Firebase votes snapshot handler)
    - fbSubscribeRunoffVotes handler for runoff
  - Initializes the badge on first render so zero counts display immediately.

Behavior
- During active poll, each option shows a vote count; starts at 0 and updates as votes change.
- In runoff, the remaining tied books also show a vote count; updates in real time.
- After a winner is announced, the poll/runoff UI is hidden as before; counts aren’t shown on the winner card.

Accessibility
- The badge has `aria-live="polite"` and the label is set to “N vote(s)”, e.g., `aria-label="3 votes"`.

Notes
- Counts are derived locally from the names-by-book map already provided by `fbSubscribeVotes/fbSubscribeRunoffVotes`.
- No layout regressions observed; badge uses a compact pill to avoid widening on mobile.

Test plan
- Start a poll with three choices; open two viewer tabs.
- Submit name in both; toggle votes.
- Observe count badges increase/decrease instantly in both tabs.
- Start a tie runoff from admin; verify counts work in runoff as well.
- Announce a winner; verify poll UI (and badges) disappear and winner view shows as before.
