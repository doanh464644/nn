// ===== Hiển thị giao diện & luồng gửi tin nhắn =====
let convFilter = '';        // từ khoá tìm kiếm hội thoại
let streaming = false;      // đang nhận câu trả lời?
let streamCtl = null;       // AbortController của request hiện tại
let streamState = null;     // { convId, msgId, text, reason, raf }
let speakingBtn = null;     // nút "Đọc" đang phát
let finalizedMsgId = null;  // tin nhắn đã chốt nội dung (chống chốt 2 lần)

/* ---------- Tiện ích ---------- */
function visibleMessages(conv) {
  return conv ? conv.messages.filter(m => m.role !== 'system') : [];
}

function clock(ts) {
  const d = new Date(ts || Date.now());
  return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
}

function timeAgo(ts) {
  const sec = Math.floor((Date.now() - (ts || 0)) / 1000);
  if (sec < 60) return 'vừa xong';
  if (sec < 3600) return Math.floor(sec / 60) + ' phút trước';
  if (sec < 86400) return Math.floor(sec / 3600) + ' giờ trước';
  if (sec < 2592000) return Math.floor(sec / 86400) + ' ngày trước';
  return new Date(ts).toLocaleDateString('vi-VN');
}

function previewOf(conv) {
  const list = visibleMessages(conv);
  const last = list[list.length - 1];
  if (!last) return 'Chưa có tin nhắn';
  const text = String(last.content)
    .replace(/```[\s\S]*?```/g, ' [mã] ')
    .replace(/\s+/g, ' ')
    .trim();
  const c = attCounts(last.att);                    // tin nhắn có ảnh/tệp đính kèm
  const mark = (c.images ? '🖼' + (c.images > 1 ? c.images : '') : '') +
    (c.files ? '📎' + (c.files > 1 ? c.files : '') : '');
  return (last.role === 'user' ? 'Bạn: ' : 'Bóng X: ') + (mark ? mark + ' ' : '') +
    (text.length > 46 ? text.slice(0, 46) + '…' : text);
}

/* Tô sáng đoạn khớp trong chuỗi đã escape */
function markHtml(text, idx, len) {
  const s = String(text == null ? '' : text);
  if (idx == null || idx < 0 || !len) return escapeHtml(s);
  return escapeHtml(s.slice(0, idx)) +
    '<mark>' + escapeHtml(s.slice(idx, idx + len)) + '</mark>' +
    escapeHtml(s.slice(idx + len));
}

/* Trích đoạn quanh vị trí khớp rồi tô sáng (gộp khoảng trắng nhưng giữ đúng vị trí) */
function snippetHtml(raw, query) {
  const q = foldText(String(query || '').trim());
  const flat = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
  if (!q) return escapeHtml(flat.slice(0, 90));
  const idx = foldText(flat).indexOf(q);
  if (idx < 0) return escapeHtml(flat.slice(0, 90));
  const start = Math.max(0, idx - 30);
  const end = Math.min(flat.length, idx + q.length + 46);
  return (start > 0 ? '…' : '') +
    markHtml(flat.slice(start, end), idx - start, q.length) +
    (end < flat.length ? '…' : '');
}

/* ---------- Toast (kèm nút hành động tuỳ chọn) ---------- */
function showToast(message, type, action) {
  const wrap = $('toastWrap');
  if (!wrap) return null;
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'err' ? ' err' : '');
  el.innerHTML = '<span class="t-ico"></span><span class="t-msg"></span>';
  el.querySelector('.t-ico').textContent = type === 'err' ? '⚠️' : (type === 'info' ? 'ℹ️' : '✅');
  el.querySelector('.t-msg').textContent = message;

  let timer = null;
  const close = () => {
    if (timer) clearTimeout(timer);
    el.classList.add('out');
    setTimeout(() => el.remove(), 280);
  };

  if (action && action.label) {
    const b = document.createElement('button');
    b.className = 't-act';
    b.type = 'button';
    b.textContent = action.label;
    b.addEventListener('click', () => {
      close();
      if (typeof action.run === 'function') action.run();
    });
    el.appendChild(b);
  }

  wrap.appendChild(el);
  timer = setTimeout(close, action ? 6000 : 2600);
  return el;
}

/* ---------- Sao chép ---------- */
function copyText(text) {
  const done = () => showToast('Đã sao chép vào bộ nhớ tạm');
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); }
    catch (e) { showToast('Không sao chép được', 'err'); }
    ta.remove();
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(fallback);
  } else {
    fallback();
  }
}

/* ---------- Đọc to (Web Speech API) ---------- */
function clearSpeaking() {
  if (speakingBtn) {
    speakingBtn.classList.remove('on');
    speakingBtn.textContent = 'Đọc';
    speakingBtn = null;
  }
}

function speakMessage(msgId, btn) {
  if (!('speechSynthesis' in window)) {
    showToast('Trình duyệt không hỗ trợ đọc to', 'err');
    return;
  }
  const synth = window.speechSynthesis;
  if (synth.speaking || synth.pending) {
    synth.cancel();
    clearSpeaking();
    return;
  }
  const conv = findConv(state.currentId);
  const m = conv ? conv.messages.find(x => x.id === msgId) : null;
  if (!m) return;

  const clean = String(m.content)
    .replace(/```[\s\S]*?```/g, ' … khối mã … ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#*`>_~|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) { showToast('Không có nội dung để đọc', 'err'); return; }

  const u = new SpeechSynthesisUtterance(clean.slice(0, 5000));
  u.lang = 'vi-VN';
  u.rate = 1.02;
  const vo = (synth.getVoices() || []).find(v => /^vi/i.test(v.lang));
  if (vo) u.voice = vo;

  speakingBtn = btn || null;
  if (btn) { btn.classList.add('on'); btn.textContent = 'Dừng đọc'; }
  u.onend = clearSpeaking;
  u.onerror = clearSpeaking;
  synth.speak(u);
}

/* ---------- Trạng thái & cuộn ---------- */
function setStreamingUI(on) {
  const btn = $('sendBtn');
  if (btn) {
    btn.classList.toggle('stop', !!on);
    btn.textContent = on ? '■' : '➤';
    btn.title = on ? 'Dừng tạo câu trả lời (Esc)' : 'Gửi tin nhắn (Enter)';
    btn.disabled = false;
  }
  const bar = document.querySelector('.input-bar');
  if (bar) bar.classList.toggle('busy', !!on);
}

function closeSidebarOnMobile() {
  if (!window.matchMedia('(max-width: 720px)').matches) return;
  $('sidebar').classList.add('closed');
  $('backdrop').classList.remove('show');
}

function nearBottom(slack) {
  const box = $('msgs');
  if (!box) return true;
  return box.scrollHeight - box.scrollTop - box.clientHeight < (slack || 120);
}

function scrollBottom() {
  const box = $('msgs');
  if (box) box.scrollTop = box.scrollHeight;
}

function updateFab() {
  const fab = $('fab');
  if (!fab) return;
  fab.classList.toggle('show', !nearBottom(90));
}

function scrollToMsg(msgId) {
  const el = document.getElementById('m-' + msgId);
  if (!el) return;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 1800);
}

/* ---------- Sidebar ---------- */
function convHtml(c, hit, q) {
  const active = c.id === state.currentId;

  let title;
  if (hit && hit.where === 'title') {
    const i = foldText(c.title).indexOf(foldText(q));
    title = markHtml(c.title, i, q.length);
  } else {
    title = escapeHtml(c.title);
  }

  let prev;
  if (hit && hit.where !== 'title') {
    prev = '<span class="where">' + (hit.where === 'you' ? 'Bạn' : 'Bóng X') + '</span> ' +
      snippetHtml(hit.raw, q);
  } else {
    prev = escapeHtml(previewOf(c));
  }

  return '<div class="conv-item' + (active ? ' active' : '') + (c.pinned ? ' pinned' : '') +
      '" data-id="' + c.id + '" id="c-' + c.id + '">' +
    '<div class="ico">' + (c.pinned ? '📌' : '💬') + '</div>' +
    '<div class="meta">' +
      '<div class="title">' + title + '</div>' +
      '<div class="prev">' + prev + '</div>' +
    '</div>' +
    '<div class="acts">' +
      '<button class="mini-btn pin" type="button" title="' +
        (c.pinned ? 'Bỏ ghim' : 'Ghim lên đầu') + '">' + (c.pinned ? '✖' : '📌') + '</button>' +
      '<button class="mini-btn del" type="button" title="Xoá cuộc trò chuyện">✕</button>' +
    '</div>' +
  '</div>';
}

function renderSidebar() {
  const list = $('convList');
  const count = $('convCount');
  if (!list) return;

  const total = state.convs.length;
  if (count) count.textContent = String(total);

  const q = convFilter.trim();

  if (q) {
    const hits = searchConvs(q);
    if (!hits.length) {
      list.innerHTML = '<div class="conv-empty">Không tìm thấy kết quả cho<br>“' +
        escapeHtml(q) + '”.</div>';
      return;
    }
    list.innerHTML = '<div class="side-label mini"><span>Kết quả (' + hits.length +
      ')</span></div>' + hits.map(h => convHtml(h.conv, h, q)).join('');
    return;
  }

  if (!total) {
    list.innerHTML = '<div class="conv-empty">Chưa có cuộc trò chuyện nào.<br>Hãy bắt đầu một chat mới!</div>';
    return;
  }

  const all = sortedConvs();
  const pinned = all.filter(c => c.pinned);
  const rest = all.filter(c => !c.pinned);
  let html = '';
  if (pinned.length) {
    html += '<div class="side-label mini"><span>Đã ghim</span><span class="count">' +
      pinned.length + '</span></div>' + pinned.map(c => convHtml(c)).join('');
  }
  if (rest.length) {
    html += '<div class="side-label mini"><span>Gần đây</span><span class="count">' +
      rest.length + '</span></div>' + rest.map(c => convHtml(c)).join('');
  }
  list.innerHTML = html;
}

