// ===== Bảng lệnh nhanh (Ctrl + K) =====
// Gõ để tìm hội thoại, tìm trong nội dung tin nhắn hoặc chạy lệnh của ứng dụng.

let palOpen = false;
let palItems = [];
let palSel = 0;

/* ---------- Danh sách lệnh ---------- */
function palCommands() {
  return [
    { key: 'new',         ico: '＋',  label: 'Chat mới',                          hint: SHORTCUTS.newChat },
    { key: 'settings',    ico: '⚙️',  label: 'Cài đặt & dữ liệu',                 hint: SHORTCUTS.settings },
    { key: 'find',        ico: '🔍',  label: 'Tìm trong hội thoại',               hint: SHORTCUTS.find },
    { key: 'theme',       ico: '🌗',  label: 'Đổi nhanh sáng / tối',              hint: SHORTCUTS.theme },
    { key: 'theme-mode',  ico: '🖥️',  label: 'Chế độ: tối / sáng / theo hệ thống' },
    { key: 'density',     ico: '📐',  label: 'Mật độ tin nhắn: thoáng / gọn' },
    { key: 'accent',      ico: '🎨',  label: 'Đổi bộ màu nhấn' },
    { key: 'model',       ico: '🧩',  label: 'Đổi model cho hội thoại',           hint: SHORTCUTS.model },
    { key: 'persona',     ico: '🎭',  label: 'Đổi vai trò trợ lý' },
    { key: 'mic',         ico: '🎙️',  label: 'Nhập bằng giọng nói',               hint: SHORTCUTS.mic },
    { key: 'attach-image', ico: '🖼️', label: 'Đính kèm ảnh để AI phân tích',      hint: SHORTCUTS.attach },
    { key: 'attach-file',  ico: '📎', label: 'Đính kèm tệp văn bản / mã nguồn' },
    { key: 'attach-clear', ico: '🧹', label: 'Bỏ mọi đính kèm đang chờ gửi' },
    { key: 'export-md',   ico: '⬇️',  label: 'Xuất hội thoại ra Markdown (.md)',  hint: SHORTCUTS.exportMd },
    { key: 'export-json', ico: '🧾',  label: 'Xuất hội thoại ra JSON (.json)' },
    { key: 'backup',      ico: '💾',  label: 'Sao lưu tất cả hội thoại (.json)',  hint: SHORTCUTS.backup },
    { key: 'restore',     ico: '📥',  label: 'Nhập sao lưu (.json)' },
    { key: 'pin',         ico: '📌',  label: 'Ghim / bỏ ghim hội thoại hiện tại' },
    { key: 'rename',      ico: '✏️',  label: 'Đổi tên hội thoại hiện tại' },
    { key: 'clear',       ico: '🧹',  label: 'Xoá tin nhắn của hội thoại hiện tại', hint: SHORTCUTS.clear },
    { key: 'sidebar',     ico: '⇔',   label: 'Ẩn / hiện thanh bên',               hint: SHORTCUTS.sidebar },
    { key: 'jump-first',  ico: '⬆️',  label: 'Về tin nhắn đầu tiên' },
    { key: 'jump-last',   ico: '⬇️',  label: 'Tới tin nhắn mới nhất' },
    { key: 'wipe',        ico: '🗑️',  label: 'Xoá tất cả cuộc trò chuyện' },
    { key: 'focus',       ico: '⌨️',  label: 'Đưa con trỏ vào ô nhập tin nhắn' }
  ];
}

