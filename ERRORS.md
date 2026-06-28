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


---
