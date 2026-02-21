import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCPRNHrIV8Jvx55GBQ-OHipugwNyR0olZ4",
  authDomain: "cashbookpro-c454b.firebaseapp.com",
  projectId: "cashbookpro-c454b",
  storageBucket: "cashbookpro-c454b.appspot.com",
  messagingSenderId: "1096890685787",
  appId: "1:1096890685787:web:81abfbc89c25f143eee27e"
};

// Initialize Firebase App
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

// Initialize Firestore
const db = getFirestore(app);

// Enable offline persistence only on the client-side.
// This check prevents the code from running on the server.
if (typeof window !== 'undefined') {
  enableIndexedDbPersistence(db)
    .catch((err) => {
      if (err.code == 'failed-precondition') {
        console.warn('Firestore persistence failed: multiple tabs open. Some features may not work offline.');
      } else if (err.code == 'unimplemented') {
        console.warn('Firestore persistence failed: browser does not support it.');
      }
    });
}

export { app, auth, db };
