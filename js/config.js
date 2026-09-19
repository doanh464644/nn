// ===== Tiện ích dùng chung =====
const $  = id => document.getElementById(id);
const $$ = sel => Array.from(document.querySelectorAll(sel));

// ===== Khoá lưu trữ =====
const STORE      = 'bongx-chat-v1';   // danh sách cuộc trò chuyện + cài đặt
const THEME_KEY  = 'bongx-theme';     // chế độ: dark | light | system
const ACCENT_KEY = 'bongx-accent';    // bộ màu nhấn
const DENSITY_KEY = 'bongx-density';  // mật độ hiển thị (đọc sớm, chống nháy)
const APIKEY_KEY = 'bongx-apikey';    // khoá API riêng của người dùng (bản 3.2)

// ===== Bộ màu nhấn (đổi bằng nút 🎨 hoặc trong bảng lệnh) =====
const ACCENTS = [
  { id: 'violet', name: 'Tím khói',     c1: '#7c5cff', c2: '#22d3ee', c3: '#ff7ac6' },
  { id: 'ocean',  name: 'Xanh đại dương', c1: '#2563eb', c2: '#06b6d4', c3: '#818cf8' },
  { id: 'mint',   name: 'Bạc hà',       c1: '#0d9488', c2: '#22c55e', c3: '#5eead4' },
  { id: 'sunset', name: 'Hoàng hôn',    c1: '#f97316', c2: '#ec4899', c3: '#fbbf24' },
  { id: 'rose',   name: 'Hồng đào',     c1: '#e11d48', c2: '#a855f7', c3: '#fb7185' }
];

// ===== Thẻ gợi ý ở màn hình chào =====
const SUGGESTIONS = [
  { icon: '✨', title: 'Viết bài giới thiệu thương hiệu Bóng X', sub: 'Nội dung marketing',
    prompt: 'Viết bài giới thiệu ngắn (khoảng 200 từ) cho thương hiệu "Bóng X" — một trợ lý AI thân thiện, nhanh và dễ dùng. Giọng văn gần gũi, có tiêu đề và 3 gạch đầu dòng nêu điểm nổi bật.' },
  { icon: '🧠', title: 'Giải thích trí tuệ nhân tạo là gì', sub: 'Kiến thức cơ bản',
    prompt: 'Giải thích trí tuệ nhân tạo (AI) là gì cho người không có nền tảng kỹ thuật. Dùng ví dụ đời thường, so sánh AI hẹp và AI tổng quát, kết thúc bằng 3 ứng dụng phổ biến.' },
  { icon: '🌌', title: 'Viết một bài thơ ngắn về bầu trời', sub: 'Sáng tác',
    prompt: 'Viết một bài thơ 4 khổ về bầu trời đêm, có hình ảnh ngôi sao và dải Ngân Hà. Sau bài thơ, chú thích ngắn ý nghĩa từng khổ.' },
  { icon: '💻', title: 'Hướng dẫn học lập trình cho người mới', sub: 'Lập trình',
    prompt: 'Lập lộ trình học lập trình cho người mới trong 3 tháng, chia theo tuần. Nêu ngôn ngữ nên bắt đầu, tài nguyên học miễn phí và 3 dự án nhỏ để luyện tập.' },
  { icon: '📊', title: 'So sánh giúp tôi hai phương án', sub: 'Ra quyết định',
    prompt: 'Hướng dẫn tôi cách so sánh hai phương án khi ra quyết định: lập bảng tiêu chí – trọng số – điểm số. Cho ví dụ minh hoạ bằng một bảng markdown.' },
  { icon: '🐞', title: 'Gỡ lỗi giúp tôi đoạn code', sub: 'Lập trình',
    prompt: 'Khi tôi dán một đoạn code bị lỗi, hãy chỉ ra nguyên nhân, giải thích vì sao và đưa bản sửa hoàn chỉnh. Trả lời theo 3 mục: Nguyên nhân – Bản sửa – Lưu ý.' },
  { icon: '🖼️', title: 'Phân tích ảnh hoặc tệp tôi gửi', sub: 'Đính kèm để AI đọc',
    prompt: 'Tôi sẽ đính kèm ảnh hoặc tệp. Hãy đọc kỹ nội dung đính kèm, mô tả chính xác những gì nhìn thấy (chữ, số liệu, bố cục), rồi nêu 3 điểm đáng lưu ý và những chỗ chưa rõ để tôi bổ sung.' }
];

