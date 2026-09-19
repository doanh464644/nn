// ===== Gọi API AI (OpenAI-compatible, hỗ trợ streaming) =====

function aiUrl() {
  return String(AI_BASE).replace(/\/+$/, '') + '/chat/completions';
}

/* ---------- Đính kèm: dựng ngữ cảnh cho model (bản 3.1) ---------- */

/* Ngôn ngữ cho khối ``` của tệp (dùng lại bảng CODE_EXT) */
function langOfFile(f) {
  const ext = (f && f.ext) || extOfName(f && f.name);
  return CODE_EXT[ext] === 'Dockerfile' ? 'dockerfile' : (CODE_EXT[ext] || ext || '');
}

/* Khối văn bản của các tệp đính kèm, chèn vào ngữ cảnh */
function attFileBlock(att) {
  const files = findAtt(att).files;
  if (!files.length) return '';
  const out = ['--- TỆP ĐÍNH KÈM (' + files.length + ') ---'];
  files.forEach((f, i) => {
    out.push('### ' + (i + 1) + ') ' + f.name +
      ' (' + fmtBytes(f.size) + (f.cut ? ', đã lược bớt' : '') + ')');
    out.push('```' + langOfFile(f));
    out.push(String(f.text || '').replace(/```/g, '``\u200b`'));   // không phá khối code
    out.push('```');
  });
  out.push('--- HẾT TỆP ĐÍNH KÈM ---');
  return out.join('\n');
}

/* Dòng mô tả ảnh (dùng khi lần gửi này không kèm dữ liệu ảnh) */
function attImageNote(att) {
  const imgs = findAtt(att).images;
  if (!imgs.length) return '';
  return imgs.map((im, i) => 'Ảnh ' + (i + 1) + ': ' + im.name +
    (im.w && im.h ? ' (' + im.w + '×' + im.h + ')' : '') +
    (im.size ? ', ' + fmtBytes(im.size) : '')).join('\n');
}

/* Nội dung gửi cho model: ảnh đi kèm dưới dạng mảng phần tử
   [{ type:'text', text }, { type:'image_url', image_url:{ url } }]  */
function aiUserContent(m, skipImages) {
  const att = m.att || null;
  const images = skipImages ? [] : findAtt(att).images.filter(im => !!im.url);
  const blocks = [];

  const text = String(m.content == null ? '' : m.content).trim();
  if (text) blocks.push(text);

  const note = attImageNote(att);
  if (images.length) {
    blocks.push('Người dùng gửi kèm ' + images.length + ' ảnh — hãy phân tích kỹ nội dung ảnh rồi trả lời.');
  } else if (note) {
    blocks.push('Người dùng có đính kèm ảnh (lần này chỉ gửi phần mô tả, không kèm dữ liệu ảnh):\n' + note);
  }

  const fb = attFileBlock(att);
  if (fb) blocks.push(fb);

  const full = blocks.join('\n\n').trim();
  if (!images.length) return full;

  const parts = [];
  if (full) parts.push({ type: 'text', text: full });
  images.forEach(im => parts.push({ type: 'image_url', image_url: { url: im.url } }));
  return parts;
}

function aiMessages(conv, skipImages) {
  const list = [];
  const persona = personaOf(conv);                 // vai trò riêng của hội thoại
  if (persona && persona.prompt) list.push({ role: 'system', content: persona.prompt });
  conv.messages.forEach(m => {
    if (m.role === 'system') return;
    const content = m.att
      ? aiUserContent(m, !!skipImages)                                  // tin nhắn có đính kèm
      : String(m.content == null ? '' : m.content).trim();
    if (typeof content === 'string') {
      if (content) list.push({ role: m.role, content: content });
      return;
    }
    if (content.length) list.push({ role: m.role, content: content });
  });
  return list;
}

/* Bản 3.2: model sẽ dùng cho lần gọi này. Hội thoại có ảnh mà model được chọn
   không đọc được ảnh → chuyển tạm sang model đọc ảnh (VISION_MODELS), nhờ vậy
   ảnh không còn bị từ chối; tin nhắn chữ vẫn dùng đúng model đã chọn. */
function aiModelFor(conv) {
  const m = modelOf(conv);
  if (isVisionModel(m) || !convHasImages(conv)) return m;
  return VISION_MODELS[0];   // gemini-3.7-flash-max — đã thử thật, đọc được ảnh
}

function aiBody(conv, stream, skipImages) {
  return JSON.stringify({
    model: aiModelFor(conv),                       // bản 3.2: tự chọn model đọc ảnh
    messages: aiMessages(conv, skipImages),
    temperature: 0.7,
    stream: !!stream
  });
}

/* Tin nhắn gần nhất của người dùng có ảnh không? (để thử lại khi model không nhận ảnh) */
function convHasImages(conv) {
  for (let i = conv.messages.length - 1; i >= 0; i--) {
    if (conv.messages[i].role !== 'user') continue;
    return findAtt(conv.messages[i].att).images.length > 0;
  }
  return false;
}

/* Bản 3.2: ưu tiên khoá API riêng người dùng nhập trong Cài đặt (getApiKey trong
   storage.js, chỉ nằm trong localStorage của máy này); thiếu thì dùng khoá chung. */
function activeKey() {
  try {
    if (typeof getApiKey === 'function') {
      const k = getApiKey();
      if (k) return k;
    }
  } catch (e) { /* bỏ qua */ }
  return AI_KEY;
}

function aiHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + activeKey()
  };
}

