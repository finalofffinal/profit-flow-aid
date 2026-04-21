import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { InventoryBatch, Product, Supplier } from '@/types';
import { BUSINESS_INFO } from '@/lib/constants';
import { useVietnameseFont, PDF_FONT } from '@/lib/fonts';

function formatVNDNumber(amount: number): string {
  return Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function exportInventoryPdf(
  batches: InventoryBatch[],
  products: Product[],
  suppliers: Supplier[],
  quarter: number,
  year: number
) {
  const doc = new jsPDF('p', 'mm', 'a4');
  useVietnameseFont(doc);
  const pageWidth = doc.internal.pageSize.getWidth();

  const qBatches = batches.filter(b => b.quarter === quarter && b.year === year);

  doc.setFont(PDF_FONT, 'bold');
  doc.setFontSize(11);
  doc.text(`HỘ KINH DOANH: ${BUSINESS_INFO.name}`, 14, 20);
  doc.setFont(PDF_FONT, 'normal');
  doc.setFontSize(9);
  doc.text(`MST: ${BUSINESS_INFO.taxId}`, 14, 26);
  doc.text(`Địa chỉ: ${BUSINESS_INFO.address}, ${BUSINESS_INFO.stall}`, 14, 32);

  doc.setFont(PDF_FONT, 'bold');
  doc.setFontSize(14);
  doc.text(`KIỂM KÊ KHO HÀNG - QUÝ ${quarter}/${year}`, pageWidth / 2, 44, { align: 'center' });
  doc.setFont(PDF_FONT, 'normal');

  const bySupplier = new Map<string, InventoryBatch[]>();
  for (const b of qBatches) {
    if (!bySupplier.has(b.supplierId)) bySupplier.set(b.supplierId, []);
    bySupplier.get(b.supplierId)!.push(b);
  }

  const grandTotal = qBatches.reduce((s, b) => s + b.quantity * b.buyPrice, 0);

  doc.setFontSize(10);
  doc.text(`Tổng giá trị tồn kho: ${formatVNDNumber(grandTotal)} VNĐ`, 14, 54);
  doc.text(`Số nhà cung cấp: ${bySupplier.size}`, 14, 60);

  const tableData: string[][] = [];
  for (const [sid, batches] of bySupplier) {
    const supplier = suppliers.find(s => s.id === sid);
    const supplierName = supplier?.name || 'Khác';

    const productMap = new Map<string, { name: string; brand: string; qty: number; value: number; unit: string }>();
    for (const b of batches) {
      const product = products.find(p => p.id === b.productId);
      const brand = product?.brand || '';
      const ex = productMap.get(b.productId);
      if (ex) {
        ex.qty += b.quantity;
        ex.value += b.quantity * b.buyPrice;
      } else {
        productMap.set(b.productId, { name: b.productName, brand, qty: b.quantity, value: b.quantity * b.buyPrice, unit: b.unit });
      }
    }

    const supplierTotal = Array.from(productMap.values()).reduce((s, p) => s + p.value, 0);
    tableData.push([`[NCC] ${supplierName}`, `${productMap.size} SP`, formatVNDNumber(supplierTotal)]);
    for (const info of productMap.values()) {
      const brandLabel = info.brand ? `[${info.brand}] ` : '';
      tableData.push(['', `  ${brandLabel}${info.name}`, `${info.qty} ${info.unit} - ${formatVNDNumber(info.value)}`]);
    }
  }

  tableData.push(['', `TỔNG CỘNG TỒN KHO Q${quarter}/${year}`, formatVNDNumber(grandTotal)]);

  autoTable(doc, {
    startY: 68,
    head: [['Nhà cung cấp', 'Sản phẩm', 'Giá trị / Số lượng']],
    body: tableData,
    styles: { font: PDF_FONT, fontSize: 7, cellPadding: 1.5 },
    headStyles: { font: PDF_FONT, fontStyle: 'bold', fillColor: [50, 50, 80], fontSize: 8 },
    bodyStyles: { font: PDF_FONT },
    columnStyles: {
      0: { cellWidth: 50, fontStyle: 'bold' },
      1: { cellWidth: 80 },
      2: { cellWidth: 45, halign: 'right' },
    },
    didParseCell: (data) => {
      if (data.row.index === tableData.length - 1 && data.section === 'body') {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [240, 240, 250];
      }
    },
    margin: { left: 14, right: 14 },
  });

  doc.save(`KhoHang_Q${quarter}_${year}.pdf`);
}
