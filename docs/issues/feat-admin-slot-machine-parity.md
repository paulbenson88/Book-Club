# Reminder: Admin slot-machine parity with voting poll

## Goal
Make `pages/admin.html` slot-machine UX match `pages/voting_poll.html` slot-machine UX.

## Why
Current behavior/styling differs between admin and viewer experiences, which can cause confusion during live voting.

## Scope to align
- Reel sizing and spacing
- Spin/slowdown/stop feel
- Winner display formatting
- State transitions (idle/spinning/slowing/stopped)
- Text labels and button states

## Next time checklist
- Compare both pages side-by-side on desktop and phone.
- Validate that the same chosen winner is visually represented the same way.
- Ensure no extra admin-only visual behaviors unless explicitly intended.
