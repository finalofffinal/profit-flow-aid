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

function lastDayOfQuarter(q: number, year: number): { day: number; month: number } {
  const m = q * 3 - 1;
  const day = new Date(year, m + 1, 0).getDate();
  return { day, month: m + 1 };
}

/**
 * S2a-HKD Excel — bám sát template chính thức của Bộ Tài chính.
 * Quy ước trình bày:
 *  - Toàn bộ font Times New Roman, size 12 cho dữ liệu
 *  - Tiêu đề "SỔ CHI TIẾT…": size 14 in đậm, căn giữa, merge 4 cột
 *  - Header bảng (Chứng từ / Diễn giải / Số tiền): in đậm, căn giữa, có border
 *  - Cột A (Kí hiệu) căn giữa, Cột B (Ngày tháng) căn giữa, Cột C (Diễn giải) căn trái, Cột D (Số tiền) căn phải
 *  - Chiều cao hàng đồng nhất 18; hàng tiêu đề 24
 */
export function exportSalesExcel(salesOrders: SaleOrder[], year: number, quarters: number[] = [1, 2, 3, 4]) {
  const wb = XLSX.utils.book_new();
  const rows: any[][] = [];

  // ===== Header thông tin hộ kinh doanh (4 cột: A | B | C | D) =====
  rows.push([`Hộ kinh doanh: ${BUSINESS_INFO.name.toUpperCase()}`, '', '', 'Mẫu số S2a-HKD']);                    // 1
  rows.push([`Mã số thuế: ${BUSINESS_INFO.taxId}`, '', '', '(Kèm theo Thông tư số 152/2025/TT-BTC']);             // 2
  rows.push([`Địa chỉ: ${BUSINESS_INFO.address}, ${BUSINESS_INFO.stall}`, '', '', 'ngày 31/12/2025 của Bộ Tài chính)']); // 3
  rows.push([`Điện thoại: ${BUSINESS_INFO.phone}`, '', '', '']);                                                  // 4
  rows.push([`Ngành: ${BUSINESS_INFO.industry}`, '', '', '']);                                                    // 5
  rows.push(['', '', '', '']);                                                                                    // 6 (spacer)

  // ===== Tiêu đề chính: merge A:D, căn giữa, size 14 đậm =====
  rows.push(['SỔ CHI TIẾT DOANH THU BÁN HÀNG, DỊCH VỤ', '', '', '']);                                            // 7

  const isFullYear = quarters.length === 4;
  const periodLabel = isFullYear
    ? `Kỳ kê khai: Năm ${year}`
    : `Kỳ kê khai: Quý ${quarters.join(', ')} năm ${year}`;
  rows.push([periodLabel, '', '', '(Đơn vị tính: VND)']);                                                         // 8
  rows.push(['', '', '', '']);                                                                                    // 9 (spacer)

  // ===== Header bảng 2 hàng (merge dọc cho A,C,D; B/cột B tách 2 dòng) =====
  rows.push(['Chứng từ', '', 'Diễn giải', 'Số tiền']);                                                            // 10
  rows.push(['Kí hiệu', 'Ngày, tháng', '', '']);                                                                  // 11
  rows.push(['A', 'B', 'C', '1']);                                                                                // 12

  // Index hàng đầu tiên của dữ liệu
  const dataStartRow = rows.length; // sẽ là 12 (0-indexed)

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

    rows.push(['', '', `Cộng quý ${q}`, quarterTotal]);
    subtotalRowIdx.push(rows.length - 1);
    grandTotal += quarterTotal;

    if (!isFullYear || q < 4) {
      rows.push(['', '', '', '']); // 1 hàng trống giữa các quý
    }
  }

  if (isFullYear) {
    rows.push(['', '', `TỔNG CỘNG NĂM ${year}`, grandTotal]);
    grandTotalRowIdx = rows.length - 1;
  }

  // ===== Footer chữ ký =====
  rows.push(['', '', '', '']);
  rows.push(['', '', '', '']);
  const lastQ = Math.max(...quarters);
  const { day: lastDay, month: lastMonth } = lastDayOfQuarter(lastQ, year);
  rows.push(['', '', '', `Ngày ${lastDay} tháng ${lastMonth} năm ${year}`]);
  rows.push(['', '', '', 'NGƯỜI ĐẠI DIỆN HỘ KINH DOANH/']);
  rows.push(['', '', '', 'CÁ NHÂN KINH DOANH']);
  rows.push(['', '', '', '(Ký, ghi rõ họ tên, đóng dấu (nếu có))']);

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // ===== Cột rộng đồng nhất =====
  ws['!cols'] = [
    { wch: 12 },  // A: Kí hiệu
    { wch: 14 },  // B: Ngày tháng
    { wch: 52 },  // C: Diễn giải
    { wch: 20 },  // D: Số tiền
  ];

  // ===== Chiều cao hàng đồng nhất =====
  const totalRows = rows.length;
  ws['!rows'] = Array.from({ length: totalRows }, (_, i) => {
    if (i === 6) return { hpt: 26 }; // tiêu đề chính
    if (i === 9 || i === 10) return { hpt: 22 }; // header bảng
    return { hpt: 18 };
  });

  // ===== Merge =====
  ws['!merges'] = [
    // Tiêu đề chính SỔ CHI TIẾT… merge A:D hàng 7 (idx 6)
    { s: { r: 6, c: 0 }, e: { r: 6, c: 3 } },
    // Header "Chứng từ" merge A10:B10
    { s: { r: 9, c: 0 }, e: { r: 9, c: 1 } },
    // Header "Diễn giải" merge dọc C10:C11
    { s: { r: 9, c: 2 }, e: { r: 10, c: 2 } },
    // Header "Số tiền" merge dọc D10:D11
    { s: { r: 9, c: 3 }, e: { r: 10, c: 3 } },
  ];

  // ===== Style helpers =====
  const baseFont = { name: 'Times New Roman', sz: 12 };
  const thinBorder = { style: 'thin' as const, color: { rgb: '000000' } };
  const allBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

  const range = XLSX.utils.decode_range(ws['!ref']!);

  // Apply font + alignment cho tất cả cell có dữ liệu
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[addr];
      if (!cell) continue;
      cell.s = {
        font: { ...baseFont },
        alignment: { vertical: 'center', wrapText: true, horizontal: C === 3 ? 'right' : (C === 0 || C === 1 ? 'center' : 'left') },
      };
    }
  }

  // ===== Header thông tin (hàng 1-5): căn trái, cột D căn trái =====
  for (let R = 0; R <= 4; R++) {
    for (let C = 0; C <= 3; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[addr]) continue;
      ws[addr].s.alignment = { vertical: 'center', horizontal: C === 3 ? 'left' : 'left', wrapText: false };
    }
    // Cột D đầu tiên: "Mẫu số S2a-HKD" in đậm
    const dAddr = XLSX.utils.encode_cell({ r: R, c: 3 });
    if (R === 0 && ws[dAddr]) ws[dAddr].s.font = { ...baseFont, bold: true };
  }

  // ===== Tiêu đề chính (hàng 7, idx 6): căn giữa, size 14, đậm =====
  const titleAddr = XLSX.utils.encode_cell({ r: 6, c: 0 });
  if (ws[titleAddr]) {
    ws[titleAddr].s = {
      font: { ...baseFont, sz: 14, bold: true },
      alignment: { vertical: 'center', horizontal: 'center', wrapText: false },
    };
  }

  // ===== Kỳ kê khai (hàng 8, idx 7) =====
  const periodAddr = XLSX.utils.encode_cell({ r: 7, c: 0 });
  if (ws[periodAddr]) {
    ws[periodAddr].s = {
      font: { ...baseFont, italic: true },
      alignment: { vertical: 'center', horizontal: 'left', wrapText: false },
    };
  }
  const unitAddr = XLSX.utils.encode_cell({ r: 7, c: 3 });
  if (ws[unitAddr]) {
    ws[unitAddr].s = {
      font: { ...baseFont, italic: true },
      alignment: { vertical: 'center', horizontal: 'right', wrapText: false },
    };
  }

  // ===== Header bảng (hàng 10-12, idx 9-11): đậm, căn giữa, có border =====
  for (let R = 9; R <= 11; R++) {
    for (let C = 0; C <= 3; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[addr]) {
        ws[addr] = { v: '', t: 's' };
      }
      ws[addr].s = {
        font: { ...baseFont, bold: true },
        alignment: { vertical: 'center', horizontal: 'center', wrapText: true },
        border: allBorders,
        fill: { patternType: 'solid', fgColor: { rgb: 'F2F2F2' } },
      };
    }
  }

  // ===== Hàng dữ liệu (TM rows + subtotal + grand total): border, format số =====
  const lastDataRow = grandTotalRowIdx >= 0 ? grandTotalRowIdx : (subtotalRowIdx[subtotalRowIdx.length - 1] || dataStartRow);
  for (let R = dataStartRow; R <= lastDataRow; R++) {
    for (let C = 0; C <= 3; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[addr]) {
        ws[addr] = { v: '', t: 's' };
      }
      const isSubtotal = subtotalRowIdx.includes(R);
      const isGrand = R === grandTotalRowIdx;
      ws[addr].s = {
        font: { ...baseFont, bold: isSubtotal || isGrand },
        alignment: {
          vertical: 'center',
          horizontal: C === 3 ? 'right' : (C === 0 || C === 1 ? 'center' : (isSubtotal || isGrand ? 'right' : 'left')),
          wrapText: false,
        },
        border: allBorders,
        ...(isGrand ? { fill: { patternType: 'solid', fgColor: { rgb: 'FFF2CC' } } } : {}),
      };
      if (C === 3 && typeof ws[addr].v === 'number') {
        ws[addr].z = '#,##0';
      }
    }
  }

  // ===== Footer chữ ký: căn giữa cột D =====
  for (let R = lastDataRow + 1; R <= range.e.r; R++) {
    const dAddr = XLSX.utils.encode_cell({ r: R, c: 3 });
    if (!ws[dAddr]) continue;
    const v = String(ws[dAddr].v || '');
    const isDate = v.startsWith('Ngày');
    const isRole = v.includes('NGƯỜI ĐẠI DIỆN') || v.includes('CÁ NHÂN');
    ws[dAddr].s = {
      font: { ...baseFont, italic: isDate, bold: isRole },
      alignment: { vertical: 'center', horizontal: 'center', wrapText: false },
    };
  }

  XLSX.utils.book_append_sheet(wb, ws, 'S2a-HKD');
  const suffix = isFullYear ? `${year}` : `Q${quarters.join('-')}_${year}`;
  XLSX.writeFile(wb, `S2a-HKD_${suffix}.xlsx`, { cellStyles: true });
}
