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

function resetToMidnight(d) { d.setHours(0, 0, 0, 0); return d; }

function loadState() {
  try {
    const saved = localStorage.getItem('habitTracker');
    if (saved) {
      const p = JSON.parse(saved);
      if (!p.habits) p.habits = DEFAULT_HABITS;
      if (!p.log) p.log = {};
      if (!p.reminders) p.reminders = DEFAULT_REMINDERS;
      if (!p.settings) p.settings = { theme: 'auto' };
      return p;
    }
  } catch (e) { /* ignore */ }
  return { habits: DEFAULT_HABITS, log: {}, reminders: DEFAULT_REMINDERS, settings: { theme: 'auto' } };
}

function saveState() { localStorage.setItem('habitTracker', JSON.stringify(state)); }

// ========== Date Utilities ==========
function fmtKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isToday(d) {
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatDisplayDate(d) {
  if (isToday(d)) return 'Today';
  const opts = { weekday: 'short', month: 'short', day: 'numeric' };
  return d.toLocaleDateString('en-US', opts);
}

function getWeekDates(d) {
  const day = d.getDay();
  const mon = new Date(d);
  mon.setDate(d.getDate() - ((day + 6) % 7));
  resetToMidnight(mon);
  return Array.from({ length: 7 }, (_, i) => { const dt = new Date(mon); dt.setDate(mon.getDate() + i); return dt; });
}

function getWeekStart(d) { return getWeekDates(d)[0]; }

// ========== Habit Logic ==========
function getLog(hid, dk) { return state.log[dk]?.[hid]; }

function setLog(hid, dk, val) {
  if (!state.log[dk]) state.log[dk] = {};
  state.log[dk][hid] = { value: val };
  saveState();
}

function removeLog(hid, dk) {
  if (state.log[dk]) {
    delete state.log[dk][hid];
    saveState();
  }
}

function weekCount(habit, ref) {
  return getWeekDates(ref).reduce((c, d) => {
    const e = getLog(habit.id, fmtKey(d));
    return c + (isDone(habit, e) ? 1 : 0);
  }, 0);
}

function isDone(habit, entry) {
  if (!entry) return false;
  if (habit.type === 'check') return entry.value === true;
  if (habit.type === 'counter') return true;
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
  return habit.type === 'time' && habit.bonusValue && entry?.value && entry.value <= habit.bonusValue;
}

function calcStreak(habit) {
  return habit.goalType === 'weekly' ? calcWeeklyStreak(habit) : calcDailyStreak(habit);
}

function calcDailyStreak(habit) {
  let streak = 0;
  const d = new Date(); resetToMidnight(d);
  if (!isGoalMet(habit, getLog(habit.id, fmtKey(d)))) d.setDate(d.getDate() - 1);
  while (true) {
    if (!isGoalMet(habit, getLog(habit.id, fmtKey(d)))) break;
    streak++; d.setDate(d.getDate() - 1);
  }
  return streak;
}

function calcWeeklyStreak(habit) {
  let streak = 0;
  const d = new Date(); resetToMidnight(d);
  let ws = getWeekStart(d);
  if (weekCount(habit, ws) < habit.goalValue) ws.setDate(ws.getDate() - 7);
  while (true) {
    if (weekCount(habit, ws) < habit.goalValue) break;
    streak++; ws.setDate(ws.getDate() - 7);
  }
  return streak;
}

function calcBestStreak(habit) {
  if (habit.goalType === 'weekly') return calcBestWeeklyStreak(habit);
  return calcBestDailyStreak(habit);
}

function calcBestDailyStreak(habit) {
  const allDates = Object.keys(state.log).sort();
  if (!allDates.length) return 0;
  let best = 0, cur = 0;
  const d = new Date(allDates[0]); resetToMidnight(d);
  const end = new Date(); resetToMidnight(end);
  while (d <= end) {
    if (isGoalMet(habit, getLog(habit.id, fmtKey(d)))) { cur++; if (cur > best) best = cur; }
    else cur = 0;
    d.setDate(d.getDate() + 1);
  }
  return best;
}

function calcBestWeeklyStreak(habit) {
  const allDates = Object.keys(state.log).sort();
  if (!allDates.length) return 0;
  let best = 0, cur = 0;
  const d = getWeekStart(new Date(allDates[0]));
  const end = new Date();
  while (d <= end) {
    if (weekCount(habit, d) >= habit.goalValue) { cur++; if (cur > best) best = cur; }
    else cur = 0;
    d.setDate(d.getDate() + 7);
  }
  return best;
}

function completionRate(habit, days = 30) {
  let met = 0;
  const d = new Date(); resetToMidnight(d);
  for (let i = 0; i < days; i++) {
    if (isGoalMet(habit, getLog(habit.id, fmtKey(d)))) met++;
    d.setDate(d.getDate() - 1);
  }
  return Math.round((met / days) * 100);
}

// ========== Time Formatting ==========
function fmt12(t) {
  if (!t) return '--:--';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function timeDiff(actual, goal) {
  const [ah, am] = actual.split(':').map(Number);
  const [gh, gm] = goal.split(':').map(Number);
  let d = (ah * 60 + am) - (gh * 60 + gm);
  if (d < 0) d += 1440;
  const hrs = Math.floor(d / 60);
  return hrs > 0 ? `${hrs}h ${d % 60}m` : `${d % 60}m`;
}

// ========== Unique ID ==========
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// ========== Rendering ==========
function render() {
  renderDateStrip();
  document.getElementById('dateDisplay').textContent = formatDisplayDate(currentDate);
  if (activeTab === 'today') renderToday();
  else if (activeTab === 'week') renderWeek();
  else if (activeTab === 'stats') renderStats();
}

function renderDateStrip() {
  const strip = document.getElementById('dateStrip');
  const week = getWeekDates(currentDate);
  const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  strip.innerHTML = week.map((d, i) => {
    const today = new Date(); resetToMidnight(today);
    const active = isSameDay(d, currentDate);
    const isActualToday = isSameDay(d, today);
    const hasData = state.habits.some(h => isDone(h, getLog(h.id, fmtKey(d))));
    return `<button class="date-strip__day ${active ? 'active' : ''} ${isActualToday ? 'today' : ''} ${hasData ? 'has-data' : ''}" data-date="${fmtKey(d)}">
      <span class="date-strip__day-label">${labels[i]}</span>
      <span class="date-strip__day-num">${d.getDate()}</span>
    </button>`;
  }).join('');

  strip.querySelectorAll('.date-strip__day').forEach(btn => {
    btn.addEventListener('click', () => {
      currentDate = new Date(btn.dataset.date + 'T00:00:00');
      render();
    });
  });

  // Disable next-week arrow if already on the current (or future) week
  const today = new Date(); resetToMidnight(today);
  const currentWeekEnd = week[6];
  const nextBtn = document.getElementById('nextWeekBtn');
  if (nextBtn) nextBtn.disabled = currentWeekEnd >= today;
}

function renderToday() {
  const list = document.getElementById('habitsList');
  const dk = fmtKey(currentDate);
  list.innerHTML = state.habits.map(habit => {
    const entry = getLog(habit.id, dk);
    const wc = weekCount(habit, currentDate);
    const streak = calcStreak(habit);
    return renderCard(habit, entry, wc, streak);
  }).join('');
  bindTodayEvents();
}

function renderCard(habit, entry, wc, streak) {
  const editBtn = `<button class="habit-card__edit" data-edit="${habit.id}" aria-label="Edit">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
  </button>`;

  let action = '', meta = '';
  const streakUnit = habit.goalType === 'weekly' ? 'wk' : 'day';

  if (habit.type === 'check') {
    const done = entry?.value === true;
    action = `<button class="habit-check ${done ? 'checked' : ''}" data-action="toggle" data-habit="${habit.id}">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${done ? 'var(--bg)' : 'transparent'}" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
    </button>`;
    const dots = Array.from({ length: habit.goalValue }, (_, i) => `<span class="dot ${i < wc ? 'filled' : ''}"></span>`).join('');
    meta = `<span class="habit-card__dots">${dots}</span><span>${wc}/${habit.goalValue}</span>`;
    if (streak > 0) meta += `<span class="habit-card__streak">${streak} ${streakUnit}</span>`;
  } else if (habit.type === 'counter') {
    const val = entry?.value ?? 0;
    action = `<div class="counter-control">
      <button class="counter-btn" data-action="dec" data-habit="${habit.id}" ${val <= 0 ? 'disabled' : ''}>-</button>
      <span class="counter-value">${val}</span>
      <button class="counter-btn" data-action="inc" data-habit="${habit.id}">+</button>
    </div>`;
    const cls = val > habit.goalValue ? 'badge--red' : val === habit.goalValue ? 'badge--gold' : 'badge--green';
    meta = `<span class="badge ${cls}">${val}/${habit.goalValue}</span>`;
    if (streak > 0) meta += `<span class="habit-card__streak">${streak} ${streakUnit}</span>`;
  } else if (habit.type === 'time') {
    const val = entry?.value;
    const bon = isBonus(habit, entry);
    const met = val && val <= habit.goalValue;
    let cls = '';
    if (bon) cls = 'bonus';
    else if (met) cls = 'has-value';
    action = `<button class="bedtime-btn ${cls}" data-action="bedtime" data-habit="${habit.id}">${val ? fmt12(val) : 'Log'}</button>`;
    if (bon) meta = `<span class="badge badge--gold">Bonus</span>`;
    else if (met) meta = `<span class="badge badge--green">On time</span>`;
    else if (val) meta = `<span class="badge badge--red">Late ${timeDiff(val, habit.goalValue)}</span>`;
    if (streak > 0) meta += `<span class="habit-card__streak">${streak} ${streakUnit}</span>`;
  }

  return `<div class="habit-card" data-habit="${habit.id}">
    <div class="habit-card__icon">${habit.icon}</div>
    <div class="habit-card__body">
      <div class="habit-card__name">${habit.name}</div>
      <div class="habit-card__meta">${meta}</div>
    </div>
    ${editBtn}
    <div class="habit-card__action">${action}</div>
  </div>`;
}

function bindTodayEvents() {
  document.querySelectorAll('[data-action="toggle"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const hid = btn.dataset.habit, dk = fmtKey(currentDate);
      const e = getLog(hid, dk);
      setLog(hid, dk, !(e?.value === true));
      render();
    });
  });

  document.querySelectorAll('[data-action="inc"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const hid = btn.dataset.habit, dk = fmtKey(currentDate);
      setLog(hid, dk, (getLog(hid, dk)?.value ?? 0) + 1);
      render();
    });
  });

  document.querySelectorAll('[data-action="dec"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const hid = btn.dataset.habit, dk = fmtKey(currentDate);
      setLog(hid, dk, Math.max(0, (getLog(hid, dk)?.value ?? 0) - 1));
      render();
    });
  });

  document.querySelectorAll('[data-action="bedtime"]').forEach(btn => {
    btn.addEventListener('click', () => openBedtimeModal(btn.dataset.habit));
  });

  document.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => openEditHabit(btn.dataset.edit));
  });
}

