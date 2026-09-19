// ===== Khởi động, gắn sự kiện & phím tắt =====

function isMobile() {
  return window.matchMedia('(max-width: 720px)').matches;
}

function toggleSidebar() {
  const sb = $('sidebar');
  if (!sb) return;
  sb.classList.toggle('closed');
  const open = !sb.classList.contains('closed');
  const bd = $('backdrop');
  if (bd) bd.classList.toggle('show', isMobile() && open);
}

function msgInCurrent(id) {
  const conv = findConv(state.currentId);
  return conv ? (conv.messages.find(x => x.id === id) || null) : null;
}

/* ---------- Menu "⋯" ---------- */
function closeMore() {
  const m = $('moreMenu');
  const b = $('moreBtn');
  if (m) m.classList.remove('open');
  if (b) b.setAttribute('aria-expanded', 'false');
}

function toggleMore() {
  const m = $('moreMenu');
  const b = $('moreBtn');
  if (!m) return;
  const open = !m.classList.contains('open');
  m.classList.toggle('open', open);
  if (b) b.setAttribute('aria-expanded', open ? 'true' : 'false');
}

/* ---------- Thanh nhập tin nhắn ---------- */
function wireComposer() {
  const ta = $('input');
  const send = $('sendBtn');
  const mic = $('micBtn');
  if (ta) {
    ta.addEventListener('input', () => {
      autoResize();
      updateCounter();
      saveDraft();
      const q = slashQuery(ta);
      if (q === null) closeSlashMenu();
      else openSlashMenu(q);
    });
    ta.addEventListener('keydown', e => {
      // Đang mở danh sách lệnh nhanh
      if (slashOpen) {
        if (e.key === 'ArrowDown') { e.preventDefault(); moveSlash(1); return; }
        if (e.key === 'ArrowUp' && slashItems.length) { e.preventDefault(); moveSlash(-1); return; }
        if (e.key === 'Tab') { e.preventDefault(); chooseSlash(slashItems[slashSel]); return; }
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          chooseSlash(slashItems[slashSel]);
          return;
        }
        if (e.key === 'Escape') { e.preventDefault(); closeSlashMenu(); return; }
      }
      if (e.key === 'Escape') { closeSlashMenu(); return; }

      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (streaming) { stopStream(); return; }
        sendMessage();
        return;
      }
      // Ô nhập trống + mũi lên → sửa tin nhắn vừa gửi
      if (e.key === 'ArrowUp' && ta.value === '') {
        const conv = findConv(state.currentId);
        if (!conv) return;
        let i = conv.messages.length - 1;
        while (i >= 0 && conv.messages[i].role !== 'user') i--;
        if (i >= 0) { e.preventDefault(); startEdit(conv.messages[i].id); }
      }
    });
  }
  if (send) {
    send.addEventListener('click', () => {
      if (streaming) stopStream();
      else sendMessage();
    });
  }
  if (mic) mic.addEventListener('click', toggleMic);
}

/* ---------- Màn hình chào ---------- */
function wireWelcome() {
  const box = $('suggest');
  if (!box) return;
  box.addEventListener('click', e => {
    const card = e.target.closest('.card');
    if (!card) return;
    const s = SUGGESTIONS[Number(card.dataset.i)];
    if (s) sendMessage(s.prompt);
  });
}

/* ---------- Danh sách hội thoại ---------- */
function wireSidebar() {
  const list = $('convList');
  const search = $('convSearch');
  const nb = $('newChatBtn');
  const wipe = $('wipeBtn');

  if (nb) nb.addEventListener('click', startNewChat);
  if (wipe) wipe.addEventListener('click', wipeAllData);

  if (search) {
    search.addEventListener('input', () => {
      convFilter = search.value;
      renderSidebar();
    });
    search.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        e.preventDefault();
        search.value = '';
        convFilter = '';
        renderSidebar();
        search.blur();
      } else if (e.key === 'Enter') {
        const first = $('convList').querySelector('.conv-item');
        if (first) selectConv(first.dataset.id);
      }
    });
  }

  if (!list) return;

  list.addEventListener('click', e => {
    const item = e.target.closest('.conv-item');
    if (!item) return;
    const id = item.dataset.id;
    const act = e.target.closest('.mini-btn');

    if (act) {
      if (act.classList.contains('pin')) pinConv(id);
      else if (act.classList.contains('del')) deleteConv(id);
      return;
    }
    if (item.classList.contains('active')) { closeSidebarOnMobile(); return; }
    selectConv(id);
  });

  list.addEventListener('dblclick', e => {
    const item = e.target.closest('.conv-item');
    if (!item || e.target.closest('.mini-btn')) return;
    e.preventDefault();
    startRename(item.dataset.id);
  });
}

