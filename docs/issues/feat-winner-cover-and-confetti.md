# Feature: Winner cover + celebration + robustness

## Summary
Add a non-blocking winner book cover on the viewer, restore-and-gate celebration confetti, improve tie/runoff and winner UI reliability, and polish admin safety. Includes placeholder behavior, faster image loading, and Firebase-driven gating to avoid false triggers.

## Problem / Motivation
- Winner announcement felt flat and sometimes overlapped with lingering voting UI.
- Users wanted a book cover on the winner card without slowing the page.
- Confetti was firing on page load/refresh, not only when a winner was just announced.
- Some viewers saw stale polls or inconsistent cross-device updates.

## Scope
Viewer (`pages/voting_poll.html`) and Firebase sync bridge:
- Winner card cover image (async, cached, safe timeout, fade-in).
- Placeholder with readable, cover-like typography if a cover can’t load.
- Confetti restored and gated so it only fires on new winner announcements.
- Preconnect/dns-prefetch to Open Library; prewarm covers for current poll books.
- Improved cover selection (prefer cover_i; fallback to ISBN) and caching.
- Runoff/winner precedence maintained; fully clear voting UI on winner.

Admin and bridge (context):
- No direct edits here in this change-set, but existing logic remains: announce winner, start/end runoff, clear poll safeguards.

## Detailed Changes
- Winner UI
  - Added cover slot (`#winner-cover`) with reserved size to avoid layout shift.
  - Added async `loadWinnerCover()` with AbortController (2.5–3s timeout), localStorage caching (14 days), and fade-in on load.
  - Added `showWinnerCoverPlaceholder()` with big, two-line text ("This Broke" / "Blame Alice") if cover fails.
  - Added preconnect + dns-prefetch to Open Library hosts and `fetchpriority="high"` for the winner image.
  - Added prewarm for the three poll choices right after poll render.
- Confetti
  - Restored `startConfetti()` animation and added gating flags to ensure it only fires on live winner announcements (from Firebase, storage events, or BroadcastChannel), not on first snapshot/refresh.
- Robustness
  - Guarded winner-first render path: winner overrides runoff/poll and unsubscribes live listeners.
  - Respect reduced-motion.

## Acceptance Criteria
- Winner card always renders instantly (text/links) and never blocks.
- If a cover exists, it appears within ~0–300ms after announce, often instantly after first show due to prewarm/cache.
- If no cover is found or loading fails, a clear placeholder shows.
- Confetti does not run on initial load/refresh; it runs only when a new winner gets announced.
- Runoff UI disappears as soon as the winner appears.

## Test Plan
- Announce winner on a fresh viewer session: verify no confetti until the announce event; then confetti plays.
- Disable network or block `openlibrary.org` and `covers.openlibrary.org`: verify placeholder appears instead of a spinner or layout shift.
- Re-announce the same book: confirm cached cover appears faster.
- Tie -> runoff -> winner flow: verify runoff clears and winner overrides promptly.
- Reduced-motion: set OS reduced-motion and confirm confetti doesn’t run.

## Risks / Mitigations
- External API may be slow/unavailable: we timeout quickly and fallback gracefully.
- False cover matches: we prefer cover_i, fallback to ISBN; further tuning possible with author parsing if needed.

## Related
- Viewer polish and reliability improvements across prior issues (name gating, stale poll prevention, clear poll safety).

