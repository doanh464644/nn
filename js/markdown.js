// ===== Render markdown sang HTML =====
// Bộ phân tích nhỏ, không dùng thư viện ngoài. Nguyên tắc: nội dung do AI trả về
// luôn được escape trước, nên không thể chèn HTML/thuộc tính nguy hiểm.

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/* Chỉ cho phép giao thức an toàn */
function mdSafeUrl(u) {
  const s = String(u || '').trim();
  if (!s) return '#';
  if (/^(https?:|mailto:|tel:|#|\/|\.\/|\.\.\/)/i.test(s)) return s;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return '#';    // javascript:, data:, vbscript: ...
  return s;                                          // đường dẫn tương đối
}

/* Cất HTML đã sinh vào kho tạm để các bước sau không xử lý lại */
function mdHolder(store, html) {
  store.push(html);
  return '\u0000X' + (store.length - 1) + '\u0000';
}

/* ---------- Markdown trong dòng ---------- */
function mdInline(raw) {
  const hold = [];
  let s = escapeHtml(raw);

  // mã inline (đặt trước để ** hay [ ] bên trong không bị xử lý)
  s = s.replace(/`([^`\n]+)`/g, (m, c) => mdHolder(hold, '<code>' + c + '</code>'));

  // ảnh
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (m, alt, url, title) =>
    mdHolder(hold, '<img class="md-img" src="' + mdSafeUrl(url) + '" alt="' + alt + '"' +
      (title ? ' title="' + title + '"' : '') + ' loading="lazy">'));

  // liên kết
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (m, txt, url, title) =>
    mdHolder(hold, '<a href="' + mdSafeUrl(url) + '" target="_blank" rel="noopener noreferrer"' +
      (title ? ' title="' + title + '"' : '') + '>' + txt + '</a>'));

  // đậm + nghiêng
  s = s.replace(/\*\*\*([^*\n]+)\*\*\*/g, '<b><i>$1</i></b>');
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
  s = s.replace(/___([^_\n]+)___/g, '<b><i>$1</i></b>');
  s = s.replace(/__([^_\n]+)__/g, '<b>$1</b>');

  // nghiêng
  s = s.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, '$1<i>$2</i>');
  s = s.replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?:;]|$)/g, '$1<i>$2</i>');

  // gạch ngang & tô sáng
  s = s.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
  s = s.replace(/==([^=\n]+)==/g, '<mark>$1</mark>');

  // liên kết trần (làm cuối để không phá thuộc tính href đã sinh)
  s = s.replace(/(^|[\s(])((?:https?:\/\/|www\.)[^\s<]+[^\s<.,;:!?)])/g, (m, pre, url) =>
    pre + mdHolder(hold, '<a href="' + mdSafeUrl(url.indexOf('www.') === 0 ? 'https://' + url : url) +
      '" target="_blank" rel="noopener noreferrer">' + url + '</a>'));

  return s.replace(/\u0000X(\d+)\u0000/g, (m, i) => hold[Number(i)]);
}

/* ---------- Bảng ---------- */
function mdCells(line) {
  let s = String(line).trim();
  if (s.charAt(0) === '|') s = s.slice(1);
  if (s.charAt(s.length - 1) === '|') s = s.slice(0, -1);
  const out = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s.charAt(i);
    if (ch === '\\' && s.charAt(i + 1) === '|') { cur += '|'; i++; continue; }
    if (ch === '|') { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map(c => c.trim());
}

function mdIsSep(line) {
  return String(line).indexOf('|') >= 0 && /^[\s|:-]+$/.test(line) && /-/.test(line);
}

/* ---------- Danh sách (hỗ trợ lồng nhau + checklist) ---------- */
const MD_BULLET = /^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$/;

function mdList(lines, start) {
  const first = String(lines[start]).match(MD_BULLET);
  const indent = first[1].length;
  const ordered = /\d/.test(first[2]);
  const items = [];
  let i = start;

  while (i < lines.length) {
    const m = String(lines[i]).match(MD_BULLET);
    if (!m || m[1].length < indent) break;

    if (m[1].length > indent) {                 // mục con của mục vừa thu thập
      const sub = [];
      while (i < lines.length) {
        const s2 = String(lines[i]).match(MD_BULLET);
        if (!s2 || s2[1].length <= indent) break;
        sub.push(lines[i]);
        i++;
      }
      if (items.length) items[items.length - 1].sub = sub;
      else items.push({ text: '', sub: sub });
      continue;
    }

    items.push({ text: m[3], sub: null });
    i++;

    // dòng nối tiếp của cùng một mục (thụt lề nhưng không có gạch đầu dòng)
    while (i < lines.length && lines[i].trim() &&
           !MD_BULLET.test(lines[i]) && /^\s{2,}/.test(lines[i])) {
      items[items.length - 1].text += '\n' + String(lines[i]).trim();
      i++;
    }
  }

  let html = ordered ? '<ol>' : '<ul>';
  items.forEach(it => {
    const task = it.text.match(/^\[( |x|X)\]\s+([\s\S]*)$/);
    let inner;
    if (task) {
      inner = '<label class="task"><input type="checkbox" disabled' +
        (task[1].toLowerCase() === 'x' ? ' checked' : '') + '><span>' + mdInline(task[2]) + '</span></label>';
    } else {
      inner = mdInline(it.text);
    }
    if (it.sub && it.sub.length) inner += mdList(it.sub, 0).html;
    html += '<li>' + inner + '</li>';
  });
  html += ordered ? '</ol>' : '</ul>';

  return { html: html, next: i };
}

/* ---------- Phân tích theo khối ---------- */
function formatMsg(text) {
  const raw = String(text == null ? '' : text).replace(/\r\n?/g, '\n');
  const lines = raw.split('\n');
  const blocks = [];                  // khối code đã tách riêng
  let out = '';
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    /* khối code ``` / ~~~ (kể cả khi AI chưa kịp đóng lúc đang stream) */
    const fence = line.match(/^\s*(`{3,}|~{3,})\s*([^`~]*)$/);
    if (fence) {
      const lang = String(fence[2]).trim().split(/\s+/)[0] || '';
      const body = [];
      let closed = false;
      i++;
      while (i < lines.length) {
        if (/^\s*(`{3,}|~{3,})\s*$/.test(lines[i])) { closed = true; i++; break; }
        body.push(lines[i]);
        i++;
      }
      blocks.push(
        '<div class="code-block">' +
          '<div class="code-head">' +
            '<span class="lang">' + escapeHtml(lang || 'code') + '</span>' +
            (closed ? '' : '<span class="code-note">đang viết…</span>') +
            '<button class="wrap-code" type="button" title="Bật / tắt xuống dòng cho khối mã">Xuống dòng</button>' +
            '<button class="dl-code" type="button" title="Tải khối mã về máy">Tải</button>' +
            '<button class="copy-code" type="button">Sao chép</button>' +
          '</div>' +
          '<pre><code>' + highlightCode(body.join('\n'), lang) + '</code></pre>' +
        '</div>'
      );
      out += '\u0000B' + (blocks.length - 1) + '\u0000';
      continue;
    }

    /* dòng trống */
    if (!line.trim()) { i++; continue; }

    /* đường kẻ ngang */
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { out += '<hr>'; i++; continue; }

    /* tiêu đề */
    const h = line.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) {
      const lv = h[1].length;
      out += '<h' + lv + '>' + mdInline(h[2]) + '</h' + lv + '>';
      i++;
      continue;
    }

    /* trích dẫn */
    if (/^\s{0,3}>/.test(line)) {
      const buf = [];
      while (i < lines.length &&
             (/^\s{0,3}>/.test(lines[i]) || (buf.length && lines[i].trim() &&
              !/^\s*([-*+]|\d{1,3}[.)])\s+/.test(lines[i]) && !/^\s*(`{3,}|~{3,})/.test(lines[i])))) {
        buf.push(String(lines[i]).replace(/^\s{0,3}>\s?/, ''));
        i++;
      }
      out += '<blockquote>' + formatMsg(buf.join('\n')) + '</blockquote>';
      continue;
    }

    /* bảng markdown */
    if (line.indexOf('|') >= 0 && i + 1 < lines.length && mdIsSep(lines[i + 1])) {
      const head = mdCells(line);
      const align = mdCells(lines[i + 1]).map(s => {
        const a = s.charAt(0) === ':', b = s.charAt(s.length - 1) === ':';
        return (a && b) ? 'center' : b ? 'right' : a ? 'left' : '';
      });
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim() && lines[i].indexOf('|') >= 0) {
        rows.push(mdCells(lines[i]));
        i++;
      }
      let t = '<div class="table-wrap"><table><thead><tr>';
      head.forEach((c, k) => {
        t += '<th' + (align[k] ? ' style="text-align:' + align[k] + '"' : '') + '>' + mdInline(c) + '</th>';
      });
      t += '</tr></thead><tbody>';
      rows.forEach(r => {
        t += '<tr>';
        head.forEach((c, k) => {
          t += '<td' + (align[k] ? ' style="text-align:' + align[k] + '"' : '') + '>' + mdInline(r[k] || '') + '</td>';
        });
        t += '</tr>';
      });
      out += t + '</tbody></table></div>';
      continue;
    }

    /* danh sách */
    if (MD_BULLET.test(line)) {
      const r = mdList(lines, i);
      out += r.html;
      i = r.next;
      continue;
    }

    /* đoạn văn */
    const buf = [];
    while (i < lines.length && lines[i].trim() &&
           !/^\s*(`{3,}|~{3,})/.test(lines[i]) &&
           !/^\s{0,3}(#{1,6})\s+/.test(lines[i]) &&
           !/^\s{0,3}>/.test(lines[i]) &&
           !MD_BULLET.test(lines[i]) &&
           !/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i])) {
      buf.push(lines[i]);
      i++;
    }
    if (!buf.length) { i++; continue; }          // chống lặp vô hạn
    out += '<p>' + mdInline(buf.join('\n')) + '</p>';
  }

  return out.replace(/\u0000B(\d+)\u0000/g, (m, k) => blocks[Number(k)]);
}

