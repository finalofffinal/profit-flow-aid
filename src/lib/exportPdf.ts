import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SaleOrder } from '@/types';
import { BUSINESS_INFO } from '@/lib/constants';
import { useVietnameseFont, PDF_FONT } from '@/lib/fonts';

function formatVNDNumber(amount: number): string {
  return Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

const WEEKDAYS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];

/**
 * Sales PDF — Times New Roman (Tinos). Day rows in bold/large, products underneath.
 * No signature footer.
 */
export function exportSalesPdf(salesOrders: SaleOrder[], year: number, quarters: number[] = [1, 2, 3, 4]) {
  const doc = new jsPDF('p', 'mm', 'a4');
  useVietnameseFont(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const activeSales = salesOrders.filter(o => !o.deletedAt && new Date(o.date).getFullYear() === year);

  // Header
  doc.setFont(PDF_FONT, 'bold');
  doc.setFontSize(13);
  doc.text(`HỘ KINH DOANH: ${BUSINESS_INFO.name.toUpperCase()}`, 14, 18);
  doc.setFont(PDF_FONT, 'normal');
  doc.setFontSize(10);
  doc.text(`Mã số thuế: ${BUSINESS_INFO.taxId}`, 14, 25);
  doc.text(`Địa chỉ: ${BUSINESS_INFO.address}, ${BUSINESS_INFO.stall}`, 14, 31);
  doc.text(`Ngành nghề: ${BUSINESS_INFO.industry}`, 14, 37);

  const qLabel = quarters.length === 4 ? `NĂM ${year}` : `QUÝ ${quarters.join(', ')} / ${year}`;
  doc.setFont(PDF_FONT, 'bold');
  doc.setFontSize(16);
  doc.text(`SỔ CHI TIẾT DOANH THU BÁN HÀNG - ${qLabel}`, pageWidth / 2, 50, { align: 'center' });
  doc.setFont(PDF_FONT, 'normal');

  let currentY = 60;

  for (const q of quarters) {
    const startMonth = (q - 1) * 3;
    const qSales = activeSales.filter(o => {
      const d = new Date(o.date);
      return d.getMonth() >= startMonth && d.getMonth() < startMonth + 3;
    }).sort((a, b) => a.date.localeCompare(b.date));

    if (currentY > 240) { doc.addPage(); currentY = 20; }

    doc.setFont(PDF_FONT, 'bold');
    doc.setFontSize(13);
    doc.text(`QUÝ ${q}/${year}`, 14, currentY);
    doc.setFont(PDF_FONT, 'normal');
    currentY += 6;

    const dayMap = new Map<string, SaleOrder[]>();
    qSales.forEach(o => {
      const day = o.date.split('T')[0];
      if (!dayMap.has(day)) dayMap.set(day, []);
      dayMap.get(day)!.push(o);
    });

    type Row = { kind: 'day' | 'item'; date: string; desc: string; amount: string };
    const rows: Row[] = [];
    let quarterTotal = 0;

    const sortedDays = Array.from(dayMap.keys()).sort();
    for (const day of sortedDays) {
      const dayOrders = dayMap.get(day)!;
      const dateObj = new Date(day);
      const dateStr = dateObj.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const weekday = WEEKDAYS[dateObj.getDay()];
      const dayTotal = dayOrders.reduce((s, o) => s + o.totalRevenue, 0);
      quarterTotal += dayTotal;

      rows.push({
        kind: 'day',
        date: `${weekday}\n${dateStr}`,
        desc: `Doanh thu bán hàng ngày ${dateStr}`,
        amount: formatVNDNumber(dayTotal),
      });

      for (const order of dayOrders) {
        for (const item of order.items) {
          rows.push({
            kind: 'item',
            date: '',
            desc: `   • ${item.productName}  ×${item.quantity} ${item.unit}`,
            amount: formatVNDNumber(item.total),
          });
        }
      }
    }

    rows.push({ kind: 'day', date: '', desc: `TỔNG CỘNG QUÝ ${q}/${year}`, amount: formatVNDNumber(quarterTotal) });

    autoTable(doc, {
      startY: currentY,
      head: [['Ngày tháng', 'Diễn giải', 'Số tiền (VNĐ)']],
      body: rows.map(r => [r.date, r.desc, r.amount]),
      styles: { font: PDF_FONT, fontSize: 9, cellPadding: 2, valign: 'middle' },
      // Header bảng: nền xanh đậm, chữ trắng to (14pt) → tương phản mạnh với day rows
      headStyles: {
        font: PDF_FONT,
        fontStyle: 'bold',
        fillColor: [25, 35, 70],
        fontSize: 14,
        halign: 'center',
        textColor: [255, 255, 255],
        cellPadding: 4,
        lineColor: [255, 255, 255],
        lineWidth: 0.3,
      },
      bodyStyles: { font: PDF_FONT, textColor: [40, 40, 40] },
      columnStyles: {
        0: { cellWidth: 32, halign: 'center' },
        1: { cellWidth: 110 },
        2: { cellWidth: 35, halign: 'right' },
      },
      didParseCell: (data) => {
        const row = rows[data.row.index];
        if (!row) return;
        // Day rows: nền vàng nhạt, chữ nâu sẫm 10pt — KHÁC HẲN header xanh đậm
        if (row.kind === 'day' && data.row.index !== rows.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fontSize = 10;
          data.cell.styles.fillColor = [252, 245, 220];
          data.cell.styles.textColor = [120, 60, 10];
        }
        // Tổng cộng cuối quý
        if (data.row.index === rows.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fontSize = 12;
          data.cell.styles.fillColor = [255, 230, 180];
          data.cell.styles.textColor = [80, 40, 0];
        }
      },
      margin: { left: 14, right: 14 },
    });

    currentY = (doc as any).lastAutoTable.finalY + 10;
  }

  const suffix = quarters.length === 4 ? `${year}` : `Q${quarters.join('-')}_${year}`;
  doc.save(`S2a-HKD_${suffix}.pdf`);
}
