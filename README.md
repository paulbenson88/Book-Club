# Book Club — Static site with admin-driven poll

Small static site for running a simple book-club slot-machine + voting poll flow.
The admin (lead) uses a slot machine UI to choose three candidate books, then publishes a voting poll. Viewers open the poll page to vote.

This repo is intentionally simple: plain HTML/CSS/JS (no build step). Firebase Firestore is optional and used to propagate a published poll across devices.

## Quick start (local testing)
1. Serve the repository from the project root (do not open files with `file://`). From PowerShell:

```powershell
python -m http.server 8000
# open in browser:
# http://localhost:8000/admin.html  (admin)
# http://localhost:8000/voting_poll.html  (viewer)
```

2. In the admin page: operate the slot machine or paste manual winners, then click "Start Poll" → Preview → Publish.
3. In a different browser or an incognito window, open the poll page and confirm the poll renders.

## Files of interest
- `admin.html` — admin/lead UI: slot machine, manual winners, Start Poll publish flow.
- `voting_poll.html` — voting poll viewer for members (listens for published poll choices).
- `voting.html` — member-facing voting page (legacy view).
- `js/voting.js` — slot-machine logic and admin helpers.
- `js/voting_poll.js` (if present) and inline scripts in `voting_poll.html` — viewer rendering logic and Firestore snapshot logic.
- `css/styles.css` — main styles + Start Poll animation.
- `images/` and `favicon/` — assets.

## How the sync works
- Primary (local) persistence: `localStorage` keys are used to share state in the same browser/profile.
- Cross-device sync (optional): Firestore document `poll/current` is used as the canonical source. Admin writes to it; viewers subscribe with `onSnapshot` and update localStorage.
- Events used in code:
  - Custom events: `winnersSaved`, `winnersCleared`
  - localStorage keys: `winners`, `pollChoices`, `votes`, `slotMachineState`, `slotMachineReset`, `finalized` (see Developer notes).

## Firebase (optional)
If you want the poll to reach other devices/browsers, enable Firestore and optionally Firebase Auth.

1. Create a Firebase project at https://console.firebase.google.com/ and add a Web app to the project.
2. Copy the Web app's firebaseConfig object and paste it into both `admin.html` and `voting_poll.html` where noted.
3. Enable Firestore (Firestore Database) in the Console.
4. (Optional) Enable Authentication → Sign-in method → Google if you want the admin to sign in.

### Quick rule snippets
- Unsafe, development-only (allow public writes to `/poll/current`):

```rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /poll/current {
      allow read: if true;
      allow write: if true; // WARNING: public writes allowed
    }
    match /{document=**} { allow read, write: if false; }
  }
}
```

- Safer: allow only a particular admin UID to write (replace `YOUR_ADMIN_UID`):

```rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /poll/current {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == 'YOUR_ADMIN_UID';
    }
    match /{document=**} { allow read, write: if false; }
  }
}
```

- Time-limited public write (good for a one-off event):

```rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /poll/current {
      allow read: if true;
      allow write: if request.time < timestamp.date(2025, 8, 24);
    }
    match /{document=**} { allow read, write: if false; }
  }
}
```

> After testing, revert any permissive rules.

## How to test publish without Google Sign-in
- The code contains a developer convenience flag: `window._allowUnauthenticatedPublish` (set in `admin.html`). When true the admin will attempt an unauthenticated write (best-effort) so you can skip Google sign-in for quick testing.
- If Firestore rules block unauthenticated writes you will see a clear console error. Either (a) enable public writes temporarily, or (b) enable Google sign-in and sign in using the button in `admin.html`.

## Console logs to watch (use DevTools)
- Admin-side logs:
  - `[admin] Firebase initialized (placeholder)` — Firebase SDK initialized in admin.
  - `[admin] auth state changed true` — authentication state changed (signed in).
  - `[admin] Published poll to Firestore (authenticated|unauthenticated)` — publish succeeded.
  - `Firestore publish failed` or `publishToFirestore error` — publish failed; check message for permissions.

- Viewer-side logs:
  - `[voting_poll] Firestore initialized (placeholder)` — Firestore init on viewer.
  - `[voting_poll] subscribing to poll/current snapshot` — snapshot subscription active.
  - `[voting_poll] snapshot received true` — new poll data arrived.
  - `[voting_poll] performing one-time get() fallback for poll/current` — viewer did a single fetch to get poll data.

## Troubleshooting
- Popup blocked / no sign-in: use the explicit "Sign in (Google)" button (single click). Avoid automatic popup triggers.
- `auth/configuration-not-found` — enable Google provider in Firebase Console (Authentication → Sign-in method) and ensure `authDomain` matches the firebaseConfig.
- `Missing or insufficient permissions` — Firestore rules are blocking writes. See Rules section above.
- Scripts failing to load (gstatic): check extensions or network restrictions.

## Developer notes (quick reference)
- Important files & entry points:
  - `admin.html` — slot machine + publish UI.
  - `voting_poll.html` — viewer; contains snapshot listener and a one-time get() fallback.
  - `js/voting.js` — slot machine runtime and utilities.
  - `css/styles.css` — theme and small animations.

- LocalStorage keys used by the app:
  - `winners` — manual winners saved by admin.
  - `pollChoices` — final published poll (array of `{book,name}` objects).
  - `votes` — map of book -> array of voter names.
  - `slotMachineState` — indexes chosen by the slot machine.
  - `slotMachineReset` — flag consumed when Reset occurs.
  - `finalized` / `_finalize_backup` — finalization helpers.

- Useful client-side functions you may call from the console:
  - `window.publishToFirestore(pollChoices)` — write the current poll to Firestore (may require auth depending on rules).
  - `loadWinnersAndChoices()` — viewer helper that builds poll choices from localStorage or CSV and renders the poll.

## Next steps / recommended improvements
- Add a small admin authentication flow (already partially present) and lock writes via Firestore rules to admin UID.
- Use the Firebase Emulator Suite for local end-to-end testing without touching production data.
- Consider moving Firestore config out of HTML into a small JS config file for safer editing.

---

If you want, I can also:
- Add the Console rule snippets into this README as a copy/paste block (already included above), or
- Create a `firestore.rules` file in the repo and show the `firebase deploy --only firestore:rules` command to push it.