// ========== Week View ==========
function renderWeek() {
  const grid = document.getElementById('weekGrid');
  const week = getWeekDates(currentDate);
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  grid.innerHTML = state.habits.map(habit => {
    let cnt = 0;
    const days = week.map((d, i) => {
      const e = getLog(habit.id, fmtKey(d));
      let cls = 'week-day__marker', txt = '';
      if (isToday(d)) cls += ' today';

      if (habit.type === 'check') {
        if (e?.value === true) { cls += ' completed'; txt = '\u2713'; cnt++; }
      } else if (habit.type === 'counter') {
        if (e) { txt = e.value; cls += e.value > habit.goalValue ? ' over' : ' completed'; if (e.value <= habit.goalValue) cnt++; }
      } else if (habit.type === 'time') {
        if (e?.value) {
          if (isBonus(habit, e)) { cls += ' bonus'; txt = '\u2605'; cnt++; }
          else if (e.value <= habit.goalValue) { cls += ' completed'; txt = '\u2713'; cnt++; }
          else { cls += ' over'; txt = '\u2717'; }
        }
      }

      return `<div class="week-day"><span class="week-day__label">${labels[i]}</span><div class="${cls}">${txt}</div></div>`;
    }).join('');

    const goal = habit.goalType === 'weekly' ? habit.goalValue : 7;
    const pct = Math.min(100, (cnt / goal) * 100);

    return `<div class="week-habit">
      <div class="week-habit__header">
        <div class="week-habit__name"><span>${habit.icon}</span> ${habit.name}</div>
        <span class="week-habit__goal ${cnt >= goal ? 'met' : ''}">${cnt}/${goal}</span>
      </div>
      <div class="week-days">${days}</div>
      <div class="week-progress-bar"><div class="week-progress-bar__fill ${pct >= 100 ? 'exceeded' : ''}" style="width:${pct}%"></div></div>
    </div>`;
  }).join('');
}

