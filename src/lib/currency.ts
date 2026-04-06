/**
 * Currency utilities for VND
 * Input convention: user types "10.5" meaning 10,500 VND (x1000)
 * Display: "10.500 VND" with dot as thousands separator
 */

/** Parse user input (x1000 convention): "10.5" → 10500, "150" → 150000 */
export function parsePriceInput(input: string): number {
  if (!input || input.trim() === '') return 0;
  // Replace comma with dot for decimal parsing
  const normalized = input.replace(/,/g, '.');
  const value = parseFloat(normalized);
  if (isNaN(value)) return 0;
  return Math.round(value * 1000);
}

/** Format VND with dot separator: 10500 → "10.500 VND" */
export function formatVND(amount: number): string {
  if (amount === 0) return '0 VND';
  const formatted = Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${formatted} VND`;
}

/** Compact format: 150000000 → "150 tr", 1500000 → "1,5 tr", 500000 → "500k" */
export function formatCompactVND(amount: number): string {
  if (amount === 0) return '0';
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  
  if (abs >= 1_000_000_000) {
    const val = abs / 1_000_000_000;
    return `${sign}${val % 1 === 0 ? val.toString() : val.toFixed(1).replace('.', ',')} tỷ`;
  }
  if (abs >= 1_000_000) {
    const val = abs / 1_000_000;
    return `${sign}${val % 1 === 0 ? val.toString() : val.toFixed(1).replace('.', ',')} tr`;
  }
  if (abs >= 1_000) {
    const val = abs / 1_000;
    return `${sign}${val % 1 === 0 ? val.toString() : val.toFixed(1).replace('.', ',')}k`;
  }
  return `${sign}${abs}`;
}

/** Format for input display: 10500 → "10.5" */
export function formatPriceForInput(amount: number): string {
  if (amount === 0) return '';
  const val = amount / 1000;
  if (val % 1 === 0) return val.toString();
  return val.toFixed(1);
}

/** Round to nearest 500 or 1000 VND */
export function roundVND(amount: number, step: 500 | 1000 = 500): number {
  return Math.round(amount / step) * step;
}
