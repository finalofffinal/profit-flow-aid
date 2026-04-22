

# Sửa logic Kho hàng + Excel xuất theo template chuẩn

## Vấn đề hiện tại

1. **Chênh lệch nhập − bán luôn âm ở mọi quý** → phi logic. Q3, Q4 nhập nhiều hơn bán (theo profile đã đặt) nhưng UI vẫn hiện dấu trừ đỏ vì cách tính/format hiển thị sai.
2. **Thiếu thẻ "Tổng tiền hàng đang có trong kho"** (giá trị tồn thực tế = nhập − đã bán theo FIFO). Đây mới là số quan trọng, không phải chênh lệch dòng tiền.
3. **Số lượng tồn từng SP hiển thị thô** (vd "1.234 chai") thay vì **"1 thùng + 5 chai"** theo `conversionRate`.
4. **File Excel xuất ra lệch format** so với template `s2a_mới-2.xlsx` user vừa gửi (căn chỉnh hàng/cột, font size, khoảng cách).

## Giải pháp (giữ nguyên 100% logic data engine)

### A. Tab Kho hàng — `src/components/inventory/InventoryPage.tsx`

**Cấu trúc 3 thẻ tổng kết cuối quý** (thay block hiện tại):

```text
┌─ Nhập (+) ────────┐  ┌─ Bán (−) ─────────┐
│  +XXX triệu        │  │  -XXX triệu        │
│  N đơn · Q đv      │  │  N đơn · Q đv      │
└────────────────────┘  └────────────────────┘
┌─ Chênh lệch nhập − bán trong quý ────────────┐
│  +/-XXX triệu  (xanh nếu +, đỏ nếu −)        │
└───────────────────────────────────────────────┘
┌─ 📦 Tổng tiền hàng đang có trong kho ────────┐  ← THẺ MỚI
│  XXX triệu  (luôn dương, màu primary)         │
│  N đv · từ M lô · cuối Q1/2026                │
└───────────────────────────────────────────────┘
```

- Sửa logic màu: **chênh lệch dương → xanh emerald + dấu `+`**, âm → đỏ + dấu `−`. Hiện tại đang ép đỏ ở quá nhiều case.
- Thẻ "Tổng tiền hàng đang có" lấy từ `quarterBatches.reduce((s,b)=>s+b.quantity*b.buyPrice,0)` — đây là kết quả FIFO snapshot từ `computeInventorySnapshot`, đúng nghĩa "hàng nhập rồi mà chưa bán".

**Hiển thị tồn theo đơn vị lớn + nhỏ:**

Trong list từng SP, thay `{info.totalQty}` bằng helper `formatStockUnits(qty, conversionRate, parentUnit, childUnit)`:

```text
qty=1.5, rate=10, parent="thùng", child="chai"
→ 1.5 * 10 = 15 chai → "1 thùng 5 chai"

qty=0.3, rate=12 → 3.6 → "3 chai" (không đủ thùng)
qty=2, rate=1 → "2 chai" (không có đơn vị lớn)
```

Hiển thị dạng: **`1 thùng + 5 chai`** ngay bên cạnh số đơn vị quy đổi, font đậm.

### B. Dashboard — `src/components/dashboard/DashboardPage.tsx`

Thẻ "Kho hàng Q" hiện đang hiển thị **chênh lệch (có thể âm)**. Đổi thành hiển thị **giá trị tồn thực tế (luôn dương)** = `stockValue` để khớp với thẻ mới ở tab Kho hàng. Chênh lệch nhập−bán đẩy xuống dòng phụ phía dưới.

### C. Excel S2a-HKD — `src/lib/exportExcel.ts`

Bám sát chính xác template `s2a_mới-2.xlsx`:

| Khu vực | Format chuẩn template |
|---|---|
| Toàn file | Times New Roman, size 12 |
| Header HKD (hàng 1–6) | Căn trái cột A, căn trái cột D, KHÔNG bold trừ "Mẫu số S2a-HKD" |
| Tiêu đề "SỔ CHI TIẾT…" | Merge A:D, **size 14 bold**, căn giữa, hàng cao 26pt |
| "Kỳ kê khai" | Italic, căn trái cột A; "(Đơn vị tính: VND)" italic căn phải cột D |
| Header bảng (3 hàng) | Bold, **căn giữa cả ngang lẫn dọc**, border đầy đủ, fill xám nhạt `#F2F2F2`, hàng cao 22pt |
| Hàng "Ngành nghề: 4719…" | Italic, căn trái cột C, không border số tiền |
| Dòng dữ liệu TM | Cột A,B căn giữa · Cột C căn trái · Cột D căn phải, format `#,##0`, border mỏng, hàng cao 18pt đồng đều |
| "Tổng cộng (Quý X)" | Bold, căn phải, có hàng trống phía trên |
| Footer chữ ký | Merge C:D, italic dòng ngày, bold dòng "NGƯỜI ĐẠI DIỆN…", italic dòng "(Ký, ghi rõ…)" |
| Cột rộng | A=12, B=14, C=52, D=20 (giữ nguyên) |

Bổ sung hàng **"Ngành nghề: 4719- Bán tạp hóa"** ngay sau hàng A/B/C/1 (đang thiếu so với template).

## File sẽ sửa

- `src/components/inventory/InventoryPage.tsx` — thêm thẻ tồn kho, helper `formatStockUnits`, sửa màu chênh lệch.
- `src/components/dashboard/DashboardPage.tsx` — đổi thẻ Kho hàng sang hiển thị giá trị tồn thực.
- `src/lib/exportExcel.ts` — refactor styling theo template, thêm hàng "Ngành nghề".

## Không động tới

- `src/lib/dataEngine.ts` (giữ 100% logic generation).
- Logic doanh thu Sales tab, Dashboard targets.
- Cấu trúc dữ liệu `InventoryBatch`, `ImportOrder`, `SaleOrder`.

