# Kế hoạch: Cập nhật logic đơn tự động Tab Nhập hàng

## 1. UI — Tab Nhập hàng (`ImportPage.tsx`)

- **Xóa** nút "Xóa auto" (Eraser).
- **Giữ** nút "Ngẫu nhiên" (Shuffle): regenerate đơn auto, tôn trọng đơn auto đã khóa + đơn bổ sung.
- **Thêm** nút mới **"Tạo đơn tự động"** (icon Plus/Wand2):
  - Mở dialog yêu cầu nhập **số lượng đơn** (số nguyên tùy ý).
  - Tạo `N` đơn auto **bổ sung** vào quý hiện tại, KHÔNG bị giới hạn bởi `ordersCount` của rule NCC.
  - Mỗi đơn chỉ gồm các sản phẩm có **yêu cầu ≥ 2 đơn vị lớn/quý** (sản phẩm fixed-1 bị loại).
  - Số lượng vẫn tuân thủ `maxQtyPerProduct/maxQtyPerOrder`.
  - Đơn tạo bởi nút này có `tag='auto'` (có thể bị Ngẫu nhiên thay đổi, trừ khi khóa).

## 2. Logic — `dataEngine.ts`

### 2a. Viết lại toàn bộ `getSupplierRule()` theo spec mới

Mở rộng interface để hỗ trợ:

- `allowedProducts?: (p) => boolean` — whitelist SP được phép xuất hiện trong auto.
- `minItemsPerOrder?: number` — cho TADA/Địa Đạo/Chợ Lớn (≥5 SP/đơn).
- `fixedOrdersCount?: number` — Chợ Lớn cố định 5 đơn.

Rule theo NCC (đơn vị: "đơn vị lớn"/quý):


| NCC            | #đơn/quý | Whitelist + qty                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **hpv**        | 3–5      | Hạt nêm 1.8Kg: 1/q; Shiitake 330ML: max 20/q, mỗi lần ≥10; Xúc xích Bin&Bon: ≤20/q, ≥5/đơn; NM Nam Ngư 750: ≤3/đơn; NM Đệ Nhị: ≤3/đơn; NM Siêu Tiết Kiệm 5L: ≤2/đơn; Nhất Ca: 1/q; Nhị Ca: ≤3/đơn; Tương ớt 500ML: 3/q. Khác → loại.                                                                                                                                                                                                                                                                                                                                                                                                    |
| **bánh tráng** | 1        | BT vuông: 2/q; BT tròn lớn: 2/q.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **đường**      | 3        | Đường trắng bao: 1/q; Đường trắng đóng gói: 1/q; Đường mía: 1/q; Phèn viên: 3/đơn.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **mắm**        | 1        | Ruốc nhỏ 1, trung 2, lớn 3; Tôm Bắc nhỏ/lớn 1; Nêm nhỏ 1, lớn 2.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **giấm**       | 1        | Tinh luyện 2; Nuôi 1; Cốt 10 chai/q.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **vĩnh thuận** | 0        | manualOnly                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **sen việt**   | 1        | Bột chiên giòn 1KG: 1; 150G: 2; Bơ thực vật 1KG: 1; Dầu nành 1L: 2; 2L: 2.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **đậu**        | 1        | Đen 2; Đỏ 1; Xanh hột 1; Xanh tróc vỏ 2; Xanh nửa vàng 1; Phộng nhỏ 2; Điều màu 5.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **cô lan**     | 1        | Bún tàu 1; Miến dong HN 10 bịch; Măng 2.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **mỹ nga**     | 1        | NM 800ML: 3.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **liên thành** | 1        | NM chay 1; NM nhãn vàng 1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **huy hoàng**  | 1        | Bún tươi 10 gói.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **chấn hưng**  | 1        | Mắm nêm pha 170ML 1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **TADA**       | ≥5       | minItems=5/đơn; whitelist ~30 SP với cap chi tiết (Tương ớt 700ML ≤3/đơn, Tương đen 5L 1/q, Lẩu thái 4/đơn, Dầu giấm 4/đơn, Sốt lẩu chua HS 2/q, Sa tế tôm 90G 4/đơn 450G 2/đơn, Tương đen 2/q, Dầu hào 350G 2/đơn, Nấm mèo 5/đơn, Nấm đông cô 3/đơn, NT Thanh Dịu+Đậm Đặc 2/q, Sốt xá xíu gói 2/q, Sốt thịt nướng hủ 200G 4/q, gói 70G 2/đơn, Ớt sa tế 150G & ớt khô 100G 1/q mỗi loại, NT Hương Việt ≤3/đơn, Dầu hào 820G 3/q, Xì dầu đặc biệt 5/q, Sốt hải sản 5/q, Chao 4 loại 1/q mỗi, Hạt nêm nấm hương 250G+450G 1/q mỗi, Aji-Mayo 10/1 đơn duy nhất, Sườn kí 2/q, Tương hột 250G 6/q, Tương ớt 830G 2/q, Bột chiên xù 1KG 2/q). |
| **địa đạo**    | ≥6       | minItems=5/đơn; whitelist riêng (đa số 1/q; Cooking Oil 1L/2L ≤3/đơn; Bột ngọt 454 ≤2/đơn, 400G ≤3, 1KG ≤5, 5KG ≤3; Nhất Ca 1/q, Nhị Ca 3/q; NM Nam Ngư 750 ≤3/đơn, Đệ Nhị ≤5/đơn; Hạt nêm 400G+900G 2/q, Tương ớt+cà 2.1KG 2/q; Tương ớt 830ML 3/q; Tương cà+ớt 270ML 2/q).                                                                                                                                                                                                                                                                                                                                                            |
| **chợ lớn**    | fixed 5  | Whitelist ~55 SP (đã liệt kê cụ thể), mỗi SP **chỉ xuất hiện 1 lần** duy nhất trong 5 đơn, phân phối đều ~11 SP/đơn.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |


