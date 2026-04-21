import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { InventoryBatch, Product, Supplier } from '@/types';
import { BUSINESS_INFO } from '@/lib/constants';
import { useVietnameseFont, PDF_FONT } from '@/lib/fonts';

function formatVNDNumber(amount: number): string {
  return Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Inventory PDF — Times New Roman.
 * Per supplier: bold/large supplier header with total beside, then table:
 *   [Nhãn hàng | Sản phẩm | Số lượng | Thành tiền]
 */
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
  doc.setFontSize(13);
  doc.text(`HỘ KINH DOANH: ${BUSINESS_INFO.name.toUpperCase()}`, 14, 18);
  doc.setFont(PDF_FONT, 'normal');
  doc.setFontSize(10);
  doc.text(`Mã số thuế: ${BUSINESS_INFO.taxId}`, 14, 25);
  doc.text(`Địa chỉ: ${BUSINESS_INFO.address}, ${BUSINESS_INFO.stall}`, 14, 31);

  doc.setFont(PDF_FONT, 'bold');
  doc.setFontSize(16);
  doc.text(`KIỂM KÊ KHO HÀNG - QUÝ ${quarter}/${year}`, pageWidth / 2, 44, { align: 'center' });
  doc.setFont(PDF_FONT, 'normal');

  // Group by supplier
  const bySupplier = new Map<string, InventoryBatch[]>();
  for (const b of qBatches) {
    if (!bySupplier.has(b.supplierId)) bySupplier.set(b.supplierId, []);
    bySupplier.get(b.supplierId)!.push(b);
  }

  const grandTotal = qBatches.reduce((s, b) => s + b.quantity * b.buyPrice, 0);
  doc.setFontSize(10);
  doc.text(`Số NCC: ${bySupplier.size}    |    Tổng giá trị tồn kho: ${formatVNDNumber(grandTotal)} VNĐ`, pageWidth / 2, 52, { align: 'center' });

  let currentY = 60;

  for (const [sid, sBatches] of bySupplier) {
    const supplier = suppliers.find(s => s.id === sid);
    const supplierName = supplier?.name || 'Khác';

    // Aggregate by product
    const productMap = new Map<string, { name: string; brand: string; qty: number; value: number; unit: string }>();
    for (const b of sBatches) {
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

    if (currentY > 250) { doc.addPage(); currentY = 20; }

    // Supplier header bar (bold, large, with total beside)
    doc.setFillColor(40, 50, 80);
    doc.rect(14, currentY - 5, pageWidth - 28, 9, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont(PDF_FONT, 'bold');
    doc.setFontSize(13);
    doc.text(`NHÀ CUNG CẤP: ${supplierName.toUpperCase()}`, 17, currentY + 1);
    doc.text(`Tổng: ${formatVNDNumber(supplierTotal)} VNĐ`, pageWidth - 17, currentY + 1, { align: 'right' });
    doc.setTextColor(0, 0, 0);
    doc.setFont(PDF_FONT, 'normal');
    currentY += 7;

    const body = Array.from(productMap.values())
      .sort((a, b) => (a.brand || '').localeCompare(b.brand || '') || a.name.localeCompare(b.name))
      .map(p => [p.brand || '—', p.name, `${p.qty} ${p.unit}`, formatVNDNumber(p.value)]);

    autoTable(doc, {
      startY: currentY,
      head: [['Nhãn hàng', 'Sản phẩm', 'Số lượng', 'Thành tiền (VNĐ)']],
      body,
      styles: { font: PDF_FONT, fontSize: 9, cellPadding: 1.8 },
      headStyles: { font: PDF_FONT, fontStyle: 'bold', fillColor: [220, 225, 240], fontSize: 10, textColor: [30, 30, 60], halign: 'center' },
      bodyStyles: { font: PDF_FONT },
      columnStyles: {
        0: { cellWidth: 35, fontStyle: 'bold' },
        1: { cellWidth: 90 },
        2: { cellWidth: 30, halign: 'center' },
        3: { cellWidth: 33, halign: 'right' },
      },
      margin: { left: 14, right: 14 },
    });
    currentY = (doc as any).lastAutoTable.finalY + 8;
  }

  if (currentY > 260) { doc.addPage(); currentY = 20; }
  doc.setFont(PDF_FONT, 'bold');
  doc.setFontSize(13);
  doc.setFillColor(255, 240, 210);
  doc.rect(14, currentY - 5, pageWidth - 28, 9, 'F');
  doc.text(`TỔNG CỘNG TỒN KHO QUÝ ${quarter}/${year}: ${formatVNDNumber(grandTotal)} VNĐ`, pageWidth / 2, currentY + 1, { align: 'center' });

  doc.save(`KhoHang_Q${quarter}_${year}.pdf`);
}
