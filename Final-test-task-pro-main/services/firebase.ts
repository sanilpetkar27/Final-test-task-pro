import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";

const firebaseApiKey = String(import.meta.env.VITE_FIREBASE_API_KEY || '').trim();
const firebaseAuthDomain = String(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '').trim();
const firebaseProjectId = String(import.meta.env.VITE_FIREBASE_PROJECT_ID || '').trim();
const firebaseStorageBucket = String(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '').trim();
const firebaseMessagingSenderId = String(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim();
const firebaseAppId = String(import.meta.env.VITE_FIREBASE_APP_ID || '').trim();

if (!firebaseApiKey) {
  throw new Error('Missing required environment variable: VITE_FIREBASE_API_KEY');
}
if (!firebaseAuthDomain) {
  throw new Error('Missing required environment variable: VITE_FIREBASE_AUTH_DOMAIN');
}
if (!firebaseProjectId) {
  throw new Error('Missing required environment variable: VITE_FIREBASE_PROJECT_ID');
}
if (!firebaseStorageBucket) {
  throw new Error('Missing required environment variable: VITE_FIREBASE_STORAGE_BUCKET');
}
if (!firebaseMessagingSenderId) {
  throw new Error('Missing required environment variable: VITE_FIREBASE_MESSAGING_SENDER_ID');
}
if (!firebaseAppId) {
  throw new Error('Missing required environment variable: VITE_FIREBASE_APP_ID');
}

const firebaseConfig = {
  apiKey: firebaseApiKey,
  authDomain: firebaseAuthDomain,
  projectId: firebaseProjectId,
  storageBucket: firebaseStorageBucket,
  messagingSenderId: firebaseMessagingSenderId,
  appId: firebaseAppId,
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);
