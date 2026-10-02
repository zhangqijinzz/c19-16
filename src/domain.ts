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
export const FIELD_MARGIN = 0.5;
const PLACEMENT_STEP = 0.1;

export interface Placement {
  x: number;
  y: number;
  /** true 表示该落点仅能保证不重叠，周边间距小于建议通道，摆放较紧凑 */
  tight: boolean;
}

/**
 * 为新元素寻找一个不与已有元素重叠的落点。
 * 优先保证与周边元素保留 MIN_CHANNEL 的间距（同时避免产生窄通道记录），
 * 候选位置按距场地中心的距离排序，让新元素落在视野焦点附近；
 * 只能紧贴摆放时返回 tight=true 的落点；连不重叠都做不到时返回 null。
 */
export const findPlacement = (
  field: FieldSize,
  width: number,
  height: number,
  existing: ExpoElement[],
): Placement | null => {
  const maxX = field.width - width - FIELD_MARGIN;
  const maxY = field.height - height - FIELD_MARGIN;
  if (maxX < FIELD_MARGIN || maxY < FIELD_MARGIN) return null;

  const occupied = existing.map((element) => {
    const box = getBoundingBox(element);
    return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
  });
  const centerX = field.width / 2;
  const centerY = field.height / 2;

  let fallback: Placement | null = null;
  let fallbackDistance = Infinity;
  // 用整数索引驱动网格，避免 0.1 浮点累加导致边界候选点丢失
  const cols = Math.round((maxX - FIELD_MARGIN) / PLACEMENT_STEP) + 1;
  const rows = Math.round((maxY - FIELD_MARGIN) / PLACEMENT_STEP) + 1;
  const candidates: Array<{ x: number; y: number; distance: number }> = [];
  for (let row = 0; row < rows; row += 1) {
    const y = Number((FIELD_MARGIN + row * PLACEMENT_STEP).toFixed(1));
    for (let col = 0; col < cols; col += 1) {
      const x = Number((FIELD_MARGIN + col * PLACEMENT_STEP).toFixed(1));
      candidates.push({ x, y, distance: Math.hypot(x + width / 2 - centerX, y + height / 2 - centerY) });
    }
  }
  candidates.sort((first, second) => first.distance - second.distance);

  for (const candidate of candidates) {
    const right = candidate.x + width;
    const bottom = candidate.y + height;
    let comfortable = true;
    let blocked = false;
    for (const box of occupied) {
      const overlapX = intersectionSize(candidate.x, right, box.left, box.right);
      const overlapY = intersectionSize(candidate.y, bottom, box.top, box.bottom);
      if (overlapX > 0 && overlapY > 0) { blocked = true; break; }
      // 投影重叠的那条轴决定并排还是竖排，通行间隙落在另一条轴上；两轴都分离（对角）则无通道问题
      if (overlapY > 0) {
        const gap = box.left >= right ? box.left - right : candidate.x - box.right;
        if (gap < MIN_CHANNEL) comfortable = false;
      } else if (overlapX > 0) {
        const gap = box.top >= bottom ? box.top - bottom : candidate.y - box.bottom;
        if (gap < MIN_CHANNEL) comfortable = false;
      }
    }
    if (blocked) continue;
    if (comfortable) return { x: candidate.x, y: candidate.y, tight: false };
    if (!fallback || candidate.distance < fallbackDistance) {
      fallback = { x: candidate.x, y: candidate.y, tight: true };
      fallbackDistance = candidate.distance;
    }
  }
  return fallback;
};

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

export interface CreatedElement {
  element: ExpoElement;
  tight: boolean;
}

export const createElement = (kind: ElementKind, existing: ExpoElement[], field: FieldSize): CreatedElement | null => {
  const spec = ELEMENT_SPECS[kind];
  const placement = findPlacement(field, spec.width, spec.height, existing);
  if (!placement) return null;
  const sameKindCount = existing.filter((element) => element.kind === kind).length;
  return {
    tight: placement.tight,
    element: {
      id: `${kind}-${Date.now()}-${sameKindCount}`,
      kind,
      name: `${spec.label} ${sameKindCount + 1}`,
      x: placement.x,
      y: placement.y,
      width: spec.width,
      height: spec.height,
      rotation: 0,
    },
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
