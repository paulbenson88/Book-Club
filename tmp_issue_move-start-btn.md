Remove legacy admin controls alert + reposition Start New Session button

Description:
The info alert "Admin controls: anyone on this page may operate the slot machine." is redundant and takes vertical space.
Also the large "Start new book voting session" button currently sits above the card header; it should appear directly under the "Admin: Book Slot Machine" title/description inside the card.

Acceptance Criteria:
- Alert banner removed from slot area.
- Large Start New Session button moved inside the card under the descriptive paragraph.
- Styling remains prominent (full width inside card or centered) and no duplicate button appears.
- Existing JS listener for #topStartNewSessionBtn still works (button ID retained or code updated).

Out of Scope:
- Additional layout refactors or styling beyond this move.

Testing:
- Load admin.html: button appears under title section; no alert banner below.
- Click button: new session logic still fires (check console log and state reset).
