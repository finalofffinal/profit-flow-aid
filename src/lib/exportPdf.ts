import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SaleOrder } from '@/types';
import { BUSINESS_INFO, IMPORT_TAG_LABELS } from '@/lib/constants';

function formatVNDNumber(amount: number): string {
  return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function exportSalesPdf(salesOrders: SaleOrder[], year: number, quarters: number[] = [1, 2, 3, 4]) {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const activeSales = salesOrders.filter(o => !o.deletedAt && new Date(o.date).getFullYear() === year);

  doc.setFontSize(11);
  doc.text(`HO KINH DOANH: ${BUSINESS_INFO.name}`, 14, 20);
  doc.setFontSize(9);
  doc.text(`MST: ${BUSINESS_INFO.taxId}`, 14, 26);
  doc.text(`Dia chi: ${BUSINESS_INFO.address}, ${BUSINESS_INFO.stall}`, 14, 32);
  doc.text(`Nganh nghe: ${BUSINESS_INFO.industry}`, 14, 38);

  const qLabel = quarters.length === 4 ? `Nam ${year}` : `Quy ${quarters.join(', ')} / ${year}`;
  doc.setFontSize(14);
  doc.text(`SO CHI TIET DOANH THU BAN HANG - ${qLabel}`, pageWidth / 2, 50, { align: 'center' });

  let currentY = 60;

  for (const q of quarters) {
    const startMonth = (q - 1) * 3;
    const qSales = activeSales.filter(o => {
      const d = new Date(o.date);
      return d.getMonth() >= startMonth && d.getMonth() < startMonth + 3;
    }).sort((a, b) => a.date.localeCompare(b.date));

    if (currentY > 240) { doc.addPage(); currentY = 20; }

    doc.setFontSize(12);
    doc.text(`QUY ${q}/${year}`, 14, currentY);
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
      const dayTotal = dayOrders.reduce((s, o) => s + o.totalRevenue, 0);
      quarterTotal += dayTotal;

      const tagLabel = dayOrders.some(o => o.tag !== 'auto')
        ? dayOrders.filter(o => o.tag !== 'auto').map(o => IMPORT_TAG_LABELS[o.tag] || 'TM').join(', ')
        : 'TM';
      tableData.push([tagLabel, dateStr, `Doanh thu ngay ${dateStr}`, formatVNDNumber(dayTotal)]);

      for (const order of dayOrders) {
        for (const item of order.items) {
          tableData.push(['', '', `  ${item.productName} x${item.quantity} ${item.unit}`, formatVNDNumber(item.total)]);
        }
      }
    }

    tableData.push(['', '', `TONG CONG QUY ${q}`, formatVNDNumber(quarterTotal)]);

    autoTable(doc, {
      startY: currentY,
      head: [['Chung tu', 'Ngay thang', 'Dien giai', 'So tien (VND)']],
      body: tableData,
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [50, 50, 80], fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 25 }, 1: { cellWidth: 22 }, 2: { cellWidth: 90 }, 3: { cellWidth: 35, halign: 'right' },
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
  doc.text(`Ngay ... thang ... nam ${year}`, pageWidth - 60, currentY);
  doc.text('NGUOI DAI DIEN HO KINH DOANH', pageWidth - 70, currentY + 6);
  doc.text(`${BUSINESS_INFO.name}`, pageWidth - 55, currentY + 18);

  const suffix = quarters.length === 4 ? `${year}` : `Q${quarters.join('-')}_${year}`;
  doc.save(`S2a-HKD_${suffix}.pdf`);
}
