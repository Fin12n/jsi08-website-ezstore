
## [2026-07-12 18:38] - Mua hàng ZCoin không nhận được sản phẩm & QR payment polling redirect không hoạt động

- **Type**: Logic
- **Severity**: Critical
- **File**: `src/routes/index.js:396` & `src/routes/webhook.js:71`
- **Agent**: ezstore
- **Root Cause**: 
  1. Khi thanh toán bằng ZCoin, đơn hàng được tạo ban đầu với trạng thái `status: 'completed'`. Khi chuyển tiếp đến `completeOrder()`, hàm này kiểm tra `status === 'completed'` và kết thúc sớm (short-circuit) mà không thực hiện logic nạp sản phẩm vào thư viện hay chia hoa hồng cho người bán.
  2. Webhook của ngân hàng chuyển đổi toàn bộ nội dung chuyển khoản thành chữ hoa (`.toUpperCase()`), làm thay đổi định dạng ID của đơn hàng trong Firestore (vốn phân biệt chữ hoa/thường), dẫn đến việc webhook không tìm thấy đơn hàng tương ứng để hoàn tất thanh toán.
- **Fix Applied**: 
  1. Khởi tạo đơn hàng thanh toán ZCoin với trạng thái `status: 'pending'` để `completeOrder()` xử lý phân phối rồi mới đổi thành `completed`.
  2. Loại bỏ `.toUpperCase()` trên trường `transferContent` của webhook để giữ nguyên tính phân biệt chữ hoa/thường của ID đơn hàng, đồng thời vẫn bảo toàn tính năng so khớp case-insensitive cho mã nạp tiền.
- **Prevention**: Thêm unit test và kiểm tra case-sensitivity của các mã đơn hàng động tạo bởi Firestore.
- **Status**: Fixed

---

## [2026-07-12 02:48] - GET /admin 500 Internal Server Error (EJS Include Resolve Path Exception)

- **Type**: Integration
- **Severity**: Critical
- **File**: `src/views/admin/layout.ejs:366`
- **Agent**: ezstore
- **Root Cause**: The admin layout page attempted to include the UI Notifier using `./partials/ui-notify`, but the partial resides under the root views folder (`src/views/partials/`) rather than the admin-specific views folder (`src/views/admin/partials/`). This path mismatch caused EJS to crash with a file-not-found resolve error during render time, resulting in a 500 status code response.
- **Error Message**: 
  ```
  Error: Failed to lookup view "./partials/ui-notify" in views directory
  ```
- **Fix Applied**: Adjusted relative path from `./partials/ui-notify` to `../partials/ui-notify` to properly traverse up and resolve the file.
- **Prevention**: Expanded local EJS validation scripts (`scratch/test_all_ejs.js`) to compile layout files and run tests before committing code.
- **Status**: Fixed

---

# EZ Store Error Log

File này lưu trữ toàn bộ các lỗi phát hiện và được sửa trong hệ thống để phục vụ học hỏi và ngăn chặn tái diễn lỗi.

---

## [2026-06-21 14:26] - Lỗi TypeError khi truy cập Giỏ Hàng (/cart)

- **Type**: Runtime
- **Severity**: High
- **File**: `src/routes/index.js:150`
- **Agent**: jsi08
- **Root Cause**: Khi người dùng truy cập trang `/cart`, hệ thống duyệt qua danh sách sản phẩm trong giỏ hàng (`req.session.cart`) và thực hiện `item.price.toString()`. Tuy nhiên, nếu một sản phẩm không có thuộc tính `salePrice` (ví dụ do tạo từ admin/seller mà thiếu hoặc sai thuộc tính), giá trị `item.price` sẽ bị `undefined`, gây ra lỗi không thể gọi `.toString()` của giá trị undefined.
- **Error Message**: 
  ```
  TypeError: Cannot read properties of undefined (reading 'toString')
      at /media/fin12n/DATA/JSI08/new/EZ_Store_JSI08/src/routes/index.js:150:20
      at Array.forEach (<anonymous>)
      at /media/fin12n/DATA/JSI08/new/EZ_Store_JSI08/src/routes/index.js:149:22
  ```
