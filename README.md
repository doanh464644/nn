# Bóng X — Trợ lý AI (bản 3.2)

Ứng dụng chat AI đơn giản viết bằng HTML/CSS/JS thuần (không cần build, không cần
server), kết nối tới endpoint OpenAI-compatible được cấu hình sẵn trong mã nguồn.

## Có gì mới ở bản 3.2

- **Gửi ảnh không còn lỗi "model không đọc được ảnh"** — tin nhắn có ảnh được tự động
  chuyển sang model đọc ảnh (`gemini-3.7-flash-max`, dự phòng `gemini-3.8-flash-max`)
  đã thử thật với endpoint hiện tại; tin nhắn chữ vẫn dùng đúng model bạn đã chọn.
  Lớp dự phòng cũ (gửi lại kèm mô tả ảnh) vẫn giữ làm lưới an toàn cuối cùng.
- **Gỡ nhóm model `antigravity/*`** — nhóm này trả 403 với khoá hiện tại, đã bị loại khỏi
  danh sách dự phòng, khỏi danh sách nạp từ `GET /v1/models`, khỏi dữ liệu cũ trong máy
  (cài đặt, hội thoại, lịch sử chọn model) và khỏi bộ chọn model.
- **Khoá API riêng (tùy chọn)** — mục mới trong Cài đặt: dán khoá API của bạn để không phụ
  thuộc khoá dùng chung. Khoá chỉ nằm trong localStorage của trình duyệt này (key
  `bongx-apikey`), không bao giờ đi vào state, file sao lưu hay file xuất; bỏ trống thì
  dùng lại khoá chung. Ô nhập dạng mật khẩu, hiển thị dưới dạng đã che và không bao giờ
  xuất hiện trong thông báo lỗi hay toast.
- **Sẵn sàng triển khai Vercel** — thêm `vercel.json` (site tĩnh phát hành thư mục gốc,
  không cần build, kèm header bảo mật); hướng dẫn từng bước ở mục *Đưa lên Vercel* bên dưới.

## Có gì mới ở bản 3.1

- **Đính kèm ảnh để AI đọc & phân tích** — nút **🖼️ Ảnh** (`Ctrl+Shift+A`), kéo–thả tệp
  vào cửa sổ, hoặc **dán ảnh** từ bộ nhớ tạm (`Ctrl+V`). Ảnh được nén trong trình duyệt
  (cạnh dài ≤ 1280px, JPEG chất lượng 0.82) rồi gửi cho model theo chuẩn
  `content: [{type:'text'}, {type:'image_url'}]`, tối đa 4 ảnh mỗi tin nhắn.
