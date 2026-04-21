import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ImportOrder, Product } from '@/types';
import { BUSINESS_INFO } from '@/lib/constants';
import { useVietnameseFont, PDF_FONT } from '@/lib/fonts';

function formatVNDNumber(amount: number): string {
  return Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

const WEEKDAYS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];

/**
 * Import PDF — Times New Roman.
 * Layout: Day cell (bold/large) groups all suppliers that delivered. For each supplier
 * (bold heading row): list brand-tagged products with qty + buy price + total. Spacer
 * row between suppliers within same day.
 */
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

  // Header
  doc.setFont(PDF_FONT, 'bold');
  doc.setFontSize(13);
  doc.text(`HỘ KINH DOANH: ${BUSINESS_INFO.name.toUpperCase()}`, 14, 18);
  doc.setFont(PDF_FONT, 'normal');
  doc.setFontSize(10);
  doc.text(`Mã số thuế: ${BUSINESS_INFO.taxId}`, 14, 25);
  doc.text(`Địa chỉ: ${BUSINESS_INFO.address}, ${BUSINESS_INFO.stall}`, 14, 31);

  doc.setFont(PDF_FONT, 'bold');
  doc.setFontSize(16);
  doc.text(`SỔ NHẬP HÀNG - QUÝ ${quarter}/${year}`, pageWidth / 2, 44, { align: 'center' });
  doc.setFont(PDF_FONT, 'normal');
  doc.setFontSize(10);
  doc.text(`Tổng số đơn: ${qOrders.length}    |    Tổng tiền nhập: ${formatVNDNumber(totalAmount)} VNĐ`, pageWidth / 2, 52, { align: 'center' });

  // Group orders by day
  const dayMap = new Map<string, ImportOrder[]>();
  for (const o of qOrders) {
    const day = o.date.split('T')[0];
    if (!dayMap.has(day)) dayMap.set(day, []);
    dayMap.get(day)!.push(o);
  }

  type Row = { kind: 'day' | 'supplier' | 'item' | 'spacer'; col0: string; col1: string; col2: string; col3: string };
  const rows: Row[] = [];

  const sortedDays = Array.from(dayMap.keys()).sort();
  for (const day of sortedDays) {
    const dayOrders = dayMap.get(day)!;
    const dateObj = new Date(day);
    const dateStr = dateObj.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const weekday = WEEKDAYS[dateObj.getDay()];
    const dayTotal = dayOrders.reduce((s, o) => s + o.total, 0);
    const supplierNames = Array.from(new Set(dayOrders.map(o => o.supplierName))).join(', ');

    rows.push({
      kind: 'day',
      col0: `${weekday}\n${dateStr}`,
      col1: `NCC giao: ${supplierNames}`,
      col2: '',
      col3: formatVNDNumber(dayTotal),
    });

    dayOrders.forEach((order, idx) => {
      rows.push({
        kind: 'supplier',
        col0: '',
        col1: `► ${order.supplierName}`,
        col2: `${order.items.length} SP`,
        col3: formatVNDNumber(order.total),
      });
      for (const item of order.items) {
        const product = products.find(p => p.id === item.productId);
        const brand = product?.brand || '';
        const brandTag = brand ? `[${brand}] ` : '';
        rows.push({
          kind: 'item',
          col0: '',
          col1: `      ${brandTag}${item.productName}`,
          col2: `${item.quantity} ${item.unit} × ${formatVNDNumber(item.buyPrice)}`,
          col3: formatVNDNumber(item.total),
        });
      }
      if (idx < dayOrders.length - 1) {
        rows.push({ kind: 'spacer', col0: '', col1: '', col2: '', col3: '' });
      }
    });
  }

  rows.push({
    kind: 'day',
    col0: '',
    col1: `TỔNG CỘNG QUÝ ${quarter}/${year}`,
    col2: '',
    col3: formatVNDNumber(totalAmount),
  });

  autoTable(doc, {
    startY: 58,
    head: [['Ngày tháng', 'Nhà cung cấp / Sản phẩm', 'Số lượng × Đơn giá', 'Thành tiền (VNĐ)']],
    body: rows.map(r => [r.col0, r.col1, r.col2, r.col3]),
    styles: { font: PDF_FONT, fontSize: 9, cellPadding: 1.8, valign: 'middle' },
    headStyles: { font: PDF_FONT, fontStyle: 'bold', fillColor: [40, 50, 80], fontSize: 10, halign: 'center', textColor: [255, 255, 255] },
    bodyStyles: { font: PDF_FONT },
    columnStyles: {
      0: { cellWidth: 30, halign: 'center' },
      1: { cellWidth: 90 },
      2: { cellWidth: 38, halign: 'center' },
      3: { cellWidth: 30, halign: 'right' },
    },
    didParseCell: (data) => {
      const row = rows[data.row.index];
      if (!row) return;
      if (row.kind === 'day') {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fontSize = 11;
        data.cell.styles.fillColor = [232, 238, 250];
      } else if (row.kind === 'supplier') {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fontSize = 10;
        data.cell.styles.fillColor = [245, 245, 230];
      } else if (row.kind === 'spacer') {
        data.cell.styles.fillColor = [255, 255, 255];
        data.cell.styles.minCellHeight = 3;
      }
      if (data.row.index === rows.length - 1) {
        data.cell.styles.fontSize = 12;
        data.cell.styles.fillColor = [255, 240, 210];
      }
    },
    margin: { left: 14, right: 14 },
  });

  doc.save(`NhapHang_Q${quarter}_${year}.pdf`);
}
