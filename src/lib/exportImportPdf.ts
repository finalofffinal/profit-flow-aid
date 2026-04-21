import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ImportOrder, Product } from '@/types';
import { BUSINESS_INFO } from '@/lib/constants';
import { useVietnameseFont, PDF_FONT } from '@/lib/fonts';

function formatVNDNumber(amount: number): string {
  return Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function exportImportPdf(importOrders: ImportOrder[], products: Product[], quarter: number, year: number) {
  const doc = new jsPDF('p', 'mm', 'a4');
  useVietnameseFont(doc);
  const pageWidth = doc.internal.pageSize.getWidth();

  const startMonth = (quarter - 1) * 3;
  const qOrders = importOrders.filter(o => {
    if (o.deletedAt) return false;
    const d = new Date(o.date);
    return d.getFullYear() === year && d.getMonth() >= startMonth && d.getMonth() < startMonth + 3;
  }).sort((a, b) => a.date.localeCompare(b.date));

  const totalAmount = qOrders.reduce((s, o) => s + o.total, 0);
  const totalCount = qOrders.length;

  doc.setFont(PDF_FONT, 'bold');
  doc.setFontSize(11);
  doc.text(`HỘ KINH DOANH: ${BUSINESS_INFO.name}`, 14, 20);
  doc.setFont(PDF_FONT, 'normal');
  doc.setFontSize(9);
  doc.text(`MST: ${BUSINESS_INFO.taxId}`, 14, 26);
  doc.text(`Địa chỉ: ${BUSINESS_INFO.address}, ${BUSINESS_INFO.stall}`, 14, 32);

  doc.setFont(PDF_FONT, 'bold');
  doc.setFontSize(14);
  doc.text(`SỔ NHẬP HÀNG - QUÝ ${quarter}/${year}`, pageWidth / 2, 44, { align: 'center' });
  doc.setFont(PDF_FONT, 'normal');

  doc.setFontSize(10);
  doc.text(`Tổng số đơn: ${totalCount}`, 14, 54);
  doc.text(`Tổng tiền nhập: ${formatVNDNumber(totalAmount)} VNĐ`, 14, 60);

  const tableData: string[][] = [];
  for (const order of qOrders) {
    const dateStr = new Date(order.date).toLocaleDateString('vi-VN');
    tableData.push([dateStr, `[${order.supplierName}] (${order.items.length} SP)`, formatVNDNumber(order.total)]);
    for (const item of order.items) {
      const product = products.find(p => p.id === item.productId);
      const brand = product?.brand || '';
      const brandLabel = brand ? `[${brand}] ` : '';
      tableData.push(['', `  ${brandLabel}${item.productName} x${item.quantity} ${item.unit}`, formatVNDNumber(item.total)]);
    }
  }
  tableData.push(['', `TỔNG CỘNG QUÝ ${quarter}/${year}`, formatVNDNumber(totalAmount)]);

  autoTable(doc, {
    startY: 68,
    head: [['Ngày', 'Diễn giải', 'Số tiền (VNĐ)']],
    body: tableData,
    styles: { font: PDF_FONT, fontSize: 7, cellPadding: 1.5 },
    headStyles: { font: PDF_FONT, fontStyle: 'bold', fillColor: [50, 50, 80], fontSize: 8 },
    bodyStyles: { font: PDF_FONT },
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
