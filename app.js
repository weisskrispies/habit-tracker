// ========== Default Data ==========
const DEFAULT_HABITS = [
  { id: 'meditation', name: 'Meditation', icon: '\u{1F9D8}', type: 'check', goalType: 'weekly', goalValue: 4 },
  { id: 'cardio', name: 'Cardio', icon: '\u{1F3C3}', type: 'check', goalType: 'weekly', goalValue: 3 },
  { id: 'strength', name: 'Strength', icon: '\u{1F3CB}\u{FE0F}', type: 'check', goalType: 'weekly', goalValue: 3 },
  { id: 'drinks', name: 'Drinks', icon: '\u{1F37A}', type: 'counter', goalType: 'daily_max', goalValue: 2 },
  { id: 'stretching', name: 'Stretching', icon: '\u{1F938}', type: 'check', goalType: 'weekly', goalValue: 3 },
  { id: 'sleep', name: 'Bedtime', icon: '\u{1F634}', type: 'time', goalType: 'daily_before', goalValue: '23:00', bonusValue: '22:30' },
];

const DEFAULT_REMINDERS = {
  meditation: { enabled: false, time: '07:00' },
  cardio: { enabled: false, time: '07:00' },
  strength: { enabled: false, time: '07:00' },
  drinks: { enabled: false, time: '20:00' },
  stretching: { enabled: false, time: '08:00' },
  sleep: { enabled: false, time: '22:30' },
  evening_log: { enabled: false, time: '21:00' },
};

// ========== State ==========
let state = loadState();
let currentDate = new Date();
resetToMidnight(currentDate);
let activeTab = 'today';
let reminderTimers = {};

function resetToMidnight(d) {
  d.setHours(0, 0, 0, 0);
  return d;
}

function loadState() {
  try {
    const saved = localStorage.getItem('habitTracker');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (!parsed.habits) parsed.habits = DEFAULT_HABITS;
      if (!parsed.log) parsed.log = {};
      if (!parsed.reminders) parsed.reminders = DEFAULT_REMINDERS;
      if (!parsed.settings) parsed.settings = { theme: 'auto' };
      return parsed;
    }
  } catch (e) { /* ignore */ }
  return {
    habits: DEFAULT_HABITS,
    log: {},
    reminders: DEFAULT_REMINDERS,
    settings: { theme: 'auto' },
  };
}

function saveState() {
  localStorage.setItem('habitTracker', JSON.stringify(state));
}

// ========== Date Utilities ==========
function formatDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isToday(d) {
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function formatDisplayDate(d) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const prefix = isToday(d) ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' });
  return `${prefix} - ${months[d.getMonth()]} ${d.getDate()}`;
}

function getWeekDates(d) {
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((day + 6) % 7));
  resetToMidnight(monday);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    dates.push(date);
  }
  return dates;
}

function getWeekStart(d) {
  return getWeekDates(d)[0];
}

// ========== Habit Logic ==========
function getLogEntry(habitId, dateKey) {
  return state.log[dateKey]?.[habitId];
}

function setLogEntry(habitId, dateKey, value) {
  if (!state.log[dateKey]) state.log[dateKey] = {};
  state.log[dateKey][habitId] = { value };
  saveState();
}

function getWeeklyCount(habit, refDate) {
  const weekDates = getWeekDates(refDate);
  let count = 0;
  for (const d of weekDates) {
    const entry = getLogEntry(habit.id, formatDateKey(d));
    if (entry && isHabitDone(habit, entry)) count++;
  }
  return count;
}

function isHabitDone(habit, entry) {
  if (!entry) return false;
  if (habit.type === 'check') return entry.value === true;
  if (habit.type === 'counter') return true; // logged is done, goal check is separate
  if (habit.type === 'time') return entry.value != null && entry.value !== '';
  return false;
}

function isGoalMet(habit, entry) {
  if (!entry) return false;
  if (habit.type === 'check') return entry.value === true;
  if (habit.type === 'counter') return entry.value <= habit.goalValue;
  if (habit.type === 'time') return entry.value && entry.value <= habit.goalValue;
  return false;
}

function isBonus(habit, entry) {
  if (habit.type === 'time' && habit.bonusValue && entry?.value) {
    return entry.value <= habit.bonusValue;
  }
  return false;
}

