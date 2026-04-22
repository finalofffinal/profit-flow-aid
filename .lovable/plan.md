

# Q2/Q3: Nhập nhiều, tồn kho cao, bán dần

## Yêu cầu

Q2 & Q3 doanh thu thấp → vẫn **nhập hàng nhiều** (chuẩn bị kho cho Q4 cao điểm) → **hàng dồn lại trong kho**, bán ra từ từ. Đây là logic stockpiling trước mùa cao điểm — không phải nhập-bán cân bằng.

## Hiện trạng vs Mục tiêu

| Quý | Doanh thu | Nhập (ratio) | Tồn cuối quý | Trạng thái hiện tại |
|---|---|---|---|---|
| Q1 | Trung bình | 0.30–0.40× (bán nốt 2025) | Cạn dần | ✓ OK |
| **Q2** | **Thấp** | **Cần 1.8–2.2×** (nhập gấp đôi bán) | **Dồn cao** | Đang 1.6–1.8 → **tăng** |
| **Q3** | **Thấp** | **Cần 2.0–2.4×** (nhập gấp 2-2.4× bán) | **Dồn rất cao** | Đang 1.7–1.9 → **tăng** |
| Q4 | Cao điểm | 1.20–1.30× (nhập hơn bán 20-30%) | Vừa phải | ✓ OK |

Số lượng "X thùng + Y chai" hiện cao bất thường KHÔNG phải do ratio nhập sai — mà do **`endingStockRatio` snapshot quá lớn** (20–31%) khiến FIFO giữ lại quá nhiều batch cuối quý. Ratio nhập phải GIỮ CAO (đúng ý user), chỉ giảm `endingStockRatio` xuống vừa phải.

## Giải pháp — `src/lib/dataEngine.ts`

Tinh chỉnh `getQuarterInventoryProfile`:

| Quý | `seasonalRatio` mới | `endingStockRatio` mới | Ý nghĩa |
|---|---|---|---|
| Q1 | 0.30–0.40 (giữ) | 0.05–0.10 (giữ) | Cạn nốt tồn 2025 |
| **Q2** | **1.80–2.00** ↑ | **0.15–0.20** ↓ từ 0.20–0.31 | Nhập gấp đôi bán, dồn vừa phải |
| **Q3** | **2.00–2.20** ↑ | **0.18–0.22** ↓ từ 0.20–0.31 | Nhập gấp 2× bán, dồn cao chuẩn bị Q4 |
| Q4 | 1.20–1.30 (giữ) | 0.08–0.12 (giữ) | Bán xả tồn Q3 + nhập bù 20-30% |

**Cơ chế FIFO sẽ tự xử lý**:
- Q2/Q3 nhập batch lớn → sales orders chỉ tiêu thụ một phần → batch còn lại nằm trong kho.
- `computeInventorySnapshot` cuối Q2/Q3 sẽ thấy nhiều batch dư → "X thùng + Y chai" hiển thị đúng số dồn.
- Sang Q4, `computeCarryOverStock` mang tồn Q3 sang → Q4 bán mạnh, tồn giảm.

**Không động `endingStockRatio` quá thấp** vì cần thật sự có hàng dồn trong kho cuối Q2/Q3 (đó là điểm chính của yêu cầu).

## File sẽ sửa

- `src/lib/dataEngine.ts` — `getQuarterInventoryProfile`: tăng `seasonalRatio` Q2/Q3, giảm nhẹ `endingStockRatio` Q2/Q3.

## Không động

- `src/components/inventory/InventoryPage.tsx` (UI đã đúng).
- `src/lib/exportPdf.ts`, `exportExcel.ts`.
- Logic doanh thu Sales = 100% target Dashboard.
- Logic FIFO `computeInventorySnapshot`, `computeCarryOverStock`.

## Kết quả mong đợi

- Tab Nhập hàng Q2: tổng nhập **~2× tổng bán** (vd bán 150tr → nhập ~300tr).
- Tab Nhập hàng Q3: tổng nhập **~2.1× tổng bán** (vd bán 160tr → nhập ~340tr).
- Tab Kho hàng cuối Q2: chênh lệch **+150tr** (xanh), tồn mỗi SP **vài chục đơn vị** (vd 8 thùng + 3 chai).
- Tab Kho hàng cuối Q3: chênh lệch **+180tr** (xanh), tồn dồn cao hơn Q2.
- Tab Kho hàng cuối Q4: chênh lệch nhỏ (~+20-30% bán), tồn giảm rõ rệt vì xả cho mùa cao điểm.