### 2b. Cập nhật generator (`generateSupplierImports`)

- Lọc SP qua `allowedProducts` (nếu có) thay vì `excludeProduct`.
- Tôn trọng `minItemsPerOrder` (mặc định 3, TADA/Địa Đạo = 5).
- Chợ Lớn: nhánh đặc biệt — phân phối không trùng giữa các đơn.
- Khi randomize (Ngẫu nhiên): SP đã xuất hiện trong đơn bổ sung + đơn auto đã khóa được trừ khỏi cap còn lại, các đơn auto mới tập trung vào SP **chưa đủ**.

### 2c. Hàm mới: `generateSupplementaryAutoOrders(quarter, products, suppliers, N)`

- Tạo N đơn auto, chỉ với SP có `maxQtyPerQuarter >= 2` hoặc `maxQtyPerProduct >= 2` từ rule.
- Bỏ qua tổng cap `ordersCount` của rule.
- Phân phối SP ngẫu nhiên qua N đơn, tôn trọng `maxQtyPerProduct`.

## 3. Wiring

- `Index.tsx` (hoặc nơi truyền props): truyền callback `onGenerateAutoOrders(q, y, count)` xuống `ImportPage`.
- Bỏ prop `onClearAutoOrders` (đã xóa nút).
- `constants.ts`: không thay đổi (tag auto/supplementary đã có).

## Phạm vi file

- `src/lib/dataEngine.ts` — viết lại `getSupplierRule` + thêm `generateSupplementaryAutoOrders`.
- `src/components/import/ImportPage.tsx` — bỏ nút "Xóa auto", thêm nút + dialog "Tạo đơn tự động".
- `src/pages/Index.tsx` — wiring callback mới, bỏ callback cũ.

## Câu hỏi xác nhận trước khi code

1. **Logic "Xóa auto"**: tôi bỏ hoàn toàn nút này. Bạn vẫn có thể xóa từng đơn auto thủ công qua icon Trash trên mỗi đơn — OK chứ?
2. **Khi bấm "Ngẫu nhiên"**: hiện tại regen toàn bộ đơn auto theo `ordersCount` của rule (3–5 cho HPV, v.v.). Sau update, "Ngẫu nhiên" có nên tự động **bổ sung thêm SP chưa đủ cap** vào các đơn auto mới (không tăng số đơn vượt rule), hay chỉ regen với số đơn theo rule như cũ?
3. **Đơn tạo bởi "Tạo đơn tự động"**: khi bấm Ngẫu nhiên, các đơn này có bị xóa/tạo lại không, hay được giữ riêng (chỉ khóa mới giữ được)? Theo spec bạn viết: "có thể bị thay đổi nếu nút Ngẫu nhiên kích hoạt, tuy nhiên nếu đơn này bị khóa thì không bị thay đổi" → tôi hiểu là **bị xóa và tạo lại** giống đơn auto bình thường. Đúng không?  
Giữ nguyên các đơn đã khóa và các đơn bổ sung