/* Đổi tên ngay trong danh sách (nháy đúp vào tiêu đề) */
function startRename(id) {
  const item = document.getElementById('c-' + id);
  const conv = findConv(id);
  if (!item || !conv) return;
  const titleEl = item.querySelector('.title');
  if (!titleEl) return;

  const inp = document.createElement('input');
  inp.className = 'rename';
  inp.type = 'text';
  inp.maxLength = 90;
  inp.value = conv.title;
  titleEl.replaceWith(inp);
  inp.focus();
  inp.select();

  let done = false;
  const commit = ok => {
    if (done) return;
    done = true;
    if (ok) {
      renameConv(id, inp.value);
      updateChatHead();
      showToast('Đã đổi tên cuộc trò chuyện');
    }
    renderSidebar();
  };

  inp.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); commit(true); }
    else if (e.key === 'Escape') { e.preventDefault(); commit(false); }
  });
  inp.addEventListener('blur', () => commit(true));
}

/* ---------- Tin nhắn ---------- */
function thinkHtml(m) {
  const r = String(m.reasoning || '');
  return '<details class="think"' + (r ? '' : ' hidden') + '>' +
    '<summary>Suy luận của Bóng X</summary>' +
    '<div class="think-body">' + escapeHtml(r) + '</div>' +
  '</details>';
}

function msgHtml(m) {
  const isUser = m.role === 'user';
  const tools = ['<button class="tool copy-msg" type="button" title="Sao chép tin nhắn">Sao chép</button>'];
  if (isUser) {
    tools.push('<button class="tool edit-msg" type="button" title="Sửa tin nhắn rồi gửi lại">Sửa</button>');
  } else {
    tools.push('<button class="tool speak-msg" type="button" title="Đọc to câu trả lời">Đọc</button>');
    tools.push('<button class="tool regen-msg" type="button" title="Tạo lại câu trả lời">Tạo lại</button>');
  }
  tools.push('<button class="tool del-msg" type="button" title="Xoá tin nhắn">Xoá</button>');

  return '<div class="msg ' + (isUser ? 'user' : 'bot') + '" data-mid="' + m.id +
      '" id="m-' + m.id + '">' +
    '<div class="avatar">' + (isUser ? 'Bạn' : 'X') + '</div>' +
    '<div class="body">' +
      (isUser ? '' : thinkHtml(m)) +
      attHtml(m) +
      '<div class="bubble">' + formatMsg(m.content) + '</div>' +
      '<div class="msg-tools">' + tools.join('') +
        '<span class="stamp">' + clock(m.ts) + (m.edited ? ' · đã sửa' : '') + '</span>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function renderMessages() {
  const conv = findConv(state.currentId);
  const list = $('msgList');
  const welcome = $('welcome');
  if (!list) return;

  const items = visibleMessages(conv);

  if (welcome) welcome.style.display = items.length ? 'none' : '';
  list.innerHTML = items.map(msgHtml).join('');
  updateChatHead();
}

function renderWelcome() {
  const box = $('suggest');
  if (!box) return;
  box.innerHTML = SUGGESTIONS.map((s, i) =>
    '<button class="card" type="button" data-i="' + i + '">' +
      '<span class="card-ico">' + s.icon + '</span>' +
      '<span class="card-body">' +
        '<span class="card-txt">' + escapeHtml(s.title) + '</span>' +
        '<span class="card-sub">' + escapeHtml(s.sub) + '</span>' +
      '</span>' +
    '</button>'
  ).join('');
}

/* ---------- Thanh tiêu đề ---------- */
function updateChatHead() {
  const conv = findConv(state.currentId);
  const items = visibleMessages(conv);
  const title = $('chatTitle');
  const sub = $('chatSub');
  if (title) title.textContent = conv ? (conv.title || 'Chat mới') : 'Chat mới';
  if (sub) {
    if (!items.length) {
      sub.textContent = 'Bắt đầu cuộc trò chuyện mới';
    } else {
      const bits = [items.length + ' tin nhắn', convWordCount(conv).toLocaleString('vi-VN') + ' từ'];
      if (conv && conv.pinned) bits.push('đã ghim');
      bits.push('cập nhật ' + timeAgo(conv.updatedAt));
      sub.textContent = bits.join(' • ');
    }
  }
}

/* ---------- Điều khiển chung ---------- */
function renderAll() {
  renderSidebar();
  renderMessages();
  renderChips();
  renderAttach();
}

function autoResize() {
  const ta = $('input');
  if (!ta) return;
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 180) + 'px';
}

function updateCounter() {
  const ta = $('input');
  const c = $('counter');
  if (!ta || !c) return;
  const v = ta.value;
  const n = v.length;
  c.textContent = n
    ? n.toLocaleString('vi-VN') + ' ký tự • ' + countWords(v).toLocaleString('vi-VN') + ' từ'
    : '';
}

/* Chèn chấm "đang trả lời" vào bong bóng của tin nhắn trợ lý */
function addGhost(bubble) {
  if (!bubble) return;
  bubble.innerHTML = '<span class="dots"><span></span><span></span><span></span></span>';
}

/* ---------- Chọn / xoá / ghim hội thoại ---------- */
function selectConv(id, focusInput) {
  if (streaming) {
    showToast('Đang trả lời — hãy dừng lại trước khi chuyển', 'err');
    return;
  }
  state.currentId = id;
  saveState();
  renderAll();
  restoreDraft();
  scrollBottom();
  updateFab();
  closeSidebarOnMobile();
  if (focusInput !== false) $('input').focus();
}

function deleteConv(id) {
  const conv = findConv(id);
  if (!conv) return;
  const at = state.convs.indexOf(conv);
  const snapshot = JSON.parse(JSON.stringify(conv));
  dropConv(id);
  renderAll();
  restoreDraft();
  scrollBottom();

  showToast('Đã xoá “' + conv.title + '”', 'info', {
    label: 'Hoàn tác',
    run: () => {
      restoreConv(snapshot, at);
      state.currentId = snapshot.id;
      saveState();
      renderAll();
      restoreDraft();
      showToast('Đã khôi phục cuộc trò chuyện');
    }
  });
}

function pinConv(id) {
  const on = togglePin(id);
  renderSidebar();
  updateChatHead();
  showToast(on ? 'Đã ghim lên đầu danh sách' : 'Đã bỏ ghim');
}

/* ---------- Sửa tin nhắn người dùng ---------- */
function autoGrow(ta) {
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 320) + 'px';
}

function startEdit(msgId) {
  if (streaming) { showToast('Đang trả lời — hãy đợi hoặc dừng lại', 'err'); return; }
  const conv = findConv(state.currentId);
  const m = conv ? conv.messages.find(x => x.id === msgId) : null;
  const el = document.getElementById('m-' + msgId);
  if (!m || !el) return;
  const bubble = el.querySelector('.bubble');
  if (!bubble) return;

  const box = document.createElement('div');
  box.className = 'editor';
  box.innerHTML =
    '<textarea class="edit-ta" rows="2"></textarea>' +
    '<div class="edit-acts">' +
      '<button class="tool primary save-edit" type="button">Lưu &amp; gửi lại</button>' +
      '<button class="tool cancel-edit" type="button">Huỷ</button>' +
      '<span class="edit-hint">Ctrl+Enter để lưu • Esc để huỷ</span>' +
    '</div>';

  bubble.replaceWith(box);
  const ta = box.querySelector('.edit-ta');
  ta.value = m.content;
  autoGrow(ta);
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);

  let done = false;
  const finish = save => {
    if (done) return;
    done = true;
    if (!save) { renderMessages(); return; }

    const text = ta.value.trim();
    if (!text) { showToast('Nội dung không được để trống', 'err'); renderMessages(); return; }

    m.content = text;
    m.edited = true;
    m.ts = Date.now();
    // Bỏ mọi tin nhắn phía sau vì ngữ cảnh đã thay đổi
    const idx = conv.messages.indexOf(m);
    if (idx >= 0) conv.messages = conv.messages.slice(0, idx + 1);
    conv.updatedAt = Date.now();
    saveState();
    renderAll();
    scrollBottom();
    runAssistant(conv);
  };

  ta.addEventListener('input', () => autoGrow(ta));
  ta.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); finish(true); }
  });
  box.querySelector('.save-edit').addEventListener('click', () => finish(true));
  box.querySelector('.cancel-edit').addEventListener('click', () => finish(false));
}

/* ---------- Xoá tin nhắn (có hoàn tác) ---------- */
function deleteMsg(msgId) {
  const conv = findConv(state.currentId);
  if (!conv) return;
  const idx = conv.messages.findIndex(x => x.id === msgId);
  if (idx < 0) return;
  const copy = conv.messages[idx];
  conv.messages.splice(idx, 1);
  conv.updatedAt = Date.now();
  saveState();
  renderMessages();
  renderSidebar();

  showToast('Đã xoá tin nhắn', 'info', {
    label: 'Hoàn tác',
    run: () => {
      conv.messages.splice(idx, 0, copy);
      saveState();
      renderMessages();
      renderSidebar();
      showToast('Đã khôi phục tin nhắn');
    }
  });
}