/* ---------- Hành động trên tin nhắn ---------- */
function wireMessages() {
  const list = $('msgList');
  if (list) {
    list.addEventListener('click', e => {
      const cp = e.target.closest('.copy-code');
      if (cp) {
        const block = cp.closest('.code-block');
        const code = block ? block.querySelector('pre code') : null;
        if (code) copyText(code.textContent);
        return;
      }

      const wrapBtn = e.target.closest('.wrap-code');
      if (wrapBtn) {
        const block = wrapBtn.closest('.code-block');
        if (block) toggleCodeWrap(block, wrapBtn);
        return;
      }

      const dlBtn = e.target.closest('.dl-code');
      if (dlBtn) {
        const block = dlBtn.closest('.code-block');
        if (block) downloadCodeBlock(block);
        return;
      }

      const attEl = e.target.closest('.att-img, .att-file');
      if (attEl) {
        openAttach(attEl.dataset.mid, attEl.dataset.kind, Number(attEl.dataset.i));
        return;
      }

      const btn = e.target.closest('.tool');
      if (!btn) return;
      const wrap = btn.closest('.msg');
      const mid = wrap ? wrap.dataset.mid : null;
      if (!mid) return;

      if (btn.classList.contains('copy-msg')) {
        const m = msgInCurrent(mid);
        if (m) copyText(m.content);
      } else if (btn.classList.contains('edit-msg')) {
        startEdit(mid);
      } else if (btn.classList.contains('speak-msg')) {
        speakMessage(mid, btn);
      } else if (btn.classList.contains('regen-msg')) {
        regenerate();
      } else if (btn.classList.contains('del-msg')) {
        deleteMsg(mid);
      }
    });
  }

  const box = $('msgs');
  if (box) {
    box.addEventListener('scroll', updateFab);
    box.addEventListener('click', () => closeMore());
  }

  const fab = $('fab');
  if (fab) fab.addEventListener('click', () => { scrollBottom(); updateFab(); });
}

/* ---------- Thanh trên cùng ---------- */
function wireTop() {
  const theme = $('themeBtn');
  if (theme) {
    theme.addEventListener('click', () => {
      const r = cycleThemeMode();
      showToast('Chế độ: ' + r.mode.name + ' (' + r.look + ')');
    });
  }

  const setBtn = $('settingsBtn');
  if (setBtn) setBtn.addEventListener('click', openSettings);

  const pill = $('modePill');
  if (pill) pill.addEventListener('click', () => openPicker('model'));

  const accent = $('accentBtn');
  if (accent) {
    accent.addEventListener('click', () => {
      showToast('Bộ màu: ' + cycleAccent().name);
    });
  }

  const pal = $('paletteBtn');
  if (pal) pal.addEventListener('click', togglePalette);

  const menu = $('menuBtn');
  if (menu) menu.addEventListener('click', toggleSidebar);

  const more = $('moreBtn');
  if (more) {
    more.addEventListener('click', e => {
      e.stopPropagation();
      toggleMore();
    });
  }

  const mm = $('moreMenu');
  if (mm) {
    mm.addEventListener('click', e => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      closeMore();
      if (act === 'shortcuts') { openPalette(''); return; }
      runPaletteCommand(act);
    });
  }

  document.addEventListener('click', e => {
    if (!e.target.closest('#moreWrap')) closeMore();
  });

  const bd = $('backdrop');
  if (bd) bd.addEventListener('click', () => toggleSidebar());
}