// ===== Cấu hình AI (hardcode, không có UI chỉnh sửa) =====
const AI_BASE  = 'https://ai.hacodev.io.vn/v1';
const AI_KEY   = 'sk-free';
const AI_MODEL = 'deepseek-v4-pro-auto';

const AI_PRESET = 'Bạn là Bóng X, trợ lý AI thân thiện, chính xác và hữu ích. ' +
  'Luôn trả lời bằng tiếng Việt trừ khi người dùng yêu cầu ngôn ngữ khác. ' +
  'Trình bày rõ ràng bằng markdown: dùng tiêu đề, danh sách, bảng khi phù hợp; ' +
  'đặt code trong khối ``` kèm tên ngôn ngữ. Nếu không chắc chắn, hãy nói rõ mức độ tin cậy ' +
  'thay vì bịa thông tin.';

/* ===== Bản 3.0: chế độ giao diện, mật độ, model, vai trò trợ lý ===== */

/* Chế độ sáng / tối / theo hệ thống */
const THEME_MODES = [
  { id: 'dark',   name: 'Tối',           ico: '🌙' },
  { id: 'light',  name: 'Sáng',          ico: '☀️' },
  { id: 'system', name: 'Theo hệ thống', ico: '🖥️' }
];

/* Mật độ hiển thị tin nhắn */
const DENSITIES = [
  { id: 'comfy',   name: 'Thoáng', ico: '📐' },
  { id: 'compact', name: 'Gọn',    ico: '📏' }
];

/* Danh sách model dự phòng (máy chủ có /v1/models thì nạp live, xem api.js).
   Bản 3.2: đã loại nhóm antigravity/* — máy chủ trả 403 với khoá hiện tại. */
const AI_MODELS = [
  'deepseek-v4-pro-auto',
  'tdpsk_deepseek-v4-pro-202606',
  'glm-5.3',
  'glm-5.3-flash',
  'glm-flash-free',
  'auto-model'
];

/* Bản 3.2: tiền tố model bị chặn — ẩn khỏi danh sách chọn và tự gỡ khỏi dữ liệu cũ */
const MODEL_BLOCK = 'antigravity/';

/* Bản 3.2: model đọc được ảnh (đã thử thật với khoá hiện tại). Khi tin nhắn có ảnh
   mà model đang chọn không thuộc nhóm này, ảnh được gửi qua model đầu tiên còn dùng
   được trong danh sách — xem aiModelFor() trong api.js. */
const VISION_MODELS = ['gemini-3.7-flash-max', 'gemini-3.8-flash-max'];

/* Model có đọc được ảnh không / có bị chặn không (dùng ở api.js, ui.js, storage.js) */
function isVisionModel(m) {
  return VISION_MODELS.indexOf(String(m || '')) >= 0;
}

function isBlockedModel(m) {
  return String(m || '').indexOf(MODEL_BLOCK) === 0;
}

