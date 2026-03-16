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

// Check if Firebase is configured
const hasFirebaseConfig = firebaseApiKey && firebaseAuthDomain && firebaseProjectId && 
                         firebaseStorageBucket && firebaseMessagingSenderId && firebaseAppId;

if (!hasFirebaseConfig) {
  console.warn('Firebase not configured. Firebase features will be disabled.');
}

const firebaseConfig = {
  apiKey: firebaseApiKey || 'demo-api-key',
  authDomain: firebaseAuthDomain || 'demo.firebaseapp.com',
  projectId: firebaseProjectId || 'demo-project',
  storageBucket: firebaseStorageBucket || 'demo-bucket.appspot.com',
  messagingSenderId: firebaseMessagingSenderId || 'demo-sender-id',
  appId: firebaseAppId || 'demo-app-id',
};

// Only initialize Firebase if we have real config
let app: any = null;
let firestoreDb: any = null;
let firebaseStorage: any = null;
let firebaseAuth: any = null;

if (hasFirebaseConfig) {
  try {
    app = initializeApp(firebaseConfig);
    firestoreDb = getFirestore(app);
    firebaseStorage = getStorage(app);
    firebaseAuth = getAuth(app);
  } catch (error) {
    console.error('Failed to initialize Firebase:', error);
  }
}

// Create mock implementations for when Firebase is not available
const createMockFirestore = () => ({
  collection: () => ({
    doc: () => ({
      get: () => Promise.resolve({ exists: false }),
      set: () => Promise.resolve(),
      update: () => Promise.resolve(),
      delete: () => Promise.resolve(),
    }),
    add: () => Promise.resolve({ id: 'mock-doc-id' }),
    where: () => ({
      get: () => Promise.resolve({ docs: [] }),
      orderBy: () => ({ get: () => Promise.resolve({ docs: [] }) }),
    }),
  }),
});

const createMockAuth = () => ({
  currentUser: null,
  signInWithEmailAndPassword: () => Promise.reject(new Error('Firebase not configured')),
  createUserWithEmailAndPassword: () => Promise.reject(new Error('Firebase not configured')),
  signOut: () => Promise.resolve(),
  onAuthStateChanged: (callback: any) => {
    callback(null);
    return () => {};
  },
});

const createMockStorage = () => ({
  ref: () => ({
    put: () => Promise.resolve({ ref: { getDownloadURL: () => Promise.resolve('') } }),
    getDownloadURL: () => Promise.resolve(''),
    delete: () => Promise.resolve(),
  }),
});

export const db = firestoreDb || createMockFirestore();
export const storage = firebaseStorage || createMockStorage();
export const auth = firebaseAuth || createMockAuth();