- **Đính kèm tệp văn bản / mã nguồn** — nút **📎 Tệp**, tối đa 5 tệp mỗi tin nhắn:
  `.txt .md .json .csv .log .yml .xml .html .css .js .ts .py .java .c .cpp .cs .php .rb .go .rs .sql .sh…`
  Nội dung tệp được chèn vào ngữ cảnh trong khối ```` ```<ngôn ngữ> ```` kèm tên và dung lượng.
- **Bạn viết yêu cầu, AI làm theo** — gõ yêu cầu ngay dưới dải đính kèm; nếu chỉ gửi ảnh/tệp
  mà chưa gõ gì, ứng dụng dùng câu lệnh mặc định và đặt tiêu đề hội thoại theo tên tệp.
- **Dải xem trước & quản lý đính kèm** — ảnh thu nhỏ, biểu tượng theo loại tệp, dung lượng,
  nút ✕ cho từng mục và **✕ Bỏ hết**; đính kèm đang chờ được lưu riêng cho từng hội thoại.
- **Xem lại đính kèm đã gửi** — bấm ảnh để mở khung xem lớn (`Esc` để đóng), bấm tệp để xem
  toàn bộ nội dung, có nút **Tải về** / **Sao chép**.
- **Tự lo khi model không nhận ảnh** — nếu máy chủ trả lỗi cho payload có ảnh, ứng dụng tự
  gửi lại kèm mô tả ảnh (tên, kích thước) và thông báo cho bạn biết.
- **Vai trò mới “Soi ảnh & tệp” 🖼️** — prompt chuyên đọc ảnh/chứng từ/tài liệu và mã nguồn.
- **Thống kê & xuất dữ liệu có đính kèm** — bảng cài đặt thêm ô *Ảnh đính kèm*, *Tệp đính kèm*,
  *Dữ liệu đính kèm*; xuất `.md` ghi chú và chèn nội dung tệp, xuất `.json` kèm dữ liệu ảnh,
  sao lưu `.json` giữ nguyên ảnh để khôi phục được.

## Có gì mới ở bản 3.0 (nền tảng)

- **Model & vai trò riêng cho từng hội thoại** — chip ngay trong khung nhập và bản ghim dưới thanh bên;
  hội thoại có thiết lập riêng được đánh dấu, bấm để đổi hoặc gõ `/model`, `/vaitro`.
- **Danh sách model nạp thật** từ `GET /v1/models` (hiện có 32 model); `AI_MODELS` là bản dự phòng khi offline.
- **Vai trò trợ lý (persona)** — 9 vai trò: Mặc định, Lập trình viên, Cây bút, Gia sư, Nhà phân tích,
  Phiên dịch, Siêu ngắn, **Soi ảnh & tệp**, Không vai trò; prompt riêng được gửi dưới dạng message `system`.
- **Lệnh gõ nhanh `/`** — 20 lệnh: nhóm chèn mẫu (tóm tắt, dịch, viết code, soạn email…) và
  nhóm hành động (đính kèm ảnh/tệp, mở cài đặt, đổi model, sao lưu, tìm…).
- **Bảng cài đặt & dữ liệu (`Ctrl + ,`)** — chế độ tối/sáng/theo hệ thống, mật độ thoáng/gọn,
  model & vai trò mặc định, thống kê dữ liệu, bảng phím tắt.
- **Sao lưu / khôi phục `.json`** — xuất toàn bộ (`Ctrl+Shift+S`), nhập lại theo lựa chọn
  **GỘP** hoặc **THAY THẾ**, tự đổi mã hội thoại trùng.
- **Tìm trong hội thoại (`Ctrl + F`)** — thanh tìm riêng, tô sáng mọi đoạn khớp, bộ đếm `n/N`,
  nhảy vòng, gõ không dấu vẫn ra kết quả.
- **Nhập bằng giọng nói** — Web Speech API (`vi-VN`), nghe liên tục, chèn dần vào ô nhập.
- **Tiện ích khối mã** — bật/tắt xuống dòng, tải về máy đúng tên file (ví dụ `bong-x-js-1.js`).
- **Mật độ hiển thị** (thoáng/gọn) và **chế độ theo hệ thống** tự đổi khi máy đổi sáng/tối.

## Tính năng giao diện

**Trò chuyện**
- **Trả lời theo luồng (streaming)** — chữ hiện dần, có nút ■ để dừng giữa dòng, giữ lại phần đã nhận.
- **Khối suy luận** — phần `reasoning_content` của model được gấp gọn trong mục “Suy luận của Bóng X”.
- **Markdown đầy đủ** — tiêu đề, đậm/nghiêng/gạch ngang, tô sáng `==…==`, danh sách (kể cả checkbox),
  bảng, trích dẫn, đường kẻ, ảnh, liên kết an toàn.
- **Tô màu cú pháp** — 7 ngữ pháp lõi (JS/TS, Python, JSON, Bash/Shell, SQL, HTML/XML, CSS) nhận diện
  theo tên ngôn ngữ ghi sau dấu ba huyền, kèm ~30 bí danh (`tsx`, `jsx`, `scss`, `powershell`, `postgres`, `vue`…);
  mỗi khối mã có nhãn ngôn ngữ, **nút xuống dòng**, **nút tải về** (đặt tên `bong-x-<lang>-<số>.<ext>`),
  nút sao chép và ghi chú “đang viết…” khi stream chưa đóng.
- **Thao tác từng tin nhắn** — sao chép, sửa & gửi lại (Ctrl+Enter), đọc to tiếng Việt, tạo lại câu trả lời, xoá kèm **hoàn tác**.
- **Bản nháp riêng** cho từng hội thoại, tự lưu khi gõ.
- **Nhập bằng giọng nói** — nút 🎙️ (`Ctrl+Shift+M`) hoặc lệnh `/mic`; nút tự làm mờ nếu trình duyệt không hỗ trợ.

**Đính kèm ảnh & tệp để AI phân tích (bản 3.1)**
- **Ba cách thêm đính kèm** — nút **🖼️ Ảnh** / **📎 Tệp** trên khung nhập, kéo–thả tệp vào cửa sổ
  (có lớp phủ báo “Thả ảnh hoặc tệp vào đây”), hoặc **dán ảnh** bằng `Ctrl+V`.
- **Giới hạn an toàn** — tối đa 4 ảnh (≤ 8 MB mỗi ảnh) và 5 tệp văn bản (≤ 1 MB mỗi tệp) trong
  một tin nhắn; tệp dài bị cắt ở 60.000 ký tự và ghi rõ “đã lược bớt”; vượt giới hạn sẽ báo
  lỗi rõ lý do ngay trên toast.
- **Xử lý trước khi gửi** — ảnh được vẽ lại vào canvas rồi xuất JPEG (cạnh dài ≤ 1280px, chất
  lượng 0.82) để payload nhẹ mà vẫn đọc được chữ; GIF giữ nguyên để không mất chuyển động;
  tệp văn bản đọc bằng `FileReader` theo UTF-8.
- **Ngữ cảnh gửi model** — câu hỏi của bạn + khối `TỆP ĐÍNH KÈM` (tên, dung lượng, nội dung
  trong khối code đúng ngôn ngữ) đi cùng ảnh dạng `image_url` base64; tin nhắn chỉ có chữ vẫn
  gửi dạng chuỗi như trước.
- **Xem lại sau khi gửi** — ảnh thu nhỏ trong bong bóng (giữ đúng tỉ lệ), bấm để mở khung xem lớn;
  tệp hiện thành thẻ có biểu tượng theo loại, bấm để xem toàn bộ nội dung, kèm nút Tải về/Sao chép.
- **Lệnh nhanh** — `/anh`, `/tep`, `/botep`; menu “⋯” có thêm 3 mục tương ứng; phím tắt `Ctrl+Shift+A`.

**Model & vai trò cho từng hội thoại**
- Chip **vai trò** và **model** ngay trên khung nhập, kèm bản ghim dưới thanh bên và trên thanh tiêu đề;
  hội thoại đặt riêng hiện nhãn “riêng hội thoại này”, bỏ chọn ở bộ chọn là quay về mặc định.
- **Bộ chọn dùng chung** với ô lọc mờ (gõ không dấu), `↑ ↓` `Enter` `Esc`; riêng model có dòng
  “Nạp danh sách model từ máy chủ” và hiện số mục.
- **Vai trò** chỉ gửi prompt khi khác “Không vai trò”, và luôn là message `system` đầu tiên.

**Điều hướng & dữ liệu**
- **Bảng lệnh Ctrl + K** — tìm hội thoại, tìm trong nội dung tin nhắn (bỏ dấu tiếng Việt) và chạy 25 lệnh của ứng dụng.
- **Lệnh gõ nhanh trong ô nhập** — gõ `/` để mở danh sách, `↑ ↓` chọn, `Tab`/`Enter` chèn; chia hai nhóm
  chèn mẫu và hành động.
- **Bảng cài đặt & dữ liệu Ctrl + ,** — chế độ giao diện (tối/sáng/theo hệ thống), mật độ tin nhắn,
  model & vai trò mặc định, thống kê (số hội thoại, tin nhắn, hỏi/đáp, từ, ký tự, khối mã,
  ảnh/tệp đính kèm, dữ liệu đính kèm, ký tự suy luận,
  dung lượng lưu, mốc cũ nhất/mới nhất) và bảng phím tắt.
- **Sao lưu / khôi phục** — xuất toàn bộ dữ liệu ra `bong-x-saoluu-YYYY-MM-DD.json`; nhập lại có thể
  **GỘP** (giữ dữ liệu hiện có) hoặc **THAY THẾ**; hội thoại trùng mã được tự đổi mã mới.
- **Tìm trong hội thoại Ctrl + F** — tô sáng tất cả đoạn khớp, bộ đếm `n/N`, nút ◀ ▶ nhảy vòng, `Esc` để đóng.
- **Ghim hội thoại** lên đầu danh sách; **đổi tên** ngay trong danh sách (nháy đúp).
- **Tìm kiếm thông minh** — gõ không dấu vẫn khớp (“tieu de” → “Tiêu đề”), tô sáng đoạn khớp trong tiêu đề và cả trong nội dung.
- **Xuất hội thoại** ra `.md` hoặc `.json`; xoá toàn bộ dữ liệu trong một nút.

**Trải nghiệm**
- Toast có nút **Hoàn tác** cho mọi thao tác xoá.
- Nút cuộn xuống cuối, thanh tiến trình khi chờ, mốc thời gian kiểu “3 phút trước”, đếm ký tự/từ, ô nhập tự giãn.
- **Chủ đề sáng / tối / theo hệ thống** và **5 bộ màu nhấn** (tím khói, xanh đại dương, bạc hà, hoàng hôn, hồng đào).
- **Mật độ hiển thị** thoáng / gọn (thuộc tính `data-density` trên `<html>`).
- Phím tắt: `Ctrl+K` bảng lệnh, `Ctrl+B` ẩn/hiện thanh bên, `Ctrl+Shift+O` chat mới, `Ctrl+F` tìm trong hội thoại,
  `Ctrl+,` cài đặt, `Ctrl+M` đổi model, `Ctrl+Shift+M` micro, `Ctrl+Shift+A` đính kèm ảnh,
  `Ctrl+Shift+S` sao lưu, `Ctrl+Shift+E` xuất Markdown,
  `Ctrl+Shift+X` xoá tin nhắn, `Ctrl+Shift+D` xoay chế độ, `Alt+↑ / ↓` nhảy giữa các tin nhắn,
  `Esc` đóng/dừng theo thứ tự, `↑` trong ô nhập trống để sửa tin vừa gửi.
- Responsive: dưới 720px thanh bên trượt ra kèm lớp phủ; thiết bị cảm ứng luôn hiện nút thao tác.

## Cấu trúc dự án

```
bong-x-chat/
├── index.html          # Khung HTML, nạp CSS/JS (khung cài đặt, bộ chọn, thanh tìm, menu lệnh,
│                       # dải đính kèm, ô chọn tệp ẩn, khung xem ảnh/tệp, vùng báo kéo–thả)
├── css/
│   └── style.css       # Toàn bộ giao diện (markdown, tô màu cú pháp, mục 10: chip/bộ chọn/cài đặt/tìm,
│                       # mục 11: dải đính kèm, ảnh/tệp trong bong bóng, khung xem, kéo–thả)
└── js/
    ├── config.js       # Hằng số, bộ màu, gợi ý, cấu hình AI, model dự phòng, persona,
    │                   # chế độ giao diện, mật độ, lệnh "/", phím tắt, đuôi file khối mã,
    │                   # giới hạn đính kèm (ATT), định dạng ảnh/tệp cho phép
    ├── storage.js      # State v3 + localStorage, chuẩn hoá dữ liệu (kể cả đính kèm `att`), cài đặt chung,
    │                   # sao lưu/khôi phục, thống kê, tìm kiếm bỏ dấu, ghim/đổi tên/hoàn tác
    ├── theme.js        # Chủ đề sáng / tối / theo hệ thống, mật độ hiển thị, bộ màu nhấn
    ├── highlight.js    # Tô màu cú pháp (tự viết, không thư viện)
    ├── markdown.js     # Render markdown → HTML an toàn (escape trước, chịu được fence chưa đóng)
    ├── api.js          # Gọi API AI (model/persona theo hội thoại) + đọc SSE + nạp /v1/models,
    │                   # dựng ngữ cảnh đa phương thức (text + image_url + nội dung tệp)
    ├── ui.js           # Render giao diện, chip & bộ chọn model/vai trò, bảng cài đặt,
    │                   # tìm trong hội thoại, khối mã, micro, nhảy tin nhắn,
    │                   # đính kèm (chọn/nén ảnh/đọc tệp/dải xem trước/khung xem)
    ├── palette.js      # Bảng lệnh & tìm kiếm mờ (Ctrl + K)
    └── main.js         # Khởi tạo, gắn sự kiện (kể cả kéo–thả, dán ảnh), phím tắt, bắt lỗi ra #errLog
