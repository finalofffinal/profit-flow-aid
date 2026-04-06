

# Sổ Doanh Thu — Giai đoạn 1: Nền tảng & Tab Danh mục

## Tổng quan
Xây dựng khung ứng dụng hoàn chỉnh với design system Matte Slate & Charcoal, layout responsive (mobile bottom nav + desktop sidebar), header thông tin kinh doanh, và Tab Danh mục với đầy đủ chức năng quản lý sản phẩm/nhà cung cấp.

---

## 1. Design System & Theme
- Cài đặt font Inter (400-900)
- Thiết lập CSS tokens HSL cho Light/Dark mode theo spec (Matte Slate, Charcoal, Emerald, Crimson, Gold...)
- Tạo custom shadows: `card-shadow` (subtle), `card-shadow-lg` (elevated)
- Glassmorphism cards (opacity 85%, thin drop shadow)
- Dark/Light toggle với Sun/Moon icon
- Tiện ích tiền tệ: `parsePriceInput()`, `formatVND()`, `formatCompactVND()` — logic x1000 input

## 2. Layout & Navigation
- **Header**: Thông tin KD collapsible (Hồ Thị Hoa, MST, địa chỉ), đồng hồ realtime HH:MM:SS, badge Q{n}/{year}, ngày dương + âm lịch, theme toggle, notification bell
- **Mobile (≤768px)**: Bottom navigation 5 tab (Tổng quan, Nhập hàng, Kho hàng, Bán hàng, Danh mục) với icon + label, safe area padding
- **Desktop (>768px)**: Sidebar collapsible với cùng 5 tab, icon-only khi thu gọn
- 5 trang placeholder cho các tab chưa triển khai

## 3. Tab Danh mục — Quản lý Nhà cung cấp & Sản phẩm

### Cấu trúc dữ liệu
- **Nhà cung cấp (NCC)**: tên, danh sách sản phẩm. NCC mặc định "Khác" cho SP không thuộc NCC nào
- **Sản phẩm**: tên, nhà cung cấp, đơn vị lớn (tùy nhập: thùng/lốc/kg/bao...), giá nhập, giá bán, khối lượng tịnh (multi-value), ghi chú, lịch sử giá 5 lần
- **Quy đổi bán lẻ** (tùy chọn): đơn vị nhỏ, tỷ lệ quy đổi, auto-tính giá lẻ + lợi nhuận + % lợi nhuận trên đơn vị nhỏ

### Giao diện
- **Sticky toolbar**: Nút Thêm SP, Thùng rác, Tìm kiếm, Filter theo NCC — ghim đỉnh màn hình với hiệu ứng blur
- **Danh sách theo NCC**: Mỗi NCC là section collapsible, bên trong là các thẻ sản phẩm lớn, rõ ràng, tương phản cao
- **Thẻ sản phẩm**: Hiển thị đầy đủ thông tin (tên, đơn vị lớn/nhỏ, giá nhập/bán, khối lượng tịnh, lợi nhuận/% lợi nhuận). Mỗi thẻ NCC trong SP luôn mở, có thể đóng

### Chức năng
- **Thêm SP**: Form phân cấp 2 vùng (Parent Unit + Child Unit ẩn/hiện). Tất cả ô có thể bỏ trống
- **Chỉnh sửa inline**: Sửa mọi trường trực tiếp trên thẻ, thêm/xóa NCC cho SP
- **Drag & drop**: Kéo SP giữa các NCC, copy SP sang NCC khác
- **Thùng rác**: Soft delete, khôi phục hoặc xóa vĩnh viễn (chỉ xóa khi stock = 0)
- **Khối lượng tịnh**: Hỗ trợ nhiều giá trị sẵn có + nhập thủ công
- **Autocomplete**: Gợi ý tên NCC và tên SP khi nhập

## 4. Persistence
- localStorage auto-save cho products, suppliers, notifications
- Notification bell với badge đỏ cho unread, dropdown 20 gần nhất
- Track: thêm/xóa SP, cập nhật giá

---

## Các giai đoạn tiếp theo (chưa triển khai)
- **GĐ 2**: Data Engine + Tab Tổng quan (Dashboard, định mức doanh thu, KPI, biểu đồ hình sin)
- **GĐ 3**: Tab Nhập hàng + Tab Kho (vòng quay nhập-kho, tag màu, FIFO)
- **GĐ 4**: Tab Bán hàng + Export PDF/Excel + polish cuối

