import * as XLSX from 'xlsx';
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
  const m = q * 3 - 1; // 0-indexed last month of quarter
  const day = new Date(year, m + 1, 0).getDate();
  return { day, month: m + 1 };
}

/**
 * S2a-HKD Excel — strict template per official sample.
 * - One row per day (even zero-revenue), description = "Doanh thu tiền mặt bán lẻ"
 * - Date format: DD-MM
 * - Kỳ kê khai: "Năm {year}" if all 4 quarters else "Quý X năm {year}"
 * - Footer date: last day of selected period + selected year
 */
export function exportSalesExcel(salesOrders: SaleOrder[], year: number, quarters: number[] = [1, 2, 3, 4]) {
  const wb = XLSX.utils.book_new();
  const ws_data: any[][] = [];

  // Header block (matches template column layout: A | B | C | D)
  ws_data.push([`Hộ kinh doanh: ${BUSINESS_INFO.name.toUpperCase()}`, '', '', 'Mẫu số S2a-HKD']);
  ws_data.push([`Mã số thuế: ${BUSINESS_INFO.taxId}`, '', '', '(Kèm theo Thông tư số 152/2025/TT-BTC']);
  ws_data.push([`Địa chỉ: ${BUSINESS_INFO.address}, ${BUSINESS_INFO.stall}`, '', '', 'ngày 31/12/2025 của Bộ Tài chính)']);
  ws_data.push([`Điện thoại: ${BUSINESS_INFO.phone}`]);
  ws_data.push([`Ngành: ${BUSINESS_INFO.industry}`]);
  ws_data.push([]);
  ws_data.push(['', '', 'SỔ CHI TIẾT DOANH THU BÁN HÀNG, DỊCH VỤ']);

  const isFullYear = quarters.length === 4;
  const periodLabel = isFullYear
    ? `Kỳ kê khai: Năm ${year}`
    : `Kỳ kê khai: Quý ${quarters.join(', ')} năm ${year}`;
  ws_data.push([periodLabel, '', '', '(Đơn vị tính: VND)']);
  ws_data.push([]);

  // Table header (2-row merged style)
  ws_data.push(['Chứng từ', '', 'Diễn giải', 'Số tiền']);
  ws_data.push(['Kí hiệu', 'Ngày, tháng', '', '']);
  ws_data.push(['A', 'B', 'C', '1']);
  ws_data.push(['', '', `Ngành nghề: ${BUSINESS_INFO.industry}`, '']);

  const activeSales = salesOrders.filter(o => !o.deletedAt && new Date(o.date).getFullYear() === year);

  // Build day map for fast lookup: date -> total revenue
  const dayTotal = new Map<string, number>();
  for (const o of activeSales) {
    const day = o.date.split('T')[0];
    dayTotal.set(day, (dayTotal.get(day) || 0) + o.totalRevenue);
  }

  let grandTotal = 0;

  for (const q of quarters) {
    const days = getDaysInQuarter(q, year);
    let quarterTotal = 0;

    for (const day of days) {
      const total = dayTotal.get(day) || 0;
      quarterTotal += total;
      const [, mm, dd] = day.split('-');
      ws_data.push(['TM', `${dd}-${mm}`, 'Doanh thu tiền mặt bán lẻ', total]);
    }

    ws_data.push([]);
    ws_data.push(['', '', `Tổng cộng (Quý ${q})`, quarterTotal]);
    grandTotal += quarterTotal;

    if (!isFullYear || q < 4) {
      // Spacer between quarters
      for (let i = 0; i < 3; i++) ws_data.push([]);
    }
  }

  if (isFullYear) {
    ws_data.push([]);
    ws_data.push(['', '', `TỔNG CỘNG NĂM ${year}`, grandTotal]);
  }

  // Footer with proper date (last day of selected period)
  const lastQ = Math.max(...quarters);
  const { day: lastDay, month: lastMonth } = lastDayOfQuarter(lastQ, year);
  for (let i = 0; i < 4; i++) ws_data.push([]);
  ws_data.push(['', '', `Ngày ${lastDay} tháng ${lastMonth} năm ${year}`]);
  ws_data.push(['', '', 'NGƯỜI ĐẠI DIỆN HỘ KINH DOANH/ CÁ NHÂN KINH DOANH']);
  ws_data.push(['', '', '(Ký, ghi rõ họ tên, đóng dấu (nếu có))']);

  const ws = XLSX.utils.aoa_to_sheet(ws_data);
  ws['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 50 }, { wch: 18 }];

  // Apply Times New Roman to ALL cells + bold the headings + currency format on column D
  const range = XLSX.utils.decode_range(ws['!ref']!);
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[addr]) continue;
      ws[addr].s = ws[addr].s || {};
      ws[addr].s.font = { name: 'Times New Roman', sz: 11 };
      ws[addr].s.alignment = { vertical: 'center', wrapText: true };
    }
  }

  // Bold key rows (heuristic by content)
  const boldKeywords = ['SỔ CHI TIẾT', 'TỔNG CỘNG', 'Tổng cộng', 'Chứng từ', 'NGƯỜI ĐẠI DIỆN', 'Ngày', 'Mẫu số', 'Hộ kinh doanh'];
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[addr];
      if (!cell || typeof cell.v !== 'string') continue;
      if (boldKeywords.some(k => cell.v.includes(k))) {
        cell.s.font = { ...cell.s.font, bold: true };
      }
      // Title bigger
      if (cell.v.includes('SỔ CHI TIẾT')) {
        cell.s.font = { ...cell.s.font, sz: 14, bold: true };
        cell.s.alignment = { ...cell.s.alignment, horizontal: 'center' };
      }
    }
  }

  // Number format on column D (index 3) for numeric cells
  for (let R = range.s.r; R <= range.e.r; R++) {
    const addr = XLSX.utils.encode_cell({ r: R, c: 3 });
    const cell = ws[addr];
    if (cell && typeof cell.v === 'number') {
      cell.z = '#,##0';
      cell.s = cell.s || {};
      cell.s.alignment = { horizontal: 'right', vertical: 'center' };
      cell.s.font = { name: 'Times New Roman', sz: 11 };
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, 'S2a-HKD');
  const suffix = isFullYear ? `${year}` : `Q${quarters.join('-')}_${year}`;
  XLSX.writeFile(wb, `S2a-HKD_${suffix}.xlsx`, { cellStyles: true });
}
