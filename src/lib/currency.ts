/**
 * Currency utilities for VND
 * Input convention: user types "10.5" meaning 10,500 VND (x1000)
 * Display: "10.500 VND" with dot as thousands separator
 * ALL amounts rounded to nearest 1,000 VND
 */

/** Parse user input (x1000 convention): "10.5" → 10500, "150" → 150000 */
export function parsePriceInput(input: string): number {
  if (!input || input.trim() === '') return 0;
  const normalized = input.replace(/,/g, '.');
  const value = parseFloat(normalized);
  if (isNaN(value)) return 0;
  return Math.round(value * 1000);
}

/** Format VND with dot separator: 10500 → "10.500 VND" */
export function formatVND(amount: number): string {
  if (amount === 0) return '0 VND';
  const rounded = Math.round(amount / 1000) * 1000;
  const formatted = rounded
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${formatted} VND`;
}

/** Compact format showing full thousands: 1525000 → "1.525.000", 500000 → "500.000" */
export function formatCompactVND(amount: number): string {
  if (amount === 0) return '0';
  const rounded = Math.round(amount / 1000) * 1000;
  const abs = Math.abs(rounded);
  const sign = amount < 0 ? '-' : '';

  if (abs >= 1_000_000_000) {
    // Show as "X tỷ YYY tr" for very large
    const ty = Math.floor(abs / 1_000_000_000);
    const remainder = abs % 1_000_000_000;
    if (remainder === 0) return `${sign}${ty} tỷ`;
    const tr = Math.floor(remainder / 1_000_000);
    return `${sign}${ty} tỷ ${tr} tr`;
  }
  if (abs >= 1_000_000) {
    // Show full thousands: 1.525.000
    const formatted = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${sign}${formatted}`;
  }
  if (abs >= 1_000) {
    const formatted = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${sign}${formatted}`;
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

/** Round to nearest 1000 VND */
export function roundVND(amount: number): number {
  return Math.round(amount / 1000) * 1000;
}