/* Vai trò của trợ lý (system prompt riêng cho từng hội thoại) */
const PERSONAS = [
  { id: 'default', name: 'Mặc định', ico: '✨', sub: 'Cân bằng, đúng trọng tâm', prompt: AI_PRESET },
  { id: 'code', name: 'Lập trình viên', ico: '💻', sub: 'Code, gỡ lỗi, kiến trúc',
    prompt: 'Bạn là kỹ sư phần mềm nhiều kinh nghiệm. Trả lời bằng tiếng Việt, code đặt trong khối ``` kèm tên ngôn ngữ. ' +
      'Luôn nêu: nguyên nhân – giải pháp – code hoàn chỉnh – lưu ý khi triển khai. Ưu tiên giải pháp đơn giản, an toàn, dễ đọc.' },
  { id: 'writer', name: 'Cây bút', ico: '✍️', sub: 'Bài viết, marketing, kể chuyện',
    prompt: 'Bạn là biên tập viên nội dung tiếng Việt. Viết tự nhiên, giàu hình ảnh, câu ngắn dễ đọc, tránh sáo rỗng. ' +
      'Khi viết dài, có tiêu đề rõ ràng theo mở bài – thân bài – kết bài và gợi ý 2 phương án tiêu đề.' },
  { id: 'teacher', name: 'Gia sư', ico: '🎓', sub: 'Giải thích dễ hiểu, từng bước',
    prompt: 'Bạn là gia sư kiên nhẫn. Giải thích theo từng bước, bắt đầu từ khái niệm đơn giản, dùng ví dụ đời thường, ' +
      'sau đó mới tới chi tiết. Cuối câu trả lời đặt 2 câu hỏi nhỏ để kiểm tra người học đã hiểu chưa.' },
  { id: 'analyst', name: 'Nhà phân tích', ico: '📊', sub: 'Dữ liệu, so sánh, quyết định',
    prompt: 'Bạn là nhà phân tích. Luôn cấu trúc câu trả lời thành: Dữ kiện – Phân tích – Rủi ro – Khuyến nghị. ' +
      'Dùng bảng markdown khi so sánh, nêu rõ giả định và mức độ chắc chắn của mỗi kết luận.' },
  { id: 'translate', name: 'Phiên dịch', ico: '🌐', sub: 'Dịch Việt ⇄ Anh sát nghĩa',
    prompt: 'Bạn là phiên dịch chuyên nghiệp. Dịch sát nghĩa nhưng tự nhiên, giữ nguyên định dạng markdown và khối code. ' +
      'Với từ chuyên ngành, ghi bản dịch kèm thuật ngữ gốc trong ngoặc. Nếu câu gốc tối nghĩa, hỏi lại thay vì đoán.' },
  { id: 'brief', name: 'Siêu ngắn', ico: '⚡', sub: 'Tối đa 5 gạch đầu dòng',
    prompt: 'Bạn trả lời cực ngắn: tối đa 5 gạch đầu dòng, mỗi dòng dưới 20 từ, không mở bài, không kết luận dài dòng. ' +
      'Chỉ dùng khối code khi thật sự cần thiết.' },
  { id: 'soianh', name: 'Soi ảnh & tệp', ico: '🖼️', sub: 'Đọc ảnh, tài liệu, mã nguồn',
    prompt: 'Bạn là chuyên gia đọc và phân tích tài liệu đính kèm. Với ảnh: mô tả chính xác những gì nhìn thấy ' +
      '(chữ, số liệu, bố cục, chi tiết bất thường) rồi mới kết luận. Với tệp: tóm tắt cấu trúc, chỉ ra lỗi hoặc điểm ' +
      'đáng nghi, trích dẫn đoạn liên quan. Luôn trả lời bằng tiếng Việt, chia mục rõ ràng và ghi rõ khi không chắc chắn.' },
  { id: 'none', name: 'Không vai trò', ico: '🚫', sub: 'Không gửi system prompt', prompt: '' }
];

function findPersona(id) {
  return PERSONAS.find(p => p.id === id) || PERSONAS[0];
}

// ===== Phím tắt (hiển thị trong bảng lệnh) =====
const SHORTCUTS = {
  palette: 'Ctrl + K',
  sidebar: 'Ctrl + B',
  newChat: 'Ctrl + Shift + O',
  exportMd: 'Ctrl + Shift + E',
  theme: 'Ctrl + J',
  clear: 'Ctrl + Shift + X',
  settings: 'Ctrl + ,',
  find: 'Ctrl + F',
  backup: 'Ctrl + Shift + S',
  jumpMsg: 'Alt + ↑ / ↓',
  model: 'Ctrl + M',
  mic: 'Ctrl + Shift + M',
  attach: 'Ctrl + Shift + A'
};