```

## Thứ tự nạp script

`config.js` → `storage.js` → `theme.js` → `highlight.js` → `markdown.js` → `api.js` →
`ui.js` → `palette.js` → `main.js`

Các file chia sẻ biến/hàm qua global scope (script cổ điển), nên **phải nạp đúng
thứ tự** như trong `index.html`.

## Cấu hình AI

Toàn bộ cấu hình nằm trong `js/config.js`, không có giao diện chỉnh sửa:

```js
const AI_BASE  = 'https://ai.hacodev.io.vn/v1';
const AI_KEY   = 'sk-free';
const AI_MODEL = 'deepseek-v4-pro-auto';
```

Muốn đổi model/endpoint chỉ cần sửa 3 dòng trên.

## Chạy

Mở trực tiếp `index.html` bằng trình duyệt (double-click). Không cần cài đặt gì thêm.

> Lưu ý: dùng thẻ `<script>` cổ điển (không phải ES module) để có thể chạy trực tiếp
> qua `file://`. Nếu muốn chuyển sang ES module (`import`/`export`), cần phục vụ
> project qua một web server (ví dụ `python -m http.server`).

## Ghi chú

- Lịch sử hội thoại được lưu trong `localStorage` (key `bongx-chat-v1`) theo lược đồ **v3**:
  mỗi hội thoại có `pinned`, `draft`, `persona`, `model` (rỗng = dùng cài đặt chung) và
  `att` (ảnh/tệp **đang chờ gửi** của hội thoại đó);
  `state.settings` gồm `themeMode`, `density`, `model`, `persona`, `models`
  (danh sách model nạp từ máy chủ). Dữ liệu bản 1/2 được tự động nâng cấp khi đọc,
  vẫn giữ nguyên lựa chọn sáng/tối cũ.