// ========== Stats View ==========
function renderStats() {
  const container = document.getElementById('statsContainer');
  const now = new Date(); resetToMidnight(now);
  const todayKey = fmtKey(now);

  let todayDone = 0;
  state.habits.forEach(h => { if (isGoalMet(h, getLog(h.id, todayKey))) todayDone++; });
  const totalStreaks = state.habits.reduce((s, h) => s + calcStreak(h), 0);

  const drinksH = state.habits.find(h => h.id === 'drinks' || h.type === 'counter');
  let dAvg = '--';
  if (drinksH) {
    const wk = getWeekDates(now); let t = 0, d = 0;
    wk.forEach(dt => { const e = getLog(drinksH.id, fmtKey(dt)); if (e) { t += e.value || 0; d++; } });
    dAvg = d > 0 ? (t / d).toFixed(1) : '0';
  }

  const streaks = state.habits.map(h => {
    const c = calcStreak(h), b = calcBestStreak(h), u = h.goalType === 'weekly' ? 'wk' : 'day';
    return `<div class="stat-row"><span class="stat-row__label">${h.icon} ${h.name}</span><span class="stat-row__value streak">${c} ${u} (best: ${b})</span></div>`;
  }).join('');

  const rates = state.habits.map(h => {
    const r = completionRate(h);
    return `<div class="stat-row"><span class="stat-row__label">${h.icon} ${h.name}</span><span class="stat-row__value">${r}%</span></div>`;
  }).join('');

  const chartData = [];
  for (let w = 7; w >= 0; w--) {
    const ref = new Date(now); ref.setDate(now.getDate() - w * 7);
    const wk = getWeekDates(ref);
    let total = 0, met = 0;
    wk.forEach(d => { state.habits.forEach(h => { total++; if (isGoalMet(h, getLog(h.id, fmtKey(d)))) met++; }); });
    chartData.push({ pct: total > 0 ? Math.round(met / total * 100) : 0, label: `${wk[0].getMonth() + 1}/${wk[0].getDate()}` });
  }

  const mx = Math.max(...chartData.map(d => d.pct), 1);
  const bars = chartData.map(d => `<div class="stat-bar"><span class="stat-bar__value">${d.pct}%</span><div class="stat-bar__fill" style="height:${(d.pct / mx) * 100}%"></div><span class="stat-bar__label">${d.label}</span></div>`).join('');

  container.innerHTML = `
    <div class="stat-card"><div class="stat-card__title">Overview</div>
      <div class="stat-summary">
        <div class="stat-summary__item"><div class="stat-summary__number green">${todayDone}/${state.habits.length}</div><div class="stat-summary__label">Today</div></div>
        <div class="stat-summary__item"><div class="stat-summary__number gold">${totalStreaks}</div><div class="stat-summary__label">Streaks</div></div>
        <div class="stat-summary__item"><div class="stat-summary__number">${dAvg}</div><div class="stat-summary__label">${drinksH ? drinksH.name + '/day' : ''}</div></div>
      </div>
    </div>
    <div class="stat-card"><div class="stat-card__title">Streaks</div>${streaks}</div>
    <div class="stat-card"><div class="stat-card__title">30-Day Rate</div>${rates}</div>
    <div class="stat-card"><div class="stat-card__title">Weekly Trends</div><div class="stat-bar-chart">${bars}</div></div>`;
}