function calculateStreak(habit) {
  if (habit.goalType === 'weekly') {
    return calculateWeeklyStreak(habit);
  }
  return calculateDailyStreak(habit);
}

function calculateDailyStreak(habit) {
  let streak = 0;
  const d = new Date();
  resetToMidnight(d);
  // Check today first; if not done, start from yesterday
  const todayEntry = getLogEntry(habit.id, formatDateKey(d));
  if (!isGoalMet(habit, todayEntry)) {
    d.setDate(d.getDate() - 1);
  }
  while (true) {
    const entry = getLogEntry(habit.id, formatDateKey(d));
    if (!isGoalMet(habit, entry)) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

function calculateWeeklyStreak(habit) {
  let streak = 0;
  const d = new Date();
  resetToMidnight(d);
  // Current week: check if goal is met
  let weekStart = getWeekStart(d);
  let count = getWeeklyCount(habit, weekStart);
  if (count < habit.goalValue) {
    // Current week not yet met, check if the week is still in progress
    // Go back to last week
    weekStart.setDate(weekStart.getDate() - 7);
  }
  while (true) {
    const cnt = getWeeklyCount(habit, weekStart);
    if (cnt < habit.goalValue) break;
    streak++;
    weekStart.setDate(weekStart.getDate() - 7);
  }
  return streak;
}

function calculateBestStreak(habit) {
  if (habit.goalType === 'weekly') return calculateBestWeeklyStreak(habit);
  return calculateBestDailyStreak(habit);
}

function calculateBestDailyStreak(habit) {
  const allDates = Object.keys(state.log).sort();
  if (allDates.length === 0) return 0;
  let best = 0, current = 0;
  const startDate = new Date(allDates[0]);
  const endDate = new Date();
  resetToMidnight(startDate);
  resetToMidnight(endDate);
  const d = new Date(startDate);
  while (d <= endDate) {
    const entry = getLogEntry(habit.id, formatDateKey(d));
    if (isGoalMet(habit, entry)) {
      current++;
      if (current > best) best = current;
    } else {
      current = 0;
    }
    d.setDate(d.getDate() + 1);
  }
  return best;
}

function calculateBestWeeklyStreak(habit) {
  const allDates = Object.keys(state.log).sort();
  if (allDates.length === 0) return 0;
  let best = 0, current = 0;
  const startDate = getWeekStart(new Date(allDates[0]));
  const endDate = new Date();
  const d = new Date(startDate);
  while (d <= endDate) {
    const cnt = getWeeklyCount(habit, d);
    if (cnt >= habit.goalValue) {
      current++;
      if (current > best) best = current;
    } else {
      current = 0;
    }
    d.setDate(d.getDate() + 7);
  }
  return best;
}

function getCompletionRate(habit, days = 30) {
  let met = 0, total = 0;
  const d = new Date();
  resetToMidnight(d);
  for (let i = 0; i < days; i++) {
    const entry = getLogEntry(habit.id, formatDateKey(d));
    if (habit.type === 'check') {
      if (entry?.value === true) met++;
    } else if (habit.type === 'counter') {
      if (entry && entry.value <= habit.goalValue) met++;
    } else if (habit.type === 'time') {
      if (entry?.value && entry.value <= habit.goalValue) met++;
    }
    total++;
    d.setDate(d.getDate() - 1);
  }
  return total > 0 ? Math.round((met / total) * 100) : 0;
}

// ========== Time Formatting ==========
function formatTime12(time24) {
  if (!time24) return '--:--';
  const [h, m] = time24.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// ========== Rendering ==========
function render() {
  renderDateNav();
  if (activeTab === 'today') renderTodayView();
  else if (activeTab === 'week') renderWeekView();
  else if (activeTab === 'stats') renderStatsView();
}

function renderDateNav() {
  const display = document.getElementById('dateDisplay');
  display.textContent = formatDisplayDate(currentDate);
  display.classList.toggle('is-today', isToday(currentDate));
}

function renderTodayView() {
  const list = document.getElementById('habitsList');
  const dateKey = formatDateKey(currentDate);
  list.innerHTML = state.habits.map(habit => {
    const entry = getLogEntry(habit.id, dateKey);
    const weekCount = getWeeklyCount(habit, currentDate);
    const streak = calculateStreak(habit);
    if (habit.type === 'check') return renderCheckCard(habit, entry, weekCount, streak);
    if (habit.type === 'counter') return renderCounterCard(habit, entry, streak);
    if (habit.type === 'time') return renderTimeCard(habit, entry, streak);
    return '';
  }).join('');
  bindTodayEvents();
}

function renderCheckCard(habit, entry, weekCount, streak) {
  const done = entry?.value === true;
  return `
    <div class="habit-card" data-habit="${habit.id}">
      <div class="habit-card__top">
        <div class="habit-card__info">
          <div class="habit-card__icon">${habit.icon}</div>
          <span class="habit-card__name">${habit.name}</span>
        </div>
        <button class="habit-check ${done ? 'checked' : ''}" data-action="toggle" data-habit="${habit.id}" aria-label="${done ? 'Mark incomplete' : 'Mark complete'}">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${done ? '#fff' : 'transparent'}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </button>
      </div>
      <div class="habit-card__bottom">
        <div class="habit-card__progress">
          <div class="progress-dots">
            ${Array.from({ length: habit.goalValue }, (_, i) => `<div class="progress-dot ${i < weekCount ? 'filled' : ''}"></div>`).join('')}
          </div>
          <span>${weekCount}/${habit.goalValue} this week</span>
        </div>
        ${streak > 0 ? `<span class="habit-card__streak">\u{1F525} ${streak} wk streak</span>` : ''}
      </div>
    </div>`;
}

function renderCounterCard(habit, entry, streak) {
  const value = entry?.value ?? 0;
  const limit = habit.goalValue;
  let statusClass = 'under-limit';
  let statusText = `${value} / ${limit} limit`;
  if (value > limit) { statusClass = 'over-limit'; statusText = `${value} / ${limit} - over limit`; }
  else if (value === limit) { statusClass = 'at-limit'; statusText = `${value} / ${limit} - at limit`; }

  // Weekly average
  const weekDates = getWeekDates(currentDate);
  let weekTotal = 0, weekDays = 0;
  for (const d of weekDates) {
    const e = getLogEntry(habit.id, formatDateKey(d));
    if (e) { weekTotal += e.value || 0; weekDays++; }
  }
  const weekAvg = weekDays > 0 ? (weekTotal / weekDays).toFixed(1) : '0.0';

  return `
    <div class="habit-card" data-habit="${habit.id}">
      <div class="habit-card__top">
        <div class="habit-card__info">
          <div class="habit-card__icon">${habit.icon}</div>
          <span class="habit-card__name">${habit.name}</span>
        </div>
        <div class="counter-control">
          <button class="counter-btn" data-action="decrement" data-habit="${habit.id}" ${value <= 0 ? 'disabled' : ''}>-</button>
          <span class="counter-value">${value}</span>
          <button class="counter-btn" data-action="increment" data-habit="${habit.id}">+</button>
        </div>
      </div>
      <div class="habit-card__bottom">
        <span class="counter-status ${statusClass}">${statusText}</span>
        ${streak > 0 ? `<span class="habit-card__streak">\u{1F525} ${streak} day streak</span>` : ''}
      </div>
      <div class="habit-card__detail">Avg this week: ${weekAvg}/day</div>
    </div>`;
}

function renderTimeCard(habit, entry, streak) {
  const value = entry?.value;
  const bonus = isBonus(habit, entry);
  const goalMet = value && value <= habit.goalValue;
  let btnClass = 'bedtime-btn';
  if (bonus) btnClass += ' bonus';
  else if (goalMet) btnClass += ' has-value';

  return `
    <div class="habit-card" data-habit="${habit.id}">
      <div class="habit-card__top">
        <div class="habit-card__info">
          <div class="habit-card__icon">${habit.icon}</div>
          <span class="habit-card__name">${habit.name}</span>
        </div>
        <button class="${btnClass}" data-action="bedtime" data-habit="${habit.id}">
          ${value ? formatTime12(value) : 'Log time'}
        </button>
      </div>
      <div class="habit-card__bottom">
        <span class="habit-card__detail">Goal: before ${formatTime12(habit.goalValue)}</span>
        ${streak > 0 ? `<span class="habit-card__streak">\u{1F525} ${streak} day streak</span>` : ''}
      </div>
      ${bonus ? `<div class="habit-card__bonus">\u{2728} Bonus! Before ${formatTime12(habit.bonusValue)}</div>` : ''}
      ${goalMet && !bonus ? `<div class="habit-card__detail" style="color: var(--green); font-weight: 600;">\u{2705} Goal met!</div>` : ''}
      ${value && !goalMet ? `<div class="habit-card__detail" style="color: var(--red);">Missed goal by ${getTimeDiff(value, habit.goalValue)}</div>` : ''}
    </div>`;
}

function getTimeDiff(actual, goal) {
  const [ah, am] = actual.split(':').map(Number);
  const [gh, gm] = goal.split(':').map(Number);
  let diff = (ah * 60 + am) - (gh * 60 + gm);
  if (diff < 0) diff += 24 * 60;
  const hours = Math.floor(diff / 60);
  const mins = diff % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function bindTodayEvents() {
  // Toggle check habits
  document.querySelectorAll('[data-action="toggle"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const habitId = btn.dataset.habit;
      const dateKey = formatDateKey(currentDate);
      const entry = getLogEntry(habitId, dateKey);
      setLogEntry(habitId, dateKey, !(entry?.value === true));
      render();
    });
  });

  // Counter buttons
  document.querySelectorAll('[data-action="increment"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const habitId = btn.dataset.habit;
      const dateKey = formatDateKey(currentDate);
      const entry = getLogEntry(habitId, dateKey);
      setLogEntry(habitId, dateKey, (entry?.value ?? 0) + 1);
      render();
    });
  });

  document.querySelectorAll('[data-action="decrement"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const habitId = btn.dataset.habit;
      const dateKey = formatDateKey(currentDate);
      const entry = getLogEntry(habitId, dateKey);
      const val = Math.max(0, (entry?.value ?? 0) - 1);
      setLogEntry(habitId, dateKey, val);
      render();
    });
  });

  // Bedtime
  document.querySelectorAll('[data-action="bedtime"]').forEach(btn => {
    btn.addEventListener('click', () => {
      openBedtimeModal(btn.dataset.habit);
    });
  });
}

