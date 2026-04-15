// Firebase Sync Module
// Uses Firebase Auth (Google sign-in) + Firestore for cross-device sync

import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js';
import { getFirestore, doc, setDoc, getDoc, getDocFromServer, onSnapshot } from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js';

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
let lastPushTimestamp = 0;

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
  const now = Date.now();
  lastPushTimestamp = now;
  try {
    await setDoc(ref, {
      habits: JSON.stringify(state.habits),
      log: JSON.stringify(state.log),
      reminders: JSON.stringify(state.reminders),
      settings: JSON.stringify(state.settings),
      deletedHabits: JSON.stringify(state._deletedHabits || []),
      updatedAt: now,
    });
    return now;
  } catch (e) {
    console.error('Push to cloud failed:', e);
    return null;
  }
}

export async function pullFromCloud() {
  if (!currentUser) return null;
  const ref = userDocRef();
  if (!ref) return null;
  try {
    // Always fetch from server — never use Firestore's offline cache
    const snap = await getDocFromServer(ref);
    if (snap.exists()) {
      return parseCloudData(snap.data());
    }
  } catch (e) {
    // Offline fallback: try cached data
    console.warn('Server fetch failed, trying cache:', e.message);
    try {
      const snap = await getDoc(ref);
      if (snap.exists()) {
        return parseCloudData(snap.data());
      }
    } catch (e2) {
      console.error('Pull from cloud failed entirely:', e2);
    }
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
      deletedHabits: data.deletedHabits ? JSON.parse(data.deletedHabits) : [],
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
  // includeMetadataChanges so we get notified when fromCache changes
  unsubscribe = onSnapshot(ref, { includeMetadataChanges: true }, (snap) => {
    if (!snap.exists() || syncPaused) return;
    // Ignore local pending writes
    if (snap.metadata.hasPendingWrites) return;
    // Ignore stale data from Firestore offline cache — wait for server
    if (snap.metadata.fromCache) return;
    const data = parseCloudData(snap.data());
    if (!data) return;
    // Skip if this is the echo of our own push
    if (data.updatedAt === lastPushTimestamp) return;
    callback(data);
  });
}

export function pauseSync() { syncPaused = true; }
export function resumeSync() { syncPaused = false; }
