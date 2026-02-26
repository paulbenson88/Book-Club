# PR: Book Descriptions with Goodreads Links (Issue #52)

Summary
- Add a concise 1–2 sentence description beneath each book in the poll and runoff, with optional “See more/See less” to expand full text.
- Add an accessible Goodreads link per option (opens in new tab; aria-label includes title) that deep-links to the exact book page when possible.
- Keep layout stable on mobile/desktop; preview blurb constrained to ~2 sentences (~160–200 chars) before expansion.

Details
- pages/voting_poll.html
  - UI: Inserted `.book-meta` block per option with `.book-desc` and `.book-links`.
  - Links: `Goodreads` button rendered immediately with a search URL, then upgraded asynchronously to a deep link via resolver chain.
  - Descriptions: Loaded asynchronously from Open Library (best-effort) with a 2.5s timeout and localStorage caching (30d). Normalizes pasted blurbs (HTML <br> -> newlines). “See more/See less” toggle for full text.
  - Reliability: Adds retry logic and a post-render sweep to fill in descriptions that arrive late (e.g., cold starts), removing the need for manual refresh.
  - Accessibility: aria-live="polite" on description container; link label includes the book title.
  - Runoff: Same description/link block added for remaining books only.
  - Styling: Added minimal CSS for `.book-meta`, `.book-desc`, `.book-links`, ensuring stable height and small text.

- Goodreads deep-link resolution
  - Order of precedence:
    1) JSON overrides (`goodreads-overrides.json`) mapping normalized "title - author" to exact URLs.
    2) Server resolver (Firebase Cloud Function: `resolveGoodreads`) using Open Library IDs/editions/ISBN/work links, with a scrape fallback.
    3) Client-side Open Library resolution (same heuristics as a backup).
    4) Fallback to Goodreads search URL (not cached) if all else fails.
  - Only deep links are cached in localStorage; search links are not cached to allow future improvements.

Acceptance mapping
- Preview ~1–2 sentences: enforced via a sentence-aware `trimToTwoSentences()` with hard cap and ellipsis; full text available via toggle.
- Accessible links: aria-label includes book title; `rel="noopener noreferrer"`.
- Mobile layout stable: line length constrained; reserved min-height for desc to reduce shifting.
- Hidden until published: metadata renders only with poll/runoff, not during waiting state.
- Runoff filtered: block added to runoff items only.

Notes
- Data source: Uses Open Library for lightweight public descriptions when not specified in upstream data. If we later add descriptions to Firestore/static mapping, the same mount point can consume that instead of fetching.
- Performance: Requests are cached per title in localStorage to avoid repeat fetches across sessions. Deep-link URLs are cached; search URLs are not.
- Server resolver: Frontend defaults to the Firebase function URL using `FIREBASE_CONFIG.projectId` if present; can be overridden via `window.GOODREADS_RESOLVER_URL`.

Additional updates in this branch
- pages/admin.html + functions/index.js
  - Adds a winner confirmation modal and a `finalizeWinner` function to remove the winner from the submissions sheet and append to the “Read” sheet.
- js/books-read.js + pages/books-read.html
  - Fixes Books Read feed to the proper “Read” tab and improves CSV parsing via header detection/heuristics.
- pages/voting.html + js/voting.js + js/firebase-sync.js
  - Ensures winner payload includes `suggestedBy`, which now displays in winner UI.

Closes #52
