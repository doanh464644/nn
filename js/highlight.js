// ===== Tô màu cú pháp tối giản (không dùng thư viện ngoài) =====
// Mục tiêu: khối code dễ đọc hơn, không bao giờ làm hỏng nội dung.
// Muốn thêm ngôn ngữ: bổ sung vào HL_ALIAS và (nếu cần) HL_SPECS.

const HL_ALIAS = {
  js: 'js', javascript: 'js', jsx: 'js', mjs: 'js', cjs: 'js', node: 'js',
  ts: 'js', typescript: 'js', tsx: 'js',
  py: 'py', python: 'py', py3: 'py',
  json: 'json', jsonc: 'json', json5: 'json',
  sh: 'bash', shell: 'bash', zsh: 'bash', bash: 'bash', console: 'bash', powershell: 'bash', ps1: 'bash',
  sql: 'sql', mysql: 'sql', postgres: 'sql', postgresql: 'sql',
  html: 'html', htm: 'html', xml: 'html', svg: 'html', vue: 'html',
  css: 'css', scss: 'css', sass: 'css', less: 'css'
};

const HL_KW = {
  js: 'await async break case catch class const continue debugger default delete do else export extends finally for from function get if import in instanceof let new of return set static super switch this throw try typeof var void while with yield true false null undefined NaN Infinity',
  py: 'and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return True False None self while with yield try Match',
  json: 'true false null',
  bash: 'if then else elif fi for in do done while case esac function return exit export local echo cd ls cat grep sed awk mkdir rm cp mv sudo apt npm pnpm yarn node python python3 git docker curl wget chmod chown touch find xargs tee source set unset read printf test',
  sql: 'select from where insert into values update set delete join left right inner outer full on group by order having limit offset as and or not null is like ilike distinct count sum avg min max create table primary key foreign references drop alter add column index view union all case when then end asc desc truncate',
  css: '',
  html: ''
};

const HL_SPECS = {
  js:   { line: '//', block: true,  str: true, num: true },
  py:   { line: '#',  block: false, str: true, num: true },
  json: { line: null, block: false, str: true, num: true },
  bash: { line: '#',  block: false, str: true, num: false },
  sql:  { line: '--', block: true,  str: true, num: true },
  css:  { line: null, block: true,  str: true, num: true },
  html: { line: null, block: true,  str: true, num: false }
};

function hlEsc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function hlRx(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hlSpan(cls, text) {
  return '<span class="tok-' + cls + '">' + hlEsc(text) + '</span>';
}

/* Bộ nhận dạng riêng cho HTML/CSS (cấu trúc khác các ngôn ngữ lập trình) */
const HL_RAW = {
  html: /(?<com><!--[\s\S]*?-->)|(?<str>"[^"\n]*"|'[^'\n]*')|(?<tag><\/?[A-Za-z][\w:-]*)|(?<attr>\b[A-Za-z_:][\w:.-]*(?=\s*=))|(?<punc>\/?>)/g,
  css: /(?<com>\/\*[\s\S]*?\*\/)|(?<str>"[^"\n]*"|'[^'\n]*')|(?<num>#[0-9a-fA-F]{3,8}\b|\b\d+(?:\.\d+)?(?:px|em|rem|%|s|ms|vh|vw|fr|deg|pt)?\b)|(?<sel>[.#]?[A-Za-z][\w-]*(?=[^{};]*[{,]))|(?<prop>[A-Za-z-]+(?=\s*:))|(?<punc>[{}();:,]+)/g
};

const HL_RAW_CLASS = {
  html: { com: 'com', str: 'str', tag: 'kw', attr: 'fn', punc: 'punc' },
  css:  { com: 'com', str: 'str', num: 'num', sel: 'kw', prop: 'fn', punc: 'punc' }
};

/* Regex dùng nhóm có tên để biết token vừa khớp thuộc loại nào */
function hlBuild(spec) {
  const p = [];
  if (spec.line)  p.push('(?<com>' + hlRx(spec.line) + '[^\\n]*)');
  if (spec.block) p.push('(?<blk>/\\*[\\s\\S]*?\\*/)');
  if (spec.str)   p.push('(?<str>"(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\'|`(?:\\\\.|[^`\\\\])*`)');
  if (spec.num)   p.push('(?<num>#[0-9a-fA-F]{3,8}\\b|\\b\\d[\\d_]*(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b)');
  p.push('(?<fn>\\b[A-Za-z_$][\\w$]*(?=\\s*\\())');
  p.push('(?<word>\\b[A-Za-z_$][\\w$]*\\b)');
  p.push('(?<punc>[{}()\\[\\];,.:+\\-*/%=<>!&|^~?@]+)');
  return new RegExp(p.join('|'), 'g');
}

/* Trả về HTML đã tô màu cho `code` theo ngôn ngữ `lang` */
function highlightCode(code, lang) {
  const src = String(code == null ? '' : code);
  const key = HL_ALIAS[String(lang || '').trim().toLowerCase()] || '';
  if (!key) return hlEsc(src);

  const kw = new Set(String(HL_KW[key] || '').split(' ').filter(Boolean));
  const raw = HL_RAW[key];
  const re = raw || hlBuild(HL_SPECS[key]);
  const cls = HL_RAW_CLASS[key];

  let out = '';
  let last = 0;
  let m;
  re.lastIndex = 0;

  while ((m = re.exec(src)) !== null) {
    if (m[0].length === 0) { re.lastIndex++; continue; }
    out += hlEsc(src.slice(last, m.index));

    const g = m.groups || {};
    let name = '';
    for (const k in g) { if (g[k] !== undefined) { name = k; break; } }

    let c;
    if (cls) {
      c = cls[name] || 'punc';
    } else if (name === 'com' || name === 'blk') {
      c = 'com';
    } else if (name === 'str') {
      c = 'str';
    } else if (name === 'num') {
      c = 'num';
    } else if (name === 'fn') {
      c = 'fn';
    } else if (name === 'punc') {
      c = 'punc';
    } else {
      c = kw.has(m[0]) ? 'kw' : (/^[A-Z]/.test(m[0]) ? 'cls' : 'var');
    }

    out += hlSpan(c, m[0]);
    last = m.index + m[0].length;
  }

  out += hlEsc(src.slice(last));
  return out;
}
