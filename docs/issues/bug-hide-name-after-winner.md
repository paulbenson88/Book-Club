Hide name box and edit button after winner announced in voting_poll.html

Description:
When an admin announces a poll winner, the voting viewer should stop showing the name input and the Edit Name button to prevent additional votes or name changes. This issue requests hiding/disabling the name UI once a winner is chosen.

Steps to reproduce:
1. Open `pages/admin.html` and publish a poll.
2. Open `pages/voting_poll.html` as a participant, submit a name and vote.
3. Admin announces a winner (sets `localStorage.pollWinner` or triggers announce flow).
4. On the voting viewer, the name input and Edit button remain visible (current behavior).

Expected behavior:
- After `pollWinner` is set (or winner announced), the viewer hides the name input and Edit Name button.
- Optionally show a short message like "Voting closed — winner announced" and the winner details.
- Persisted `voterName` remains in localStorage but the UI prevents further changes until a new session starts.

Acceptance criteria:
- UI hides or disables `#nameInput`, `#submitNameBtn`, and `#editNameBtn` when a winner is present.
- Voting options are disabled or hidden after winner announced.
- Behavior works across page reloads (uses `localStorage.pollWinner` check on load).
- Tests or manual steps to verify included in PR.

Files to change (suggested):
- `pages/voting_poll.html` — render logic and show/hide elements
- `js/voting.js` — ensure `announceWinner` writes `pollWinner` consistently if needed

Notes:
- Keep accessibility in mind: if hiding controls, ensure focus is moved appropriately and screen readers are informed.