/* ---------- Bản nháp riêng cho từng hội thoại ---------- */
function saveDraft() {
  const ta = $('input');
  const conv = findConv(state.currentId);
  if (!ta || !conv) return;
  conv.draft = ta.value;
  saveLazy(500);
}

function restoreDraft() {
  const ta = $('input');
  const conv = findConv(state.currentId);
  if (!ta) return;
  ta.value = conv ? (conv.draft || '') : '';
  autoResize();
  updateCounter();
}

/* ---------- Gửi tin nhắn ---------- */
async function sendMessage(textOverride) {
  if (streaming) return;
  const ta = $('input');
  const conv = currentConv();
  const att = normAtt(conv.att);                       // ảnh/tệp đang chờ gửi
  const typed = (textOverride != null ? String(textOverride) : (ta ? ta.value : '')).trim();
  const text = typed || (att ? ATT_DEFAULT_PROMPT : '');   // chỉ đính kèm → dùng câu lệnh mặc định
  if (!text) { if (ta) ta.focus(); return; }

  const first = visibleMessages(conv).length === 0;
  addMessage(conv, 'user', text, att ? { att: att } : null);
  if (first) conv.title = autoTitle(typed || attTitle(att) || text);
  conv.draft = '';
  conv.att = null;                                     // đã gửi → dải đính kèm trống

  if (textOverride == null && ta) {
    ta.value = '';
    autoResize();
    updateCounter();
  }

  saveState();
  renderAll();
  scrollBottom();
  await runAssistant(conv);
}

/* ---------- Nhận câu trả lời (hiện chữ dần) ---------- */
function paintStream() {
  const st = streamState;
  if (!st || st.raf) return;
  st.raf = requestAnimationFrame(() => {
    const s = streamState;
    if (!s) return;
    s.raf = 0;

    const el = document.getElementById('m-' + s.msgId);
    if (!el) return;

    const bubble = el.querySelector('.bubble');
    if (bubble) bubble.innerHTML = formatMsg(s.text);

    if (s.reason) {
      const det = el.querySelector('details.think');
      const body = el.querySelector('.think-body');
      if (det) det.hidden = false;
      if (body) body.textContent = s.reason;
    }

    if (nearBottom(180)) scrollBottom();
    updateFab();
  });
}

async function runAssistant(conv) {
  streaming = true;
  setStreamingUI(true);
  clearSpeaking();
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();

  const msg = addMessage(conv, 'assistant', '');
  saveState();
  renderMessages();
  scrollBottom();

  const el = document.getElementById('m-' + msg.id);
  if (el) {
    el.classList.add('streaming');
    addGhost(el.querySelector('.bubble'));
  }

  streamState = { convId: conv.id, msgId: msg.id, text: '', reason: '', raf: 0 };
  streamCtl = new AbortController();

  let result = null;
  let failure = null;
  try {
    result = await streamReply(conv, {
      onDelta: full => { if (streamState) { streamState.text = full; paintStream(); } },
      onReason: full => { if (streamState) { streamState.reason = full; paintStream(); } },
      signal: streamCtl.signal
    });
  } catch (e) {
    failure = e;
  }

  // Lỗi khi chưa nhận được chữ nào (và không phải người dùng dừng) → thử lại
  // một lần bằng chế độ không streaming để câu trả lời vẫn tới được.
  const gotNothing = !(streamState && streamState.text);
  let skipImages = false;

  // Bản 3.1: model/máy chủ có thể từ chối phần ảnh → gửi lại chỉ kèm mô tả ảnh.
  // Bản 3.2: thường không tới đây nữa vì aiModelFor() đã gửi qua model đọc ảnh.
  if (failure && failure.name !== 'AbortError' && gotNothing && convHasImages(conv)) {
    skipImages = true;
    try {
      if (streamState) { streamState.text = ''; streamState.reason = ''; }
      const again = await streamReply(conv, {
        onDelta: full => { if (streamState) { streamState.text = full; paintStream(); } },
        onReason: full => { if (streamState) { streamState.reason = full; paintStream(); } },
        signal: streamCtl.signal
      }, true);
      if (again && again.text) {
        result = again;
        failure = null;
        showToast('Model không nhận ảnh — đã gửi lại kèm mô tả ảnh', 'info');
      }
    } catch (e2) {
      failure = e2;
    }
  }

  if (failure && failure.name !== 'AbortError' && !(streamState && streamState.text)) {
    try {
      const whole = await callOpenAI(conv, skipImages);
      if (whole && whole.indexOf('(không có phản hồi)') < 0) {
        result = { text: whole, reasoning: '' };
        failure = null;
      }
    } catch (e2) {
      failure = e2;
    }
  }

  finishStream(conv, msg, result, failure);
}

function finishStream(conv, msg, result, failure) {
  if (msg.id === finalizedMsgId) return;      // đã chốt trước đó → bỏ qua
  finalizedMsgId = msg.id;

  const st = streamState || { text: '', reason: '' };
  const stopped = !!(failure && failure.name === 'AbortError');
  let text = (result && result.text) ? result.text : st.text;
  const reason = (result && result.reason) ? result.reason : st.reason;

  if (stopped) {
    if (!text) text = '_Đã dừng trước khi có nội dung._';
    showToast('Đã dừng tạo câu trả lời', 'info');
  } else if (failure) {
    const note = '⚠️ **Không gửi được tin nhắn.**\n\n`' + String(failure.message || failure) + '`';
    text = text ? text + '\n\n' + note : note;
    showToast('Lỗi kết nối tới máy chủ AI', 'err');
  } else if (!text) {
    text = '⚠️ **Máy chủ không trả về nội dung.** Hãy thử gửi lại.';
  }

  msg.content = text;
  msg.reasoning = reason || '';
  msg.ts = Date.now();
  conv.updatedAt = msg.ts;
  saveState();

  streamState = null;
  streamCtl = null;
  streaming = false;
  setStreamingUI(false);
  renderMessages();
  renderSidebar();
  if (nearBottom(220)) scrollBottom();
  updateFab();
  const ta = $('input');
  if (ta) ta.focus();
}

/* Dừng tạo câu trả lời. Nếu máy chủ không phản hồi việc huỷ bỏ,
   đồng hồ an toàn sẽ tự chốt phần nội dung đã nhận sau 400ms. */
function stopStream() {
  if (!streamCtl) return;
  streamCtl.abort();

  const st = streamState;
  if (!st) return;
  setTimeout(() => {
    if (streamState !== st) return;                 // đã kết thúc bình thường
    const conv = findConv(st.convId);
    const msg = conv ? conv.messages.find(m => m.id === st.msgId) : null;
    if (!conv || !msg) return;
    const e = new Error('aborted');
    e.name = 'AbortError';
    finishStream(conv, msg, { text: st.text, reasoning: st.reason }, e);
  }, 400);
}

/* ---------- Tạo lại câu trả lời ---------- */
function regenerate() {
  if (streaming) { showToast('Đang trả lời… hãy dừng lại trước', 'err'); return; }
  const conv = findConv(state.currentId);
  if (!conv) return;

  let i = conv.messages.length - 1;
  while (i >= 0 && conv.messages[i].role === 'assistant') i--;
  if (i < 0) { showToast('Chưa có tin nhắn nào để tạo lại', 'err'); return; }
  if (conv.messages[i].role !== 'user') { showToast('Hãy gửi một tin nhắn trước', 'err'); return; }

  conv.messages = conv.messages.slice(0, i + 1);
  conv.updatedAt = Date.now();
  saveState();
  renderAll();
  scrollBottom();
  runAssistant(conv);
}

/* ---------- Xoá tin nhắn của hội thoại hiện tại ---------- */
function clearCurrent() {
  if (streaming) { showToast('Đang trả lời — hãy dừng lại trước', 'err'); return; }
  const conv = findConv(state.currentId);
  const hasAtt = !!normAtt(conv && conv.att);
  if (!conv || (!visibleMessages(conv).length && !hasAtt)) {
    showToast('Không có tin nhắn để xoá', 'err');
    return;
  }
  if (visibleMessages(conv).length &&
      !window.confirm('Xoá toàn bộ tin nhắn trong cuộc trò chuyện này?')) return;

  conv.messages = [];
  conv.title = 'Chat mới';
  conv.draft = '';
  conv.att = null;
  conv.updatedAt = Date.now();
  saveState();
  renderAll();
  restoreDraft();
  scrollBottom();
  showToast('Đã xoá tin nhắn');
}

/* ---------- Tạo hội thoại mới ---------- */
function startNewChat() {
  if (streaming) { showToast('Đang trả lời — hãy dừng lại trước', 'err'); return; }
  const conv = findConv(state.currentId);
  if (conv && !visibleMessages(conv).length) {
    closeSidebarOnMobile();
    $('input').focus();
    return;
  }
  newConv();
  renderAll();
  restoreDraft();
  scrollBottom();
  updateFab();
  closeSidebarOnMobile();
  $('input').focus();
}