// ========== Add/Edit Habit Modal ==========
function openAddHabit() {
  document.getElementById('habitModalTitle').textContent = 'New habit';
  document.getElementById('habitName').value = '';
  document.getElementById('habitEditId').value = '';
  document.getElementById('habitGoal').value = 3;
  document.getElementById('deleteHabitBtn').style.display = 'none';
  document.querySelectorAll('.icon-option').forEach((b, i) => b.classList.toggle('selected', i === 0));
  document.querySelector('[name="habitType"][value="check"]').checked = true;
  updateHabitFormType();
  document.getElementById('habitModal').classList.remove('hidden');
}

function openEditHabit(hid) {
  const habit = state.habits.find(h => h.id === hid);
  if (!habit) return;
  document.getElementById('habitModalTitle').textContent = 'Edit habit';
  document.getElementById('habitName').value = habit.name;
  document.getElementById('habitEditId').value = habit.id;
  document.getElementById('deleteHabitBtn').style.display = '';

  // Set icon
  document.querySelectorAll('.icon-option').forEach(b => b.classList.toggle('selected', b.dataset.icon === habit.icon));

  // Set type
  const typeInput = document.querySelector(`[name="habitType"][value="${habit.type}"]`);
  if (typeInput) typeInput.checked = true;

  // Set goal
  if (habit.type === 'time') {
    document.getElementById('habitGoal').value = habit.goalValue;
    if (habit.bonusValue) document.getElementById('habitBonus').value = habit.bonusValue;
  } else {
    document.getElementById('habitGoal').value = habit.goalValue;
  }

  updateHabitFormType();
  document.getElementById('habitModal').classList.remove('hidden');
}