// ========== Week View ==========
function renderWeekView() {
  const grid = document.getElementById('weekGrid');
  const weekDates = getWeekDates(currentDate);
  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  grid.innerHTML = state.habits.map(habit => {
    let completedCount = 0;
    const daysHtml = weekDates.map((d, i) => {
      const entry = getLogEntry(habit.id, formatDateKey(d));
      let markerClass = 'week-day__marker';
      let markerContent = '';
      if (isToday(d)) markerClass += ' today';

      if (habit.type === 'check') {
        if (entry?.value === true) { markerClass += ' completed'; markerContent = '\u{2713}'; completedCount++; }
      } else if (habit.type === 'counter') {
        if (entry) {
          markerContent = entry.value;
          if (entry.value > habit.goalValue) markerClass += ' over';
          else { markerClass += ' completed'; completedCount++; }
        }
      } else if (habit.type === 'time') {
        if (entry?.value) {
          if (isBonus(habit, entry)) { markerClass += ' bonus'; markerContent = '\u{2605}'; completedCount++; }
          else if (entry.value <= habit.goalValue) { markerClass += ' completed'; markerContent = '\u{2713}'; completedCount++; }
          else { markerClass += ' over'; markerContent = '\u{2717}'; }
        }
      }

      return `
        <div class="week-day">
          <span class="week-day__label">${dayLabels[i]}</span>
          <div class="${markerClass}">${markerContent}</div>
        </div>`;
    }).join('');

    const goalText = habit.goalType === 'weekly'
      ? `${completedCount}/${habit.goalValue}`
      : `${completedCount}/7 days`;
    const goalMet = habit.goalType === 'weekly'
      ? completedCount >= habit.goalValue
      : completedCount >= 7;
    const progressPct = habit.goalType === 'weekly'
      ? Math.min(100, (completedCount / habit.goalValue) * 100)
      : (completedCount / 7) * 100;
    const exceeded = progressPct > 100;

    return `
      <div class="week-habit">
        <div class="week-habit__header">
          <div class="week-habit__name"><span>${habit.icon}</span> ${habit.name}</div>
          <span class="week-habit__goal ${goalMet ? 'met' : ''}">${goalText}</span>
        </div>
        <div class="week-days">${daysHtml}</div>
        <div class="week-progress-bar">
          <div class="week-progress-bar__fill ${exceeded ? 'exceeded' : ''}" style="width: ${Math.min(100, progressPct)}%"></div>
        </div>
      </div>`;
  }).join('');
}

