Firebase setup (optional, enables cross-device sync)

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