function runPaletteCommand(key) {
  const conv = findConv(state.currentId);
  switch (key) {
    case 'new':         startNewChat(); break;
    case 'theme':       showToast('Giao diện: ' + (toggleTheme() === 'light' ? 'sáng' : 'tối')); break;
    case 'theme-mode': {
      const r = cycleThemeMode();
      showToast('Chế độ: ' + r.mode.name + ' (' + r.look + ')');
      break;
    }
    case 'density': {
      const d = cycleDensity();
      applyDensity(d.id);
      showToast('Mật độ: ' + d.name);
      break;
    }
    case 'accent':      showToast('Bộ màu: ' + cycleAccent().name); break;
    case 'settings':    openSettings(); break;
    case 'find':        openFind(); break;
    case 'model':       openPicker('model'); break;
    case 'persona':     openPicker('persona'); break;
    case 'mic':         toggleMic(); break;
    case 'attach-image': attPickImage(); break;
    case 'attach-file':  attPickFile(); break;
    case 'attach-clear': attClear(); break;
    case 'backup':      backupAll(); break;
    case 'restore':     askRestore(); break;
    case 'export-md':   exportConv('md'); break;
    case 'export-json': exportConv('json'); break;
    case 'pin':         conv ? pinConv(conv.id) : showToast('Chưa có hội thoại', 'err'); break;
    case 'rename':      conv ? startRename(conv.id) : showToast('Chưa có hội thoại', 'err'); break;
    case 'clear':       clearCurrent(); break;
    case 'sidebar':     toggleSidebar(); break;
    case 'jump-first': {
      const el = document.querySelector('#msgList .msg');
      if (el && el.dataset.mid) scrollToMsg(el.dataset.mid);
      else showToast('Hội thoại chưa có tin nhắn', 'err');
      break;
    }
    case 'jump-last':   scrollBottom(); updateFab(); break;
    case 'wipe':        wipeAllData(); break;
    case 'focus':       $('input').focus(); break;
    default: break;
  }
}

/* ---------- Chấm điểm khớp mờ (có dấu hay không dấu đều tìm được) ---------- */
function fuzzyScore(text, q) {
  const t = foldText(text);
  let ti = 0;
  let score = 0;
  let streak = 0;
  for (let i = 0; i < q.length; i++) {
    const idx = t.indexOf(q.charAt(i), ti);
    if (idx < 0) return -1;
    streak = (idx === ti) ? streak + 1 : 0;
    score += 12 - Math.min(10, idx - ti) + streak * 3;
    ti = idx + 1;
  }
  return score - Math.min(24, Math.floor(t.length / 8));
}

/* ---------- Dựng danh sách kết quả ---------- */
function buildPalette(q) {
  const fq = foldText(String(q || '').trim());
  const cmds = [];
  const convs = [];
  const msgs = [];

  palCommands().forEach((c, i) => {
    const s = fq ? fuzzyScore(c.label, fq) : (1000 - i);
    if (s >= 0) {
      cmds.push({ kind: 'cmd', key: c.key, ico: c.ico, label: c.label, hint: c.hint || '', score: s });
    }
  });

  if (fq) {
    // Khớp ở tiêu đề → nhóm "Hội thoại"
    sortedConvs().forEach(c => {
      if (foldText(c.title).indexOf(fq) < 0) return;
      if (convs.length >= 6) return;
      const s = fuzzyScore(c.title, fq);
      convs.push({
        kind: 'conv', convId: c.id,
        ico: c.pinned ? '📌' : '💬',
        label: c.title,
        hint: c.messages.length + ' tin nhắn',
        snippet: snippetHtml(c.title, q),
        score: (s < 0 ? 5 : s) + 30
      });
    });
    // Khớp trong nội dung → nhóm "Trong nội dung tin nhắn"
    searchMessages(q, 8).forEach(h => {
      msgs.push({
        kind: 'msg', convId: h.conv.id, msgId: h.msg.id,
        ico: h.where === 'you' ? '🧑' : '🤖',
        label: h.conv.title,
        hint: 'trong tin nhắn',
        snippet: snippetHtml(h.raw, q),
        score: 10
      });
    });
    convs.sort((a, b) => b.score - a.score);
  } else {
    sortedConvs().slice(0, 6).forEach(c => {
      convs.push({
        kind: 'conv', convId: c.id,
        ico: c.pinned ? '📌' : '💬',
        label: c.title,
        hint: timeAgo(c.updatedAt),
        snippet: escapeHtml(previewOf(c)),
        score: 0
      });
    });
  }

  const out = [];
  cmds.forEach(x => out.push(x));
  if (convs.length) {
    out.push({ kind: 'head', label: 'Hội thoại' });
    convs.forEach(x => out.push(x));
  }
  if (msgs.length) {
    out.push({ kind: 'head', label: 'Trong nội dung tin nhắn' });
    msgs.forEach(x => out.push(x));
  }
  return out;
}