// ========== Stats View ==========
function renderStatsView() {
  const container = document.getElementById('statsContainer');

  // Overall summary
  const totalHabits = state.habits.length;
  const todayKey = formatDateKey(new Date());
  let todayDone = 0;
  state.habits.forEach(h => {
    const entry = getLogEntry(h.id, todayKey);
    if (h.type === 'check' && entry?.value === true) todayDone++;
    else if (h.type === 'counter' && entry && entry.value <= h.goalValue) todayDone++;
    else if (h.type === 'time' && entry?.value && entry.value <= h.goalValue) todayDone++;
  });

  const totalStreaks = state.habits.reduce((sum, h) => sum + calculateStreak(h), 0);

  // Streaks table
  const streaksHtml = state.habits.map(habit => {
    const current = calculateStreak(habit);
    const best = calculateBestStreak(habit);
    const unit = habit.goalType === 'weekly' ? 'wk' : 'day';
    return `
      <div class="stat-row">
        <span class="stat-row__label">${habit.icon} ${habit.name}</span>
        <span class="stat-row__value streak">\u{1F525} ${current} ${unit} (best: ${best})</span>
      </div>`;
  }).join('');

  // Completion rates
  const ratesHtml = state.habits.map(habit => {
    const rate = getCompletionRate(habit);
    return `
      <div class="stat-row">
        <span class="stat-row__label">${habit.icon} ${habit.name}</span>
        <span class="stat-row__value">${rate}%</span>
      </div>`;
  }).join('');

  // Weekly bar chart (last 8 weeks overall completion)
  const chartData = [];
  const now = new Date();
  resetToMidnight(now);
  for (let w = 7; w >= 0; w--) {
    const weekRef = new Date(now);
    weekRef.setDate(now.getDate() - w * 7);
    const weekDates = getWeekDates(weekRef);
    let total = 0, met = 0;
    for (const d of weekDates) {
      const dk = formatDateKey(d);
      for (const habit of state.habits) {
        total++;
        const entry = getLogEntry(habit.id, dk);
        if (isGoalMet(habit, entry)) met++;
      }
    }
    const pct = total > 0 ? Math.round((met / total) * 100) : 0;
    const label = `${weekDates[0].getMonth() + 1}/${weekDates[0].getDate()}`;
    chartData.push({ pct, label });
  }

  const maxPct = Math.max(...chartData.map(d => d.pct), 1);
  const barsHtml = chartData.map(d => `
    <div class="stat-bar">
      <span class="stat-bar__value">${d.pct}%</span>
      <div class="stat-bar__fill" style="height: ${(d.pct / maxPct) * 100}%"></div>
      <span class="stat-bar__label">${d.label}</span>
    </div>`).join('');

  // Drinks weekly average
  const drinksHabit = state.habits.find(h => h.id === 'drinks');
  let drinksWeeklyAvg = '--';
  if (drinksHabit) {
    const weekDates = getWeekDates(now);
    let total = 0, days = 0;
    for (const d of weekDates) {
      const e = getLogEntry('drinks', formatDateKey(d));
      if (e) { total += e.value || 0; days++; }
    }
    drinksWeeklyAvg = days > 0 ? (total / days).toFixed(1) : '0.0';
  }

  container.innerHTML = `
    <div class="stat-card">
      <div class="stat-card__title">Overview</div>
      <div class="stat-summary">
        <div class="stat-summary__item">
          <div class="stat-summary__number green">${todayDone}/${totalHabits}</div>
          <div class="stat-summary__label">Today</div>
        </div>
        <div class="stat-summary__item">
          <div class="stat-summary__number orange">${totalStreaks}</div>
          <div class="stat-summary__label">Active Streaks</div>
        </div>
        <div class="stat-summary__item">
          <div class="stat-summary__number purple">${drinksWeeklyAvg}</div>
          <div class="stat-summary__label">Drinks/Day Avg</div>
        </div>
      </div>
    </div>

    <div class="stat-card">
      <div class="stat-card__title">Current Streaks</div>
      ${streaksHtml}
    </div>

    <div class="stat-card">
      <div class="stat-card__title">30-Day Completion Rate</div>
      ${ratesHtml}
    </div>

    <div class="stat-card">
      <div class="stat-card__title">Weekly Trends</div>
      <div class="stat-bar-chart">${barsHtml}</div>
    </div>
  `;
}

