'use client';

import { DIMENSIONS } from '@/lib/dimensions';
import {
  SLICE_COLORS,
  buildSlices,
  countByDimension,
  donutSlicePath,
  type Dimension,
} from '@/lib/dimension-pie';

type Props = {
  counts: Record<Dimension, number>;
  selected: string;
  onSelect: (dimension: string) => void;
  total: number;
};

export function DimensionPie({ counts, selected, onSelect, total }: Props) {
  const slices = buildSlices(counts);
  const size = 180;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = 78;
  const innerR = 46;
  const centerCount = selected && DIMENSIONS.includes(selected as Dimension)
    ? counts[selected as Dimension]
    : total;

  if (total === 0) {
    return (
      <div className="dimension-pie dimension-pie-empty" role="img" aria-label="当前没有可汇总的问题">
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
          <circle cx={cx} cy={cy} r={outerR} className="dimension-pie-track" />
          <circle cx={cx} cy={cy} r={innerR} className="dimension-pie-hole" />
        </svg>
        <p className="small muted">暂无问题分布</p>
      </div>
    );
  }

  return (
    <div className="dimension-pie">
      <div className="dimension-pie-chart">
        <svg
          viewBox={`0 0 ${size} ${size}`}
          width={size}
          height={size}
          role="img"
          aria-label={`问题维度分布，共 ${total} 条`}
        >
          <circle cx={cx} cy={cy} r={outerR} className="dimension-pie-track" aria-hidden="true" />
          {slices.map(slice => {
            const active = selected === slice.dimension;
            return (
              <path
                key={slice.dimension}
                d={donutSlicePath(cx, cy, outerR, innerR, slice.start, slice.end)}
                fill={slice.color}
                className={active ? 'dimension-pie-slice is-active' : 'dimension-pie-slice'}
                aria-hidden="true"
                onClick={() => onSelect(slice.dimension)}
              />
            );
          })}
          <text x={cx} y={cy - 2} textAnchor="middle" className="dimension-pie-center-count">
            {centerCount}
          </text>
          <text x={cx} y={cy + 16} textAnchor="middle" className="dimension-pie-center-label">
            条
          </text>
        </svg>
      </div>
      <ul className="dimension-pie-legend" aria-label="按问题维度筛选">
        <li>
          <button
            type="button"
            className="dimension-pie-legend-item"
            aria-pressed={!selected}
            onClick={() => onSelect('')}
          >
            <span className="dimension-pie-swatch dimension-pie-swatch-all" aria-hidden="true" />
            <span className="dimension-pie-legend-label">全部问题</span>
            <span className="dimension-pie-legend-count">
              {total}
              <span className="sr-only">条</span>
            </span>
          </button>
        </li>
        {DIMENSIONS.map((dimension, index) => {
          const count = counts[dimension];
          const active = selected === dimension;
          return (
            <li key={dimension}>
              <button
                type="button"
                className="dimension-pie-legend-item"
                aria-pressed={active}
                onClick={() => onSelect(dimension)}
              >
                <span
                  className="dimension-pie-swatch"
                  style={{ background: SLICE_COLORS[index] }}
                  aria-hidden="true"
                />
                <span className="dimension-pie-legend-label">{dimension}</span>
                <span className="dimension-pie-legend-count">
                  {count}
                  <span className="sr-only">条</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
