// ===== Quản lý trạng thái & lưu trữ (localStorage) =====
let state = loadState();

function defaultState() {
  return { v: 3, convs: [], currentId: null, settings: defaultSettings() };
}

/* ---------- Cài đặt chung ---------- */
function defaultSettings() {
  return {
    themeMode: 'dark',      // dark | light | system
    density: 'comfy',       // comfy | compact
    model: AI_MODEL,        // model mặc định cho hội thoại mới
    persona: 'default',     // vai trò mặc định
    models: []              // danh sách model nạp từ máy chủ (rỗng = dùng AI_MODELS)
  };
}

function normSettings(s) {
  const d = defaultSettings();
  if (!s || typeof s !== 'object') return d;
  const themeMode = THEME_MODES.some(t => t.id === s.themeMode) ? s.themeMode : d.themeMode;
  const density = DENSITIES.some(t => t.id === s.density) ? s.density : d.density;
  const persona = PERSONAS.some(p => p.id === s.persona) ? s.persona : d.persona;
  const model = (typeof s.model === 'string' && s.model.trim() && s.model.indexOf(MODEL_BLOCK) !== 0)
    ? s.model.trim() : d.model;
  const models = Array.isArray(s.models)
    ? s.models.filter(m => typeof m === 'string' && m && m.indexOf(MODEL_BLOCK) !== 0) : [];
  return { themeMode: themeMode, density: density, model: model, persona: persona, models: models };
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ---------- Đính kèm ảnh / tệp (bản 3.1) ---------- */
/* Chuẩn hoá một gói đính kèm; trả về null nếu không có gì dùng được */
function normAtt(a) {
  if (!a || typeof a !== 'object') return null;

  const images = [];
  (Array.isArray(a.images) ? a.images : []).forEach(im => {
    if (!im || typeof im !== 'object') return;
    const url = typeof im.url === 'string' ? im.url : '';
    if (url.indexOf('data:image/') !== 0) return;   // chỉ nhận ảnh nhúng base64
    images.push({
      name: typeof im.name === 'string' && im.name ? im.name.slice(0, 160) : 'ảnh',
      url: url,
      w: Number(im.w) || 0,
      h: Number(im.h) || 0,
      size: Number(im.size) || 0
    });
  });

  const files = [];
  (Array.isArray(a.files) ? a.files : []).forEach(f => {
    if (!f || typeof f !== 'object') return;
    const name = typeof f.name === 'string' ? f.name.trim() : '';
    if (!name) return;
    files.push({
      name: name.slice(0, 160),
      size: Number(f.size) || 0,
      ext: typeof f.ext === 'string' && f.ext ? f.ext.slice(0, 12) : extOfName(name),
      text: typeof f.text === 'string' ? f.text : '',
      cut: !!f.cut
    });
  });

  if (!images.length && !files.length) return null;
  return { images: images.slice(0, ATT.images), files: files.slice(0, ATT.files) };
}

function extOfName(name) {
  const m = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

function attCounts(att) {
  const a = findAtt(att);
  return { images: a.images.length, files: a.files.length };
}

function attEmpty(att) {
  const c = attCounts(att);
  return c.images + c.files === 0;
}

/* Dung lượng xấp xỉ phần đính kèm (byte, chuỗi UTF-16) */
function attBytes(att) {
  const a = findAtt(att);
  let n = 0;
  a.images.forEach(im => { n += String(im.url || '').length * 2; });
  a.files.forEach(f => { n += String(f.text || '').length * 2; });
  return n;
}

/* Danh sách tên để ghép tiêu đề / bản xem trước */
function attNames(att) {
  const a = findAtt(att);
  return a.images.map(i => i.name).concat(a.files.map(f => f.name));
}

/* Ghi chú dạng chữ khi sao chép tin nhắn hoặc xuất Markdown */
function attPlainNote(att) {
  const a = findAtt(att);
  const bits = [];
  a.images.forEach(i => bits.push('ảnh ' + i.name));
  a.files.forEach(f => bits.push('tệp ' + f.name));
  return bits.length ? '[Đính kèm: ' + bits.join(', ') + ']' : '';
}

/* ---------- Chuẩn hoá dữ liệu (tương thích bản cũ) ---------- */
function normMsg(m) {
  if (!m || typeof m !== 'object') return null;
  const role = (m.role === 'user' || m.role === 'assistant' || m.role === 'system') ? m.role : 'assistant';
  const out = {
    id: m.id || uid(),
    role: role,
    content: typeof m.content === 'string' ? m.content : String(m.content == null ? '' : m.content),
    reasoning: typeof m.reasoning === 'string' ? m.reasoning : '',
    ts: typeof m.ts === 'number' ? m.ts : Date.now(),
    edited: !!m.edited
  };
  const att = normAtt(m.att);
  if (att) out.att = att;
  return out;
}

function normConv(c) {
  if (!c || typeof c !== 'object') return null;
  const messages = [];
  (Array.isArray(c.messages) ? c.messages : []).forEach(m => {
    const n = normMsg(m);
    if (n) messages.push(n);
  });
  const created = typeof c.createdAt === 'number' ? c.createdAt : Date.now();
  return {
    id: c.id || uid(),
    title: typeof c.title === 'string' && c.title ? c.title : 'Chat mới',
    messages: messages,
    pinned: !!c.pinned,
    draft: typeof c.draft === 'string' ? c.draft : '',
    persona: typeof c.persona === 'string' && PERSONAS.some(p => p.id === c.persona) ? c.persona : '',
    model: (typeof c.model === 'string' && c.model.indexOf(MODEL_BLOCK) !== 0) ? c.model : '',
    att: normAtt(c.att),                 // ảnh/tệp đang chờ gửi (bản 3.1)
    createdAt: created,
    updatedAt: typeof c.updatedAt === 'number' ? c.updatedAt : created
  };
}

function loadState() {
  let legacyTheme = '';
  try { legacyTheme = localStorage.getItem(THEME_KEY) || ''; } catch (e) { /* bỏ qua */ }

  try {
    const raw = localStorage.getItem(STORE);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && Array.isArray(s.convs)) {
        const convs = [];
        s.convs.forEach(c => {
          const n = normConv(c);
          if (n) convs.push(n);
        });
        const settings = normSettings(s.settings);
        // Nâng cấp từ bản 1/2: giữ nguyên lựa chọn sáng/tối đang dùng
        if (!s.settings && (legacyTheme === 'light' || legacyTheme === 'dark')) {
          settings.themeMode = legacyTheme;
        }
        return { v: 3, convs: convs, currentId: s.currentId || null, settings: settings };
      }
    }
  } catch (e) { /* dữ liệu hỏng → bắt đầu lại */ }
  return defaultState();
}