// ========== Bedtime Modal ==========
function openBedtimeModal(habitId) {
  const modal = document.getElementById('bedtimeModal');
  const input = document.getElementById('bedtimeInput');
  const dateKey = formatDateKey(currentDate);
  const entry = getLogEntry(habitId, dateKey);
  input.value = entry?.value || '';
  modal.classList.remove('hidden');
  modal._habitId = habitId;
}

// ========== Settings Modal ==========
function openSettings() {
  const modal = document.getElementById('settingsModal');
  modal.classList.remove('hidden');
  renderGoals();
  renderReminders();
}

function renderGoals() {
  const list = document.getElementById('goalsList');
  list.innerHTML = state.habits.map(habit => {
    if (habit.type === 'check') {
      return `
        <div class="goal-item">
          <span class="goal-item__label">${habit.icon} ${habit.name}</span>
          <div class="goal-item__control">
            <input type="number" class="goal-input" min="1" max="7" value="${habit.goalValue}" data-goal="${habit.id}">
            <span class="goal-unit">x/week</span>
          </div>
        </div>`;
    } else if (habit.type === 'counter') {
      return `
        <div class="goal-item">
          <span class="goal-item__label">${habit.icon} ${habit.name}</span>
          <div class="goal-item__control">
            <input type="number" class="goal-input" min="0" max="20" value="${habit.goalValue}" data-goal="${habit.id}">
            <span class="goal-unit">max/day</span>
          </div>
        </div>`;
    } else if (habit.type === 'time') {
      return `
        <div class="goal-item">
          <span class="goal-item__label">${habit.icon} ${habit.name} (goal)</span>
          <div class="goal-item__control">
            <input type="time" class="goal-input goal-input--time" value="${habit.goalValue}" data-goal="${habit.id}">
          </div>
        </div>
        <div class="goal-item">
          <span class="goal-item__label">${habit.icon} ${habit.name} (bonus)</span>
          <div class="goal-item__control">
            <input type="time" class="goal-input goal-input--time" value="${habit.bonusValue || ''}" data-goal-bonus="${habit.id}">
          </div>
        </div>`;
    }
    return '';
  }).join('');

  // Bind goal change events
  list.querySelectorAll('[data-goal]').forEach(input => {
    input.addEventListener('change', () => {
      const habit = state.habits.find(h => h.id === input.dataset.goal);
      if (habit) {
        if (habit.type === 'time') habit.goalValue = input.value;
        else habit.goalValue = parseInt(input.value) || 1;
        saveState();
        render();
      }
    });
  });

  list.querySelectorAll('[data-goal-bonus]').forEach(input => {
    input.addEventListener('change', () => {
      const habit = state.habits.find(h => h.id === input.dataset.goalBonus);
      if (habit) {
        habit.bonusValue = input.value;
        saveState();
        render();
      }
    });
  });
}

