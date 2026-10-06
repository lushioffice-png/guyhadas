import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";

// Same Firebase project as the public guyhadas.xyz site (guyhadas-e38c4) -
// this app is a second Hosting site on the *same* project, not a new one.
// These values are not secrets (Firebase web config is public by design;
// access is enforced by Firebase Auth + firestore.rules, not by hiding this).
const firebaseConfig = {
  apiKey: "AIzaSyAtlRFde2oI4KkiAwK8DIOT5Yyq68rqm1A",
  authDomain: "guyhadas-e38c4.firebaseapp.com",
  projectId: "guyhadas-e38c4",
  storageBucket: "guyhadas-e38c4.firebasestorage.app",
  messagingSenderId: "83424733373",
  appId: "1:83424733373:web:c7bdc188962b7df3edafd4",
  measurementId: "G-5WBBDT3CR2"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// ignoreUndefinedProperties: the Add Business/Task/Opportunity forms send
// every unfilled optional field as `undefined` (e.g. `description.trim() ||
// undefined`), which the Firestore SDK rejects by default with "Unsupported
// field value: undefined" - surfaced to the user as a generic save error.
// Telling Firestore to skip undefined fields instead of throwing matches
// the forms' actual intent (omit the field), without rewriting every modal.
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true });

// Admin allowlist for the Visibility OS. Generalized from the single
// hardcoded admin email in the public site's admin.js so more GuyHadas
// users can be added later without restructuring auth. The authoritative
// check lives in firestore.rules (ADMIN_EMAILS there) - this client-side
// copy only decides what the UI shows; it grants no access by itself.
export const ADMIN_EMAILS = ["mr.hadas@gmail.com"];

export function isAuthorizedEmail(email: string | null | undefined): boolean {
  return !!email && ADMIN_EMAILS.includes(email);
}
