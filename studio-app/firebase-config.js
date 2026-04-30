/* firebase-config.js — public Firebase web config for CW Leaders.
   These values identify the Firebase project; they are NOT secrets and are
   safe to ship in client bundles. Real authentication happens server-side
   when the auth-firebase Lambda verifies the resulting ID token's signature
   against Google's public JWKS. */

window.LEAD_FIREBASE_CONFIG = {
  apiKey:            "AIzaSyDLOJtNuxnZyPUU-lDm8J0fqrUuF2909c4",
  authDomain:        "cwleaders.firebaseapp.com",
  projectId:         "cwleaders",
  storageBucket:     "cwleaders.firebasestorage.app",
  messagingSenderId: "800606905998",
  appId:             "1:800606905998:web:48c4b34799ade0c99b4bdf",
  measurementId:     "G-N971K3LG06"
};
