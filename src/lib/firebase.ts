import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCPRNHrIV8Jvx55GBQ-OHipugwNyR0olZ4",
  authDomain: "cashbookpro-c454b.firebaseapp.com",
  projectId: "cashbookpro-c454b",
  storageBucket: "cashbookpro-c454b.appspot.com",
  messagingSenderId: "1096890685787",
  appId: "1:1096890685787:web:81abfbc89c25f143eee27e"
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

// browserLocalPersistence is the default for web, so we don't need to set it explicitly.
// This avoids a potential race condition on app startup.

export { app, auth, db };