/* ---------- Bản 3.0: chip, bộ chọn, cài đặt, tìm, micro ---------- */
function wireRound3() {
  const pChip = $('personaChip');
  if (pChip) pChip.addEventListener('click', () => openPicker('persona'));

  const mChip = $('modelChip');
  if (mChip) mChip.addEventListener('click', () => openPicker('model'));

  const slashBtn = $('slashBtn');
  if (slashBtn) {
    slashBtn.addEventListener('click', () => {
      const ta = $('input');
      if (!ta) return;
      if (ta.value && !/^\/[^\n]*$/.test(ta.value)) {
        showToast('Hãy xoá nội dung ô nhập rồi gõ / để mở lệnh nhanh', 'info');
        return;
      }
      ta.value = '/';
      ta.focus();
      try { ta.setSelectionRange(1, 1); } catch (e) { /* bỏ qua */ }
      openSlashMenu('');
      autoResize();
      updateCounter();
      saveDraft();
    });
  }

  const slashBox = $('slashMenu');
  if (slashBox) {
    slashBox.addEventListener('mousedown', e => e.preventDefault());
    slashBox.addEventListener('click', e => {
      const b = e.target.closest('.slash-item');
      if (b) chooseSlash(slashItems[Number(b.dataset.i)]);
    });
  }

  document.addEventListener('mousedown', e => {
    if (slashOpen && !e.target.closest('.input-wrap')) closeSlashMenu();
  });

  /* Bảng cài đặt */
  const sClose = $('settingsClose');
  if (sClose) sClose.addEventListener('click', closeSettings);

  [ $('segTheme'), $('segDensity') ].forEach(seg => {
    if (!seg) return;
    seg.addEventListener('click', e => {
      const b = e.target.closest('.seg-btn');
      if (b) applySegSetting(b.dataset.set, b.dataset.v);
    });
  });

  const pPick = $('pickPersonaBtn');
  if (pPick) pPick.addEventListener('click', () => openPicker('dpersona'));
  const mPick = $('pickModelBtn');
  if (mPick) mPick.addEventListener('click', () => openPicker('dmodel'));

  const bkB = $('backupBtn');
  if (bkB) bkB.addEventListener('click', backupAll);
  const rsB = $('restoreBtn');
  if (rsB) rsB.addEventListener('click', askRestore);
  const wp2 = $('wipeBtn2');
  if (wp2) wp2.addEventListener('click', wipeAllData);

  const file = $('importFile');
  if (file) {
    file.addEventListener('change', () => readImportFile(file.files && file.files[0]));
  }

  /* Khoá API riêng (bản 3.2) — lưu khi rời ô nhập hoặc bấm Enter */
  const keyIn = $('apiKeyInput');
  if (keyIn) {
    keyIn.addEventListener('change', saveApiKeyFromSettings);
    keyIn.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); saveApiKeyFromSettings(); }
    });
  }

  /* Bộ chọn model / vai trò */
  const pClose = $('pickerClose');
  if (pClose) pClose.addEventListener('click', closePicker);
  const pList = $('pickerList');
  if (pList) {
    pList.addEventListener('click', e => {
      const b = e.target.closest('.pk-item');
      if (b) choosePicker(pickerRows[Number(b.dataset.i)]);
    });
  }

  const setBox = $('settings');
  if (setBox) setBox.addEventListener('mousedown', e => { if (e.target === setBox) closeSettings(); });
  const pickBox = $('picker');
  if (pickBox) pickBox.addEventListener('mousedown', e => { if (e.target === pickBox) closePicker(); });

  /* Thanh tìm trong hội thoại */
  const fIn = $('findInput');
  if (fIn) {
    fIn.addEventListener('input', () => runFind(false));
    fIn.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); findStep(e.shiftKey ? -1 : 1); }
      else if (e.key === 'Escape') { e.preventDefault(); closeFind(); }
    });
  }
  const fNext = $('findNext');
  if (fNext) fNext.addEventListener('click', () => findStep(1));
  const fPrev = $('findPrev');
  if (fPrev) fPrev.addEventListener('click', () => findStep(-1));
  const fClose = $('findClose');
  if (fClose) fClose.addEventListener('click', closeFind);
  const fBtn = $('findBtn');
  if (fBtn) fBtn.addEventListener('click', openFind);

  initMicButton();
  refreshModelListQuietly();
}

