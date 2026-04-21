import * as XLSX from 'xlsx';
import { SaleOrder, ImportTag } from '@/types';
import { BUSINESS_INFO, IMPORT_TAG_LABELS } from '@/lib/constants';

function getTagLabel(tag: ImportTag): string {
  if (tag === 'auto') return 'TM';
  return IMPORT_TAG_LABELS[tag] || tag;
}

function getDescription(tag: ImportTag): string {
  if (tag === 'auto') return 'Doanh thu tiền mặt bán lẻ';
  return `Doanh thu ${IMPORT_TAG_LABELS[tag]?.toLowerCase() || tag} bán giá sỉ`;
}

export function exportSalesExcel(salesOrders: SaleOrder[], year: number, quarters: number[] = [1, 2, 3, 4]) {
  const wb = XLSX.utils.book_new();
  const ws_data: any[][] = [];

  ws_data.push([`HỘ, CÁ NHÂN KINH DOANH: ${BUSINESS_INFO.name}`, '', '', 'Mẫu số S2a-HKD']);
  ws_data.push([`Địa chỉ: ${BUSINESS_INFO.address}`, '', '', '(Kèm theo Thông tư số 152/2025/TT-BTC']);
  ws_data.push([`Mã số thuế: ${BUSINESS_INFO.taxId}`, '', '', 'ngày 31/12/2025 của Bộ Tài chính)']);
  ws_data.push([]);
  ws_data.push(['SỔ CHI TIẾT DOANH THU BÁN HÀNG HÓA, DỊCH VỤ']);
  ws_data.push([`Địa điểm kinh doanh: ${BUSINESS_INFO.address}, ${BUSINESS_INFO.stall}`]);
  ws_data.push([`Kỳ kê khai: ${quarters.length === 4 ? `Năm ${year}` : `Quý ${quarters.join(', ')} năm ${year}`}`]);
  ws_data.push(['', '', '', 'Đơn vị tính: VND']);
  ws_data.push([]);

  const activeSales = salesOrders.filter(o => !o.deletedAt && new Date(o.date).getFullYear() === year);

  for (const q of quarters) {
    const startMonth = (q - 1) * 3;
    const qSales = activeSales.filter(o => {
      const d = new Date(o.date);
      const m = d.getMonth();
      return m >= startMonth && m < startMonth + 3;
    }).sort((a, b) => a.date.localeCompare(b.date));

    ws_data.push([`Quý ${q} - ${BUSINESS_INFO.industry}`]);
    ws_data.push([]);
    ws_data.push(['Chứng từ', 'Ngày, tháng', 'Diễn giải', 'Số tiền']);
    ws_data.push(['A', 'B', 'C', '1']);

    let quarterTotal = 0;
    const dayMap = new Map<string, SaleOrder[]>();
    qSales.forEach(o => {
      const day = o.date.split('T')[0];
      if (!dayMap.has(day)) dayMap.set(day, []);
      dayMap.get(day)!.push(o);
    });

    const sortedDays = Array.from(dayMap.keys()).sort();
    for (const day of sortedDays) {
      const dayOrders = dayMap.get(day)!;
      const dateObj = new Date(day);
      const dateStr = dateObj.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
      const manualOrders = dayOrders.filter(o => o.tag !== 'auto');
      const autoOrders = dayOrders.filter(o => o.tag === 'auto');
      for (const order of manualOrders) {
        ws_data.push([`${getTagLabel(order.tag)} ${dateStr}`, dateStr, getDescription(order.tag), order.totalRevenue]);
        quarterTotal += order.totalRevenue;
      }
      if (autoOrders.length > 0) {
        const autoTotal = autoOrders.reduce((s, o) => s + o.totalRevenue, 0);
        ws_data.push(['TM', dateStr, getDescription('auto'), autoTotal]);
        quarterTotal += autoTotal;
      }
    }

    ws_data.push([]);
    ws_data.push(['', '', `Tổng cộng (Quý ${q})`, quarterTotal]);
    for (let i = 0; i < 5; i++) ws_data.push([]);
  }

  ws_data.push([]);
  ws_data.push(['', '', '', `Ngày ... tháng ... năm ${year}`]);
  ws_data.push(['', '', '', 'NGƯỜI ĐẠI DIỆN HỘ KINH DOANH']);
  ws_data.push(['', '', '', '(Ký, ghi rõ họ tên, đóng dấu (nếu có))']);

  const ws = XLSX.utils.aoa_to_sheet(ws_data);
  ws['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 35 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ws, `S2a-HKD ${year}`);
  const suffix = quarters.length === 4 ? `${year}` : `Q${quarters.join('-')}_${year}`;
  XLSX.writeFile(wb, `S2a-HKD_${suffix}.xlsx`);
}