/* ---------- Vẽ ---------- */
function renderPalette() {
  const list = $('paletteList');
  if (!list) return;

  const hasItem = palItems.some(it => it.kind !== 'head');
  if (!palItems.length || !hasItem) {
    list.innerHTML = '<div class="pal-empty">Không có kết quả phù hợp.</div>';
    return;
  }

  list.innerHTML = palItems.map((it, i) => {
    if (it.kind === 'head') {
      return '<div class="pal-head">' + escapeHtml(it.label) + '</div>';
    }
    return '<button class="pal-item' + (i === palSel ? ' sel' : '') + '" type="button" data-i="' + i + '">' +
      '<span class="pal-ico">' + it.ico + '</span>' +
      '<span class="pal-main">' +
        '<span class="pal-title">' + escapeHtml(it.label) + '</span>' +
        '<span class="pal-sub">' + (it.snippet || '') + '</span>' +
      '</span>' +
      (it.hint ? '<span class="pal-hint">' + escapeHtml(it.hint) + '</span>' : '') +
    '</button>';
  }).join('');

  const sel = list.querySelector('.pal-item.sel');
  if (sel) sel.scrollIntoView({ block: 'nearest' });
}

function palMove(step) {
  if (!palItems.length) return;
  let i = palSel;
  for (let n = 0; n < palItems.length; n++) {
    i = (i + step + palItems.length) % palItems.length;
    if (palItems[i].kind !== 'head') break;
  }
  palSel = i;
  renderPalette();
}

function palRefresh() {
  const inp = $('paletteInput');
  palItems = buildPalette(inp ? inp.value : '');
  palSel = palItems.findIndex(it => it.kind !== 'head');
  if (palSel < 0) palSel = 0;
  renderPalette();
}

function runPaletteItem(it) {
  closePalette();
  if (!it || it.kind === 'head') return;
  if (it.kind === 'cmd') return runPaletteCommand(it.key);
  if (it.kind === 'conv') return selectConv(it.convId);
  if (it.kind === 'msg') return jumpToMessage(it.convId, it.msgId);
}

/* ---------- Mở / đóng ---------- */
function openPalette(prefill) {
  const box = $('palette');
  const inp = $('paletteInput');
  if (!box || !inp) return;
  palOpen = true;
  box.hidden = false;
  box.classList.add('show');
  inp.value = prefill == null ? '' : String(prefill);
  palRefresh();
  inp.focus();
  inp.select();
}

function closePalette() {
  const box = $('palette');
  const inp = $('paletteInput');
  if (!box) return;
  palOpen = false;
  box.classList.remove('show');
  setTimeout(() => { if (!palOpen && box) box.hidden = true; }, 170);
  if (inp) inp.value = '';
}

function togglePalette() {
  if (palOpen) closePalette();
  else openPalette('');
}

/* ---------- Gắn sự kiện ---------- */
function initPalette() {
  const box = $('palette');
  const inp = $('paletteInput');
  const list = $('paletteList');
  if (!box || !inp || !list) return;

  inp.addEventListener('input', palRefresh);

  inp.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'ArrowDown') { e.preventDefault(); palMove(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); palMove(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); runPaletteItem(palItems[palSel]); }
    else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
  });

  list.addEventListener('click', e => {
    const btn = e.target.closest('.pal-item');
    if (!btn) return;
    runPaletteItem(palItems[Number(btn.dataset.i)]);
  });

  list.addEventListener('mousemove', e => {
    const btn = e.target.closest('.pal-item');
    if (!btn) return;
    const i = Number(btn.dataset.i);
    if (i !== palSel) { palSel = i; renderPalette(); }
  });

  box.addEventListener('mousedown', e => {
    if (e.target === box) closePalette();
  });
}

