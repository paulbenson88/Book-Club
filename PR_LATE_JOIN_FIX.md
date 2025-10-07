# fix: reliable late-join poll reveal + pre-name gating UX

## Overview
Improves the voting poll experience for users who open the page after a poll has already started ("late joiners") and cleans up the pre-name submission UX.

## Key Changes
1. **Late-Join Reliability**
   - Queues first Firestore snapshot until internal state/gating is ready.
   - Multi-interval retries to reveal poll/winner (50ms → 180ms → 420ms → 1000ms → 2200ms) for slow/empty initial loads.
   - Conditional clearing of cached poll data only if stale (>6h) or winner present.
   - Remote vote snapshot treated as source of truth; local votes overwritten safely.
2. **UX: Name Gating & Waiting State**
   - Pre-publish + no name: only name input (no Merc waiting UI).
   - Pre-publish + name: Merc waiting UI appears.
   - Published + name: poll choices animate in.
   - Published + no name: still gated until name entered.
3. **Failsafe Script Adjusted**
   - Bottom-page failsafe no longer injects Merc before name submission.
   - Adds `data-src="failsafe"` for debug attribution.
4. **Visual / Motion**
   - Fade-in animation on first reveal for late joiners.
5. **Logging & Diagnostics**
   - Added verbose logs for snapshot queueing, retries, and state application.

## Implementation Notes
- Snapshot queue variables: `__viewerBlockApply`, `__queuedSnapshot` ensure first snapshot isn't prematurely applied.
- `showWaitingMessage()` and the late failsafe both respect name gating and publish state.
- Defensive try/catch blocks around localStorage and DOM operations to avoid hard failures on partial loads.

## Testing Steps
1. Clear localStorage keys (`voterName`, `pollPublishedAt`, `pollChoices`, `pollWinner`) and load before publish: only name input visible.
2. Submit name (still pre-publish): Merc waiting UI appears.
3. Publish poll (admin): poll choices fade in automatically.
4. Open new tab (no name) post-publish: still name-gated, no Merc until name entry.
5. End poll / announce winner: late joiner sees winner immediately.
6. Verify pre-name: `!!document.querySelector('.wait-dog')` is false.

## Edge Cases
- Slow first snapshot arrival → retries cover.
- Stale cached poll replaced only when necessary.
- Winner state dominance respected.
- Name removal mid-session re-gates UI.

## Follow-Ups (Not Included)
- "Multiple choices allowed" caption.
- BroadcastChannel fallback for offline Firebase scenario.
- Modularization of poll logic into separate JS file.

## Screenshots / Media
(N/A – purely behavioral + minor animation)

## Closing
Closes #<issue-number-if-any>

---
Please replace `<issue-number-if-any>` with the actual issue if one exists before merging.