// ===== Lệnh gõ nhanh trong ô nhập — gõ "/" để mở danh sách =====
const SLASH_COMMANDS = [
  { key: 'tomtat',    ico: '⚡', label: 'Tóm tắt',              sub: 'Gạch đầu dòng ý chính',
    insert: 'Tóm tắt nội dung sau bằng tiếng Việt, nêu 3–5 gạch đầu dòng quan trọng nhất:\n\n' },
  { key: 'dich',      ico: '🌐', label: 'Dịch sang tiếng Việt', sub: 'Giữ nguyên định dạng',
    insert: 'Dịch sang tiếng Việt, giữ nguyên định dạng và thuật ngữ chuyên ngành:\n\n' },
  { key: 'dichanh',   ico: '🇬🇧', label: 'Dịch sang tiếng Anh',  sub: 'Natural English',
    insert: 'Translate into natural English, keep the markdown formatting and code blocks:\n\n' },
  { key: 'giaithich', ico: '🎓', label: 'Giải thích dễ hiểu',    sub: 'Có ví dụ đời thường',
    insert: 'Giải thích nội dung sau cho người mới, dùng ví dụ đời thường rồi mới tới chi tiết:\n\n' },
  { key: 'code',      ico: '💻', label: 'Viết code',             sub: 'Kèm chú thích & ví dụ',
    insert: 'Viết code cho yêu cầu sau, kèm chú thích và ví dụ chạy thử:\n\n' },
  { key: 'loi',       ico: '🐞', label: 'Tìm lỗi trong code',    sub: 'Nguyên nhân – cách sửa',
    insert: 'Tìm lỗi trong đoạn code sau: nêu nguyên nhân, cách sửa và bản code hoàn chỉnh.\n\n```\n\n```' },
  { key: 'email',     ico: '✉️', label: 'Soạn email',            sub: 'Trang trọng, có lời kết',
    insert: 'Soạn email chuyên nghiệp cho tình huống sau (có tiêu đề và lời kết):\n\n' },
  { key: 'kehoach',   ico: '🗂️', label: 'Lập kế hoạch',          sub: 'Chia theo tuần + mốc',
    insert: 'Lập kế hoạch chi tiết cho mục tiêu sau, chia theo tuần kèm mốc kiểm tra và rủi ro:\n\n' },
  { key: 'bang',      ico: '📊', label: 'Bảng so sánh',          sub: 'Tiêu chí + kết luận',
    insert: 'Lập bảng markdown so sánh các phương án sau theo tiêu chí, kèm kết luận nên chọn phương án nào:\n\n' },
  { key: 'anh',       ico: '🖼️', label: 'Đính kèm ảnh',           sub: 'AI đọc & phân tích ảnh',    act: 'attach-image' },
  { key: 'tep',       ico: '📎', label: 'Đính kèm tệp',           sub: 'Txt, code, json, csv…',     act: 'attach-file' },
  { key: 'botep',     ico: '🧹', label: 'Bỏ mọi đính kèm',        sub: 'Xoá ảnh/tệp đang chờ gửi',  act: 'attach-clear' },
  { key: 'caidat',    ico: '⚙️', label: 'Mở cài đặt',            sub: 'Giao diện, model, sao lưu', act: 'settings' },
  { key: 'model',     ico: '🧩', label: 'Đổi model',             sub: 'Chọn cho hội thoại này',    act: 'model' },
  { key: 'vaitro',    ico: '🎭', label: 'Đổi vai trò trợ lý',    sub: 'Persona của hội thoại',     act: 'persona' },
  { key: 'tim',       ico: '🔍', label: 'Tìm trong hội thoại',   sub: 'Ctrl + F',                  act: 'find' },
  { key: 'xuat',      ico: '⬇️', label: 'Xuất hội thoại (.md)',  sub: 'Markdown',                  act: 'export-md' },
  { key: 'saoluu',    ico: '💾', label: 'Sao lưu tất cả (.json)', sub: 'Gồm mọi hội thoại',        act: 'backup' },
  { key: 'xoa',       ico: '🧹', label: 'Xoá tin nhắn hội thoại này', sub: 'Không thể hoàn tác',   act: 'clear' },
  { key: 'moi',       ico: '＋', label: 'Chat mới',               sub: 'Bắt đầu hội thoại trống',   act: 'new' }
];