function renderReminders() {
  const list = document.getElementById('remindersList');
  const allReminders = [
    ...state.habits.map(h => ({ id: h.id, label: `${h.icon} ${h.name}` })),
    { id: 'evening_log', label: '\u{1F4CB} Evening log reminder' },
  ];

  list.innerHTML = allReminders.map(r => {
    const reminder = state.reminders[r.id] || { enabled: false, time: '08:00' };
    return `
      <div class="reminder-item">
        <span class="reminder-item__label">${r.label}</span>
        <div class="reminder-item__control">
          <input type="time" class="reminder-time" value="${reminder.time}" data-reminder-time="${r.id}">
          <label class="toggle">
            <input type="checkbox" ${reminder.enabled ? 'checked' : ''} data-reminder-toggle="${r.id}">
            <span class="toggle__slider"></span>
          </label>
        </div>
      </div>`;
  }).join('');

  // Bind reminder events
  list.querySelectorAll('[data-reminder-toggle]').forEach(input => {
    input.addEventListener('change', () => {
      const id = input.dataset.reminderToggle;
      if (!state.reminders[id]) state.reminders[id] = { enabled: false, time: '08:00' };
      state.reminders[id].enabled = input.checked;
      saveState();
      scheduleReminders();
    });
  });

  list.querySelectorAll('[data-reminder-time]').forEach(input => {
    input.addEventListener('change', () => {
      const id = input.dataset.reminderTime;
      if (!state.reminders[id]) state.reminders[id] = { enabled: false, time: '08:00' };
      state.reminders[id].time = input.value;
      saveState();
      scheduleReminders();
    });
  });
}

