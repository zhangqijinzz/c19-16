import type {
  Analysis,
  BoundsIssue,
  ChannelIssue,
  ElementKind,
  ElementSpec,
  ExpoElement,
  FieldSize,
  LayoutDocument,
  PathPreview,
  OverlapIssue,
} from './types';

export const MIN_CHANNEL = 1.2;

export const ELEMENT_SPECS: Record<ElementKind, ElementSpec> = {
  booth: { kind: 'booth', label: '标准展位', eyebrow: 'BOOTH', icon: '▦', color: '#e7f0ff', width: 5, height: 3.5 },
  stage: { kind: 'stage', label: '主舞台', eyebrow: 'STAGE', icon: '✦', color: '#f2e9ff', width: 8, height: 4 },
  seating: { kind: 'seating', label: '观众座席', eyebrow: 'SEATING', icon: '▤', color: '#e6f7f2', width: 6, height: 3 },
  entrance: { kind: 'entrance', label: '入口', eyebrow: 'ENTRY', icon: '↗', color: '#fff2d8', width: 2.5, height: 1.5 },
};

export const createStarterDocument = (): LayoutDocument => ({
  version: 1,
  title: '春日创意市集 · A 区',
  field: { width: 28, height: 18 },
  elements: [
    { id: 'entry-1', kind: 'entrance', name: '主入口', x: 1, y: 8.25, width: 2.5, height: 1.5, rotation: 0 },
    { id: 'stage-1', kind: 'stage', name: '分享舞台', x: 10, y: 1.5, width: 8, height: 4, rotation: 0 },
    { id: 'booth-1', kind: 'booth', name: '香氛展位', x: 4, y: 2, width: 5, height: 3.5, rotation: 0 },
    { id: 'booth-2', kind: 'booth', name: '手作展位', x: 19, y: 2, width: 5, height: 3.5, rotation: 0 },
    { id: 'seating-1', kind: 'seating', name: '休息座席', x: 10, y: 11, width: 6, height: 3, rotation: 0 },
  ],
});

// 新元素与场地边缘保留的内边距。
const PLACEMENT_MARGIN = 0.5;
// 生成候选落点时相对已有元素边界的偏移；坐标舍入到 0.1 m 后仍不小于最小通道。
const PLACEMENT_GAP = MIN_CHANNEL + 0.1;
// 兜底间距：场地碎片化时只要不重叠且留有目视可辨的间隙即可，提示用户间距偏紧。
const TIGHT_GAP = 0.3;

export interface PlacementSpot {
  x: number;
  y: number;
  tight: boolean;
}

const round1 = (value: number) => Number(value.toFixed(1));

/**
 * 在场地内为一个给定尺寸的新元素寻找落点：
 * 1. 优先找四周间距不小于最小通道的位置，落位后检查面板不会新增任何记录；
 * 2. 找不到时退而求其次，找任何不重叠且留有目视间隙的位置（tight=true）；
 * 3. 连不重叠的位置都没有时返回 null，由调用方拒绝添加。
 * 候选位置取场地左上角及每个已有元素的右侧、下侧边界，按从上到下、从左到右
 * 排序，因此总是落在“第一个空当”里，位置固定且用户一眼可见。
 */
export const findFreePlacement = (
  width: number,
  height: number,
  field: FieldSize,
  elements: ExpoElement[],
): PlacementSpot | null => {
  const maxX = field.width - PLACEMENT_MARGIN - width;
  const maxY = field.height - PLACEMENT_MARGIN - height;
  if (maxX < PLACEMENT_MARGIN - 1e-9 || maxY < PLACEMENT_MARGIN - 1e-9) return null;

  const occupied = elements.map(getBoundingBox);
  const separated = (left: number, top: number, gap: number) => {
    const right = left + width;
    const bottom = top + height;
    return occupied.every((box) =>
      right <= box.left - gap + 1e-9 ||
      left >= box.right + gap - 1e-9 ||
      bottom <= box.top - gap + 1e-9 ||
      top >= box.bottom + gap - 1e-9);
  };
  const inside = (left: number, top: number) =>
    left >= PLACEMENT_MARGIN - 1e-9 && top >= PLACEMENT_MARGIN - 1e-9 &&
    round1(left + width) <= field.width - PLACEMENT_MARGIN + 1e-9 &&
    round1(top + height) <= field.height - PLACEMENT_MARGIN + 1e-9;

  const axisCandidates = (size: number, max: number, edge: (box: ReturnType<typeof getBoundingBox>) => [number, number]) => {
    // 均匀参考点保证开阔空当（如场地中部）也有候选起点；已有元素边界保证密集排布时不遗漏缝隙。
    const span = max - PLACEMENT_MARGIN;
    const grid = [0, 0.25, 0.5, 0.75, 1].map((ratio) => round1(PLACEMENT_MARGIN + span * ratio));
    const values = Array.from(new Set([
      ...grid,
      ...occupied.flatMap((box) => {
        const [lead, trail] = edge(box);
        return [round1(lead + PLACEMENT_GAP), round1(lead + TIGHT_GAP), round1(trail), round1(trail - PLACEMENT_GAP + size), round1(trail - TIGHT_GAP + size)];
      }),
    ]));
    return values.filter((value) => value >= PLACEMENT_MARGIN - 1e-9 && value <= max + 1e-9).sort((a, b) => a - b);
  };
  const candidatesX = axisCandidates(width, maxX, (box) => [box.right, box.left]);
  const candidatesY = axisCandidates(height, maxY, (box) => [box.bottom, box.top]);

  for (const [gap, tight] of [[MIN_CHANNEL, false], [TIGHT_GAP, true]] as const) {
    for (const y of candidatesY) {
      for (const x of candidatesX) {
        const left = round1(x);
        const top = round1(y);
        if (inside(left, top) && separated(left, top, gap)) return { x: left, y: top, tight };
      }
    }
  }
  return null;
};

