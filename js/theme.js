// ===== Chủ đề sáng / tối / theo hệ thống, mật độ & bộ màu nhấn =====

/* Quy đổi chế độ (dark | light | system) thành giao diện thực tế */
function resolveTheme(mode) {
  if (mode === 'system') {
    const light = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    return light ? 'light' : 'dark';
  }
  return mode === 'light' ? 'light' : 'dark';
}

/* Chế độ đang chọn: ưu tiên cài đặt trong state, sau đó tới khoá cũ bongx-theme */
function loadThemeMode() {
  const s = (typeof state !== 'undefined' && state.settings) ? state.settings.themeMode : '';
  if (THEME_MODES.some(t => t.id === s)) return s;
  let v = 'dark';
  try { v = localStorage.getItem(THEME_KEY) || 'dark'; } catch (e) { /* bỏ qua */ }
  return THEME_MODES.some(t => t.id === v) ? v : 'dark';
}

function applyThemeMode(mode, keepSettings) {
  const m = THEME_MODES.some(t => t.id === mode) ? mode : 'dark';
  const look = resolveTheme(m);
  document.documentElement.setAttribute('data-theme', look);

  const btn = $('themeBtn');
  if (btn) {
    const ico = (THEME_MODES.find(t => t.id === m) || {}).ico || '🌙';
    btn.textContent = m === 'system' ? ico : (look === 'light' ? '🌙' : '☀️');
    btn.title = 'Chế độ: ' + ((THEME_MODES.find(t => t.id === m) || {}).name || m) +
      ' (bấm để đổi)';
  }
  try { localStorage.setItem(THEME_KEY, m); } catch (e) { /* bỏ qua */ }
  if (!keepSettings && typeof state !== 'undefined' && state.settings) {
    state.settings.themeMode = m;
    saveNow();
  }
  return look;
}

/* Đổi nhanh sáng / tối (giữ cho các lệnh cũ) */
function toggleTheme() {
  const now = resolveTheme(loadThemeMode());
  return applyThemeMode(now === 'light' ? 'dark' : 'light');
}

/* Xoay vòng: Tối → Sáng → Theo hệ thống */
function cycleThemeMode() {
  const cur = loadThemeMode();
  const i = THEME_MODES.findIndex(t => t.id === cur);
  const next = THEME_MODES[(i + 1) % THEME_MODES.length];
  const look = applyThemeMode(next.id);
  return { mode: next, look: look };
}

/* Hệ điều hành đổi sáng/tối trong khi đang ở chế độ "theo hệ thống" */
function watchSystemTheme() {
  if (!window.matchMedia) return;
  const mq = window.matchMedia('(prefers-color-scheme: light)');
  const onChange = () => { if (loadThemeMode() === 'system') applyThemeMode('system', true); };
  if (mq.addEventListener) mq.addEventListener('change', onChange);
  else if (mq.addListener) mq.addListener(onChange);
}

/* ---------- Mật độ hiển thị ---------- */
function loadDensity() {
  const s = (typeof state !== 'undefined' && state.settings) ? state.settings.density : '';
  if (DENSITIES.some(d => d.id === s)) return s;
  let v = 'comfy';
  try { v = localStorage.getItem(DENSITY_KEY) || 'comfy'; } catch (e) { /* bỏ qua */ }
  return DENSITIES.some(d => d.id === v) ? v : 'comfy';
}

function applyDensity(id, keepSettings) {
  const d = DENSITIES.some(x => x.id === id) ? id : 'comfy';
  document.documentElement.setAttribute('data-density', d);
  try { localStorage.setItem(DENSITY_KEY, d); } catch (e) { /* bỏ qua */ }
  if (!keepSettings && typeof state !== 'undefined' && state.settings) {
    state.settings.density = d;
    saveNow();
  }
  return d;
}

function cycleDensity() {
  const cur = loadDensity();
  const i = DENSITIES.findIndex(d => d.id === cur);
  return DENSITIES[(i + 1) % DENSITIES.length];
}

/* ---------- Bộ màu nhấn ---------- */
function loadAccent() {
  let id = 'violet';
  try { id = localStorage.getItem(ACCENT_KEY) || 'violet'; } catch (e) { /* bỏ qua */ }
  return ACCENTS.some(a => a.id === id) ? id : 'violet';
}

function applyAccent(id) {
  const a = ACCENTS.find(x => x.id === id) || ACCENTS[0];
  const root = document.documentElement;
  root.setAttribute('data-accent', a.id);
  root.style.setProperty('--accent-1', a.c1);
  root.style.setProperty('--accent-2', a.c2);
  root.style.setProperty('--accent-3', a.c3);

  const btn = $('accentBtn');
  if (btn) {
    btn.title = 'Bộ màu: ' + a.name + ' (bấm để đổi)';
    const dot = btn.querySelector('.accent-dot');
    if (dot) dot.style.background = 'linear-gradient(135deg,' + a.c1 + ',' + a.c2 + ')';
  }
  try { localStorage.setItem(ACCENT_KEY, a.id); } catch (e) { /* bỏ qua */ }
  return a;
}

/* Đổi vòng qua các bộ màu */
function cycleAccent() {
  const cur = loadAccent();
  const i = ACCENTS.findIndex(a => a.id === cur);
  return applyAccent(ACCENTS[(i + 1) % ACCENTS.length].id);
}