/* ---------- Xuất hội thoại ---------- */
function downloadFile(name, text, mime) {
  const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function exportFileName(conv) {
  const base = String(conv.title || 'bong-x').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
  return (base.slice(0, 40) || 'bong-x');
}

function exportConv(kind) {
  const conv = findConv(state.currentId);
  const items = visibleMessages(conv);
  if (!conv || !items.length) { showToast('Chưa có nội dung để xuất', 'err'); return; }

  if (kind === 'json') {
    const data = {
      title: conv.title,
      exportedAt: new Date().toISOString(),
      messages: items.map(m => ({
        role: m.role,
        content: m.content,
        reasoning: m.reasoning || undefined,
        edited: m.edited || undefined,
        ts: m.ts,
        att: attForExport(m.att)
      }))
    };
    downloadFile(exportFileName(conv) + '.json', JSON.stringify(data, null, 2), 'application/json;charset=utf-8');
    showToast('Đã xuất hội thoại ra file .json');
    return;
  }

  const lines = [
    '# ' + (conv.title || 'Hội thoại Bóng X'),
    '',
    '_Xuất lúc ' + new Date().toLocaleString('vi-VN') + ' • ' +
      items.length + ' tin nhắn • ' +
      convWordCount(conv).toLocaleString('vi-VN') + ' từ_',
    '',
    '---',
    ''
  ];
  items.forEach(m => {
    lines.push(m.role === 'user' ? '### 🧑 Bạn' : '### 🤖 Bóng X');
    lines.push('');
    const note = attPlainNote(m.att);
    if (note) lines.push('> ' + note, '');
    const fa = findAtt(m.att).files;
    fa.forEach(f => {                                  // nội dung tệp đính kèm
      lines.push('**📎 ' + f.name + '** (' + fmtBytes(f.size) + ')', '');
      lines.push('```' + (f.ext || ''), String(f.text || ''), '```', '');
    });
    lines.push(m.content, '');
  });

  downloadFile(exportFileName(conv) + '.md', lines.join('\n'), 'text/markdown;charset=utf-8');
  showToast('Đã xuất hội thoại ra file .md');
}

/* ---------- Xoá toàn bộ dữ liệu ---------- */
function wipeAllData() {
  if (streaming) { showToast('Đang trả lời — hãy dừng lại trước', 'err'); return; }
  if (!state.convs.length) { showToast('Không có dữ liệu để xoá', 'err'); return; }
  if (!window.confirm('Xoá TẤT CẢ cuộc trò chuyện (' + state.convs.length +
      ')? Hành động này không thể hoàn tác.')) return;

  wipeAll();
  renderAll();
  restoreDraft();
  scrollBottom();
  updateFab();
  showToast('Đã xoá toàn bộ cuộc trò chuyện');
}

/* ---------- Nhảy tới một tin nhắn (bảng lệnh) ---------- */
function jumpToMessage(convId, msgId) {
  if (streaming) stopStream();
  state.currentId = convId;
  saveNow();
  renderAll();
  restoreDraft();
  closeSidebarOnMobile();
  setTimeout(() => scrollToMsg(msgId), 60);
}

/* ================= Bản 3.0 =================
   Chip model / vai trò, bộ chọn, bảng cài đặt & dữ liệu            */

function num(n) {
  return Number(n || 0).toLocaleString('vi-VN');
}

function shortModel(id) {
  const s = String(id || '');
  return s.length > 26 ? s.slice(0, 25) + '…' : s;
}

/* Đồng bộ chip trong khung nhập, ghim ở thanh bên và bảng cài đặt */
function renderChips() {
  const conv = findConv(state.currentId);
  const per = personaOf(conv);
  const model = modelOf(conv);

  const pIco = $('personaChipIco');
  const pTxt = $('personaChipTxt');
  const pBtn = $('personaChip');
  if (pIco) pIco.textContent = per.ico;
  if (pTxt) pTxt.textContent = per.name;
  if (pBtn) {
    pBtn.classList.toggle('own', !!(conv && conv.persona));
    pBtn.title = 'Vai trò: ' + per.name + ' — ' + per.sub +
      (conv && conv.persona ? ' (riêng hội thoại này)' : ' (theo cài đặt chung)') +
      '. Bấm để đổi, hoặc gõ /vaitro';
  }

  const mTxt = $('modelChipTxt');
  const mBtn = $('modelChip');
  if (mTxt) mTxt.textContent = shortModel(model);
  if (mBtn) {
    mBtn.classList.toggle('own', !!(conv && conv.model));
    mBtn.title = 'Model: ' + model +
      (conv && conv.model ? ' (riêng hội thoại này)' : ' (theo cài đặt chung)') +
      '. Bấm để đổi, hoặc gõ /model';
  }

  const pillTxt = $('modePillTxt');
  const pill = $('modePill');
  if (pillTxt) pillTxt.textContent = shortModel(model);
  if (pill) pill.title = 'Model đang dùng: ' + model + ' — bấm để đổi';

  const setM = $('pickModelBtn');
  const setP = $('pickPersonaBtn');
  const defPer = findPersona(getSetting('persona'));
  if (setM) setM.textContent = shortModel(getSetting('model')) + '  ▾';
  if (setP) setP.textContent = defPer.ico + ' ' + defPer.name + '  ▾';

  const apiIn = $('apiKeyInput');
  if (apiIn && document.activeElement !== apiIn) apiIn.value = maskKey(getApiKey());
}

/* ---------- Bộ chọn dùng chung (model / vai trò) ---------- */
let pickerKind = '';
let pickerFilter = '';
let pickerSel = 0;
let pickerRows = [];
let pkSearch = null;

function pickerRowsFor(kind) {
  const conv = findConv(state.currentId);
  if (kind === 'model' || kind === 'dmodel') {
    const cur = kind === 'dmodel' ? getSetting('model') : modelOf(conv);
    const rows = [{ key: '__load__', ico: '🔄', label: 'Nạp danh sách model từ máy chủ',
      sub: 'GET /v1/models — cần kết nối mạng' }];
    availableModels().forEach(m => {
      if (isBlockedModel(m)) return;              // bản 3.2: ẩn model không dùng được
      rows.push({
        key: m, ico: m === cur ? '✅' : '🧩', label: m,
        sub: m === cur ? 'Đang dùng' : (kind === 'dmodel' ? 'Đặt làm mặc định' : 'Dùng cho hội thoại này')
      });
    });
    return rows;
  }
  const cur = kind === 'dpersona' ? getSetting('persona') : ((conv && conv.persona) || getSetting('persona'));
  return PERSONAS.map(p => ({
    key: p.id, ico: p.id === cur ? '✅' : p.ico, label: p.name,
    sub: p.sub + (p.prompt ? '' : ' • không gửi system prompt')
  }));
}

function renderPicker() {
  const list = $('pickerList');
  if (!list) return;
  const fq = foldText(pickerFilter.trim());
  const all = pickerRowsFor(pickerKind);
  pickerRows = fq
    ? all.filter(r => r.key === '__load__' || fuzzyScore(r.label + ' ' + r.sub, fq) >= 0)
    : all;

  if (!pickerRows.length) {
    list.innerHTML = '<div class="pk-empty">Không có lựa chọn phù hợp.</div>';
    return;
  }
  if (pickerSel >= pickerRows.length) pickerSel = 0;

  let html = '';
  pickerRows.forEach((r, i) => {
    html += '<button class="pk-item' + (i === pickerSel ? ' sel' : '') + '" type="button" data-i="' + i + '">' +
      '<span class="pk-ico">' + r.ico + '</span>' +
      '<span class="pk-main"><span class="pk-title">' + escapeHtml(r.label) + '</span>' +
      (r.sub ? '<span class="pk-sub">' + escapeHtml(r.sub) + '</span>' : '') + '</span>' +
    '</button>';
  });
  list.innerHTML = html;
  const cnt = $('pickerCount');
  if (cnt) cnt.textContent = pickerRows.length + ' mục';
  const sel = list.querySelector('.pk-item.sel');
  if (sel) sel.scrollIntoView({ block: 'nearest' });
}

function ensurePickerSearch() {
  if (pkSearch) return pkSearch;
  const list = $('pickerList');
  const box = list ? list.parentNode : null;
  if (!box) return null;
  const wrap = document.createElement('div');
  wrap.className = 'pk-search';
  wrap.innerHTML = '<span>🔎</span>' +
    '<input id="pickerSearch" type="text" autocomplete="off" spellcheck="false" placeholder="Lọc theo tên…">' +
    '<span class="pk-count" id="pickerCount"></span>';
  box.insertBefore(wrap, list);
  pkSearch = $('pickerSearch');
  if (pkSearch) {
    pkSearch.addEventListener('input', () => { pickerFilter = pkSearch.value; pickerSel = 0; renderPicker(); });
    pkSearch.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'ArrowDown') { e.preventDefault(); movePicker(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); movePicker(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); choosePicker(pickerRows[pickerSel]); }
      else if (e.key === 'Escape') { e.preventDefault(); closePicker(); }
    });
  }
  return pkSearch;
}

function movePicker(step) {
  if (!pickerRows.length) return;
  pickerSel = (pickerSel + step + pickerRows.length) % pickerRows.length;
  renderPicker();
}

function pickerHead(node) {
  const icon = document.querySelector('.modal-box.picker-box .modal-ico');
  const title = $('pickerTitle');
  if (icon) icon.textContent = node.ico || '🧩';
  if (title) title.textContent = node.title || 'Chọn';
}

