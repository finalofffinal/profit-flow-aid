import { describe, expect, it } from 'vitest';
import type { ImportOrder } from '@/types';
import { mergeSupplementaryOrders } from '@/lib/supplementaryOrderArchive';

function order(id: string, tag: ImportOrder['tag'] = 'supplementary'): ImportOrder {
  return {
    id,
    supplierId: 'supplier-1',
    supplierName: 'Nhà cung cấp A',
    date: '2026-11-26',
    items: [],
    total: 1000,
    tag,
    locked: false,
    images: [],
    deletedAt: null,
    createdAt: '2026-11-26T12:00:00.000Z',
  };
}

describe('mergeSupplementaryOrders', () => {
  it('restores a saved supplementary order missing from the main list', () => {
    const restored = mergeSupplementaryOrders([], [order('saved-order-1')]);

    expect(restored.map(item => item.id)).toEqual(['saved-order-1']);
  });

  it('keeps the current order once and excludes non-supplementary archives', () => {
    const current = order('existing-order');
    const merged = mergeSupplementaryOrders(
      [current],
      [order('existing-order'), order('auto-order', 'auto')],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]).toBe(current);
    expect(merged[0].id).toBe('existing-order');
  });
});