- **Đính kèm trong lược đồ dữ liệu** — tin nhắn có thêm khoá tuỳ chọn `att`:
  `{ images: [{ name, url (data URL base64), w, h, size }], files: [{ name, ext, size, text, cut }] }`.
  `normAtt()` loại bỏ mọi mục sai định dạng, chỉ nhận ảnh `data:image/…` và cắt về đúng giới hạn
  (4 ảnh / 5 tệp) nên dữ liệu cũ hoặc file sao lưu bị sửa tay vẫn an toàn.
- **Dung lượng**: ảnh lưu dạng base64 nên file sao lưu `.json` sẽ lớn lên đáng kể khi có ảnh
  (khoảng 1.33× dung lượng ảnh gốc). Bản xuất `.md` chỉ ghi chú tên đính kèm và chèn nội dung tệp;
  bản xuất `.json` của một hội thoại kèm dữ liệu ảnh nếu tổng ảnh dưới 3 MB (vượt mức thì chỉ ghi
  tên + kích thước để file không quá nặng).
- **Ảnh gửi cho model** theo chuẩn OpenAI: `content` của tin nhắn người dùng là mảng
  `[{ type: 'text', text }, { type: 'image_url', image_url: { url } }]`; nội dung tệp được chèn
  vào phần text trong khối ```` ```<ngôn ngữ> ```` (mọi dấu ba huyền trong tệp được vô hiệu hoá để
  không phá khối code). Nếu máy chủ trả lỗi cho payload có ảnh, ứng dụng **tự gửi lại** không kèm
  dữ liệu ảnh (chỉ còn mô tả tên/kích thước) và báo cho người dùng biết.
- Chủ đề ở key `bongx-theme`, mật độ ở `bongx-density`, bộ màu nhấn ở `bongx-accent`.
- Prompt vai trò được chèn thành message `system` đầu tiên; việc gửi tin dùng model của
  hội thoại (hoặc model mặc định trong cài đặt) — trừ khi tin nhắn có ảnh, khi đó
  `aiModelFor()` tự chuyển sang model đọc ảnh — và `aiBody()` lo phần payload.
- Micro (Web Speech API) chỉ bật khi người dùng bấm nút và trình duyệt cho phép; nút tự làm mờ
  nếu trình duyệt không hỗ trợ.
- Nội dung AI trả về luôn được escape trước khi render, nên không thể chèn HTML/script vào trang.
- Gọi API bằng `fetch` + `ReadableStream` để đọc SSE; có đường dự phòng cho endpoint không hỗ trợ stream.
- Nút ■ (hoặc `Esc`) huỷ request và giữ lại phần nội dung đã nhận.
- Khoá API dùng chung vẫn nhúng trong `config.js` (phù hợp demo/nội bộ); từ bản 3.2 có thể
  dán khoá riêng trong Cài đặt — khoá này chỉ nằm trong localStorage của trình duyệt.

## Kiểm thử

Bản 3.2: bộ kiểm thử riêng (18 phép thử) chạy bằng Chrome headless với `js/config.js +
storage.js + api.js` thật: **18/18 PASS, không có lỗi runtime**, gồm kiểm tra lọc model bị
khoá (hằng số, `normSettings`, `setModelList`, `fetchModels` thật), định tuyến ảnh → model
đọc ảnh (`aiModelFor`/`aiBody`), khoá API riêng (lưu, làm tròn, dùng trong header, không
bao giờ vào state/sao lưu) và **vòng lặp ảnh thật qua API** — máy chủ trả lời mô tả ảnh
qua `gemini-3.7-flash-max`.

Bản 3.1 trước đó đã đạt **299 phép thử — tất cả đạt**, không có lỗi runtime
(`#errLog` rỗng, `body[data-ready="3"]`):

