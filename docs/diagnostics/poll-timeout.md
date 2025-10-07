# Poll Timeout / Unexpected Reset Diagnostics

This document explains how to capture diagnostics for Issue #50 (poll resets after ~10–15 minutes).

## Instrumentation Added
A lightweight logger (`window.__pollDiag`) now records key localStorage mutation events:
- `ls.remove` (with reason and whether a value existed)
- `stale.clear.begin` (staleness purge start)
- Contextual reasons: `applySnapshot-winner`, `applySnapshot-empty`, `subscribe-winner`, `subscribe-empty`, `stale-clear`

Logs are stored in a rolling array (max 40) in `localStorage.__pollDiagLog` and echoed to the console with the prefix `[poll-diagnostic]`.

## How to Capture
1. Open the browser DevTools (Console tab) on `voting_poll.html`.
2. Let the page sit idle until the suspected reset occurs.
3. Run in console:
   ```js
   JSON.parse(localStorage.getItem('__pollDiagLog')||'[]')
   ```
4. Copy the resulting array into the GitHub issue (redact names if needed).
5. Also capture current relevant keys:
   ```js
   ({
     pollChoices: localStorage.getItem('pollChoices'),
     pollPublishedAt: localStorage.getItem('pollPublishedAt'),
     pollWinner: localStorage.getItem('pollWinner'),
     voterName: localStorage.getItem('voterName')
   })
   ```

## Interpreting Entries
Each entry has:
- `ts`: ISO timestamp
- `evt`: Event name
- Additional fields (e.g., `key`, `reason`, `hadValue`)

Common patterns:
- A normal winner flow: `subscribe-winner` or `applySnapshot-winner` removals followed by winner UI.
- Staleness purge: `stale.clear.begin` followed by `ls.remove` with `reason: 'stale-clear'`.
- Unexpected idle reset suspicion: `applySnapshot-empty` or `subscribe-empty` without an admin action.

## Next Investigations (Post-Log)
- Verify whether Firestore state actually changed (admin republished or cleared) vs. a client-side misinterpretation.
- Correlate timestamps with any network reconnects or tab visibility changes.
- Consider persisting `lastKnownPollId` (future enhancement) if resets correlate with ID churn.

## Cleanup
Instrumentation is intentionally low-impact and can remain until resolution. Removal will be tracked in a follow-up PR once the root cause is confirmed.