let saveTimer = null;

function saveNow() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* hết dung lượng */ }
}

function saveState() {
  saveNow();
}

/* Ghi chậm: dùng khi cập nhật liên tục (ví dụ lưu bản nháp) */
function saveLazy(delay) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, delay || 400);
}

/* ---------- Truy vấn ---------- */
function findConv(id) {
  return state.convs.find(c => c.id === id) || null;
}

function currentConv() {
  let c = findConv(state.currentId);
  if (!c) {
    c = normConv({ title: 'Chat mới', messages: [], createdAt: Date.now() });
    state.convs.unshift(c);
    state.currentId = c.id;
    saveState();
  }
  return c;
}

function newConv() {
  const c = normConv({ title: 'Chat mới', messages: [], createdAt: Date.now() });
  state.convs.unshift(c);
  state.currentId = c.id;
  saveState();
  return c;
}

/* Ghim lên đầu, còn lại xếp theo lần cập nhật gần nhất */
function sortedConvs() {
  return state.convs.slice().sort((a, b) =>
    (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) ||
    (b.updatedAt || 0) - (a.updatedAt || 0)
  );
}

function addMessage(conv, role, content, extra) {
  const m = normMsg(Object.assign({ role: role, content: content, ts: Date.now() }, extra || {}));
  conv.messages.push(m);
  conv.updatedAt = m.ts;
  return m;
}

function dropConv(id) {
  const i = state.convs.findIndex(c => c.id === id);
  if (i < 0) return null;
  const removed = state.convs.splice(i, 1)[0];
  if (state.currentId === id) {
    const next = sortedConvs()[0];
    state.currentId = next ? next.id : null;
  }
  saveState();
  return removed;
}

function restoreConv(conv, index) {
  const at = Math.max(0, Math.min(index, state.convs.length));
  state.convs.splice(at, 0, conv);
  saveState();
}

function togglePin(id) {
  const c = findConv(id);
  if (!c) return false;
  c.pinned = !c.pinned;
  saveState();
  return c.pinned;
}

function renameConv(id, title) {
  const c = findConv(id);
  if (!c) return;
  const t = String(title || '').trim().replace(/\s+/g, ' ');
  c.title = t || 'Chat mới';
  c.updatedAt = Date.now();
  saveState();
}

