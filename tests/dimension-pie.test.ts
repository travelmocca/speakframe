import { describe, expect, it } from 'vitest';
import { DIMENSIONS } from '../src/lib/dimensions';
import { buildSlices, countByDimension, donutSlicePath } from '../src/lib/dimension-pie';

describe('dimension pie helpers', () => {
  it('counts issues by dimension and ignores unknown labels', () => {
    const counts = countByDimension([
      { issue: { dimension: '抓重点' } },
      { issue: { dimension: '抓重点' } },
      { issue: { dimension: '展开内容' } },
      { issue: { dimension: '未知维度' } },
    ]);
    expect(counts['抓重点']).toBe(2);
    expect(counts['展开内容']).toBe(1);
    expect(counts['排顺序']).toBe(0);
    expect(DIMENSIONS.every(d => typeof counts[d] === 'number')).toBe(true);
  });

  it('builds proportional slices that sum to a full circle', () => {
    const counts = Object.fromEntries(DIMENSIONS.map(d => [d, 0])) as Record<(typeof DIMENSIONS)[number], number>;
    counts['抓重点'] = 1;
    counts['展开内容'] = 1;
    counts['口头禅与语气垫词'] = 2;
    const slices = buildSlices(counts);
    expect(slices).toHaveLength(3);
    expect(slices[0].start).toBe(0);
    expect(slices.at(-1)?.end).toBe(360);
    expect(slices.reduce((sum, s) => sum + (s.end - s.start), 0)).toBe(360);
  });

  it('draws a closed donut path for a slice and a full ring', () => {
    const wedge = donutSlicePath(90, 90, 78, 46, 0, 90);
    expect(wedge.startsWith('M ')).toBe(true);
    expect(wedge.includes('A 78 78')).toBe(true);
    expect(wedge.includes('A 46 46')).toBe(true);
    expect(wedge.endsWith('Z')).toBe(true);
    const full = donutSlicePath(90, 90, 78, 46, 0, 360);
    expect(full.split('Z').length - 1).toBe(2);
  });
});