export const createElement = (kind: ElementKind, index: number, spot: PlacementSpot): ExpoElement => {
  const spec = ELEMENT_SPECS[kind];
  return {
    id: `${kind}-${Date.now()}-${index}`,
    kind,
    name: `${spec.label} ${index + 1}`,
    x: spot.x,
    y: spot.y,
    width: spec.width,
    height: spec.height,
    rotation: 0,
  };
};

export const normalizeRotation = (rotation: number): number => ((Math.round(rotation / 90) * 90) % 360 + 360) % 360;

export const getBoundingBox = (element: ExpoElement) => {
  const isQuarterTurn = normalizeRotation(element.rotation) % 180 !== 0;
  const width = isQuarterTurn ? element.height : element.width;
  const height = isQuarterTurn ? element.width : element.height;
  return { left: element.x, top: element.y, right: element.x + width, bottom: element.y + height, width, height };
};

const intersectionSize = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
  Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));

export const findOverlaps = (elements: ExpoElement[]): OverlapIssue[] => {
  const issues: OverlapIssue[] = [];
  for (let i = 0; i < elements.length; i += 1) {
    const first = getBoundingBox(elements[i]);
    for (let j = i + 1; j < elements.length; j += 1) {
      const second = getBoundingBox(elements[j]);
      const overlapX = intersectionSize(first.left, first.right, second.left, second.right);
      const overlapY = intersectionSize(first.top, first.bottom, second.top, second.bottom);
      if (overlapX > 0 && overlapY > 0) {
        issues.push({ firstId: elements[i].id, secondId: elements[j].id, amount: Number((overlapX * overlapY).toFixed(1)) });
      }
    }
  }
  return issues;
};

export const findBoundsIssues = (field: FieldSize, elements: ExpoElement[]): BoundsIssue[] =>
  elements.flatMap((element) => {
    const box = getBoundingBox(element);
    const overflow = Math.max(0, -box.left, -box.top, box.right - field.width, box.bottom - field.height);
    return overflow > 0 ? [{ elementId: element.id, overflow: Number(overflow.toFixed(1)) }] : [];
  });

export const findNarrowChannels = (elements: ExpoElement[]): ChannelIssue[] => {
  const issues: ChannelIssue[] = [];
  for (let i = 0; i < elements.length; i += 1) {
    const first = getBoundingBox(elements[i]);
    for (let j = i + 1; j < elements.length; j += 1) {
      const second = getBoundingBox(elements[j]);
      const verticalOverlap = intersectionSize(first.top, first.bottom, second.top, second.bottom);
      const horizontalOverlap = intersectionSize(first.left, first.right, second.left, second.right);
      const horizontalGap = first.right <= second.left ? second.left - first.right : second.right <= first.left ? first.left - second.right : 0;
      const verticalGap = first.bottom <= second.top ? second.top - first.bottom : second.bottom <= first.top ? first.top - second.bottom : 0;
      const gap = verticalOverlap > 0 ? horizontalGap : horizontalOverlap > 0 ? verticalGap : 0;
      if (gap > 0 && gap < MIN_CHANNEL) issues.push({ firstId: elements[i].id, secondId: elements[j].id, gap: Number(gap.toFixed(1)) });
    }
  }
  return issues;
};

const distance = (first: { x: number; y: number }, second: { x: number; y: number }) => Math.hypot(second.x - first.x, second.y - first.y);

export const createPathPreview = (elements: ExpoElement[]): PathPreview | null => {
  const entrance = elements.find((element) => element.kind === 'entrance');
  const target = elements.find((element) => element.kind === 'stage') ?? elements.find((element) => element.kind !== 'entrance');
  if (!entrance || !target) return null;
  const startBox = getBoundingBox(entrance);
  const targetBox = getBoundingBox(target);
  const start = { x: startBox.left + startBox.width / 2, y: startBox.top + startBox.height / 2 };
  const end = { x: targetBox.left + targetBox.width / 2, y: targetBox.top + targetBox.height / 2 };
  const elbow = { x: end.x, y: start.y };
  return { points: [start, elbow, end], distance: Number((distance(start, elbow) + distance(elbow, end)).toFixed(1)), fromName: entrance.name, toName: target.name };
};

export const analyzeLayout = (document: LayoutDocument): Analysis => ({
  overlaps: findOverlaps(document.elements),
  bounds: findBoundsIssues(document.field, document.elements),
  channels: findNarrowChannels(document.elements),
  path: createPathPreview(document.elements),
});

export const findElement = (document: LayoutDocument, id: string | null) => document.elements.find((element) => element.id === id) ?? null;

export const formatArea = (field: FieldSize) => `${field.width} × ${field.height} m`;