/* ---------- Tìm kiếm (bỏ dấu tiếng Việt, giữ nguyên độ dài để tô sáng đúng vị trí) ---------- */
function foldChar(ch) {
  if (ch.length > 1) return ch;                 // ký tự ngoài BMP (emoji...) giữ nguyên
  if (ch === '\u0111') return 'd';              // đ → d (NFD không tách được chữ này)
  if (ch === '\u0110') return 'D';              // Đ → D
  const f = ch.normalize('NFD');
  return f.length === 1 ? f : f.charAt(0);      // bỏ dấu mũ / dấu thanh
}

function foldText(s) {
  return Array.from(String(s == null ? '' : s).toLowerCase()).map(foldChar).join('');
}

/* Kết quả khớp: giữ nguyên vị trí khớp để giao diện tô sáng */
function matchConv(conv, q) {
  const t = foldText(conv.title);
  let i = t.indexOf(q);
  if (i >= 0) return { conv: conv, where: 'title', raw: conv.title, idx: i, len: q.length };

  for (let k = conv.messages.length - 1; k >= 0; k--) {
    const m = conv.messages[k];
    if (m.role === 'system') continue;
    i = foldText(m.content).indexOf(q);
    if (i >= 0) {
      return {
        conv: conv, where: m.role === 'user' ? 'you' : 'bot',
        raw: m.content, idx: i, len: q.length, msgId: m.id
      };
    }
  }
  return null;
}

function searchConvs(query) {
  const q = foldText(String(query || '').trim());
  if (!q) return [];
  const out = [];
  sortedConvs().forEach(c => {
    const hit = matchConv(c, q);
    if (hit) out.push(hit);
  });
  return out;
}

/* Tìm trong toàn bộ tin nhắn (dùng cho bảng lệnh) */
function searchMessages(query, limit) {
  const q = foldText(String(query || '').trim());
  if (!q) return [];
  const out = [];
  const max = limit || 0;
  sortedConvs().forEach(c => {
    for (let k = c.messages.length - 1; k >= 0; k--) {
      const m = c.messages[k];
      if (m.role === 'system') continue;
      const i = foldText(m.content).indexOf(q);
      if (i >= 0) {
        out.push({
          conv: c, msg: m, where: m.role === 'user' ? 'you' : 'bot',
          raw: m.content, idx: i, len: q.length
        });
        break;
      }
    }
  });
  return max ? out.slice(0, max) : out;
}

/* ---------- Tiện ích nhỏ ---------- */
function countWords(text) {
  const t = String(text || '').trim();
  return t ? t.split(/\s+/).length : 0;
}

function convWordCount(conv) {
  if (!conv) return 0;
  let n = 0;
  conv.messages.forEach(m => { if (m.role !== 'system') n += countWords(m.content); });
  return n;
}