function openPicker(kind) {
  const box = $('picker');
  if (!box) return;
  pickerKind = kind;
  pickerFilter = '';
  pickerSel = 0;
  const titles = {
    model:    { ico: '🧩', title: 'Model cho hội thoại này' },
    dmodel:   { ico: '🧩', title: 'Model mặc định' },
    persona:  { ico: '🎭', title: 'Vai trò cho hội thoại này' },
    dpersona: { ico: '🎭', title: 'Vai trò mặc định' }
  };
  pickerHead(titles[kind] || { ico: '🧩', title: 'Chọn' });
  box.hidden = false;
  requestAnimationFrame(() => box.classList.add('show'));
  const s = ensurePickerSearch();
  if (s) {
    s.value = '';
    s.placeholder = (kind === 'model' || kind === 'dmodel') ? 'Lọc model…' : 'Lọc vai trò…';
  }
  renderPicker();
  if (s) s.focus();
}

function closePicker() {
  const box = $('picker');
  if (!box) return;
  box.classList.remove('show');
  setTimeout(() => { if (!box.classList.contains('show')) box.hidden = true; }, 180);
}

async function loadModelList() {
  showToast('Đang nạp danh sách model…', 'info');
  try {
    const ids = await fetchModels();
    setModelList(ids);
    renderPicker();
    renderChips();
    showToast('Đã nạp ' + ids.length + ' model từ máy chủ');
  } catch (e) {
    showToast('Không nạp được danh sách model: ' + (e && e.message ? e.message : e), 'err');
  }
}

function choosePicker(row) {
  if (!row) return;
  if (row.key === '__load__') { loadModelList(); return; }

  const conv = findConv(state.currentId);
  if (pickerKind === 'model') {
    if (!conv) return;
    conv.model = row.key === getSetting('model') ? '' : row.key;
    conv.updatedAt = Date.now();
    saveNow();
    renderChips();
    showToast(conv.model ? 'Hội thoại này dùng model: ' + conv.model : 'Đã trở về model mặc định');
  } else if (pickerKind === 'dmodel') {
    setSetting('model', row.key);
    renderChips();
    showToast('Model mặc định: ' + row.key);
  } else if (pickerKind === 'persona') {
    if (!conv) return;
    conv.persona = row.key === getSetting('persona') ? '' : row.key;
    conv.updatedAt = Date.now();
    saveNow();
    renderChips();
    showToast('Vai trò: ' + findPersona(conv.persona || getSetting('persona')).name);
  } else if (pickerKind === 'dpersona') {
    setSetting('persona', row.key);
    renderChips();
    showToast('Vai trò mặc định: ' + findPersona(row.key).name);
  }
  closePicker();
  const st = $('settings');
  if (st && !st.hidden) renderSettings();
}

/* ---------- Khoá API riêng (bản 3.2) ---------- */
function maskKey(k) {
  const s = String(k || '');
  if (!s) return '';
  if (s.length <= 8) return '••••••••';
  return s.slice(0, 4) + '••••••••' + s.slice(-4);
}

function saveApiKeyFromSettings() {
  const inp = $('apiKeyInput');
  if (!inp) return;
  const cur = getApiKey();
  const val = String(inp.value || '').trim();
  if (val === maskKey(cur)) return;                 // chưa sửa gì
  setApiKey(val);
  if (val) showToast('Đã lưu khoá API riêng cho trình duyệt này');
  else showToast('Đã xoá khoá riêng — dùng lại khoá chung');
  inp.value = maskKey(getApiKey());
  inp.blur();
}

/* ---------- Bảng cài đặt & dữ liệu ---------- */
function openSettings() {
  const box = $('settings');
  if (!box) return;
  box.hidden = false;
  requestAnimationFrame(() => box.classList.add('show'));
  renderSettings();
}

function closeSettings() {
  const box = $('settings');
  if (!box) return;
  box.classList.remove('show');
  setTimeout(() => { if (!box.classList.contains('show')) box.hidden = true; }, 180);
}

function renderStats() {
  const box = $('statsGrid');
  if (!box) return;
  const st = computeStats();
  const date = ts => ts ? new Date(ts).toLocaleDateString('vi-VN') : '—';
  const tiles = [
    { k: 'Hội thoại', v: num(st.convs) + (st.pinned ? ' (📌 ' + num(st.pinned) + ')' : '') },
    { k: 'Tin nhắn', v: num(st.msgs) },
    { k: 'Hỏi / đáp', v: num(st.user) + ' / ' + num(st.bot) },
    { k: 'Số từ', v: num(st.words) },
    { k: 'Ký tự', v: num(st.chars) },
    { k: 'Khối mã', v: num(st.codeBlocks) },
    { k: 'Ảnh đính kèm', v: num(st.images) },
    { k: 'Tệp đính kèm', v: num(st.files) },
    { k: 'Dữ liệu đính kèm', v: st.attText },
    { k: 'Suy luận', v: num(st.thinkChars) + ' ký tự' },
    { k: 'Dung lượng lưu', v: st.sizeText },
    { k: 'Cũ nhất', v: date(st.oldest) },
    { k: 'Mới nhất', v: date(st.newest) }
  ];
  box.innerHTML = tiles.map(t =>
    '<div class="stat"><span class="stat-k">' + escapeHtml(t.k) + '</span>' +
    '<span class="stat-v">' + escapeHtml(String(t.v)) + '</span></div>'
  ).join('');
}

function renderSettings() {
  const curTheme = loadThemeMode();
  const curDensity = loadDensity();
  const segT = $('segTheme');
  const segD = $('segDensity');
  if (segT) {
    segT.innerHTML = THEME_MODES.map(t =>
      '<button class="seg-btn' + (t.id === curTheme ? ' on' : '') + '" type="button" data-set="theme" data-v="' +
      t.id + '">' + t.ico + ' ' + escapeHtml(t.name) + '</button>').join('');
  }
  if (segD) {
    segD.innerHTML = DENSITIES.map(d =>
      '<button class="seg-btn' + (d.id === curDensity ? ' on' : '') + '" type="button" data-set="density" data-v="' +
      d.id + '">' + d.ico + ' ' + escapeHtml(d.name) + '</button>').join('');
  }
  renderChips();
  renderStats();

  const keys = $('keyList');
  if (keys) {
    const rows = [
      ['Bảng lệnh & tìm kiếm', SHORTCUTS.palette],
      ['Ẩn / hiện thanh bên', SHORTCUTS.sidebar],
      ['Chat mới', SHORTCUTS.newChat],
      ['Tìm trong hội thoại', SHORTCUTS.find],
      ['Cài đặt & dữ liệu', SHORTCUTS.settings],
      ['Sao lưu tất cả', SHORTCUTS.backup],
      ['Nhảy giữa các tin nhắn', SHORTCUTS.jumpMsg],
      ['Đổi model hội thoại', SHORTCUTS.model],
      ['Nhập bằng giọng nói', SHORTCUTS.mic],
      ['Xuất Markdown', SHORTCUTS.exportMd],
      ['Xoá tin nhắn hiện tại', SHORTCUTS.clear],
      ['Gõ / trong ô nhập', 'Mở lệnh nhanh']
    ];
    keys.innerHTML = rows.map(r =>
      '<div class="key-row"><span>' + escapeHtml(r[0]) + '</span><kbd class="kbd">' +
      escapeHtml(r[1]) + '</kbd></div>').join('');
  }
}

function applySegSetting(kind, value) {
  if (kind === 'theme') {
    const look = applyThemeMode(value);
    showToast('Chế độ: ' + ((THEME_MODES.find(t => t.id === value) || {}).name || value) + ' (' + look + ')');
  } else if (kind === 'density') {
    applyDensity(value);
    showToast('Mật độ: ' + ((DENSITIES.find(d => d.id === value) || {}).name || value));
  }
  renderSettings();
}

/* ---------- Sao lưu / khôi phục toàn bộ ---------- */
function backupAll() {
  const data = backupPayload();
  if (!data.convs.length) { showToast('Chưa có hội thoại để sao lưu', 'err'); return; }
  const name = 'bong-x-saoluu-' + new Date().toISOString().slice(0, 10) + '.json';
  downloadFile(name, JSON.stringify(data, null, 2), 'application/json;charset=utf-8');
  showToast('Đã sao lưu ' + data.convs.length + ' hội thoại ra file .json');
}

function askRestore() {
  const inp = $('importFile');
  if (!inp) { showToast('Không mở được hộp chọn tệp', 'err'); return; }
  inp.value = '';
  inp.click();
}

async function readImportFile(file) {
  if (!file) return;
  let text = '';
  try {
    text = await file.text();
  } catch (e) {
    try {
      text = await new Promise((ok, bad) => {
        const fr = new FileReader();
        fr.onload = () => ok(String(fr.result || ''));
        fr.onerror = bad;
        fr.readAsText(file, 'utf-8');
      });
    } catch (e2) { showToast('Không đọc được tệp sao lưu', 'err'); return; }
  }

  let obj = null;
  try { obj = JSON.parse(text); } catch (e) { showToast('Tệp không phải JSON hợp lệ', 'err'); return; }
  if (!obj || !Array.isArray(obj.convs)) { showToast('Tệp không đúng định dạng sao lưu của Bóng X', 'err'); return; }

  const replace = window.confirm(
    'Tệp có ' + obj.convs.length + ' hội thoại.\n\n' +
    'OK = THAY THẾ toàn bộ dữ liệu đang có\n' +
    'Cancel = GỘP vào dữ liệu đang có'
  );
  const r = importPayload(obj, replace ? 'replace' : 'merge');
  if (!r.ok) { showToast(r.error, 'err'); return; }

  renderAll();
  restoreDraft();
  scrollBottom();
  updateFab();
  renderSettings();
  showToast('Đã nhập ' + r.added + ' hội thoại' +
    (r.renamed ? ' (' + r.renamed + ' mã trùng đã đổi)' : ''));
}

