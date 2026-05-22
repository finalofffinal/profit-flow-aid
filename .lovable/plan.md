# Kế hoạch — Tab Nhập hàng (logic ngưỡng quý + UI đơn bổ sung)

## 1. Thay logic "doanh thu nhập của quý" bằng NGƯỠNG SÀN

### 1a. Ngưỡng theo quý (so với `quarter.targetRevenue`)

| Quý | Sàn tối thiểu | Trần |
|-----|---------------|------|
| Q1  | 60%           | 70% (đặc biệt — Q1 nhập ít) |
| Q2  | 140%          | không trần |
| Q3  | 110%          | không trần |
| Q4  | 120%          | không trần |

Logic mới khi `generateQuarterData` chạy:
- Tính `manualImportTotal` (tổng đơn nhập **không có tag='auto'** + đơn auto đã khóa).
- Tính `autoImportTotal` cần sinh = `targetRevenue * floorRatio - manualImportTotal`.
- Nếu `manualImportTotal` đã ≥ `floorRatio * targetRevenue` → **KHÔNG sinh đơn auto mới**, chỉ hiển thị thông báo "Đã đạt ngưỡng X% — không cần thêm đơn auto".
- Nếu chưa đủ → sinh auto bám theo rule NCC + cap, nhưng **bỏ giới hạn trần** (không clamp xuống khi vượt 100% target).
- Q1 đặc biệt: nếu auto vượt 70%, dừng thêm clone/boost.

### 1b. Thông báo khi xóa đơn auto làm tổng tụt dưới sàn

- Trong `ImportPage`: tính `currentTotal = manual + auto` của quý hiện tại theo realtime.
- Nếu `currentTotal < floor * targetRevenue` → hiển thị banner cảnh báo màu Wise-amber phía trên danh sách đơn: "Tổng nhập quý X mới đạt Y% (ngưỡng tối thiểu Z%). Vui lòng thêm đơn nhập hoặc bấm 'Ngẫu nhiên' để bổ sung."
- **KHÔNG** tự động tạo lại đơn auto khi user xóa — chỉ cảnh báo. User phải bấm "Ngẫu nhiên" hoặc "Tạo đơn tự động" thủ công.

### 1c. Bỏ logic clamp/scale theo target hiện tại

Trong `dataEngine.ts`:
- Xóa block `POST-CLAMP IMPORT BOOST` (line 1451–1519) — không còn boost theo `minRatio` cứng.
- Xóa `scaleGroup` clamp xuống (line 1287–1332) — chỉ giữ scale lên nếu chưa đủ sàn.
- `getQuarterInventoryProfile` chỉ trả `endingStockRatio` (bỏ `seasonalRatio`).
- Thay bằng vòng lặp: sinh đơn theo rule NCC → tính tổng → nếu < sàn, clone đơn lớn nhất (giữ logic cũ) cho đến khi đạt sàn. Q1 dừng khi vượt trần 70%.

## 2. Cập nhật "Ngẫu nhiên"

Khi bấm Ngẫu nhiên:
- Giữ đơn manual + đơn auto đã khóa.
- Tính tập sản phẩm **còn thiếu** so với rule cap (gộp đã có ở manual + locked).
- Sinh đơn auto mới CHỈ với sản phẩm còn thiếu cap, đến khi đạt sàn quý.
- Không tăng tổng số đơn vượt rule NCC trừ khi cần để đạt sàn (cho phép clone đơn lớn nhất).

## 3. UI nút "Thêm đơn bổ sung"

### 3a. Sản phẩm có trong danh mục — nhập giá đầy đủ

- Hiện tại input giá nhập dùng x1000 (parsePriceInput). Cho **SP đã có trong catalog**, đổi sang input thường VND đầy đủ (cho phép "1.002.222" = 1.002.222 VND).
- SP **mới điền thủ công** giữ x1000 (vì tiện nhập nhanh).
- Phân biệt qua flag `isCatalogProduct` trong state form.

### 3b. SP thủ công — hiển thị khi sửa

Hiện tại: khi sửa SP thủ công không thấy tên, vẫn hiển thị ô "thêm SP mới".

Fix: khi click edit, load toàn bộ thuộc tính SP thủ công vào form (tên, đơn vị lớn, giá, có/không đơn vị bé, đơn vị bé, qui cách) và **ẩn ô "thêm SP mới"** trong khi edit.

### 3c. Cấu trúc form SP thủ công mới

Thay vì layout phẳng hiện tại, cấu trúc dọc:

```text
[Tên sản phẩm]
[Đơn vị lớn ▼ (gợi ý: chai, lon, gói, thùng, kg, lốc, hộp, bịch...) | input thủ công]
[Giá nhập đơn vị lớn]  [Giá bán đơn vị lớn]
☐ Có đơn vị bé
  └─ (nếu chọn) [Đơn vị bé ▼ + thủ công]  [Qui cách: 1 lớn = ? bé]
```

- Đơn vị bé, nếu có, là đơn vị **bán ra** ở tab Bán hàng (lưu vào `conversionUnit` + `conversionRate` của SaleItem).
- Nếu không có đơn vị bé → `conversionRate = 1`, bán theo đơn vị lớn.

## 4. Phạm vi file

- `src/lib/dataEngine.ts` — viết lại logic `generateQuarterData` mảng import (sàn quý, bỏ clamp/boost cũ), giữ nguyên SALES.
- `src/components/import/ImportPage.tsx` — thêm banner cảnh báo sàn, sửa form add/edit SP thủ công, đổi nhập giá cho SP catalog.
- `src/pages/Index.tsx` — wiring (nếu cần truyền floor ratio).
- `src/lib/constants.ts` — thêm `QUARTER_FLOOR_RATIO = { 1: 0.6, 2: 1.4, 3: 1.1, 4: 1.2 }` và `Q1_CEILING = 0.7`.

## 5. Câu hỏi xác nhận

1. **Sàn Q1 60–70%**: khi đã đạt 60% có cho clone thêm để lên 65–70%, hay dừng ngay ở 60%? Spec ghi "60%–70% (giới hạn dưới)" → tôi hiểu nhắm mục tiêu khoảng 60–70%, dừng khi đạt ≥60%, không vượt 70%. Đúng không?
2. **Khi "Ngẫu nhiên"**: nếu manual + locked đã ≥ sàn quý → không sinh đơn auto nào, chỉ xóa các đơn auto chưa khóa cũ. Đúng không?
3. **Đơn auto đã khóa** có được coi như "đã đạt sàn" giống đơn manual không? (Tôi đang giả định: có)
4. **SP catalog nhập giá đầy đủ**: chỉ áp dụng cho ô "Giá nhập" khi user **sửa giá** trong dialog đơn bổ sung, hay cả ô giá bán?
