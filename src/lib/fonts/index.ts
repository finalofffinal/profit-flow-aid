import type jsPDF from 'jspdf';
import tinosRegular from './tinos-regular.b64.txt?raw';
import tinosBold from './tinos-bold.b64.txt?raw';

const FONT_NAME = 'Tinos';

/**
 * Register Tinos (Times New Roman metric-compatible, Unicode, Vietnamese diacritics)
 * with a jsPDF instance and set as active font. Call once per document right after `new jsPDF(...)`.
 */
export function useVietnameseFont(doc: jsPDF) {
  doc.addFileToVFS('Tinos-Regular.ttf', tinosRegular.trim());
  doc.addFileToVFS('Tinos-Bold.ttf', tinosBold.trim());
  doc.addFont('Tinos-Regular.ttf', FONT_NAME, 'normal');
  doc.addFont('Tinos-Bold.ttf', FONT_NAME, 'bold');
  doc.setFont(FONT_NAME, 'normal');
  return FONT_NAME;
}

export const PDF_FONT = FONT_NAME;
