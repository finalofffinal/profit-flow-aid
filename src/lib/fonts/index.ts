import type jsPDF from 'jspdf';
import robotoRegular from './roboto-regular.b64.txt?raw';
import robotoBold from './roboto-bold.b64.txt?raw';

let registered = false;
const FONT_NAME = 'Roboto';

/**
 * Register Roboto (Unicode, supports Vietnamese diacritics) with a jsPDF instance
 * and set it as the active font. Call once per document right after `new jsPDF(...)`.
 */
export function useVietnameseFont(doc: jsPDF) {
  // jsPDF's VFS is per-document-class; safe to add once per session
  if (!registered) {
    doc.addFileToVFS('Roboto-Regular.ttf', robotoRegular.trim());
    doc.addFileToVFS('Roboto-Bold.ttf', robotoBold.trim());
    doc.addFont('Roboto-Regular.ttf', FONT_NAME, 'normal');
    doc.addFont('Roboto-Bold.ttf', FONT_NAME, 'bold');
    registered = true;
  } else {
    // Subsequent docs still need the font references registered on their instance
    doc.addFileToVFS('Roboto-Regular.ttf', robotoRegular.trim());
    doc.addFileToVFS('Roboto-Bold.ttf', robotoBold.trim());
    doc.addFont('Roboto-Regular.ttf', FONT_NAME, 'normal');
    doc.addFont('Roboto-Bold.ttf', FONT_NAME, 'bold');
  }
  doc.setFont(FONT_NAME, 'normal');
  return FONT_NAME;
}

export const PDF_FONT = FONT_NAME;