- **A. Cấu hình & khởi động** (14) — hằng số AI/lưu trữ, thẻ gợi ý (kể cả thẻ phân tích đính kèm),
  9 vai trò trợ lý, DOM chính.
- **B. Hằng số đính kèm** (29) — giới hạn `ATT` (4 ảnh / 5 tệp / 8 MB / 1 MB / 1280px),
  định dạng ảnh và đuôi tệp cho phép, câu lệnh mặc định, phím tắt, 3 lệnh `/anh /tep /botep`.
- **C. Chuẩn hoá đính kèm** (26) — `normAtt` loại dữ liệu rác, cắt đúng giới hạn, giới hạn độ dài tên,
  `extOfName`, `attCounts/attEmpty/attBytes/attNames/attPlainNote`.
- **D. Tin nhắn, thống kê & sao lưu** (19) — khoá `att` chỉ xuất hiện khi hợp lệ, đính kèm theo hội thoại,
  thống kê ảnh/tệp, lưu xuống `localStorage`, nhập sao lưu giữ nguyên ảnh.
- **E. Payload gửi model** (35) — `content` dạng mảng `[{type:'text'},{type:'image_url'}]`, khối
  `TỆP ĐÍNH KÈM` kèm ngôn ngữ, ghi chú ảnh khi bỏ dữ liệu ảnh, `aiBody`/`convHasImages`,
  nội dung tệp chứa ```` ``` ```` không phá khối code.
- **F. Luồng gửi kèm đính kèm** (39) — dải xem trước, gửi thật qua `fetch` giả lập (payload có ảnh +
  nội dung tệp), dọn dải sau khi gửi, render ảnh/tệp trong bong bóng, khung xem ảnh/tệp, `Esc` để đóng.
- **F2. Gửi lại khi model từ chối ảnh & câu lệnh mặc định** (14) — tự gửi lại không kèm `image_url`,
  có mô tả ảnh và toast giải thích; ô nhập trống thì dùng câu lệnh mặc định, tiêu đề theo tên tệp.
- **G1. Đọc tệp & nén ảnh** (33) — đọc tệp UTF-8, từ chối vượt dung lượng/định dạng, nhận diện theo
  MIME & đuôi tệp, ảnh PNG thật, nén 2000×1000 → 1280×640 JPEG, GIF giữ nguyên định dạng.
- **G2. Giới hạn, bỏ đính kèm & an toàn** (34) — ảnh hỏng, giới hạn 5 tệp/4 ảnh, cắt tệp dài,
  bỏ từng mục & bỏ hết, nút ✕ trên dải, đính kèm theo từng hội thoại, các hàm chịu được dữ liệu lạ.
- **H. Xuất dữ liệu, kéo thả, lệnh & hồi quy giao diện** (56) — `.md` ghi chú + chèn nội dung tệp,
  `.json` kèm `att`, 3 ô thống kê mới, menu “⋯”, `accept`/`multiple` của ô chọn tệp, `hasFileDrag`,
  `filesFromTransfer`, lớp phủ kéo–thả, lệnh bảng & lệnh `/`, markdown/XSS và các render cũ.

Ngoài ra đã gọi **thật** từ trong trang (Chrome headless, không dùng `fetch` giả lập):

- `GET /v1/models` → danh sách model thật; từ bản 3.2 nhóm `antigravity/*` (bị 403) được
  lọc bỏ ngay khi nạp, model đang dùng được ghim lên đầu danh sách.
- `POST /v1/chat/completions` (chỉ chữ) → trả về nội dung bình thường.
- `POST /v1/chat/completions` **có ảnh** (payload `content` dạng mảng với `image_url` base64) →
  model mặc định `deepseek-v4-pro-auto` **từ chối ảnh**, nên từ bản 3.2 payload ảnh được tự
  động gửi qua `gemini-3.7-flash-max`; đã gọi thật và nhận mô tả đúng nội dung ảnh.
  Đường dự phòng "gửi lại không kèm ảnh" vẫn giữ làm lưới an toàn khi đổi model.
- Giao diện đã được chụp ảnh kiểm tra ở 3 trạng thái: bong bóng có ảnh/tệp + dải đính kèm,
  khung xem ảnh lớn, khung xem nội dung tệp (ảnh xem trước giữ đúng tỉ lệ, không cắt mất nội dung).

Bộ kiểm thử bản 3.1 chạy bằng cách sao `index.html` thành một trang tạm có thêm `<script>`
kiểm thử rồi `chrome --headless=new --disable-gpu --virtual-time-budget=20000 --dump-dom
<trang-tạm>`; kết quả đọc từ `#testOut` và `document.title` (`PASS=299 FAIL=0`). Bản 3.2
dùng cách tương tự với trang tạm nạp trực tiếp 3 file JS lõi, kết quả đọc từ `#out`.

## Đưa lên Vercel

Ứng dụng là site tĩnh thuần (không build, không server) nên triển khai rất đơn giản.
Trong thư mục đã có sẵn `vercel.json` — cấu hình phát hành thư mục gốc, kèm header
bảo mật (`X-Content-Type-Options: nosniff`) và `Cache-Control: no-cache` để bản mới
luôn hiện ngay sau khi deploy.

**Cách 1 — Giao diện web (khuyên dùng):**
1. Đẩy thư mục này lên một repo GitHub.
2. Vào vercel.com → **Add New… → Project**, chọn repo đó.
3. Vercel tự nhận dạng "Other" (site tĩnh): **Build Command** để trống,
   **Output Directory** để mặc định (thư mục gốc).
4. Bấm **Deploy** — mở địa chỉ `https://<tên-project>.vercel.app`
   (có thể gắn tên miền riêng sau trong **Settings → Domains**).

**Cách 2 — Vercel CLI từ máy:**
1. `npm i -g vercel`
2. Trong thư mục dự án chạy `vercel` — lần đầu sẽ hỏi đăng nhập và cấu hình, cứ chọn mặc định.
3. Bản chính thức: `vercel --prod`.

Ghi chú:
- Không cần biến môi trường: endpoint và khoá dùng chung nằm trong `js/config.js`; người
  dùng có thể tự dán khoá API riêng trong Cài đặt (chỉ lưu trên trình duyệt của họ).
- Vercel tự lo HTTPS, nén và CDN toàn cầu; không có bước build nên mỗi lần `git push`
  (hoặc `vercel --prod`) là bản mới được phát hành ngay.