function updateHabitFormType() {
  const type = document.querySelector('[name="habitType"]:checked').value;
  const goalGroup = document.getElementById('goalGroup');
  const bonusGroup = document.getElementById('bonusGroup');
  const goalInput = document.getElementById('habitGoal');
  const goalHint = document.getElementById('goalHint');

  goalGroup.classList.remove('hidden');
  bonusGroup.classList.add('hidden');

  if (type === 'check') {
    goalInput.type = 'number'; goalInput.min = 1; goalInput.max = 7;
    goalHint.textContent = 'times per week';
  } else if (type === 'counter') {
    goalInput.type = 'number'; goalInput.min = 0; goalInput.max = 20;
    goalHint.textContent = 'max per day';
  } else if (type === 'time') {
    goalInput.type = 'time';
    goalHint.textContent = 'bed by';
    bonusGroup.classList.remove('hidden');
  }
}

function saveHabit() {
  const name = document.getElementById('habitName').value.trim();
  if (!name) return;

  const icon = document.querySelector('.icon-option.selected')?.dataset.icon || '\u{1F4CC}';
  const type = document.querySelector('[name="habitType"]:checked').value;
  const goalInput = document.getElementById('habitGoal');
  const editId = document.getElementById('habitEditId').value;

  let goalType, goalValue, bonusValue;
  if (type === 'check') {
    goalType = 'weekly';
    goalValue = parseInt(goalInput.value) || 3;
  } else if (type === 'counter') {
    goalType = 'daily_max';
    goalValue = parseInt(goalInput.value) || 2;
  } else {
    goalType = 'daily_before';
    goalValue = goalInput.value || '23:00';
    bonusValue = document.getElementById('habitBonus').value || null;
  }

  if (editId) {
    const habit = state.habits.find(h => h.id === editId);
    if (habit) {
      habit.name = name;
      habit.icon = icon;
      habit.type = type;
      habit.goalType = goalType;
      habit.goalValue = goalValue;
      if (bonusValue) habit.bonusValue = bonusValue;
    }
  } else {
    state.habits.push({ id: uid(), name, icon, type, goalType, goalValue, ...(bonusValue ? { bonusValue } : {}) });
  }

  saveState();
  document.getElementById('habitModal').classList.add('hidden');
  render();
}

let pendingDeleteId = null;

function confirmDeleteHabit() {
  const editId = document.getElementById('habitEditId').value;
  if (!editId) return;
  pendingDeleteId = editId;
  const habit = state.habits.find(h => h.id === editId);
  document.getElementById('confirmText').textContent = `This will remove "${habit?.name}" and all its tracking data.`;
  document.getElementById('confirmModal').classList.remove('hidden');
}

function doDelete() {
  if (!pendingDeleteId) return;
  state.habits = state.habits.filter(h => h.id !== pendingDeleteId);
  // Clean log entries
  Object.keys(state.log).forEach(dk => { delete state.log[dk][pendingDeleteId]; });
  delete state.reminders[pendingDeleteId];
  pendingDeleteId = null;
  saveState();
  document.getElementById('confirmModal').classList.add('hidden');
  document.getElementById('habitModal').classList.add('hidden');
  render();
}

// ========== Bedtime Modal ==========
function openBedtimeModal(hid) {
  const modal = document.getElementById('bedtimeModal');
  const input = document.getElementById('bedtimeInput');
  const entry = getLog(hid, fmtKey(currentDate));
  input.value = entry?.value || '';
  modal.classList.remove('hidden');
  modal._habitId = hid;
}