/* ---------- Bản 3.1: đính kèm ảnh & tệp để AI phân tích ---------- */
function wireAttach() {
  const imgBtn = $('attImgBtn');
  if (imgBtn) imgBtn.addEventListener('click', attPickImage);
  const fileBtn = $('attFileBtn');
  if (fileBtn) fileBtn.addEventListener('click', attPickFile);
  const clearBtn = $('attClearBtn');
  if (clearBtn) clearBtn.addEventListener('click', () => attClear());

  // Ô chọn tệp ẩn
  const imgIn = $('attImgInput');
  if (imgIn) {
    imgIn.addEventListener('change', () => {
      const list = Array.prototype.slice.call(imgIn.files || []);
      imgIn.value = '';
      if (list.length) attAddFiles(list);
    });
  }
  const fileIn = $('attFileInput');
  if (fileIn) {
    fileIn.addEventListener('change', () => {
      const list = Array.prototype.slice.call(fileIn.files || []);
      fileIn.value = '';
      if (list.length) attAddFiles(list);
    });
  }

  // Bỏ một mục trong dải xem trước
  const strip = $('attachList');
  if (strip) {
    strip.addEventListener('click', e => {
      const x = e.target.closest('.att-x');
      if (!x) return;
      attRemove(x.dataset.kind, Number(x.dataset.i));
    });
  }

  // Dán ảnh từ bộ nhớ tạm
  document.addEventListener('paste', e => {
    const files = filesFromTransfer(e.clipboardData).filter(f => attFileKind(f) === 'image');
    if (!files.length) return;
    e.preventDefault();
    attAddFiles(files);
  });

  // Kéo & thả tệp vào cửa sổ
  let dragDepth = 0;
  document.addEventListener('dragenter', e => {
    if (!hasFileDrag(e.dataTransfer)) return;
    e.preventDefault();
    dragDepth++;
    showDropHint(true);
  });
  document.addEventListener('dragover', e => {
    if (!hasFileDrag(e.dataTransfer)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });
  document.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) showDropHint(false);
  });
  document.addEventListener('drop', e => {
    const files = filesFromTransfer(e.dataTransfer);
    dragDepth = 0;
    showDropHint(false);
    if (!files.length) return;
    e.preventDefault();
    attAddFiles(files);
  });

  // Xem ảnh / nội dung tệp đã gửi
  const lb = $('lightbox');
  if (lb) lb.addEventListener('mousedown', e => { if (e.target === lb) closeLightbox(); });
  const lbClose = $('lbClose');
  if (lbClose) lbClose.addEventListener('click', closeLightbox);
  const lbSave = $('lbSave');
  if (lbSave) lbSave.addEventListener('click', lightboxSave);
  const lbCopy = $('lbCopy');
  if (lbCopy) lbCopy.addEventListener('click', lightboxCopy);
}

/* Nút micro: mờ đi nếu trình duyệt không hỗ trợ */
function initMicButton() {
  const btn = $('micBtn');
  if (!btn) return;
  if (!micSupported()) {
    btn.classList.add('off');
    btn.title = 'Trình duyệt không hỗ trợ nhập bằng giọng nói';
  }
}

/* Nạp danh sách model một lần ở chế độ nền, không chặn khởi động */
function refreshModelListQuietly() {
  if (availableModels().length > AI_MODELS.length) return;
  fetchModels().then(ids => setModelList(ids)).catch(() => { /* giữ danh sách dự phòng */ });
}

