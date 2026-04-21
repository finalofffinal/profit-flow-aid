import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ImportOrder, Product } from '@/types';
import { BUSINESS_INFO } from '@/lib/constants';

function formatVNDNumber(amount: number): string {
  return Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Import PDF — for a locked quarter.
 * Format: Quarter header + total amount + total orders, then per-day orders grouped by supplier
 * with brand, product name, quantity, line total, and order total. Quarter total at end.
 */
export function exportImportPdf(importOrders: ImportOrder[], products: Product[], quarter: number, year: number) {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();

  const startMonth = (quarter - 1) * 3;
  const qOrders = importOrders.filter(o => {
    if (o.deletedAt) return false;
    const d = new Date(o.date);
    return d.getFullYear() === year && d.getMonth() >= startMonth && d.getMonth() < startMonth + 3;
  }).sort((a, b) => a.date.localeCompare(b.date));

  const totalAmount = qOrders.reduce((s, o) => s + o.total, 0);
  const totalCount = qOrders.length;

  doc.setFontSize(11);
  doc.text(`HO KINH DOANH: ${BUSINESS_INFO.name}`, 14, 20);
  doc.setFontSize(9);
  doc.text(`MST: ${BUSINESS_INFO.taxId}`, 14, 26);
  doc.text(`Dia chi: ${BUSINESS_INFO.address}, ${BUSINESS_INFO.stall}`, 14, 32);

  doc.setFontSize(14);
  doc.text(`SO NHAP HANG - QUY ${quarter}/${year}`, pageWidth / 2, 44, { align: 'center' });

  doc.setFontSize(10);
  doc.text(`Tong so don: ${totalCount}`, 14, 54);
  doc.text(`Tong tien nhap: ${formatVNDNumber(totalAmount)} VND`, 14, 60);

  // Build table: per-order rows grouped by date, then per-item rows
  const tableData: string[][] = [];
  for (const order of qOrders) {
    const dateStr = new Date(order.date).toLocaleDateString('vi-VN');
    // Order header row: date | supplier | total
    tableData.push([dateStr, `[${order.supplierName}] (${order.items.length} SP)`, formatVNDNumber(order.total)]);
    // Item rows
    for (const item of order.items) {
      const product = products.find(p => p.id === item.productId);
      const brand = product?.brand || '';
      const brandLabel = brand ? `[${brand}] ` : '';
      tableData.push(['', `  ${brandLabel}${item.productName} x${item.quantity} ${item.unit}`, formatVNDNumber(item.total)]);
    }
  }
  tableData.push(['', `TONG CONG QUY ${quarter}/${year}`, formatVNDNumber(totalAmount)]);

  autoTable(doc, {
    startY: 68,
    head: [['Ngay', 'Dien giai', 'So tien (VND)']],
    body: tableData,
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [50, 50, 80], fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 25 },
      1: { cellWidth: 115 },
      2: { cellWidth: 35, halign: 'right' },
    },
    didParseCell: (data) => {
      if (data.row.index === tableData.length - 1 && data.section === 'body') {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [240, 240, 250];
      }
    },
    margin: { left: 14, right: 14 },
  });

  doc.save(`NhapHang_Q${quarter}_${year}.pdf`);
}