- **Fix Applied**: 
  1. Cập nhật router `/cart` để kiểm tra thuộc tính `item.price` khác `undefined` và `null` trước khi thực hiện chuyển đổi chuỗi và tính toán tổng tiền.
  2. Cập nhật router `/cart/add` để gán giá trị `price` phòng vệ hơn bằng cách sử dụng toán tử fallback: `product.salePrice || product.originalPrice || product.price || (product.priceNumber ? product.priceNumber.toString() : '0')`.
- **Prevention**: Luôn áp dụng defensive coding (optional chaining, fallback values, validation) đối với các trường thông tin lấy từ cơ sở dữ liệu động như Firestore trước khi thực hiện các phép biến đổi kiểu dữ liệu.
- **Status**: Fixed

---

## [2026-06-29 04:54] - Lỗi API Settings POST 404 Not Found & Lỗi EROFS Deploy Preview Cũ trên Vercel

- **Type**: Integration / Routing
- **Severity**: High
- **File**: `src/app.js:208` & `src/routes/admin/settings.js:13`
- **Agent**: ezstore
- **Root Cause**: 
  1. Router cài đặt mới `adminSettingsRouter` được mount tại `/admin/settings` trong khi các form action của cài đặt trong `settings.ejs` gửi yêu cầu đến `/admin/api/settings/...` (gây lệch routing path dẫn tới lỗi 404).
  2. Lỗi EROFS (Read-only file system) xảy ra trên các bản deploy preview cũ hơn của Vercel (chưa được đồng bộ code chuyển sang cookie-session) vẫn cố gắng ghi file session local lên serverless storage.
- **Error Message**: 
  ```
  POST 404 /admin/api/settings/chatbot
  GET 500 / Error: EROFS: read-only file system, mkdir '/var/task/sessions'
  ```
- **Fix Applied**: 
  1. Đổi mount path của `adminSettingsRouter` trong `src/app.js` thành `/admin` (đồng bộ với `/admin/api/settings/...`).
  2. Sửa route GET trang cài đặt trong `src/routes/admin/settings.js` từ `/` thành `/settings` để giữ nguyên URL truy cập `/admin/settings`.
  3. Loại bỏ route GET `/settings` trùng lặp trong `src/routes/admin.js` cũ.
  4. Xác nhận deploy mới nhất và domain chính (`jsi08.ezstore.site`) đã hoàn toàn sử dụng `cookie-session` nên không bao giờ bị lỗi EROFS.
- **Prevention**: Luôn đồng bộ mount path của router với form actions tương ứng, tránh trùng lặp route và tuyệt đối không ghi file local trên serverless cloud.
- **Status**: Fixed

---


## [2026-07-06 06:02] - Lỗi SyntaxError: Unexpected token 'class' in categories.ejs

- **Type**: Syntax
- **Severity**: High
- **File**: `src/views/admin/categories.ejs:117`
- **Agent**: ezstore
- **Root Cause**: Lồng các chuỗi backtick (`` ` ``) vào nhau. File `categories.ejs` định nghĩa toàn bộ HTML của view bằng một chuỗi template literal bao bởi dấu backtick lớn ở ngoài. Khi thêm khối JavaScript để tạo HTML dòng trường động, tác nhân đã dùng tiếp dấu backtick (`` ` ``) cho biến `html` bên trong JS script tag. Điều này khiến trình biên dịch EJS hiểu nhầm rằng chuỗi HTML lớn đã kết thúc sớm, dẫn đến lỗi cú pháp không mong muốn khi compile template.
- **Error Message**: 
  ```
  SyntaxError: Unexpected token 'class' in /var/task/src/views/admin/categories.ejs while compiling ejs
  ```
- **Fix Applied**: Thay thế toàn bộ chuỗi HTML dùng backtick bên trong phần Javascript client-side bằng chuỗi sử dụng dấu nháy đơn `'` và phép cộng chuỗi `+` để ghép chuỗi an toàn tuyệt đối, tránh mọi hiện tượng lồng ký tự đặc biệt làm sai lệch cú pháp biên dịch EJS.
- **Prevention**: Khi viết mã HTML động chứa Javascript bên trong các template EJS được bọc bởi backticks lớn, hãy sử dụng dấu nháy đơn `'` hoặc nháy kép `"` và các phép nối chuỗi cổ điển cho các chuỗi HTML nội bộ của Javascript để tránh xung đột cú pháp compile-time.
- **Status**: Fixed