/* ---------- Lệnh gõ nhanh trong ô nhập ("/") ---------- */
let slashOpen = false;
let slashItems = [];
let slashSel = 0;

function slashMatches(q) {
  const fq = foldText(String(q || '').trim());
  const out = [];
  SLASH_COMMANDS.forEach((c, i) => {
    const score = fq ? fuzzyScore(c.key + ' ' + c.label, fq) : (1000 - i);
    if (score >= 0) out.push({ cmd: c, score: score });
  });
  out.sort((a, b) => b.score - a.score);
  return out.map(x => x.cmd).slice(0, 14);
}

function renderSlash() {
  const box = $('slashMenu');
  if (!box) return;
  if (!slashItems.length) {
    box.innerHTML = '<div class="slash-empty">Không có lệnh phù hợp.</div>';
    return;
  }
  box.innerHTML = slashItems.map((c, i) =>
    '<button class="slash-item' + (i === slashSel ? ' sel' : '') + '" type="button" data-i="' + i + '">' +
      '<span class="slash-ico">' + c.ico + '</span>' +
      '<span class="slash-main"><span class="slash-title">/' + escapeHtml(c.key) + ' — ' + escapeHtml(c.label) +
        '</span><span class="slash-sub">' + escapeHtml(c.sub || '') + '</span></span>' +
      (c.act ? '<span class="slash-tag">hành động</span>' : '') +
    '</button>'
  ).join('');
  const sel = box.querySelector('.slash-item.sel');
  if (sel) sel.scrollIntoView({ block: 'nearest' });
}

function openSlashMenu(query) {
  const box = $('slashMenu');
  if (!box) return;
  slashItems = slashMatches(query);
  slashSel = 0;
  slashOpen = true;
  box.hidden = false;
  renderSlash();
}

function closeSlashMenu() {
  const box = $('slashMenu');
  if (!box) return;
  slashOpen = false;
  box.hidden = true;
  box.innerHTML = '';
}

/* Nội dung gõ vào có phải đang gọi lệnh nhanh? → trả về phần truy vấn */
function slashQuery(ta) {
  const m = String(ta.value).match(/^\/([^\n]*)$/);
  return m ? m[1] : null;
}

function moveSlash(step) {
  if (!slashItems.length) return;
  slashSel = (slashSel + step + slashItems.length) % slashItems.length;
  renderSlash();
}

function chooseSlash(cmd) {
  const ta = $('input');
  if (!cmd) return;
  closeSlashMenu();

  if (cmd.act) { runPaletteCommand(cmd.act); return; }
  if (!ta) return;

  ta.value = cmd.insert || '';
  const at = ta.value.indexOf('\n\n');
  autoResize();
  updateCounter();
  saveDraft();
  ta.focus();
  const pos = at >= 0 ? at + 2 : ta.value.length;
  try { ta.setSelectionRange(pos, pos); } catch (e) { /* bỏ qua */ }
}

/* ---------- Tìm trong hội thoại (Ctrl + F) ---------- */
let findHits = [];
let findSel = -1;

function clearFindMarks() {
  const marks = document.querySelectorAll('mark.find-mark');
  for (let i = 0; i < marks.length; i++) {
    const m = marks[i];
    const p = m.parentNode;
    if (!p) continue;
    p.replaceChild(document.createTextNode(m.textContent || ''), m);
    p.normalize();
  }
}

/* Mọi vị trí khớp trong các tin nhắn đang hiển thị (bỏ dấu vẫn tìm được) */
function collectFindHits(q) {
  const conv = findConv(state.currentId);
  const hits = [];
  if (!conv || !q) return hits;

  visibleMessages(conv).forEach(m => {
    const el = document.getElementById('m-' + m.id);
    const bubble = el ? el.querySelector('.bubble') : null;
    if (!bubble) return;
    const walker = document.createTreeWalker(bubble, NodeFilter.SHOW_TEXT, null);
    let off = 0;
    let node;
    while ((node = walker.nextNode())) {
      const txt = node.nodeValue || '';
      const folded = foldText(txt);
      if (folded.length === txt.length) {           // giữ đúng vị trí ký tự
        let from = 0;
        let i;
        while ((i = folded.indexOf(q, from)) >= 0) {
          hits.push({ msgId: m.id, off: off + i, len: q.length });
          from = i + q.length;
        }
      }
      off += txt.length;
    }
  });
  return hits;
}

/* Bọc đoạn khớp trong một nút văn bản thành <mark class="find-mark"> */
function markRange(root, off, len) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  let acc = 0;
  let n;
  while ((n = walker.nextNode())) {
    const t = n.nodeValue || '';
    const start = acc;
    const end = acc + t.length;
    if (off >= start && off + len <= end) {
      const rel = off - start;
      const mark = document.createElement('mark');
      mark.className = 'find-mark';
      mark.textContent = t.slice(rel, rel + len);
      const p = n.parentNode;
      if (!p) return false;
      p.insertBefore(document.createTextNode(t.slice(0, rel)), n);
      p.insertBefore(mark, n);
      p.insertBefore(document.createTextNode(t.slice(rel + len)), n);
      p.removeChild(n);
      return true;
    }
    acc = end;
  }
  return false;
}

function updateFindCount() {
  const el = $('findCount');
  if (!el) return;
  el.textContent = findHits.length ? (findSel + 1) + '/' + findHits.length : '0/0';
}

function gotoFind(i) {
  if (!findHits.length) { findSel = -1; updateFindCount(); return; }
  findSel = ((i % findHits.length) + findHits.length) % findHits.length;
  clearFindMarks();

  const h = findHits[findSel];
  const el = document.getElementById('m-' + h.msgId);
  const bubble = el ? el.querySelector('.bubble') : null;
  if (bubble) markRange(bubble, h.off, h.len);
  if (el) {
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 1500);
  }
  updateFindCount();
}

function runFind(keepIndex) {
  const inp = $('findInput');
  const q = foldText(String(inp ? inp.value : '').trim());
  const keep = keepIndex && findHits.length ? Math.min(findSel, findHits.length - 1) : 0;
  clearFindMarks();
  findHits = collectFindHits(q);
  findSel = -1;
  updateFindCount();
  if (findHits.length) gotoFind(keep);
}

function openFind() {
  const bar = $('findBar');
  const inp = $('findInput');
  if (!bar || !inp) return;
  if (bar.hidden) {
    const ta = $('input');
    let seed = '';
    const sel = window.getSelection ? String(window.getSelection().toString() || '') : '';
    if (sel && sel.length <= 80) seed = sel;
    else if (ta && ta.selectionStart !== ta.selectionEnd) {
      seed = ta.value.slice(ta.selectionStart, ta.selectionEnd).slice(0, 80);
    }
    if (seed) inp.value = seed.trim();
  }
  bar.hidden = false;
  inp.focus();
  inp.select();
  runFind(false);
}

function closeFind() {
  const bar = $('findBar');
  const inp = $('findInput');
  clearFindMarks();
  findHits = [];
  findSel = -1;
  updateFindCount();
  if (bar) bar.hidden = true;
  if (inp) inp.value = '';
  const ta = $('input');
  if (ta) ta.focus();
}

function findStep(step) {
  if (!findHits.length) { runFind(false); return; }
  gotoFind(findSel + step);
}

/* ---------- Nhập bằng giọng nói (Web Speech API) ---------- */
let micRec = null;
let micOn = false;
let micBase = '';

function micSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

function micStopUI() {
  micOn = false;
  const btn = $('micBtn');
  if (btn) {
    btn.classList.remove('on');
    btn.setAttribute('aria-pressed', 'false');
  }
}

function setMicText(text) {
  const ta = $('input');
  if (!ta) return;
  const sep = micBase && !/\s$/.test(micBase) ? ' ' : '';
  ta.value = micBase + sep + text;
  autoResize();
  updateCounter();
  saveDraft();
  ta.focus();
}

function toggleMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { showToast('Trình duyệt không hỗ trợ nhập bằng giọng nói', 'err'); return; }

  if (micOn) {
    try { if (micRec) micRec.stop(); } catch (e) { /* bỏ qua */ }
    micStopUI();
    showToast('Đã tắt micro', 'info');
    return;
  }

  const ta = $('input');
  micBase = ta ? ta.value : '';
  micRec = new SR();
  micRec.lang = 'vi-VN';
  micRec.continuous = true;
  micRec.interimResults = true;

  micRec.onresult = ev => {
    let text = '';
    for (let i = 0; i < ev.results.length; i++) text += ev.results[i][0].transcript;
    setMicText(text);
  };
  micRec.onerror = ev => {
    const code = (ev && ev.error) || 'lỗi';
    showToast(code === 'not-allowed' ? 'Bạn cần cho phép dùng micro cho trang này' :
      'Lỗi nhập giọng nói: ' + code, 'err');
    micStopUI();
  };
  micRec.onend = micStopUI;

  try {
    micRec.start();
    micOn = true;
    const btn = $('micBtn');
    if (btn) { btn.classList.add('on'); btn.setAttribute('aria-pressed', 'true'); }
    showToast('Đang nghe… hãy nói vào micro', 'info');
  } catch (e) {
    showToast('Không bật được micro', 'err');
    micStopUI();
  }
}

/* ---------- Khối mã: xuống dòng & tải về ---------- */
function codeLangOf(block) {
  const el = block.querySelector('.code-head .lang');
  return el ? String(el.textContent || '').trim().toLowerCase() : '';
}

