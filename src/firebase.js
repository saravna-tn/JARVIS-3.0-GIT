import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAcPy9OyfvA-CrC941dwELXMZ8510QwO6E",
  authDomain: "jarvis-3-0-ai.firebaseapp.com",
  projectId: "jarvis-3-0-ai",
  storageBucket: "jarvis-3-0-ai.firebasestorage.app",
  messagingSenderId: "945420725696",
  appId: "1:945420725696:web:dc8ed7f16f676b09d42c25",
  measurementId: "G-DMVFKMJMBS"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);