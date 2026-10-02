import { describe, expect, it } from 'vitest';
import { analyzeLayout, findBoundsIssues, findNarrowChannels, findOverlaps, findFreePlacement, MIN_CHANNEL } from '../src/domain';
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

  it('places new elements inside the field with no overlap on an empty field', () => {
    const field = { width: 20, height: 12 };
    const spot = findFreePlacement(5, 3.5, field, []);
    expect(spot).toEqual({ x: 0.5, y: 0.5, tight: false });
  });

  it('keeps placing repeated elements into distinct spots with adequate clearance', () => {
    const field = { width: 24, height: 16 };
    const placed: ExpoElement[] = [];
    for (let n = 0; n < 4; n += 1) {
      const spot = findFreePlacement(5, 3.5, field, placed);
      expect(spot).not.toBeNull();
      placed.push(item(`booth-${n}`, spot!.x, spot!.y, 5, 3.5));
    }
    const spots = placed.map(({ x, y }) => `${x},${y}`);
    expect(new Set(spots).size).toBe(4);
    expect(findOverlaps(placed)).toHaveLength(0);
    expect(findNarrowChannels(placed).filter((issue) => issue.gap < MIN_CHANNEL)).toHaveLength(0);
    placed.forEach((element) => {
      expect(element.x).toBeGreaterThanOrEqual(0.5);
      expect(element.y).toBeGreaterThanOrEqual(0.5);
      expect(element.x + element.width).toBeLessThanOrEqual(field.width - 0.5);
      expect(element.y + element.height).toBeLessThanOrEqual(field.height - 0.5);
    });
  });

  it('returns null instead of stacking when no spot can fit the element', () => {
    const field = { width: 12, height: 10 };
    const placed: ExpoElement[] = [];
    let spot = findFreePlacement(5, 3.5, field, placed);
    while (spot) {
      placed.push(item(`booth-${placed.length}`, spot.x, spot.y, 5, 3.5));
      spot = findFreePlacement(5, 3.5, field, placed);
    }
    expect(placed.length).toBeGreaterThan(0);
    expect(findFreePlacement(5, 3.5, field, placed)).toBeNull();
  });

  it('reports no room when the element alone is larger than the field', () => {
    expect(findFreePlacement(30, 10, { width: 20, height: 12 }, [])).toBeNull();
  });
});