// ========== Notifications / Reminders ==========
async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    alert('Notifications are not supported in this browser.');
    return;
  }
  const result = await Notification.requestPermission();
  if (result === 'granted') {
    alert('Notifications enabled! Set your reminder times in settings.');
  }
}

function scheduleReminders() {
  // Clear existing timers
  Object.values(reminderTimers).forEach(clearTimeout);
  reminderTimers = {};

  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const now = new Date();
  Object.entries(state.reminders).forEach(([id, reminder]) => {
    if (!reminder.enabled) return;
    const [h, m] = reminder.time.split(':').map(Number);
    const target = new Date();
    target.setHours(h, m, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    const delay = target - now;
    reminderTimers[id] = setTimeout(() => {
      const habit = state.habits.find(h => h.id === id);
      const title = habit ? `Time for ${habit.name}!` : 'Log your habits!';
      const body = habit ? `Don't forget to ${habit.name.toLowerCase()} today.` : 'Take a moment to log your habits for today.';
      new Notification(title, { body, icon: habit?.icon });
      // Reschedule for next day
      scheduleReminders();
    }, delay);
  });
}

// ========== Import/Export ==========
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `habit-tracker-backup-${formatDateKey(new Date())}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.habits && data.log) {
        state = data;
        saveState();
        render();
        alert('Data imported successfully!');
      } else {
        alert('Invalid file format.');
      }
    } catch {
      alert('Failed to parse file.');
    }
  };
  reader.readAsText(file);
}

// ========== Theme ==========
function initTheme() {
  const saved = state.settings.theme;
  if (saved === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else if (saved === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  state.settings.theme = next;
  saveState();
}

// ========== Event Bindings ==========
function init() {
  initTheme();

  // Theme toggle
  document.getElementById('themeBtn').addEventListener('click', toggleTheme);

  // Settings
  document.getElementById('settingsBtn').addEventListener('click', openSettings);

  // Close modals
  document.querySelectorAll('.modal__close').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.modal-overlay').classList.add('hidden');
    });
  });

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.add('hidden');
    });
  });

  // Tabs
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeTab = tab.dataset.tab;
      document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
      document.getElementById(`${activeTab}View`).classList.remove('hidden');
      render();
    });
  });

  // Date navigation
  document.getElementById('prevDay').addEventListener('click', () => {
    currentDate.setDate(currentDate.getDate() - 1);
    render();
  });

  document.getElementById('nextDay').addEventListener('click', () => {
    currentDate.setDate(currentDate.getDate() + 1);
    render();
  });

  document.getElementById('dateDisplay').addEventListener('click', () => {
    currentDate = new Date();
    resetToMidnight(currentDate);
    render();
  });

  // Bedtime modal actions
  document.getElementById('saveBedtime').addEventListener('click', () => {
    const modal = document.getElementById('bedtimeModal');
    const input = document.getElementById('bedtimeInput');
    const dateKey = formatDateKey(currentDate);
    setLogEntry(modal._habitId, dateKey, input.value);
    modal.classList.add('hidden');
    render();
  });

  document.getElementById('clearBedtime').addEventListener('click', () => {
    const modal = document.getElementById('bedtimeModal');
    const dateKey = formatDateKey(currentDate);
    setLogEntry(modal._habitId, dateKey, null);
    modal.classList.add('hidden');
    render();
  });

  // Notifications
  document.getElementById('requestNotifBtn').addEventListener('click', requestNotificationPermission);

  // Export
  document.getElementById('exportBtn').addEventListener('click', exportData);

  // Import
  document.getElementById('importInput').addEventListener('change', (e) => {
    if (e.target.files[0]) importData(e.target.files[0]);
  });

  // Schedule reminders
  scheduleReminders();

  // Initial render
  render();
}

// Start app
document.addEventListener('DOMContentLoaded', init);
