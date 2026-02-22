import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';

const firebaseConfig = {
  apiKey:
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
    "AIzaSyCPRNHrIV8Jvx55GBQ-OHipugwNyR0olZ4",

  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
    "cashbookpro-c454b.firebaseapp.com",

  projectId:
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    "cashbookpro-c454b",

  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    "cashbookpro-c454b.appspot.com",

  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ||
    "1096890685787",

  appId:
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID ||
    "1:1096890685787:web:81abfbc89c25f143eee27e",
};

// Initialize Firebase App
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

// Enable offline persistence only in browser
if (typeof window !== 'undefined') {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn('Multiple tabs open, persistence disabled.');
    } else if (err.code === 'unimplemented') {
      console.warn('Browser does not support persistence.');
    }
  });
}

export { app, auth, db };