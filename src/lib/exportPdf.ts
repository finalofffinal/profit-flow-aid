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
 * Sales PDF — NO tags (TM/CK/auto), NO profit info.
 * Format: Day-by-day breakdown of products, quantities, totals; quarter total at end.
 */
export function exportSalesPdf(salesOrders: SaleOrder[], year: number, quarters: number[] = [1, 2, 3, 4]) {
  const doc = new jsPDF('p', 'mm', 'a4');
  useVietnameseFont(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const activeSales = salesOrders.filter(o => !o.deletedAt && new Date(o.date).getFullYear() === year);

  doc.setFont(PDF_FONT, 'bold');
  doc.setFontSize(11);
  doc.text(`HỘ KINH DOANH: ${BUSINESS_INFO.name}`, 14, 20);
  doc.setFont(PDF_FONT, 'normal');
  doc.setFontSize(9);
  doc.text(`MST: ${BUSINESS_INFO.taxId}`, 14, 26);
  doc.text(`Địa chỉ: ${BUSINESS_INFO.address}, ${BUSINESS_INFO.stall}`, 14, 32);
  doc.text(`Ngành nghề: ${BUSINESS_INFO.industry}`, 14, 38);

  const qLabel = quarters.length === 4 ? `Năm ${year}` : `Quý ${quarters.join(', ')} / ${year}`;
  doc.setFont(PDF_FONT, 'bold');
  doc.setFontSize(14);
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
    doc.setFontSize(12);
    doc.text(`QUÝ ${q}/${year}`, 14, currentY);
    doc.setFont(PDF_FONT, 'normal');
    currentY += 6;

    const dayMap = new Map<string, SaleOrder[]>();
    qSales.forEach(o => {
      const day = o.date.split('T')[0];
      if (!dayMap.has(day)) dayMap.set(day, []);
      dayMap.get(day)!.push(o);
    });

    const tableData: string[][] = [];
    let quarterTotal = 0;

    const sortedDays = Array.from(dayMap.keys()).sort();
    for (const day of sortedDays) {
      const dayOrders = dayMap.get(day)!;
      const dateObj = new Date(day);
      const dateStr = dateObj.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
      const weekday = WEEKDAYS[dateObj.getDay()];
      const dayTotal = dayOrders.reduce((s, o) => s + o.totalRevenue, 0);
      quarterTotal += dayTotal;

      tableData.push([dateStr, `${weekday}, ngày ${dateStr}`, formatVNDNumber(dayTotal)]);

      for (const order of dayOrders) {
        for (const item of order.items) {
          tableData.push(['', `  ${item.productName} x${item.quantity} ${item.unit}`, formatVNDNumber(item.total)]);
        }
      }
    }

    tableData.push(['', `TỔNG CỘNG QUÝ ${q}`, formatVNDNumber(quarterTotal)]);

    autoTable(doc, {
      startY: currentY,
      head: [['Ngày tháng', 'Diễn giải', 'Số tiền (VNĐ)']],
      body: tableData,
      styles: { font: PDF_FONT, fontSize: 7, cellPadding: 1.5 },
      headStyles: { font: PDF_FONT, fontStyle: 'bold', fillColor: [50, 50, 80], fontSize: 8 },
      bodyStyles: { font: PDF_FONT },
      columnStyles: {
        0: { cellWidth: 25 }, 1: { cellWidth: 115 }, 2: { cellWidth: 35, halign: 'right' },
      },
      didParseCell: (data) => {
        if (data.row.index === tableData.length - 1 && data.section === 'body') {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [240, 240, 250];
        }
      },
      margin: { left: 14, right: 14 },
    });

    currentY = (doc as any).lastAutoTable.finalY + 10;
  }

  if (currentY > 260) { doc.addPage(); currentY = 20; }
  doc.setFontSize(9);
  doc.text(`Ngày ... tháng ... năm ${year}`, pageWidth - 60, currentY);
  doc.setFont(PDF_FONT, 'bold');
  doc.text('NGƯỜI ĐẠI DIỆN HỘ KINH DOANH', pageWidth - 75, currentY + 6);
  doc.setFont(PDF_FONT, 'normal');
  doc.text(`${BUSINESS_INFO.name}`, pageWidth - 55, currentY + 18);

  const suffix = quarters.length === 4 ? `${year}` : `Q${quarters.join('-')}_${year}`;
  doc.save(`S2a-HKD_${suffix}.pdf`);
}