function aiExtract(d) {
  const c = d && d.choices && d.choices[0];
  if (!c) return '';
  const m = c.message || c.delta || {};
  return typeof m.content === 'string' ? m.content : '';
}

async function aiErrorText(res) {
  let body = '';
  try { body = await res.text(); } catch (e) { /* bỏ qua */ }
  let msg = body.slice(0, 300);
  try {
    const j = JSON.parse(body);
    if (j && j.error) msg = j.error.message || String(j.error);
  } catch (e) { /* body không phải JSON */ }
  return 'Máy chủ AI trả về ' + res.status + (msg ? ': ' + msg : '');
}

/* ---------- Nạp danh sách model từ máy chủ (/v1/models) ----------
   Không bắt buộc: nếu lỗi thì dùng danh sách dự phòng AI_MODELS.       */
async function fetchModels() {
  const url = String(AI_BASE).replace(/\/+$/, '') + '/models';
  const res = await fetch(url, { method: 'GET', headers: aiHeaders() });
  if (!res.ok) throw new Error(await aiErrorText(res));
  const d = await res.json();
  const rows = Array.isArray(d && d.data) ? d.data : (Array.isArray(d) ? d : []);
  const ids = [];
  rows.forEach(r => {
    const id = typeof r === 'string' ? r : (r && (r.id || r.name));
    if (typeof id !== 'string' || !id) return;
    if (isBlockedModel(id)) return;     // bản 3.2: máy chủ vẫn quảng cáo model bị khoá — bỏ sớm
    if (ids.indexOf(id) < 0) ids.push(id);
  });
  if (!ids.length) throw new Error('Máy chủ không trả về model nào');
  return ids.sort((a, b) => a.localeCompare(b));
}

/* ---------- Không streaming (dùng khi endpoint/đường truyền không hỗ trợ SSE) ---------- */
async function callOpenAI(conv, skipImages) {
  const res = await fetch(aiUrl(), { method: 'POST', headers: aiHeaders(), body: aiBody(conv, false, skipImages) });
  if (!res.ok) throw new Error(await aiErrorText(res));
  const d = await res.json();
  return aiExtract(d) || '(không có phản hồi)';
}

/* ---------- Streaming ----------
   handlers: { onDelta(fullText, piece), onReason(fullReasoning), signal }
   skipImages: true → không gửi dữ liệu ảnh (chỉ gửi mô tả), dùng khi model không nhận ảnh
   Trả về:   { text, reasoning }                                        */
async function streamReply(conv, handlers, skipImages) {
  const h = handlers || {};
  const res = await fetch(aiUrl(), {
    method: 'POST',
    headers: aiHeaders(),
    body: aiBody(conv, true, skipImages),
    signal: h.signal
  });
  if (!res.ok) throw new Error(await aiErrorText(res));

  // Máy chủ không hỗ trợ stream → nhận trọn gói
  if (!res.body || typeof res.body.getReader !== 'function') {
    const d = await res.json();
    const txt = aiExtract(d) || '';
    if (txt && h.onDelta) h.onDelta(txt, txt);
    return { text: txt, reasoning: '' };
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder('utf-8');
  let buf = '';
  let text = '';
  let reason = '';
  let sawEvent = false;
  let done = false;

  while (!done) {
    const r = await reader.read();
    if (r.done) break;
    buf += dec.decode(r.value, { stream: true });

    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).replace(/\r$/, '').trim();
      buf = buf.slice(nl + 1);
      if (!line || line.charAt(0) === ':') continue;
      if (line.indexOf('data:') !== 0) continue;

      const data = line.slice(5).trim();
      if (!data) continue;
      if (data === '[DONE]') { done = true; break; }

      let j = null;
      try { j = JSON.parse(data); } catch (e) { continue; }
      if (j && j.error) {
        throw new Error('Máy chủ AI: ' + (j.error.message || j.error));
      }

      const ch = j && j.choices && j.choices[0];
      if (!ch) continue;
      sawEvent = true;

      const d = ch.delta || ch.message || {};
      if (typeof d.reasoning_content === 'string' && d.reasoning_content) {
        reason += d.reasoning_content;
        if (h.onReason) h.onReason(reason);
      }
      const piece = typeof d.content === 'string' ? d.content : '';
      if (piece) {
        text += piece;
        if (h.onDelta) h.onDelta(text, piece);
      }
    }
  }

  // Một số endpoint bỏ qua tham số stream và trả JSON thường
  if (!sawEvent) {
    const whole = (buf || '').trim();
    if (whole.charAt(0) === '{') {
      try {
        const t = aiExtract(JSON.parse(whole));
        if (t) {
          text = t;
          if (h.onDelta) h.onDelta(text, text);
        }
      } catch (e) { /* bỏ qua */ }
    }
  }

  return { text: text, reasoning: reason };
}