## [2026-07-06 06:08] - Lỗi hiển thị thô mã ES6 template literal trên categories.ejs

- **Type**: Logic / Syntax
- **Severity**: High
- **File**: `src/views/admin/categories.ejs:36`
- **Agent**: ezstore
- **Root Cause**: Do tác nhân sử dụng ký tự escape `\` trước các dấu `$` trong các chuỗi biểu thức template literal `${expression}` (ví dụ: `\${cat.name}`). Việc escape này làm cho Javascript hiểu đó là chuỗi ký tự thông thường chứ không phải biểu thức cần biên dịch, dẫn đến việc trình duyệt hiển thị nguyên văn đoạn mã Javascript dạng chuỗi lên giao diện.
- **Fix Applied**: Loại bỏ hoàn toàn việc sử dụng backticks lồng trong phần vòng lặp vẽ bảng danh mục, chuyển sang sử dụng dấu nháy đơn `'` và phép ghép chuỗi cộng `+` cổ điển để Javascript render chính xác giá trị từ các trường dữ liệu mà không cần escape dấu `$`.
- **Prevention**: Tránh sử dụng escape `\${` khi đang viết mã trong các chuỗi template literals nếu muốn Javascript thực hiện định giá biểu thức đó khi render. Nếu cấu trúc lồng nhau quá phức tạp, hãy chuyển đổi các block bên trong sang sử dụng nối chuỗi nháy đơn `'`.
- **Status**: Fixed

## [2026-07-06 06:18] - Lỗi nút "Thêm trường" không hoạt động do readyState của DOM

- **Type**: Logic
- **Severity**: Medium
- **File**: `src/views/admin/categories-new.ejs:79`
- **Agent**: ezstore
- **Root Cause**: Script gán sự kiện click cho nút `btn-add-field` được đặt trong một khối lắng nghe sự kiện `DOMContentLoaded`. Tuy nhiên, do cấu trúc render template của EJS (được chèn ở cuối body), tại thời điểm script tải xong và thực thi, sự kiện `DOMContentLoaded` có thể đã được kích hoạt từ trước bởi trình duyệt. Điều này dẫn tới việc hàm lắng nghe sự kiện click cho nút không bao giờ được thiết lập.
- **Fix Applied**: Bổ sung hàm kiểm tra trạng thái tải của tài liệu (`document.readyState === 'loading'`). Nếu tài liệu vẫn đang tải thì tiếp tục dùng `DOMContentLoaded`, ngược lại thì kích hoạt trực tiếp hàm khởi tạo ngay lập tức. Cập nhật sửa tương tự cho trang tạo mới và sửa sản phẩm.
- **Prevention**: Luôn sử dụng mô hình kiểm tra `document.readyState` phòng thủ khi đăng ký các sự kiện tải trang cho Javascript đặt ở cuối body hoặc các script tải không đồng bộ để tránh bị lỡ sự kiện `DOMContentLoaded`.
- **Status**: Fixed

## [2026-07-06 06:28] - Lỗi nút "Thêm trường" không phản hồi do xung đột vòng đời của Alpine.js và Vanilla JS

- **Type**: Logic / Integration
- **Severity**: High
- **File**: `src/views/admin/categories-new.ejs:78`
- **Agent**: ezstore
- **Root Cause**: Layout quản trị của EZ Studio được bọc và quản lý bởi Alpine.js (`x-data="adminApp()"` tại thẻ `<body>`). Việc gán các sự kiện click và thay đổi DOM bằng mã Vanilla JS truyền thống (`addEventListener` kết hợp `insertAdjacentHTML`) xảy ra xung đột khi Alpine.js tiến hành biên dịch lại và quản lý trạng thái DOM reactive. Điều này làm mất các event listener đã gán thủ công và ngăn cản mã Vanilla JS tương tác với DOM.
- **Fix Applied**: Loại bỏ hoàn toàn mã Vanilla JS và các hàm script thủ công. Chuyển đổi toàn bộ logic của trang tạo danh mục mới sang dùng cơ chế reactive thuần túy của Alpine.js bằng thuộc tính `x-data`, `@click="addField()"`, và vòng lặp `<template x-for="...">` để render các dòng trường động một cách tự nhiên và ổn định 100%.
- **Prevention**: Khi làm việc trên các giao diện đã được kiểm soát bởi các thư viện MVVM/Reactive như Alpine.js hay Vue/React, hãy ưu tiên sử dụng cú pháp binding của chính thư viện đó thay vì can thiệp DOM thủ công bằng Vanilla JS để tránh lỗi xung đột vòng đời và mất event listener.
- **Status**: Fixed

