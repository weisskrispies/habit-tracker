// Firebase Sync Module
// Uses Firebase Auth (Google sign-in) + Firestore for cross-device sync

import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js';
import { getFirestore, doc, setDoc, getDoc, onSnapshot } from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyDUil9w_gNKpL2giKch8_iwJ28yuYGzOVU",
  authDomain: "habit-tracker-e6ab2.firebaseapp.com",
  projectId: "habit-tracker-e6ab2",
  storageBucket: "habit-tracker-e6ab2.firebasestorage.app",
  messagingSenderId: "928110951412",
  appId: "1:928110951412:web:98ea7fe9d5afa60f78d7a1"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

let currentUser = null;
let unsubscribe = null;
let syncPaused = false;

// ========== Auth ==========
export function onAuthChange(callback) {
  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    callback(user);
  });
}

export async function signInWithGoogle() {
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    console.error('Sign-in error:', e);
    if (e.code === 'auth/popup-blocked') {
      alert('Pop-up was blocked. Please allow pop-ups for this site.');
    }
  }
}

export async function doSignOut() {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  await signOut(auth);
}

export function getUser() { return currentUser; }

// ========== Sync ==========
function userDocRef() {
  if (!currentUser) return null;
  return doc(db, 'users', currentUser.uid, 'data', 'state');
}

export async function pushToCloud(state) {
  if (!currentUser || syncPaused) return;
  const ref = userDocRef();
  if (!ref) return;
  try {
    await setDoc(ref, {
      habits: JSON.stringify(state.habits),
      log: JSON.stringify(state.log),
      reminders: JSON.stringify(state.reminders),
      settings: JSON.stringify(state.settings),
      updatedAt: Date.now(),
    });
  } catch (e) {
    console.error('Push to cloud failed:', e);
  }
}

export async function pullFromCloud() {
  if (!currentUser) return null;
  const ref = userDocRef();
  if (!ref) return null;
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return parseCloudData(snap.data());
    }
  } catch (e) {
    console.error('Pull from cloud failed:', e);
  }
  return null;
}

function parseCloudData(data) {
  try {
    return {
      habits: JSON.parse(data.habits),
      log: JSON.parse(data.log),
      reminders: JSON.parse(data.reminders),
      settings: JSON.parse(data.settings),
      updatedAt: data.updatedAt,
    };
  } catch (e) {
    console.error('Parse error:', e);
    return null;
  }
}

export function listenForChanges(callback) {
  if (unsubscribe) unsubscribe();
  if (!currentUser) return;
  const ref = userDocRef();
  if (!ref) return;
  unsubscribe = onSnapshot(ref, (snap) => {
    if (snap.exists() && !syncPaused) {
      const data = parseCloudData(snap.data());
      if (data) callback(data);
    }
  });
}

export function pauseSync() { syncPaused = true; }
export function resumeSync() { syncPaused = false; }
