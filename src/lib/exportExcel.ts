import * as XLSX from 'xlsx-js-style';
import { SaleOrder } from '@/types';
import { BUSINESS_INFO } from '@/lib/constants';

function getDaysInQuarter(q: number, year: number): string[] {
  const startMonth = (q - 1) * 3;
  const days: string[] = [];
  for (let m = startMonth; m < startMonth + 3; m++) {
    const lastDay = new Date(year, m + 1, 0).getDate();
    for (let d = 1; d <= lastDay; d++) {
      const ds = `${year}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push(ds);
    }
  }
  return days;
}

/**
 * S2a-HKD Excel — bám sát CHÍNH XÁC template `s2a_mới-2.xlsx` của user.
 * Quy ước (đối chiếu cell-by-cell với template):
 *  - Font: Times New Roman
 *  - Cột rộng: A=43.78, B=29.33, C=35.78, D=38.66
 *  - A1 sz=14; D1 sz=14 bold ("Mẫu số S2a-HKD")
 *  - Hàng 2-6: sz=12 thông tin HKD
 *  - A8 merge A8:D8: "SỔ CHI TIẾT…" sz=20 bold, center, hàng cao 29.45
 *  - A9 sz=14 bold "Kỳ kê khai…"; D9 sz=14 bold "(Đơn vị tính: VND)"
 *  - A10:B10 merge "Chứng từ" sz=16 bold center; C10:C11, D10:D11 merge sz=16 bold center
 *  - A11/B11 "Kí hiệu"/"Ngày, tháng" sz=14 bold center
 *  - A12-D12: A B C 1 sz=14 bold center
 *  - C13 "Ngành nghề: 4719- Bán tạp hóa" sz=12 bold left
 *  - Data rows: tất cả sz=12, CĂN GIỮA cả 4 cột (theo template), hàng cao 15.6
 *  - Hàng trống trước "Tổng cộng"; C+D "Tổng cộng (Quý X)" sz=14 bold center, format #,##0
 *  - Footer C112:D112, C113:D113, C114:D114 merge, center
 */
export function exportSalesExcel(salesOrders: SaleOrder[], year: number, quarters: number[] = [1, 2, 3, 4]) {
  const wb = XLSX.utils.book_new();
  const rows: any[][] = [];

  // ===== Hàng 1-6: Header thông tin HKD =====
  rows.push([`Hộ kinh doanh: ${BUSINESS_INFO.name.toUpperCase()}`, '', '', 'Mẫu số S2a-HKD']);                    // 1
  rows.push([`Mã số thuế: ${BUSINESS_INFO.taxId}`, '', '', '(Kèm theo Thông tư số 152/2025/TT-BTC']);             // 2
  rows.push([`Địa chỉ: ${BUSINESS_INFO.address}, ${BUSINESS_INFO.stall}`, '', '', 'ngày 31/12/2025 của Bộ Tài chính)']); // 3
  rows.push([`             Phường Đông Hưng Thuận, TP. Hồ Chí Minh`, '', '', '']);                                 // 4
  rows.push([`Điện thoại: ${BUSINESS_INFO.phone}`, '', '', '']);                                                   // 5
  rows.push([`Ngành: 4719- Bán tạp hóa`, '', '', '']);                                                             // 6
  rows.push(['', '', '', '']);                                                                                     // 7 spacer

  // ===== Hàng 8: Tiêu đề chính =====
  rows.push(['SỔ CHI TIẾT DOANH THU BÁN HÀNG, DỊCH VỤ', '', '', '']);                                              // 8

  // ===== Hàng 9: Kỳ kê khai =====
  const isFullYear = quarters.length === 4;
  const periodLabel = isFullYear
    ? `Kỳ kê khai: Năm ${year}`
    : `Kỳ kê khai: Quý ${quarters.join(', ')} năm ${year}`;
  rows.push([periodLabel, '', '', '(Đơn vị tính: VND)']);                                                          // 9

  // ===== Hàng 10-12: Header bảng =====
  rows.push(['Chứng từ', '', 'Diễn giải', 'Số tiền']);                                                             // 10
  rows.push(['Kí hiệu', 'Ngày, tháng', '', '']);                                                                   // 11
  rows.push(['A', 'B', 'C', 1]);                                                                                   // 12

  // ===== Hàng 13: Ngành nghề =====
  rows.push(['', '', 'Ngành nghề: 4719- Bán tạp hóa', '']);                                                        // 13

  const dataStartRow = rows.length; // 0-indexed = 13 (Excel row 14)

  // ===== Tính dữ liệu doanh thu theo ngày =====
  const activeSales = salesOrders.filter(o => !o.deletedAt && new Date(o.date).getFullYear() === year);
  const dayTotal = new Map<string, number>();
  for (const o of activeSales) {
    const day = o.date.split('T')[0];
    dayTotal.set(day, (dayTotal.get(day) || 0) + o.totalRevenue);
  }

  let grandTotal = 0;
  const subtotalRowIdx: number[] = [];
  let grandTotalRowIdx = -1;

  for (const q of quarters) {
    const days = getDaysInQuarter(q, year);
    let quarterTotal = 0;

    for (const day of days) {
      const total = dayTotal.get(day) || 0;
      quarterTotal += total;
      const [, mm, dd] = day.split('-');
      rows.push(['TM', `${dd}-${mm}`, 'Doanh thu tiền mặt bán lẻ', total]);
    }

    // hàng trống trước tổng cộng
    rows.push(['', '', '', '']);
    rows.push(['', '', `Tổng cộng (Quý ${q})`, quarterTotal]);
    subtotalRowIdx.push(rows.length - 1);
    grandTotal += quarterTotal;

    if (!isFullYear || q < 4) {
      rows.push(['', '', '', '']); // 1 hàng trống giữa các quý
    }
  }

  if (isFullYear) {
    rows.push(['', '', '', '']);
    rows.push(['', '', `TỔNG CỘNG NĂM ${year}`, grandTotal]);
    grandTotalRowIdx = rows.length - 1;
  }

  // ===== Footer chữ ký (3 hàng, padding bằng hàng trống) =====
  rows.push(['', '', '', '']);
  rows.push(['', '', '', '']);
  rows.push(['', '', '', '']);
  rows.push(['', '', '', '']);
  rows.push(['', '', '', '']);
  rows.push(['', '', `Ngày … tháng … năm ${year}`, '']);                                                            // footer 1
  const footerDateRow = rows.length - 1;
  rows.push(['', '', 'NGƯỜI ĐẠI DIỆN HỘ KINH DOANH/ CÁ NHÂN KINH DOANH', '']);                                     // footer 2
  const footerRoleRow = rows.length - 1;
  rows.push(['', '', '(Ký, ghi rõ họ tên, đóng dấu (nếu có))', '']);                                                // footer 3
  const footerSignRow = rows.length - 1;

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // ===== Cột rộng (chính xác theo template) =====
  ws['!cols'] = [
    { wch: 43.78 },  // A
    { wch: 29.33 },  // B
    { wch: 35.78 },  // C
    { wch: 38.66 },  // D
  ];

  // ===== Chiều cao hàng (theo template) =====
  const totalRows = rows.length;
  ws['!rows'] = Array.from({ length: totalRows }, (_, i) => {
    if (i === 0) return { hpt: 18 };
    if (i === 1) return { hpt: 17.45 };
    if (i >= 2 && i <= 5) return { hpt: 15.6 };
    if (i === 6) return { hpt: 15 };       // spacer trước title
    if (i === 7) return { hpt: 29.45 };    // SỔ CHI TIẾT
    if (i === 8) return { hpt: 17.45 };    // Kỳ kê khai
    if (i === 9) return { hpt: 20.1 };     // Header bảng row 1
    if (i === 10) return { hpt: 17.45 };   // Header bảng row 2
    if (i === 11) return { hpt: 21.95 };   // Header bảng row 3 (A B C 1)
    if (i === 12) return { hpt: 18.6 };    // Ngành nghề
    return { hpt: 15.6 };                  // data + footer
  });

  // ===== Merge (chính xác theo template) =====
  ws['!merges'] = [
    { s: { r: 7, c: 0 }, e: { r: 7, c: 3 } },  // A8:D8 SỔ CHI TIẾT
    { s: { r: 9, c: 0 }, e: { r: 9, c: 1 } },  // A10:B10 Chứng từ
    { s: { r: 9, c: 2 }, e: { r: 10, c: 2 } }, // C10:C11 Diễn giải
    { s: { r: 9, c: 3 }, e: { r: 10, c: 3 } }, // D10:D11 Số tiền
    // Footer merge C:D
    { s: { r: footerDateRow, c: 2 }, e: { r: footerDateRow, c: 3 } },
    { s: { r: footerRoleRow, c: 2 }, e: { r: footerRoleRow, c: 3 } },
    { s: { r: footerSignRow, c: 2 }, e: { r: footerSignRow, c: 3 } },
  ];

  // ===== Style helpers =====
  const TNR = 'Times New Roman';
  const ensure = (addr: string) => {
    if (!ws[addr]) ws[addr] = { v: '', t: 's' };
    return ws[addr];
  };

  const range = XLSX.utils.decode_range(ws['!ref']!);

  // Default: tất cả cell có style cơ bản TNR sz12
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[addr]) continue;
      ws[addr].s = {
        font: { name: TNR, sz: 12 },
        alignment: { vertical: 'center', horizontal: 'center', wrapText: false },
      };
    }
  }

  // ===== Hàng 1 (idx 0) =====
  ensure('A1').s = { font: { name: TNR, sz: 14 }, alignment: { vertical: 'center', horizontal: 'left' } };
  ensure('D1').s = { font: { name: TNR, sz: 14, bold: true }, alignment: { vertical: 'center', horizontal: 'left' } };

  // ===== Hàng 2-3 (idx 1-2): cột A trái, cột D trái =====
  for (const R of [1, 2]) {
    const aAddr = XLSX.utils.encode_cell({ r: R, c: 0 });
    const dAddr = XLSX.utils.encode_cell({ r: R, c: 3 });
    if (ws[aAddr]) ws[aAddr].s = { font: { name: TNR, sz: 12 }, alignment: { vertical: 'center', horizontal: 'left' } };
    if (ws[dAddr]) ws[dAddr].s = { font: { name: TNR, sz: 12 }, alignment: { vertical: 'center', horizontal: 'left' } };
  }

  // ===== Hàng 4-6 (idx 3-5): cột A trái =====
  for (const R of [3, 4, 5]) {
    const aAddr = XLSX.utils.encode_cell({ r: R, c: 0 });
    if (ws[aAddr]) ws[aAddr].s = { font: { name: TNR, sz: 12 }, alignment: { vertical: 'center', horizontal: 'left' } };
  }

  // ===== Hàng 8 (idx 7): SỔ CHI TIẾT — sz=20 bold center =====
  ensure('A8').s = {
    font: { name: TNR, sz: 20, bold: true },
    alignment: { vertical: 'center', horizontal: 'center' },
  };

  // ===== Hàng 9 (idx 8): Kỳ kê khai sz=14 bold left; D9 sz=14 bold right-ish =====
  ensure('A9').s = {
    font: { name: TNR, sz: 14, bold: true },
    alignment: { vertical: 'center', horizontal: 'left' },
  };
  ensure('D9').s = {
    font: { name: TNR, sz: 14, bold: true },
    alignment: { vertical: 'center', horizontal: 'left' },
  };

  // ===== Hàng 10 (idx 9): "Chứng từ", "Diễn giải", "Số tiền" sz=16 bold center =====
  ensure('A10').s = { font: { name: TNR, sz: 16, bold: true }, alignment: { vertical: 'center', horizontal: 'center' } };
  ensure('C10').s = { font: { name: TNR, sz: 16, bold: true }, alignment: { vertical: 'center', horizontal: 'center' } };
  ensure('D10').s = { font: { name: TNR, sz: 16, bold: true }, alignment: { vertical: 'center', horizontal: 'center' } };

  // ===== Hàng 11 (idx 10): "Kí hiệu" / "Ngày, tháng" sz=14 bold center =====
  ensure('A11').s = { font: { name: TNR, sz: 14, bold: true }, alignment: { vertical: 'center', horizontal: 'center' } };
  ensure('B11').s = { font: { name: TNR, sz: 14, bold: true }, alignment: { vertical: 'center', horizontal: 'center' } };

  // ===== Hàng 12 (idx 11): A B C 1 sz=14 bold center =====
  for (const C of [0, 1, 2, 3]) {
    const addr = XLSX.utils.encode_cell({ r: 11, c: C });
    ensure(addr).s = { font: { name: TNR, sz: 14, bold: true }, alignment: { vertical: 'center', horizontal: 'center' } };
  }

  // ===== Hàng 13 (idx 12): "Ngành nghề: 4719- Bán tạp hóa" sz=12 bold left ở cột C =====
  ensure('C13').s = {
    font: { name: TNR, sz: 12, bold: true },
    alignment: { vertical: 'center', horizontal: 'left' },
  };

  // ===== Data rows (TM, subtotal, grand total) — căn giữa, format số =====
  for (let R = dataStartRow; R < footerDateRow - 4; R++) {
    const isSubtotal = subtotalRowIdx.includes(R);
    const isGrand = R === grandTotalRowIdx;
    for (let C = 0; C <= 3; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[addr]) continue;
      const sz = (isSubtotal || isGrand) ? 14 : 12;
      const bold = isSubtotal || isGrand;
      ws[addr].s = {
        font: { name: TNR, sz, bold },
        alignment: { vertical: 'center', horizontal: 'center', wrapText: false },
      };
      if (C === 3 && typeof ws[addr].v === 'number') {
        ws[addr].z = '#,##0';
        ws[addr].s.numFmt = '#,##0';
      }
    }
  }

  // ===== Footer =====
  ensure(XLSX.utils.encode_cell({ r: footerDateRow, c: 2 })).s = {
    font: { name: TNR, sz: 12 },
    alignment: { vertical: 'center', horizontal: 'center' },
  };
  ensure(XLSX.utils.encode_cell({ r: footerRoleRow, c: 2 })).s = {
    font: { name: TNR, sz: 14, bold: true },
    alignment: { vertical: 'center', horizontal: 'center' },
  };
  ensure(XLSX.utils.encode_cell({ r: footerSignRow, c: 2 })).s = {
    font: { name: TNR, sz: 12, italic: true },
    alignment: { vertical: 'center', horizontal: 'center' },
  };

  // Đặt chiều cao đặc biệt cho footer
  if (ws['!rows']) {
    ws['!rows'][footerDateRow] = { hpt: 17.1 };
    ws['!rows'][footerRoleRow] = { hpt: 25.5 };
    ws['!rows'][footerSignRow] = { hpt: 15.6 };
  }

  XLSX.utils.book_append_sheet(wb, ws, `S2a-HKD ${year}`);
  const suffix = isFullYear ? `${year}` : `Q${quarters.join('-')}_${year}`;
  XLSX.writeFile(wb, `S2a-HKD_${suffix}.xlsx`, { cellStyles: true });
}
