# PR: Winner cover + celebration + reliability

## Summary
Adds winner cover image (async + cached), restores and gates confetti to only fire on live announcements, improves reliability around winner/runoff precedence, and accelerates cover loads via preconnect + prewarm. Includes a readable placeholder when a cover can’t be loaded. Also documents and wires optional Firebase sync for poll state, votes, runoff, and winner.

## Changes
- Viewer (`pages/voting_poll.html`)
  - Winner card
    - Added cover slot (`#winner-cover`) within the card, reserved 180×270 space.
    - `loadWinnerCover(rawBook)` fetches Open Library search, prefers `cover_i`, falls back to `isbn`, times out quickly, caches for 14 days, and fades in on load.
    - Placeholder if load fails: large, two-line cover-like text (“This Broke” / “Blame Alice”).
    - Added `<link rel="preconnect">` and `<link rel="dns-prefetch">` for Open Library endpoints.
    - Winner image uses `fetchpriority="high"` and `referrerpolicy="no-referrer"`.
    - Prewarm covers for current poll choices shortly after poll render to make later winner load instant.
  - Confetti
    - Reintroduced `startConfetti()`; gated via `__celebrateWinnerNext` and initial snapshot tracking so it doesn’t fire on page load/refresh.
  - State precedence
    - Winner render clears poll/runoff and unsubscribes runoff listeners.
    - Reduced-motion respected for confetti.
- Firebase sync (optional, no-op if not configured)
  - Files: `js/firebase-config.js`, `js/firebase-sync.js` (compat SDK)
  - State doc: `polls/current` with subcollections `votes` and `runoffVotes`.
  - APIs: `fbPublishPoll`, `fbClearPoll`, `fbAnnounceWinner`, `fbSubscribe`, `fbGetState`, `fbSetVotes`, `fbSubscribeVotes`, `fbGetVotesSummary`, `fbStartRunoff`, `fbEndRunoff`, `fbSetRunoffVote`, `fbSubscribeRunoffVotes`, `fbGetRunoffVotesSummary`.
  - Viewer subscribes to state and votes; treats Firestore as source of truth for voter lists and “uncheck” propagation.
  - Admin announce uses freshest state; starts runoff on tie; ends runoff after winner.

## Rationale
- Keep winner UI instant by separating image loading from the core UI and fading in when ready.
- Avoid accidental confetti on initial load; only celebrate on actual new winner announcements.
- Improve perceived performance with preconnect and proactive prewarming.
- Provide optional real-time cross-device sync during live sessions.

## Testing
- Announce winner on a fresh viewer: confetti only on announce, not at load.
- Block Open Library domains or set bad cache entry: placeholder appears.
- Announce the same book again: cover loads from cache quickly.
- Tie -> Runoff -> Winner: runoff hidden once winner appears.
- Reduced-motion preference: no confetti.
- Firebase: two devices show live state and voter names; unchecking propagates.

## Docs
- Firebase setup and notes in `docs/firebase.md`.

## Screenshots / Clips
- Winner with cover: [attach]
- Placeholder state: [attach]
- Confetti on announce: [attach]

## Checklist
- [x] Winner UI instant without blocking
- [x] Cover loads async with cache/timeout
- [x] Placeholder present on failure
- [x] Confetti gated to announcements
- [x] Runoff cleared on winner
- [x] Firebase optional sync documented

Fixes: docs/issues/feat-winner-cover-and-confetti.md