/* ---------- Phím tắt ---------- */
function wireShortcuts() {
  document.addEventListener('keydown', e => {
    const k = (e.key || '').toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;

    if (ctrl && !e.shiftKey && k === 'k') { e.preventDefault(); togglePalette(); return; }
    if (ctrl && !e.shiftKey && k === 'b') { e.preventDefault(); toggleSidebar(); return; }
    if (ctrl && !e.shiftKey && k === 'j') {
      e.preventDefault();
      showToast('Giao diện: ' + (toggleTheme() === 'light' ? 'sáng' : 'tối'));
      return;
    }
    if (ctrl && !e.shiftKey && k === 'f') { e.preventDefault(); openFind(); return; }
    if (ctrl && k === ',') { e.preventDefault(); openSettings(); return; }
    if (ctrl && !e.shiftKey && k === 'm') { e.preventDefault(); openPicker('model'); return; }
    if (ctrl && e.shiftKey && k === 'm') { e.preventDefault(); toggleMic(); return; }
    if (ctrl && e.shiftKey && k === 'a') { e.preventDefault(); attPickImage(); return; }
    if (ctrl && e.shiftKey && k === 's') { e.preventDefault(); backupAll(); return; }
    if (ctrl && e.shiftKey && k === 'o') { e.preventDefault(); startNewChat(); return; }
    if (ctrl && e.shiftKey && k === 'e') { e.preventDefault(); exportConv('md'); return; }
    if (ctrl && e.shiftKey && k === 'd') {
      e.preventDefault();
      const r = cycleThemeMode();
      showToast('Chế độ: ' + r.mode.name + ' (' + r.look + ')');
      return;
    }
    if (ctrl && e.shiftKey && k === 'x') { e.preventDefault(); clearCurrent(); return; }

    if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); jumpMsg(1); return; }
    if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); jumpMsg(-1); return; }

    if (k === 'escape') {
      if (slashOpen) { closeSlashMenu(); return; }
      if (palOpen) { closePalette(); return; }
      if (lightboxOpen()) { closeLightbox(); return; }
      const set = $('settings');
      if (set && !set.hidden) { closeSettings(); return; }
      const pk = $('picker');
      if (pk && !pk.hidden) { closePicker(); return; }
      const fb = $('findBar');
      if (fb && !fb.hidden) { closeFind(); return; }
      const m = $('moreMenu');
      if (m && m.classList.contains('open')) { closeMore(); return; }
      if (streaming) { stopStream(); return; }
      const sb = $('sidebar');
      if (sb && !sb.classList.contains('closed') && isMobile()) toggleSidebar();
    }
  });
}

/* ---------- Ghi nhận lỗi (hiện ra ở #errLog để dễ kiểm tra) ---------- */
function wireErrors() {
  const log = $('errLog');
  const push = text => {
    if (log) log.textContent += 'ERR: ' + text + '\n';
  };
  window.addEventListener('error', ev => {
    push((ev.message || 'lỗi không rõ') + ' @' + (ev.filename || '') + ':' + (ev.lineno || 0));
  });
  window.addEventListener('unhandledrejection', ev => {
    const r = ev.reason;
    push(r && r.message ? r.message : String(r));
  });
}

/* ---------- Khởi động ---------- */
function init() {
  wireErrors();
  applyThemeMode(loadThemeMode());
  applyDensity(loadDensity());
  watchSystemTheme();
  applyAccent(loadAccent());

  renderWelcome();
  initPalette();
  wireComposer();
  wireWelcome();
  wireSidebar();
  wireMessages();
  wireTop();
  wireRound3();
  wireAttach();
  wireShortcuts();

  if (!findConv(state.currentId)) {
    if (state.convs.length) state.currentId = sortedConvs()[0].id;
    else newConv();
  }
  if (isMobile()) $('sidebar').classList.add('closed');

  renderAll();
  restoreDraft();
  updateFab();
  const ta = $('input');
  if (ta) ta.focus();
  document.body.dataset.ready = '3';

  let lastMobile = isMobile();
  window.addEventListener('resize', () => {
    const m = isMobile();
    if (m !== lastMobile) {
      lastMobile = m;
      const sb = $('sidebar');
      if (sb) sb.classList.toggle('closed', m);
      const bd = $('backdrop');
      if (bd) bd.classList.remove('show');
    }
    updateFab();
  });

  window.addEventListener('beforeunload', saveNow);
  window.addEventListener('pagehide', saveNow);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