/* Cắt tiêu đề tự động từ tin nhắn đầu tiên */
function autoTitle(text) {
  let t = String(text || '').replace(/[`*_#>\[\]()]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return 'Chat mới';
  if (t.length > 46) {
    const cut = t.slice(0, 46);
    const sp = cut.lastIndexOf(' ');
    t = (sp > 24 ? cut.slice(0, sp) : cut).trim() + '…';
  }
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/* Xoá toàn bộ dữ liệu hội thoại */
function wipeAll() {
  state.convs = [];
  state.currentId = null;
  saveNow();
}

/* ================= Bản 3.0: cài đặt, sao lưu, thống kê ================= */

/* ---------- Đọc / ghi cài đặt chung ---------- */
function getSetting(key) {
  return state.settings ? state.settings[key] : undefined;
}

function setSetting(key, value) {
  if (!state.settings) state.settings = defaultSettings();
  state.settings[key] = value;
  saveNow();
  return value;
}

/* ---------- API key riêng (bản 3.2) ----------
   Chỉ nằm trong localStorage của trình duyệt này, không lưu vào state
   nên không theo file sao lưu/xuất dữ liệu. Xoá thì dùng lại khoá chung AI_KEY. */
function getApiKey() {
  try { return String(localStorage.getItem(APIKEY_KEY) || '').trim(); } catch (e) { return ''; }
}

function setApiKey(k) {
  const v = String(k == null ? '' : k).trim();
  try {
    if (v) localStorage.setItem(APIKEY_KEY, v);
    else localStorage.removeItem(APIKEY_KEY);
  } catch (e) { /* trình duyệt chặn localStorage */ }
  return getApiKey();
}

/* Vai trò & model đang dùng cho một hội thoại (rỗng = theo cài đặt chung) */
function personaOf(conv) {
  return findPersona((conv && conv.persona) || getSetting('persona'));
}

function modelOf(conv) {
  return (conv && conv.model) || getSetting('model') || AI_MODEL;
}

function availableModels() {
  const list = getSetting('models');
  return (Array.isArray(list) && list.length) ? list : AI_MODELS.slice();
}

/* Danh sách model nạp từ máy chủ (luôn giữ model đang dùng ở đầu) */
function setModelList(list) {
  const clean = [];
  (Array.isArray(list) ? list : []).forEach(m => {
    if (typeof m === 'string' && m && m.indexOf(MODEL_BLOCK) !== 0 && clean.indexOf(m) < 0) clean.push(m);
  });
  if (!clean.length) return;
  const cur = getSetting('model');
  if (cur) {
    const at = clean.indexOf(cur);
    if (at > 0) clean.splice(at, 1);
    if (at !== 0) clean.unshift(cur);
  }
  setSetting('models', clean);
}

/* ---------- Sao lưu & khôi phục ---------- */
function backupPayload() {
  return {
    app: 'bong-x',
    v: 3,
    exportedAt: new Date().toISOString(),
    settings: {
      themeMode: getSetting('themeMode'),
      density: getSetting('density'),
      model: getSetting('model'),
      persona: getSetting('persona')
    },
    convs: state.convs.map(c => ({
      id: c.id, title: c.title, pinned: !!c.pinned,
      persona: c.persona || '', model: c.model || '',
      att: c.att || undefined,
      createdAt: c.createdAt, updatedAt: c.updatedAt,
      messages: c.messages.map(m => ({
        role: m.role, content: m.content,
        reasoning: m.reasoning || undefined, edited: m.edited || undefined, ts: m.ts,
        att: m.att || undefined
      }))
    }))
  };
}

/* mode: 'merge' (giữ dữ liệu đang có) | 'replace' (thay toàn bộ) */
function importPayload(obj, mode) {
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.convs)) {
    return { ok: false, error: 'File không đúng định dạng sao lưu của Bóng X.' };
  }
  const incoming = [];
  obj.convs.forEach(c => { const n = normConv(c); if (n) incoming.push(n); });
  if (!incoming.length) return { ok: false, error: 'File sao lưu không có hội thoại nào.' };

  const replace = mode === 'replace';
  if (replace) state.convs = [];

  let added = 0, renamed = 0;
  incoming.forEach(c => {
    if (state.convs.some(x => x.id === c.id)) { c.id = uid(); renamed++; }
    state.convs.push(c);
    added++;
  });

  if (replace) {
    const s = normSettings(obj.settings);
    state.settings = Object.assign(defaultSettings(), s, { models: getSetting('models') || [] });
  }
  if (!findConv(state.currentId)) {
    state.currentId = state.convs.length ? sortedConvs()[0].id : null;
  }
  saveNow();
  return { ok: true, added: added, renamed: renamed, replace: replace };
}

/* ---------- Thống kê dữ liệu ---------- */
function fmtBytes(n) {
  const b = Number(n) || 0;
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(2) + ' MB';
}

function computeStats() {
  let msgs = 0, user = 0, bot = 0, words = 0, chars = 0, codeBlocks = 0, thinkChars = 0, pinned = 0;
  let images = 0, files = 0, attBytesSum = 0;
  state.convs.forEach(c => {
    if (c.pinned) pinned++;
    const ca = attCounts(c.att);
    images += ca.images; files += ca.files; attBytesSum += attBytes(c.att);
    c.messages.forEach(m => {
      if (m.role === 'system') return;
      msgs++;
      if (m.role === 'user') user++; else bot++;
      words += countWords(m.content);
      chars += String(m.content).length;
      const fences = String(m.content).match(/```/g);
      if (fences) codeBlocks += Math.floor(fences.length / 2);
      thinkChars += String(m.reasoning || '').length;
      const ma = attCounts(m.att);
      images += ma.images; files += ma.files; attBytesSum += attBytes(m.att);
    });
  });

  let bytes = 0;
  try { bytes = (localStorage.getItem(STORE) || '').length * 2; } catch (e) { /* bỏ qua */ }

  const times = state.convs.map(c => c.createdAt).filter(n => typeof n === 'number' && n > 0);
  return {
    convs: state.convs.length, pinned: pinned,
    msgs: msgs, user: user, bot: bot,
    words: words, chars: chars, codeBlocks: codeBlocks, thinkChars: thinkChars,
    images: images, files: files, attText: fmtBytes(attBytesSum),
    bytes: bytes, sizeText: fmtBytes(bytes),
    oldest: times.length ? Math.min.apply(null, times) : 0,
    newest: times.length ? Math.max.apply(null, times) : 0
  };
}