function codeFileNameOf(block) {
  const lang = codeLangOf(block);
  const ext = CODE_EXT[lang] || 'txt';
  const list = block.parentNode ? block.parentNode.querySelectorAll('.code-block') : [];
  let n = 1;
  for (let i = 0; i < list.length; i++) if (list[i] === block) { n = i + 1; break; }
  const safe = (lang || 'code').replace(/[^\w.+-]+/g, '-').replace(/^-+|-+$/g, '') || 'code';
  return 'bong-x-' + safe + '-' + n + '.' + ext;
}

function downloadCodeBlock(block) {
  const code = block.querySelector('pre code');
  if (!code) return;
  downloadFile(codeFileNameOf(block), code.textContent || '', 'text/plain;charset=utf-8');
  showToast('Đã tải khối mã về máy');
}

function toggleCodeWrap(block, btn) {
  const on = block.classList.toggle('wrap');
  if (btn) {
    btn.textContent = on ? 'Không xuống dòng' : 'Xuống dòng';
    btn.classList.toggle('on', on);
  }
  showToast(on ? 'Khối mã: bật xuống dòng' : 'Khối mã: tắt xuống dòng', 'info');
}

/* ---------- Nhảy giữa các tin nhắn (Alt + ↑ / ↓) ---------- */
function jumpMsg(dir) {
  const list = $('msgList');
  const box = $('msgs');
  if (!list || !box) return;
  const items = Array.prototype.slice.call(list.querySelectorAll('.msg'));
  if (items.length < 2) { showToast('Hội thoại chưa có đủ tin nhắn để nhảy', 'err'); return; }

  const boxRect = box.getBoundingClientRect();
  const mid = boxRect.top + boxRect.height / 2;
  let idx = 0;
  let best = Infinity;
  items.forEach((el, i) => {
    const r = el.getBoundingClientRect();
    const d = Math.abs((r.top + r.height / 2) - mid);
    if (d < best) { best = d; idx = i; }
  });
  const next = Math.min(items.length - 1, Math.max(0, idx + (dir > 0 ? 1 : -1)));
  const el = items[next];
  if (el && el.dataset.mid) scrollToMsg(el.dataset.mid);
}













/* ================= Bản 3.1 =================
   Đính kèm ảnh & tệp để AI phân tích           */

/* ---------- Trạng thái đính kèm đang chờ gửi ---------- */
function attPending() {
  const conv = findConv(state.currentId);
  return conv ? findAtt(conv.att) : { images: [], files: [] };
}

function setAttPending(att) {
  const conv = findConv(state.currentId);
  if (!conv) return;
  conv.att = normAtt(att);          // null khi không còn gì
  saveLazy(400);
  renderAttach();
}

function attTotal() {
  const a = attPending();
  return a.images.length + a.files.length;
}

/* Tiêu đề hội thoại khi người dùng chỉ đính kèm mà không gõ yêu cầu */
function attTitle(att) {
  const names = attNames(att);
  if (!names.length) return '';
  const head = findAtt(att).images.length ? 'ảnh' : 'tệp';
  return 'Phân tích ' + head + ': ' + names.slice(0, 2).join(', ') +
    (names.length > 2 ? ' +' + (names.length - 2) : '');
}

/* Bản gọn để xuất JSON: chỉ kèm dữ liệu ảnh khi tổng dung lượng còn nhỏ */
function attForExport(att) {
  const a = findAtt(att);
  if (!a.images.length && !a.files.length) return undefined;
  const tooBig = attBytes({ images: a.images, files: [] }) > 3 * 1024 * 1024;
  return {
    images: a.images.map(im => ({
      name: im.name, w: im.w, h: im.h, size: im.size,
      url: tooBig ? undefined : im.url,
      note: tooBig ? 'bỏ dữ liệu ảnh vì file quá lớn' : undefined
    })),
    files: a.files.map(f => ({ name: f.name, ext: f.ext, size: f.size, cut: !!f.cut, text: f.text }))
  };
}

/* ---------- Nhận dạng & đọc tệp người dùng chọn ---------- */
function attFileKind(file) {
  const type = String((file && file.type) || '').toLowerCase();
  if (ATT_IMG_TYPES.indexOf(type) >= 0 || type.indexOf('image/') === 0) return 'image';
  if (type.indexOf('text/') === 0 || type === 'application/json' || type === 'application/xml') return 'file';
  const ext = extOfName(file && file.name);
  if (ATT_TEXT_EXT.indexOf(ext) >= 0) return 'file';
  return '';
}

function attReadText(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ''));
    fr.onerror = () => reject(new Error('read-error'));
    fr.readAsText(file, 'utf-8');
  });
}

function attReadDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ''));
    fr.onerror = () => reject(new Error('read-error'));
    fr.readAsDataURL(file);
  });
}

function attLoadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('decode-error'));
    img.src = url;
  });
}

/* Nén ảnh về cạnh dài tối đa ATT.imgEdge: payload nhỏ mà AI vẫn đọc rõ */
async function attMakeImage(file) {
  const raw = await attReadDataUrl(file);
  const img = await attLoadImage(raw);
  const w0 = img.naturalWidth || img.width || 0;
  const h0 = img.naturalHeight || img.height || 0;
  const isGif = String(file.type || '').toLowerCase() === 'image/gif';

  // Ảnh động: giữ nguyên để không mất chuyển động
  if (isGif && raw.length <= (ATT.imageMB * 1024 * 1024 * 4) / 3) {
    return { name: file.name || 'ảnh.gif', url: raw, w: w0, h: h0, size: file.size || Math.round(raw.length * 0.75) };
  }

  const edge = Math.max(w0 || ATT.imgEdge, h0 || ATT.imgEdge);
  const scale = Math.min(1, ATT.imgEdge / edge);
  const w = Math.max(1, Math.round((w0 || ATT.imgEdge) * scale));
  const h = Math.max(1, Math.round((h0 || ATT.imgEdge) * scale));

  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  if (!ctx) throw new Error('no-canvas');
  ctx.drawImage(img, 0, 0, w, h);

  let url = '';
  try { url = cv.toDataURL('image/jpeg', ATT.imgQuality); } catch (e) { url = raw; }
  return {
    name: file.name || 'ảnh.jpg',
    url: url,
    w: w, h: h,
    size: Math.round(url.length * 0.75)      // xấp xỉ số byte sau khi nén
  };
}

/* Đọc tệp văn bản, cắt bớt nếu quá dài */
async function attMakeFile(file) {
  const text = await attReadText(file);
  const cut = text.length > ATT.fileChars;
  return {
    name: file.name || 'tệp.txt',
    size: file.size || text.length,
    ext: extOfName(file.name),
    text: cut ? text.slice(0, ATT.fileChars) : text,
    cut: cut
  };
}

/* Thêm ảnh/tệp do người dùng chọn (nút, kéo–thả, dán, lệnh /anh /tep) */
async function attAddFiles(list) {
  const files = Array.prototype.slice.call(list || []);
  if (!files.length) return { added: 0, rejected: 0 };

  const a = attPending();
  const kept = { images: a.images.slice(), files: a.files.slice() };
  let added = 0, rejected = 0, firstErr = '';

  const fail = msg => {
    rejected++;
    if (!firstErr) firstErr = msg;
  };

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const kind = attFileKind(file);
    if (!kind) { fail('“' + file.name + '”: định dạng chưa hỗ trợ'); continue; }

    if (kind === 'image') {
      if (kept.images.length >= ATT.images) { fail('Tối đa ' + ATT.images + ' ảnh mỗi tin nhắn'); continue; }
      if (file.size > ATT.imageMB * 1024 * 1024) { fail('Ảnh “' + file.name + '” vượt ' + ATT.imageMB + ' MB'); continue; }
      try {
        kept.images.push(await attMakeImage(file));
        added++;
      } catch (e) {
        fail('Không đọc được ảnh “' + file.name + '”');
      }
      continue;
    }

    if (kept.files.length >= ATT.files) { fail('Tối đa ' + ATT.files + ' tệp mỗi tin nhắn'); continue; }
    if (file.size > ATT.fileMB * 1024 * 1024) { fail('Tệp “' + file.name + '” vượt ' + ATT.fileMB + ' MB'); continue; }
    try {
      kept.files.push(await attMakeFile(file));
      added++;
    } catch (e) {
      fail('Không đọc được tệp “' + file.name + '”');
    }
  }

  if (added) setAttPending(kept);
  if (rejected) {
    showToast(firstErr + (rejected > 1 ? ' (và ' + (rejected - 1) + ' mục khác)' : ''), 'err');
  } else if (added) {
    showToast('Đã thêm ' + added + ' đính kèm — gõ yêu cầu rồi gửi nhé', 'info');
  }
  return { added: added, rejected: rejected };
}

function attRemove(kind, index) {
  const a = attPending();
  const next = { images: a.images.slice(), files: a.files.slice() };
  if (kind === 'image') next.images.splice(index, 1);
  else next.files.splice(index, 1);
  setAttPending(next);
  showToast(kind === 'image' ? 'Đã bỏ ảnh khỏi đính kèm' : 'Đã bỏ tệp khỏi đính kèm', 'info');
}

function attClear(silent) {
  const conv = findConv(state.currentId);
  if (!conv || !normAtt(conv.att)) {
    if (!silent) showToast('Không có đính kèm nào đang chờ', 'info');
    return false;
  }
  conv.att = null;
  saveLazy(300);
  renderAttach();
  if (!silent) showToast('Đã bỏ mọi đính kèm');
  return true;
}

