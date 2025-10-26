# Feature: Prevent duplicate submissions in Google Sheets (de‑dup pipeline)

## Problem
Duplicate book suggestions are occasionally added to the Google Sheets responses. This can surface as repeated choices in the admin Slot Machine and the viewer poll, causing confusion and vote splitting.

## Goal
- Prevent new duplicates from being added going forward.
- Hide or collapse existing duplicates from the UI immediately.
- Provide a documented cleanup path for the existing sheet.

## Scope / Context
- Source of truth: Google Form responses → Google Sheets tab.
- The site currently fetches a published CSV (or Sheets URL) and renders options in `pages/admin.html`.
- Duplicates should be detected by a normalized key (Title + Author), ignoring case, punctuation, and extra spaces. Optionally include “Suggested by” only for display, not for de‑duping.

## Acceptance Criteria
- The admin dropdown and the slot machine never show duplicates of the same Title + Author.
- New duplicate Form submissions do not create visible duplicates in the UI. (Best: prevent/clean at source; Minimum: hide via client or a "Clean" view sheet.)
- A repeatable cleanup operation (button or documented steps) can remove or collapse existing duplicates in the Sheet.
- Behavior documented in `docs/` with any scripts or formulas used.

## Proposed Approach (phased)

### Phase 1: Client‑side guard (fast, low risk)
- In `pages/admin.html` after parsing CSV, add a normalization step:
  - Build a normalized key: `normalize(title) + '|' + normalize(author)` where normalize = lowercase, trim, collapse inner whitespace, remove punctuation like `.,:;!?'"`.
  - Keep the first item per key; ignore subsequent duplicates when populating the admin edit dropdowns and slot reels.
- Outcome: duplicates won’t appear in the app, even if the sheet still contains them. No backend changes required.

### Phase 2: Sheet “Clean” tab (no code execution required)
- Create a derived “Clean” sheet that references the Form Responses tab.
- Use columns with formulas:
  - Normalized Title: `=LOWER(REGEXREPLACE(TRIM(A2), "[^a-z0-9 ]", ""))` (adjust source column)
  - Normalized Author: similarly normalize the author column.
  - Key: `=NormalizedTitle & "|" & NormalizedAuthor`
  - Unique rows: set a final table using `UNIQUE()` over the Key, then `INDEX/MATCH` or `FILTER` to reconstruct the first row per key.
- Publish this Clean tab as the CSV consumed by the site (update `window.sheetCsvUrl` or admin input).
- Outcome: visible source is already de‑duplicated; less work in client.

### Phase 3: Apps Script enforcement (prevents future duplicates)
- Add a Google Apps Script bound to the Sheet with an `onFormSubmit` trigger:
  - Compute normalized key from submitted Title/Author.
  - Search the target sheet for an existing key; if found, either:
    - Block insertion (write the row to a quarantine sheet and optionally notify), or
    - Allow insertion then immediately remove the duplicate row, logging an audit entry.
- Optional: send a friendly email or response receipt indicating the entry already exists.
- Outcome: the raw sheet stays clean over time.

## Non‑Goals
- Enforcing unique “Suggested by” names. Dedup is solely by Title + Author.
- De‑duping across different editions if titles differ substantially (can be addressed later with fuzzy matching if needed).

## Risks / Considerations
- Fuzzy normalization (e.g., handling subtitles) may over‑collapse distinct books; start conservative.
- Google Forms can’t truly reject based on existing rows without Apps Script; hence the phased approach.
- Admin workflows: ensure the published URL points to the Clean tab once Phase 2 is done.

## Implementation Notes
- Client (Phase 1): modify `parseCsv` pipeline in `pages/admin.html` to normalize and filter unique by key before populating `sheetOptions`.
- Sheet (Phase 2): provide a `docs/sheets-clean-tab.md` with exact formulas and screenshots.
- Apps Script (Phase 3): add `docs/apps-script-dedupe.md` with the trigger code and setup steps.

## Definition of Done
- [ ] Admin UI no longer shows duplicate books.
- [ ] A Clean tab exists and can be published as the source for the site.
- [ ] Optional: Apps Script trigger in place to enforce uniqueness for new entries.
- [ ] Documentation added for maintenance and future edits.
