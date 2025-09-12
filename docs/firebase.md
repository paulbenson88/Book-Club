# Firebase setup (dev/test)

This project can optionally sync poll state and votes across devices via Firebase Firestore. If not configured, the viewer/admin pages fall back to local storage and events.

## 1) Create a Firebase project and web app
- In the Firebase console, create a project and add a Web app.
- Copy the config (apiKey, authDomain, projectId, etc.).

Create `js/firebase-config.js` with:

```javascript
// Define FIREBASE_CONFIG globally for compat SDKs
window.FIREBASE_CONFIG = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  // Optional but recommended
  appId: "...",
  storageBucket: "...",
  messagingSenderId: "..."
};
```

Keep this file local or use environment-specific copies; don’t commit secrets if your repo is public.

## 2) Firestore rules (dev-open)
For quick testing during a meeting, permissive rules are OK. Replace with locked-down rules later.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /polls/current { allow read, write: if true; }
    match /polls/current/{doc=**} { allow read, write: if true; }
  }
}
```

Optionally enable anonymous auth in the console; the compat bridge will attempt anon sign-in if available.

## 3) What syncs
- Document: `polls/current`
  - Fields: `pollChoices`, `pollPublishedAt`, `winner`, `runoff`.
  - Subcollections: `votes` (regular poll, per voter), `runoffVotes` (single-choice runoff).
- Viewer subscribes to:
  - State doc (`fbSubscribe`) to render Waiting/Poll/Runoff/Winner.
  - Votes (`fbSubscribeVotes`) and runoff votes (`fbSubscribeRunoffVotes`) for live “Voted by”.
- Admin uses:
  - `fbPublishPoll`, `fbClearPoll`, `fbAnnounceWinner`.
  - `fbStartRunoff`, `fbEndRunoff` and summary getters to compute winner and handle ties.

## 4) Local development tips
- Use two browsers or private windows to see live sync.
- If a viewer sets “ignore server polls,” it won’t apply remote state until cleared.
- For production, replace rules with auth-based constraints and disable anonymous auth.

---

# Firebase setup (optional, enables cross-device sync)

1) Create a Firebase project and a Web app in the Firebase console.
2) In Project settings → Your apps → SDK setup and configuration, copy the config object.
3) Provide the config to the site by defining window.FIREBASE_CONFIG before loading pages that use Firebase:

   Example (do not commit secrets; create a local file and serve it only in your environment):

   <script>
     window.FIREBASE_CONFIG = {
       apiKey: "<apiKey>",
       authDomain: "<projectId>.firebaseapp.com",
       projectId: "<projectId>",
       // optional overrides
       POLL_COLLECTION: "polls",
       POLL_DOC: "current"
     };
   </script>

4) Ensure the Firebase compat SDK is loaded (already included on admin and viewer pages).
5) That’s it — admin actions (publish/clear/winner) will write to Firestore; viewers will live-update via a snapshot listener.

Security note: Set Firestore rules to allow writes only for an authenticated admin, or restrict by IP during testing.