## [2026-07-06 06:35] - Lỗi nút toggle Bắt buộc (Required) không bấm được và vỡ bố cục giao diện khi co giãn màn hình

- **Type**: UI / UX
- **Severity**: Medium
- **File**: `src/views/admin/categories-new.ejs:85`
- **Agent**: ezstore
- **Root Cause**:
  1. Nút Switch toggle "Bắt buộc" được thiết kế ẩn checkbox bằng cách đặt `width: 0; height: 0; opacity: 0;`. Điều này khiến trình duyệt triệt tiêu hoàn toàn vùng hitbox tương tác thực tế của input checkbox, khiến sự kiện click không thể nhắm chuẩn mục tiêu và thay đổi giá trị `x-model`.
  2. Bố cục sử dụng hệ thống cột Bootstrap Grid (`col-md-6`, `col-md-3`, ...) cho các thành phần inline kích thước nhỏ trong card hẹp dẫn tới việc khi thu nhỏ màn hình hoặc trên thiết bị khác, các phần tử bị vỡ dòng và xếp chồng dọc toàn bộ.
- **Fix Applied**:
  1. Trải rộng input checkbox tuyệt đối đè lên toàn bộ nút gạt (`position: absolute; inset: 0; opacity: 0; cursor: pointer; z-index: 10; width: 100%; height: 100%`) để đảm bảo vùng click luôn bao phủ 100% switch gạt. Vô hiệu hóa pointer-events trên vòng tròn slider bên dưới.
  2. Chuyển đổi cấu trúc chia cột Bootstrap sang Flexbox chia 2 dòng nằm ngang cố định: Dòng 1 chứa Inputs chia theo tỉ lệ rộng 2:1, Dòng 2 chứa thanh gạt Bắt buộc bên trái và nút Xóa bên phải.
- **Prevention**: Khi làm custom toggle switches bằng CSS, luôn luôn kéo giãn input checkbox phủ tràn toàn bộ khung chứa với `opacity: 0` và `z-index` cao hơn, đồng thời tắt `pointer-events` ở các layer đồ họa bên dưới để tránh cản trở tương tác.
- **Status**: Fixed

## [2026-07-06 06:45] - Lỗi trình duyệt lưu cache EJS HTML cũ và thuộc tính inset:0 không tương thích trình duyệt cũ

- **Type**: Infrastructure / UI
- **Severity**: High
- **File**: `src/app.js:180` & `src/views/admin/categories-new.ejs:134`
- **Agent**: ezstore
- **Root Cause**:
  1. Trình duyệt của người dùng tự động lưu cache bản ghi HTML của EJS view do server không trả về các header điều khiển cache. Điều này dẫn tới việc người dùng tiếp tục thấy phiên bản giao diện lỗi thời mặc dù code trên server đã được deploy mới.
  2. Thuộc tính CSS `inset: 0` là thuộc tính viết tắt mới, trên một số phiên bản trình duyệt cũ hơn (đặc biệt là Safari hoặc trình duyệt nhân WebKit cũ) nó không được diễn giải chính xác, khiến switch-slider bị co rúm kích thước về 0px và biến mất.
- **Fix Applied**:
  1. Thêm middleware vô hiệu hóa cache (`Cache-Control: no-store, no-cache, must-revalidate, private`, `Pragma: no-cache`, `Expires: 0`) cho toàn bộ các route có tiền tố `/admin` trong `src/app.js`.
  2. Đổi toàn bộ thuộc tính `inset: 0` viết tắt thành `top: 0; left: 0; right: 0; bottom: 0;` để tương thích hoàn hảo trên 100% mọi trình duyệt.