// ========== Settings ==========
function openSettings() {
  document.getElementById('settingsModal').classList.remove('hidden');
  renderGoals();
  renderReminders();
}

function renderGoals() {
  const list = document.getElementById('goalsList');
  list.innerHTML = state.habits.map(habit => {
    if (habit.type === 'check') {
      return `<div class="goal-item"><span class="goal-item__label">${habit.icon} ${habit.name}</span><div class="goal-item__control"><input type="number" class="goal-input" min="1" max="7" value="${habit.goalValue}" data-goal="${habit.id}"><span class="goal-unit">x/wk</span></div></div>`;
    } else if (habit.type === 'counter') {
      return `<div class="goal-item"><span class="goal-item__label">${habit.icon} ${habit.name}</span><div class="goal-item__control"><input type="number" class="goal-input" min="0" max="20" value="${habit.goalValue}" data-goal="${habit.id}"><span class="goal-unit">max/day</span></div></div>`;
    } else {
      return `<div class="goal-item"><span class="goal-item__label">${habit.icon} Goal</span><div class="goal-item__control"><input type="time" class="goal-input goal-input--time" value="${habit.goalValue}" data-goal="${habit.id}"></div></div>
        <div class="goal-item"><span class="goal-item__label">${habit.icon} Bonus</span><div class="goal-item__control"><input type="time" class="goal-input goal-input--time" value="${habit.bonusValue || ''}" data-goal-bonus="${habit.id}"></div></div>`;
    }
  }).join('');

  list.querySelectorAll('[data-goal]').forEach(input => {
    input.addEventListener('change', () => {
      const h = state.habits.find(x => x.id === input.dataset.goal);
      if (h) { h.goalValue = h.type === 'time' ? input.value : (parseInt(input.value) || 1); saveState(); render(); }
    });
  });

  list.querySelectorAll('[data-goal-bonus]').forEach(input => {
    input.addEventListener('change', () => {
      const h = state.habits.find(x => x.id === input.dataset.goalBonus);
      if (h) { h.bonusValue = input.value; saveState(); render(); }
    });
  });
}

function renderReminders() {
  const list = document.getElementById('remindersList');
  const items = [...state.habits.map(h => ({ id: h.id, label: `${h.icon} ${h.name}` })), { id: 'evening_log', label: 'Evening log' }];
  list.innerHTML = items.map(r => {
    const rem = state.reminders[r.id] || { enabled: false, time: '08:00' };
    return `<div class="reminder-item"><span class="reminder-item__label">${r.label}</span><div class="reminder-item__control"><input type="time" class="reminder-time" value="${rem.time}" data-reminder-time="${r.id}"><label class="toggle"><input type="checkbox" ${rem.enabled ? 'checked' : ''} data-reminder-toggle="${r.id}"><span class="toggle__slider"></span></label></div></div>`;
  }).join('');

  list.querySelectorAll('[data-reminder-toggle]').forEach(input => {
    input.addEventListener('change', () => {
      const id = input.dataset.reminderToggle;
      if (!state.reminders[id]) state.reminders[id] = { enabled: false, time: '08:00' };
      state.reminders[id].enabled = input.checked;
      saveState(); scheduleReminders();
    });
  });

  list.querySelectorAll('[data-reminder-time]').forEach(input => {
    input.addEventListener('change', () => {
      const id = input.dataset.reminderTime;
      if (!state.reminders[id]) state.reminders[id] = { enabled: false, time: '08:00' };
      state.reminders[id].time = input.value;
      saveState(); scheduleReminders();
    });
  });
}

// ========== Notifications ==========
async function requestNotif() {
  if (!('Notification' in window)) { alert('Not supported.'); return; }
  const r = await Notification.requestPermission();
  if (r === 'granted') alert('Notifications enabled!');
}

