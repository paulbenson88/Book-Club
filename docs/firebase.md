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

## Optional: WhatsApp notifications from admin actions

Two HTTP functions are available for admin-triggered WhatsApp sends:

- `sendSubmissionCall` (used when starting a new voting session)
- `sendPollPublished` (used when publishing the voting poll)
- `sendWinnerAnnounced` (used when winner is announced)

Set these environment variables for Cloud Functions:

- `WHATSAPP_RAPIDAPI_KEY` — your RapidAPI key
- `WHATSAPP_RAPIDAPI_HOST` — default: `whatsapp-messaging-bot.p.rapidapi.com`
- `WHATSAPP_SESSION` — session name created in the provider
- `WHATSAPP_GROUP_CHAT_ID` — group id like `1203...@g.us`
- `WHATSAPP_SEND_TEXT_PATH` — optional explicit send route (for provider-specific routing), e.g. `/v1/sessions/{session}/messages/text` or `/v1/messages/sendText`
- `BOOK_SUBMISSIONS_URL` — optional default submissions sheet URL
- `BOOK_POLL_URL` — optional default voting poll URL

Notes:

- `WHATSAPP_SESSION` can be either full session name (for example `session_paul...`) or the short id suffix if your provider expects that in body-style routes.
- Sender logic automatically tries multiple endpoint/payload shapes, including path-session and body-session formats.

Frontend admin page URL resolution order for each function call:

1) `window.SEND_SUBMISSION_CALL_URL` / `window.SEND_POLL_PUBLISHED_URL`
2) `window.SEND_WINNER_ANNOUNCED_URL`
3) `localStorage.sendSubmissionCallUrl` / `localStorage.sendPollPublishedUrl` / `localStorage.sendWinnerAnnouncedUrl`
3) Auto-built from `window.FIREBASE_CONFIG.projectId`

Example local override in browser console:

```javascript
localStorage.setItem('sendSubmissionCallUrl', 'https://us-central1-YOUR_PROJECT.cloudfunctions.net/sendSubmissionCall');
localStorage.setItem('sendPollPublishedUrl', 'https://us-central1-YOUR_PROJECT.cloudfunctions.net/sendPollPublished');
localStorage.setItem('sendWinnerAnnouncedUrl', 'https://us-central1-YOUR_PROJECT.cloudfunctions.net/sendWinnerAnnounced');
```

Quick verification:

```powershell
Invoke-RestMethod -Method Post -Uri "https://us-central1-YOUR_PROJECT.cloudfunctions.net/sendSubmissionCall" -ContentType "application/json" -Body '{"text":"TEST submissions"}'
Invoke-RestMethod -Method Post -Uri "https://us-central1-YOUR_PROJECT.cloudfunctions.net/sendPollPublished" -ContentType "application/json" -Body '{"text":"TEST poll"}'
Invoke-RestMethod -Method Post -Uri "https://us-central1-YOUR_PROJECT.cloudfunctions.net/sendWinnerAnnounced" -ContentType "application/json" -Body '{"winnerTitle":"TEST Winner"}'
```