function attPickImage() {
  const inp = $('attImgInput');
  if (!inp) return;
  if (attPending().images.length >= ATT.images) {
    showToast('Đã đủ ' + ATT.images + ' ảnh cho tin nhắn này', 'err');
    return;
  }
  inp.value = '';                 // chọn lại đúng tệp vừa bỏ vẫn kích hoạt change
  inp.click();
}

function attPickFile() {
  const inp = $('attFileInput');
  if (!inp) return;
  if (attPending().files.length >= ATT.files) {
    showToast('Đã đủ ' + ATT.files + ' tệp cho tin nhắn này', 'err');
    return;
  }
  inp.value = '';
  inp.click();
}

/* ---------- Hiển thị ---------- */
function attIconOf(ext) {
  const e = String(ext || '').toLowerCase();
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'].indexOf(e) >= 0) return '🖼️';
  if (['json', 'csv', 'tsv', 'xml', 'yml', 'yaml'].indexOf(e) >= 0) return '🗂️';
  if (['md', 'markdown', 'txt', 'log', 'ini', 'toml', 'env'].indexOf(e) >= 0) return '📄';
  if (['js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'h', 'cpp', 'hpp', 'cs', 'php',
       'rb', 'go', 'rs', 'kt', 'swift', 'sql', 'sh', 'bat', 'ps1', 'html', 'htm', 'css'].indexOf(e) >= 0) return '💻';
  return '📎';
}

/* Khối đính kèm hiển thị phía trên bong bóng tin nhắn */
function attHtml(m) {
  const a = findAtt(m.att);
  if (!a.images.length && !a.files.length) return '';

  const imgs = a.images.map((im, i) =>
    '<img class="att-img" src="' + im.url + '" alt="' + escapeHtml(im.name) + '"' +
    ' data-kind="image" data-i="' + i + '" data-mid="' + m.id + '"' +
    ' title="' + escapeHtml(im.name) + ' — bấm để xem lớn">').join('');

  const files = a.files.map((f, i) =>
    '<button class="att-file" type="button" data-kind="file" data-i="' + i + '" data-mid="' + m.id + '"' +
      ' title="Xem nội dung tệp ' + escapeHtml(f.name) + '">' +
      '<span class="af-ico">' + attIconOf(f.ext) + '</span>' +
      '<span class="af-name">' + escapeHtml(f.name) + '</span>' +
      '<span class="af-sub">' + fmtBytes(f.size) + (f.cut ? ' · lược bớt' : '') + '</span>' +
    '</button>').join('');

  return '<div class="msg-atts">' + imgs + files + '</div>';
}

/* Dải xem trước ảnh/tệp đang chờ gửi phía trên ô nhập */
function renderAttach() {
  const strip = $('attachStrip');
  const list = $('attachList');
  const count = $('attachCount');
  const clearBtn = $('attClearBtn');
  if (!strip || !list) return;

  const a = attPending();
  const total = a.images.length + a.files.length;

  const imgBtn = $('attImgBtn');
  const fileBtn = $('attFileBtn');
  if (imgBtn) imgBtn.classList.toggle('on', a.images.length > 0);
  if (fileBtn) fileBtn.classList.toggle('on', a.files.length > 0);
  if (clearBtn) clearBtn.hidden = !total;

  strip.hidden = !total;
  if (!total) {
    list.innerHTML = '';
    if (count) count.textContent = '';
    return;
  }

  const bits = [];
  if (a.images.length) bits.push(a.images.length + ' ảnh');
  if (a.files.length) bits.push(a.files.length + ' tệp');
  if (count) count.textContent = bits.join(' + ') + ' • ' + fmtBytes(attBytes(a));

  const imgs = a.images.map((im, i) =>
    '<div class="att-item" title="' + escapeHtml(im.name) + '">' +
      '<img src="' + im.url + '" alt="' + escapeHtml(im.name) + '">' +
      '<span class="att-meta">' +
        '<span class="att-name">' + escapeHtml(im.name) + '</span>' +
        '<span class="att-sub">' + (im.w && im.h ? im.w + '×' + im.h + ' · ' : '') + fmtBytes(im.size) + '</span>' +
      '</span>' +
      '<button class="att-x" type="button" data-kind="image" data-i="' + i + '" title="Bỏ ảnh này">✕</button>' +
    '</div>').join('');

  const files = a.files.map((f, i) =>
    '<div class="att-item" title="' + escapeHtml(f.name) + '">' +
      '<span class="att-ico">' + attIconOf(f.ext) + '</span>' +
      '<span class="att-meta">' +
        '<span class="att-name">' + escapeHtml(f.name) + '</span>' +
        '<span class="att-sub">' + fmtBytes(f.size) + (f.cut ? ' · lược bớt' : '') + '</span>' +
      '</span>' +
      '<button class="att-x" type="button" data-kind="file" data-i="' + i + '" title="Bỏ tệp này">✕</button>' +
    '</div>').join('');

  list.innerHTML = imgs + files;
}

/* ---------- Xem ảnh / nội dung tệp (lightbox) ---------- */
let lbCtx = null;                      // { kind:'image'|'file', name, url, text }

function lightboxOpen() {
  const box = $('lightbox');
  return !!box && !box.hidden;
}

function openLightboxImage(url, name, info) {
  const box = $('lightbox');
  const img = $('lbImg');
  const pre = $('lbText');
  if (!box || !img) return;
  lbCtx = { kind: 'image', name: name || 'Ảnh đính kèm', url: url };
  img.hidden = false;
  img.src = url;
  if (pre) { pre.hidden = true; pre.textContent = ''; }
  if ($('lbIco')) $('lbIco').textContent = '🖼️';
  if ($('lbName')) $('lbName').textContent = lbCtx.name;
  if ($('lbInfo')) $('lbInfo').textContent = info || '';
  if ($('lbCopy')) $('lbCopy').hidden = true;
  box.hidden = false;
}

function openLightboxText(name, text, info) {
  const box = $('lightbox');
  const img = $('lbImg');
  const pre = $('lbText');
  if (!box || !pre) return;
  lbCtx = { kind: 'file', name: name || 'Tệp đính kèm', text: String(text || '') };
  pre.hidden = false;
  pre.textContent = lbCtx.text;
  if (img) { img.hidden = true; img.removeAttribute('src'); }
  if ($('lbIco')) $('lbIco').textContent = attIconOf(extOfName(name));
  if ($('lbName')) $('lbName').textContent = lbCtx.name;
  if ($('lbInfo')) $('lbInfo').textContent = info || (lbCtx.text.length.toLocaleString('vi-VN') + ' ký tự');
  if ($('lbCopy')) $('lbCopy').hidden = false;
  box.hidden = false;
}

function closeLightbox() {
  const box = $('lightbox');
  if (!box || box.hidden) return false;
  box.hidden = true;
  lbCtx = null;
  return true;
}

/* Mở một đính kèm của tin nhắn: ảnh → ảnh lớn, tệp → nội dung văn bản */
function openAttach(mid, kind, index) {
  const conv = findConv(state.currentId);
  const m = conv ? conv.messages.find(x => x.id === mid) : null;
  if (!m) return;
  const a = findAtt(m.att);

  if (kind === 'file') {
    const f = a.files[index];
    if (f) openLightboxText(f.name, f.text, fmtBytes(f.size) + (f.cut ? ' · đã lược bớt khi gửi' : ''));
    return;
  }
  const im = a.images[index];
  if (im) openLightboxImage(im.url, im.name, (im.w && im.h ? im.w + '×' + im.h + ' · ' : '') + fmtBytes(im.size));
}

function lightboxSave() {
  if (!lbCtx) return;
  if (lbCtx.kind === 'image') {
    const a = document.createElement('a');
    a.href = lbCtx.url;
    a.download = lbCtx.name || 'anh.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    showToast('Đang tải ảnh về máy…');
    return;
  }
  downloadFile(lbCtx.name.replace(/\.[a-z0-9]+$/i, '') + '.txt', lbCtx.text, 'text/plain;charset=utf-8');
  showToast('Đã tải nội dung tệp về máy');
}

function lightboxCopy() {
  if (!lbCtx) return;
  copyText(lbCtx.kind === 'file' ? lbCtx.text : lbCtx.url);
}

/* ---------- Báo hiệu kéo & thả tệp ---------- */
function showDropHint(on) {
  const el = $('dropHint');
  const bar = document.querySelector('.input-bar');
  if (el) el.hidden = !on;
  if (bar) bar.classList.toggle('dropping', !!on);
}

/* Sự kiện kéo này có chứa tệp không? (dùng cho dragenter/dragover) */
function hasFileDrag(dt) {
  if (!dt) return false;
  const t = dt.types;
  if (!t || typeof t.indexOf !== 'function') return !!(dt.files && dt.files.length);
  for (let i = 0; i < t.length; i++) if (t[i] === 'Files') return true;
  return false;
}

/* Lấy danh sách tệp từ sự kiện kéo–thả hoặc dán */
function filesFromTransfer(dt) {
  if (!dt) return [];
  if (dt.files && dt.files.length) return Array.prototype.slice.call(dt.files);
  const out = [];
  if (dt.items) {
    for (let i = 0; i < dt.items.length; i++) {
      const it = dt.items[i];
      if (it && it.kind === 'file' && it.getAsFile) {
        const f = it.getAsFile();
        if (f) out.push(f);
      }
    }
  }
  return out;
}


