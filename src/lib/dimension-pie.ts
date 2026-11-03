import { DIMENSIONS } from './dimensions';

export type Dimension = (typeof DIMENSIONS)[number];

export const SLICE_COLORS = [
  'var(--color-pie-1)',
  'var(--color-pie-2)',
  'var(--color-pie-3)',
  'var(--color-pie-4)',
  'var(--color-pie-5)',
] as const;

export type Slice = {
  dimension: Dimension;
  count: number;
  color: string;
  start: number;
  end: number;
};

function polar(cx: number, cy: number, r: number, angle: number) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** Closed donut wedge from start→end degrees (0 at 12 o'clock, clockwise). */
export function donutSlicePath(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  start: number,
  end: number,
): string {
  const sweep = end - start;
  if (sweep <= 0) return '';
  // Full circle: SVG arcs cannot draw a full 360° in one path; use two halves.
  if (sweep >= 359.999) {
    const mid = start + 180;
    return `${donutSlicePath(cx, cy, outerR, innerR, start, mid)} ${donutSlicePath(cx, cy, outerR, innerR, mid, end)}`.trim();
  }
  const large = sweep > 180 ? 1 : 0;
  const o1 = polar(cx, cy, outerR, start);
  const o2 = polar(cx, cy, outerR, end);
  const i2 = polar(cx, cy, innerR, end);
  const i1 = polar(cx, cy, innerR, start);
  return [
    `M ${o1.x} ${o1.y}`,
    `A ${outerR} ${outerR} 0 ${large} 1 ${o2.x} ${o2.y}`,
    `L ${i2.x} ${i2.y}`,
    `A ${innerR} ${innerR} 0 ${large} 0 ${i1.x} ${i1.y}`,
    'Z',
  ].join(' ');
}

export function buildSlices(counts: Record<Dimension, number>): Slice[] {
  const total = DIMENSIONS.reduce((sum, d) => sum + counts[d], 0);
  if (total === 0) return [];
  let cursor = 0;
  return DIMENSIONS.flatMap((dimension, index) => {
    const count = counts[dimension];
    if (count <= 0) return [];
    const start = (cursor / total) * 360;
    cursor += count;
    const end = (cursor / total) * 360;
    return [{ dimension, count, color: SLICE_COLORS[index], start, end }];
  });
}

export function countByDimension(issues: { issue: { dimension: string } }[]) {
  const counts = Object.fromEntries(DIMENSIONS.map(d => [d, 0])) as Record<Dimension, number>;
  for (const item of issues) {
    if (DIMENSIONS.includes(item.issue.dimension as Dimension)) {
      counts[item.issue.dimension as Dimension] += 1;
    }
  }
  return counts;
}