// ===== Đuôi file khi tải một khối code về máy =====
const CODE_EXT = {
  js: 'js', javascript: 'js', ts: 'ts', py: 'py', python: 'py', json: 'json',
  bash: 'sh', sh: 'sh', shell: 'sh', zsh: 'sh', sql: 'sql', html: 'html', htm: 'html',
  xml: 'xml', svg: 'svg', css: 'css', scss: 'scss', java: 'java', c: 'c', cpp: 'cpp',
  csharp: 'cs', cs: 'cs', php: 'php', go: 'go', rust: 'rs', rs: 'rs', rb: 'rb',
  kotlin: 'kt', kt: 'kt', swift: 'swift', yml: 'yml', yaml: 'yaml', md: 'md',
  markdown: 'md', ini: 'ini', toml: 'toml', dockerfile: 'Dockerfile', text: 'txt', txt: 'txt'
};

/* ===== Bản 3.1: đính kèm ảnh & tệp để AI phân tích ===== */

/* Giới hạn an toàn — vượt mức sẽ bị từ chối kèm thông báo rõ ràng */
const ATT = {
  images: 4,          // số ảnh tối đa trong một tin nhắn
  files: 5,           // số tệp tối đa trong một tin nhắn
  imageMB: 8,         // dung lượng ảnh gốc tối đa (trước khi nén)
  fileMB: 1,          // dung lượng tệp văn bản tối đa
  fileChars: 60000,   // số ký tự tối đa trích từ một tệp
  totalChars: 120000, // tổng ký tự tệp trong một tin nhắn
  imgEdge: 1280,      // cạnh dài nhất của ảnh sau khi nén
  imgQuality: 0.82,   // chất lượng JPEG sau khi nén
  thumbEdge: 240      // cạnh dài nhất của ảnh xem trước
};

/* Định dạng ảnh được gửi cho AI (dạng data URL base64) */
const ATT_IMG_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];

/* Đuôi tệp văn bản đọc được nội dung để đưa vào ngữ cảnh */
const ATT_TEXT_EXT = ['txt', 'text', 'md', 'markdown', 'json', 'jsonc', 'csv', 'tsv', 'log',
  'yml', 'yaml', 'xml', 'html', 'htm', 'css', 'scss', 'less', 'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx',
  'py', 'java', 'kt', 'kts', 'c', 'h', 'cpp', 'hpp', 'cc', 'cs', 'php', 'rb', 'go', 'rs', 'swift',
  'sql', 'sh', 'bash', 'zsh', 'bat', 'cmd', 'ps1', 'ini', 'toml', 'conf', 'env', 'vue', 'svelte',
  'dart', 'lua', 'pl', 'r', 'm', 'gitignore'];

/* Câu lệnh mặc định khi người dùng chỉ đính kèm mà chưa gõ yêu cầu */
const ATT_DEFAULT_PROMPT = 'Hãy phân tích nội dung tôi đính kèm: nêu những điểm chính, ' +
  'số liệu hoặc chi tiết đáng chú ý và những điều tôi nên lưu ý.';

/* Dùng cho lệnh /anh, /tep — cũng là giá trị data-act trong menu “Thêm” */
const ATT_ACTS = ['attach-image', 'attach-file', 'attach-clear'];

function findAtt(att) {
  const a = (att && typeof att === 'object') ? att : null;
  return {
    images: a && Array.isArray(a.images) ? a.images : [],
    files: a && Array.isArray(a.files) ? a.files : []
  };
}


