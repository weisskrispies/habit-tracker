// Bridge between firebase-sync (ES module) and app.js (global)
import { onAuthChange, signInWithGoogle, doSignOut, getUser, pushToCloud, pullFromCloud, listenForChanges, pauseSync, resumeSync } from './firebase-sync.js';

// Wait for DOM
document.addEventListener('DOMContentLoaded', () => {
  const syncBtn = document.getElementById('syncBtn');
  const syncLabel = document.getElementById('syncLabel');
  const syncStatus = document.getElementById('syncStatus');
  const syncSignedIn = document.getElementById('syncSignedIn');
  const syncUserName = document.getElementById('syncUserName');
  const googleSignInBtn = document.getElementById('googleSignInBtn');
  const signOutBtn = document.getElementById('signOutBtn');

  // Show sync button
  syncBtn.classList.remove('hidden');

  // Debounce push to cloud
  let pushTimer = null;
  function debouncedPush() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      const state = JSON.parse(localStorage.getItem('habitTracker') || '{}');
      if (state.habits) pushToCloud(state);
    }, 1000);
  }

  // Hook into app.js saveState by watching localStorage changes
  const origSetItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function(key, value) {
    origSetItem(key, value);
    if (key === 'habitTracker' && getUser()) {
      debouncedPush();
    }
  };

  // Auth state change
  onAuthChange(async (user) => {
    if (user) {
      syncLabel.textContent = user.displayName?.split(' ')[0] || 'Synced';
      syncBtn.classList.add('signed-in');
      syncStatus.classList.add('hidden');
      syncSignedIn.classList.remove('hidden');
      syncUserName.textContent = user.displayName || user.email;

      // Pull cloud data and merge
      const cloudData = await pullFromCloud();
      if (cloudData) {
        const localRaw = localStorage.getItem('habitTracker');
        const local = localRaw ? JSON.parse(localRaw) : null;

        // If cloud has data and local is default or cloud is newer, use cloud
        if (cloudData.habits && cloudData.habits.length > 0) {
          const localUpdated = local?._updatedAt || 0;
          if (!local || !local.log || Object.keys(local.log).length === 0 || cloudData.updatedAt > localUpdated) {
            // Use cloud data
            const merged = {
              habits: cloudData.habits,
              log: cloudData.log,
              reminders: cloudData.reminders,
              settings: cloudData.settings,
              _updatedAt: cloudData.updatedAt,
            };
            pauseSync();
            origSetItem('habitTracker', JSON.stringify(merged));
            resumeSync();
            // Trigger re-render in app.js
            if (typeof window.reloadState === 'function') window.reloadState();
          }
        }
      } else {
        // No cloud data yet — push local state
        debouncedPush();
      }

      // Listen for real-time changes from other devices
      listenForChanges((data) => {
        const current = JSON.parse(localStorage.getItem('habitTracker') || '{}');
        if (data.updatedAt > (current._updatedAt || 0)) {
          pauseSync();
          origSetItem('habitTracker', JSON.stringify({
            habits: data.habits,
            log: data.log,
            reminders: data.reminders,
            settings: data.settings,
            _updatedAt: data.updatedAt,
          }));
          resumeSync();
          if (typeof window.reloadState === 'function') window.reloadState();
        }
      });
    } else {
      syncLabel.textContent = 'Sign in';
      syncBtn.classList.remove('signed-in');
      syncStatus.classList.remove('hidden');
      syncSignedIn.classList.add('hidden');
    }
  });

  // Button handlers
  syncBtn.addEventListener('click', () => {
    if (getUser()) {
      // Open settings to sync section
      document.getElementById('settingsBtn').click();
    } else {
      signInWithGoogle();
    }
  });

  googleSignInBtn.addEventListener('click', () => signInWithGoogle());

  signOutBtn.addEventListener('click', async () => {
    await doSignOut();
  });
});
