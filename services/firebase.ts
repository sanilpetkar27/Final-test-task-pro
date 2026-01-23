import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCpLC5lDG8gQinBSIS1mCdGc5zkLQHC_sY",
  authDomain: "dealership-ops-pro.firebaseapp.com",
  projectId: "dealership-ops-pro",
  storageBucket: "dealership-ops-pro.firebasestorage.app",
  messagingSenderId: "177028391946",
  appId: "1:177028391946:web:b5ae83622d2ba86fc7ebf3"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);