function scheduleReminders() {
  Object.values(reminderTimers).forEach(clearTimeout);
  reminderTimers = {};
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const now = new Date();
  Object.entries(state.reminders).forEach(([id, rem]) => {
    if (!rem.enabled) return;
    const [h, m] = rem.time.split(':').map(Number);
    const t = new Date(); t.setHours(h, m, 0, 0);
    if (t <= now) t.setDate(t.getDate() + 1);
    reminderTimers[id] = setTimeout(() => {
      const habit = state.habits.find(x => x.id === id);
      new Notification(habit ? `Time for ${habit.name}!` : 'Log your habits!', { body: habit ? `Don't forget to ${habit.name.toLowerCase()} today.` : 'Take a moment to log your habits.', icon: habit?.icon });
      scheduleReminders();
    }, t - now);
  });
}

// ========== Import/Export ==========
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `habit-tracker-${fmtKey(new Date())}.json`; a.click();
  URL.revokeObjectURL(a.href);
}

function importData(file) {
  const r = new FileReader();
  r.onload = (e) => {
    try {
      const d = JSON.parse(e.target.result);
      if (d.habits && d.log) { state = d; saveState(); render(); alert('Imported!'); }
      else alert('Invalid file.');
    } catch { alert('Failed to parse.'); }
  };
  r.readAsText(file);
}

// ========== Theme ==========
function initTheme() {
  const s = state.settings.theme;
  if (s === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  else if (s === 'light') document.documentElement.setAttribute('data-theme', 'light');
  else {
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  state.settings.theme = next;
  saveState();
}

// ========== Init ==========
function init() {
  initTheme();

  document.getElementById('themeBtn').addEventListener('click', toggleTheme);
  document.getElementById('settingsBtn').addEventListener('click', openSettings);
  document.getElementById('addHabitBtn').addEventListener('click', openAddHabit);

  // Tap header date to jump back to today
  document.getElementById('dateDisplay').addEventListener('click', () => {
    currentDate = new Date(); resetToMidnight(currentDate);
    render();
  });

  // Week navigation arrows
  document.getElementById('prevWeekBtn').addEventListener('click', () => {
    currentDate.setDate(currentDate.getDate() - 7);
    render();
  });
  document.getElementById('nextWeekBtn').addEventListener('click', () => {
    const today = new Date(); resetToMidnight(today);
    const next = new Date(currentDate);
    next.setDate(next.getDate() + 7);
    if (next <= today) {
      currentDate = next;
    } else {
      currentDate = today;
    }
    render();
  });

  // Close modals
  document.querySelectorAll('.modal__close').forEach(btn => {
    btn.addEventListener('click', () => btn.closest('.modal-overlay').classList.add('hidden'));
  });
  document.querySelectorAll('.modal-overlay').forEach(o => {
    o.addEventListener('click', (e) => { if (e.target === o) o.classList.add('hidden'); });
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

  // Bedtime modal
  document.getElementById('saveBedtime').addEventListener('click', () => {
    const modal = document.getElementById('bedtimeModal');
    setLog(modal._habitId, fmtKey(currentDate), document.getElementById('bedtimeInput').value);
    modal.classList.add('hidden'); render();
  });

  document.getElementById('clearBedtime').addEventListener('click', () => {
    const modal = document.getElementById('bedtimeModal');
    setLog(modal._habitId, fmtKey(currentDate), null);
    modal.classList.add('hidden'); render();
  });

  // Habit modal
  document.getElementById('saveHabitBtn').addEventListener('click', saveHabit);
  document.getElementById('deleteHabitBtn').addEventListener('click', confirmDeleteHabit);
  document.getElementById('confirmDelete').addEventListener('click', doDelete);
  document.getElementById('confirmCancel').addEventListener('click', () => {
    pendingDeleteId = null;
    document.getElementById('confirmModal').classList.add('hidden');
  });

  // Habit type radio change
  document.querySelectorAll('[name="habitType"]').forEach(r => {
    r.addEventListener('change', updateHabitFormType);
  });

  // Icon picker
  document.getElementById('iconPicker').addEventListener('click', (e) => {
    const btn = e.target.closest('.icon-option');
    if (btn) {
      document.querySelectorAll('.icon-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    }
  });

  document.getElementById('requestNotifBtn').addEventListener('click', requestNotif);
  document.getElementById('exportBtn').addEventListener('click', exportData);
  document.getElementById('importInput').addEventListener('change', (e) => { if (e.target.files[0]) importData(e.target.files[0]); });

  scheduleReminders();
  render();
}

// Expose reloadState for firebase sync
window.reloadState = function() {
  state = loadState();
  render();
};

document.addEventListener('DOMContentLoaded', init);
