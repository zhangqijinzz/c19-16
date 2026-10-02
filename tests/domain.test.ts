import { describe, expect, it } from 'vitest';
import { analyzeLayout, createElement, findBoundsIssues, findNarrowChannels, findOverlaps, findPlacement } from '../src/domain';
import type { ExpoElement } from '../src/types';

const item = (id: string, x: number, y: number, width = 4, height = 3): ExpoElement => ({ id, kind: 'booth', name: id, x, y, width, height, rotation: 0 });

describe('layout domain rules', () => {
  it('detects overlap area between two elements', () => {
    expect(findOverlaps([item('a', 1, 1), item('b', 3, 2)])).toEqual([{ firstId: 'a', secondId: 'b', amount: 4 }]);
  });

  it('detects field overflow and rotated bounds', () => {
    const rotated = { ...item('rotated', 8, 2, 2, 5), rotation: 90 };
    expect(findBoundsIssues({ width: 10, height: 10 }, [rotated])).toEqual([{ elementId: 'rotated', overflow: 3 }]);
  });

  it('flags a pass narrower than the minimum channel', () => {
    expect(findNarrowChannels([item('a', 1, 1), item('b', 5.5, 1)])).toEqual([{ firstId: 'a', secondId: 'b', gap: 0.5 }]);
  });

  it('returns a path when entrance and focus area exist', () => {
    const analysis = analyzeLayout({ version: 1, title: 'x', field: { width: 20, height: 12 }, elements: [{ ...item('entry', 1, 5, 2, 1), kind: 'entrance' }, { ...item('stage', 10, 2, 5, 3), kind: 'stage' }] });
    expect(analysis.path?.points).toHaveLength(3);
    expect(analysis.path?.distance).toBeGreaterThan(0);
  });

  it('places a new element without overlapping existing ones', () => {
    const field = { width: 20, height: 14 };
    const existing = [item('a', 8, 5.5)];
    const placement = findPlacement(field, 5, 3.5, existing);
    expect(placement).not.toBeNull();
    expect(findOverlaps([...existing, item('new', placement!.x, placement!.y, 5, 3.5)])).toHaveLength(0);
  });

  it('keeps the minimum channel gap on comfortable placements', () => {
    const field = { width: 20, height: 14 };
    const existing = [item('a', 8, 5.5)];
    const placement = findPlacement(field, 5, 3.5, existing);
    expect(placement?.tight).toBe(false);
    expect(findNarrowChannels([...existing, item('new', placement!.x, placement!.y, 5, 3.5)])).toHaveLength(0);
  });

  it('falls back to a tight non-overlapping spot before giving up', () => {
    // 右侧只剩一条窄区域：能不重叠放下，但与已有元素的间距不足 1.2m 通道要求
    const field = { width: 7, height: 6 };
    const existing = [item('big', 0.5, 0.5, 4, 4)];
    const placement = findPlacement(field, 2, 2, existing);
    expect(placement).not.toBeNull();
    expect(placement?.tight).toBe(true);
    expect(findOverlaps([...existing, item('new', placement!.x, placement!.y, 2, 2)])).toHaveLength(0);
  });

  it('returns null when no non-overlapping spot exists', () => {
    const field = { width: 5.5, height: 5.5 };
    const existing = [item('big', 0.5, 0.5, 4.5, 4.5)];
    expect(findPlacement(field, 1.5, 1.5, existing)).toBeNull();
  });

  it('returns null when the element alone does not fit the field', () => {
    expect(findPlacement({ width: 4, height: 4 }, 5, 3.5, [])).toBeNull();
  });

  it('createElement builds an in-bounds element at the found placement', () => {
    const field = { width: 20, height: 14 };
    const created = createElement('booth', [item('a', 8, 5.5)], field);
    expect(created).not.toBeNull();
    expect(created!.element.x).toBeGreaterThanOrEqual(0.5);
    expect(created!.element.y).toBeGreaterThanOrEqual(0.5);
    expect(created!.element.x + created!.element.width).toBeLessThanOrEqual(field.width - 0.5);
    expect(created!.element.y + created!.element.height).toBeLessThanOrEqual(field.height - 0.5);
  });
});
