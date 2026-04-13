// Bridge between firebase-sync (ES module) and app.js (global)
import { onAuthChange, signInWithGoogle, doSignOut, getUser, pushToCloud, pullFromCloud, listenForChanges, pauseSync, resumeSync } from './firebase-sync.js';

// ========== Deep Merge Logic ==========
// Merges habits by id — local wins for existing habits, cloud adds new ones
function mergeHabits(local, cloud) {
  const map = new Map();
  // Cloud provides the base (catches habits added on other devices)
  for (const h of (cloud || [])) map.set(h.id, h);
  // Local always wins for existing habits — preserves goal changes, edits, etc.
  for (const h of (local || [])) map.set(h.id, h);
  // Preserve local ordering, append any cloud-only habits at the end
  const localIds = new Set((local || []).map(h => h.id));
  const result = [...(local || [])];
  for (const h of (cloud || [])) {
    if (!localIds.has(h.id)) result.push(h);
  }
  return result;
}

// Merges log entries per-date, per-habit — keeps all entries from both sides
function mergeLog(local, cloud) {
  const merged = { ...(local || {}) };
  for (const [date, entries] of Object.entries(cloud || {})) {
    if (!merged[date]) {
      merged[date] = entries;
    } else {
      const day = { ...merged[date] };
      for (const [hid, entry] of Object.entries(entries)) {
        if (!day[hid]) {
          day[hid] = entry;
        } else if (typeof entry?.value === 'number' && typeof day[hid]?.value === 'number') {
          // For counters, keep the higher value — never lose a logged drink
          day[hid] = { ...day[hid], value: Math.max(day[hid].value, entry.value) };
        } else {
          // For booleans/strings (check-offs, bedtime), cloud wins
          day[hid] = entry;
        }
      }
      merged[date] = day;
    }
  }
  return merged;
}

// Merges reminders by habit id — union of both, cloud wins on conflicts
function mergeReminders(local, cloud) {
  return { ...(local || {}), ...(cloud || {}) };
}

// Full deep merge: combines local and cloud state without losing data
function deepMerge(local, cloud) {
  return {
    habits: mergeHabits(local?.habits, cloud.habits),
    log: mergeLog(local?.log, cloud.log),
    reminders: mergeReminders(local?.reminders, cloud.reminders),
    settings: cloud.settings || local?.settings || { theme: 'auto' },
    _updatedAt: Math.max(cloud.updatedAt || 0, local?._updatedAt || 0),
  };
}

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

  // Hook into app.js saveState by watching localStorage changes
  const origSetItem = localStorage.setItem.bind(localStorage);

  // Debounce push to cloud
  let pushTimer = null;
  function debouncedPush() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(async () => {
      const state = JSON.parse(localStorage.getItem('habitTracker') || '{}');
      if (state.habits) {
        const timestamp = await pushToCloud(state);
        if (timestamp) {
          // Update local timestamp so we know our data is current
          state._updatedAt = timestamp;
          pauseSync();
          origSetItem('habitTracker', JSON.stringify(state));
          resumeSync();
        }
      }
    }, 1000);
  }

  localStorage.setItem = function(key, value) {
    if (key === 'habitTracker') {
      // Stamp _updatedAt immediately so incoming snapshots with older timestamps
      // don't overwrite a local change that hasn't been pushed yet
      try {
        const parsed = JSON.parse(value);
        if (!parsed._updatedAt || parsed._updatedAt < Date.now() - 100) {
          parsed._updatedAt = Date.now();
          value = JSON.stringify(parsed);
        }
      } catch (e) {}
    }
    origSetItem(key, value);
    if (key === 'habitTracker' && getUser()) {
      debouncedPush();
    }
  };

  // Apply merged data to local storage and re-render
  function applyMerged(merged) {
    pauseSync();
    origSetItem('habitTracker', JSON.stringify(merged));
    resumeSync();
    if (typeof window.reloadState === 'function') window.reloadState();
  }

  // Auth state change
  onAuthChange(async (user) => {
    if (user) {
      syncLabel.textContent = user.displayName?.split(' ')[0] || 'Synced';
      syncBtn.classList.add('signed-in');
      syncStatus.classList.add('hidden');
      syncSignedIn.classList.remove('hidden');
      syncUserName.textContent = user.displayName || user.email;

      // Pull cloud data and deep merge with local
      const cloudData = await pullFromCloud();
      const localRaw = localStorage.getItem('habitTracker');
      const local = localRaw ? JSON.parse(localRaw) : null;

      if (cloudData && cloudData.habits && cloudData.habits.length > 0) {
        const merged = deepMerge(local, cloudData);
        applyMerged(merged);
        // Push merged result back so cloud has the full picture
        debouncedPush();
      } else if (!cloudData && local && local.habits) {
        // No cloud data yet — push local state
        debouncedPush();
      }

      // Listen for real-time changes from other devices
      listenForChanges((data) => {
        const current = JSON.parse(localStorage.getItem('habitTracker') || '{}');
        if (data.updatedAt > (current._updatedAt || 0)) {
          const merged = deepMerge(current, data);
          applyMerged(merged);
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
