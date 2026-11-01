import { expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ComparisonPanel } from '../src/components/analysis-panels';
import { parseComparison } from '../src/lib/analysis-schema';
import { DIMENSIONS } from '../src/lib/dimensions';
it('labels a historical first-to-third single-issue comparison using its actual versions', () => {
  const result = parseComparison(JSON.stringify({ verdict: '有改善', summary: '重复减少', beforeEvidence: '然后然后', afterEvidence: '检查数据', remaining: '', uncertainty: '' }));
  const html = renderToStaticMarkup(createElement(ComparisonPanel, { result, beforeSequence: 1, afterSequence: 3 }));
  expect(html).toContain('第 1 次表达'); expect(html).toContain('第 3 次表达'); expect(html).toContain('历史选定问题');
  expect(html).not.toContain('相邻'); expect(html).not.toContain('上一轮');
});
it('accepts an unchanged dimension without inventing an improvement', () => {
  const result = parseComparison(JSON.stringify({ verdict: '未见明确改善', summary: '两次保持一致', beforeEvidence: '检查数据', afterEvidence: '检查数据', remaining: '', uncertainty: '', changes: DIMENSIONS.map(dimension => ({ dimension, status: '无明显变化', beforeEvidence: '检查数据', afterEvidence: '检查数据', explanation: '没有观察到明确变化' })) }), '检查数据', '检查数据', true);
  expect(result.changes.every(c => c.status === '无明显变化')).toBe(true); expect(result.verdict).toBe('未见明确改善');
});