- **Prevention**: Luôn cài đặt header cấm lưu cache cho các trang quản trị admin động và hạn chế dùng các thuộc tính CSS viết tắt quá mới như `inset` ở các phần tử hiển thị cốt lõi nếu chưa cấu hình autoprefixer.
- **Status**: Fixed

## [2026-07-06 06:48] - Lỗi Switch và Select box biến mất do cú pháp binding :style và thư viện CSS ghi đè

- **Type**: UI / UX
- **Severity**: High
- **File**: `src/views/admin/categories-new.ejs:120`
- **Agent**: ezstore
- **Root Cause**:
  1. Cú pháp binding style động của Alpine.js (`:style="field.required ? '...' : '...'"` với chuỗi ternary) gây ra lỗi biên dịch cục bộ trên một số môi trường trình duyệt khiến Alpine.js ngừng kết xuất phần còn lại của thẻ template.
  2. Lớp `.form-select` của dự án bị ghi đè thuộc tính hiển thị (display/visibility) hoặc độ cao ở một số file CSS khác dẫn tới việc Select box Kiểu dữ liệu bị ẩn hoàn toàn.
- **Fix Applied**:
  1. Thay thế hoàn toàn cú pháp `:style` động bằng liên kết `:class="field.required ? 'active' : ''"` kết hợp viết quy tắc CSS tĩnh trong thẻ `<style>` để thay đổi trạng thái màu sắc và vị trí gạt của nút Switch một cách an toàn nhất.
  2. Loại bỏ class `.form-select` kế thừa, viết trực tiếp các thuộc tính css inline (width, padding, height, background-color, border, color, display) cho thẻ `<select>` để bảo vệ nó khỏi mọi xung đột ghi đè CSS bên ngoài.
- **Prevention**: Luôn ưu tiên dùng class toggle `:class` thay vì `:style` khi tương tác động bằng Alpine.js và tránh dùng các class dùng chung của hệ thống cho các thành phần tùy biến sâu để chống xung đột ghi đè.
- **Status**: Fixed

---





## [2026-07-06 12:19] - EJS SyntaxError: Unexpected token 'class' on /admin/categories

- **Type**: Process/Build (EJS Compile Error)
- **Severity**: Critical (500 on production)
- **File**: `src/views/admin/categories.ejs`
- **Agent**: debugger
- **Root Cause**: EJS compiler on Vercel's Node.js runtime cannot parse ES6 template literals (backtick strings) that contain HTML `class=""` attributes inside `<% %>` blocks � EJS parser misinterprets the word `class` as an ES6 class declaration keyword, throwing SyntaxError.
- **Error Message**:
  ```
  SyntaxError: Unexpected token 'class' in /var/task/src/views/admin/categories.ejs while compiling ejs
  ```
- **Fix Applied**: Rewrote categories.ejs to build HTML using plain string concatenation instead of ES6 template literals inside `<% %>` code blocks. Moved all HTML building into a safe for-loop, then passed result as `pageContent` string to `include('./layout', { body: pageContent })`.
- **Prevention**: Never use nested ES6 template literals containing HTML attributes inside EJS `<% %>` blocks. Always use string concatenation or dedicated EJS loop tags (`<% %>`, `<%= %>`, `<%- %>`) when building dynamic HTML in EJS files.
- **Status**: Fixed

---

## [2026-07-08 11:12] - 413 Payload Too Large on Vercel image upload

- **Type**: Runtime / Infrastructure (Vercel payload limits)
- **Severity**: High (Fails image uploads > 3MB)
- **File**: src/views/admin/products-new.ejs, src/views/admin/products-edit.ejs
- **Agent**: debugger
- **Root Cause**: Vercel Serverless Functions have a hard 4.5MB request payload limit. Dragging, dropping, or pasting large raw image files generates giant base64 data URLs inside form fields, exceeding this 4.5MB limit.
- **Fix Applied**: Implemented client-side image compression and resizing using HTML5 Canvas inside the Alpine.js component. Images are automatically scaled to a maximum of 1200px (width or height) and converted to JPEG at 0.75 quality, shrinking sizes down to 100-200KB before converting to base64.
- **Prevention**: Always compress or scale large media resources client-side prior to converting to base64 or submitting them over serverless function APIs.
- **Status**: Fixed
