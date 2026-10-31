import { createHash } from 'node:crypto';
import { z } from 'zod';

import { DIMENSIONS } from './dimensions';
export { DIMENSIONS } from './dimensions';
const short = z.string().max(8000);
const issueSchema = z.object({ dimension: z.enum(DIMENSIONS), evidence: short.min(1), impact: short.min(1), suggestion: short.min(1) });
const analysisSchema = z.object({
  transcript: z.string().max(200000),
  dimensions: z.array(z.object({ name: z.enum(DIMENSIONS), finding: short })).length(5).refine(a => new Set(a.map(d => d.name)).size === 5),
  issues: z.array(issueSchema).max(20), uncertainty: short.nullish().transform(v => v || ''),
});
const comparisonSchema = z.object({
  verdict: z.enum(['有改善', '未见明确改善', '无法判断']), summary: short.min(1),
  beforeEvidence: short, afterEvidence: short, remaining: short,
  uncertainty: short.nullish().transform(v => v || ''),
});
function decode(text: string) {
  return JSON.parse(text.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, ''));
}
const normalized = (s: string) => s.replace(/[\s\p{P}]/gu, '');
export function parseAnalysis(text: string) {
  const input = decode(text);
  // Omni sometimes names an issue quote "finding", matching its dimension-observation key.
  if (input && Array.isArray(input.issues)) input.issues = input.issues.map((issue: Record<string, unknown>) => ({ ...issue, evidence: issue.evidence ?? issue.finding }));
  const a = analysisSchema.parse(input);
  return { ...a, issues: a.issues.map((issue, index) => ({
    ...issue, id: `issue-${index}-${createHash('sha256').update(issue.evidence).digest('hex').slice(0, 8)}`,
    evidenceVerified: normalized(a.transcript).includes(normalized(issue.evidence)) && normalized(issue.evidence).length > 0,
  })) };
}
export function parseComparison(text: string, before?: string, after?: string) {
  const r = comparisonSchema.parse(decode(text));
  const verify = (quote: string, transcript?: string) => transcript === undefined ? null : normalized(quote).length > 0 && normalized(transcript).includes(normalized(quote));
  const beforeEvidenceVerified = verify(r.beforeEvidence, before), afterEvidenceVerified = verify(r.afterEvidence, after);
  const missing = before !== undefined && after !== undefined && (!beforeEvidenceVerified || !afterEvidenceVerified);
  return { ...r,
    verdict: missing ? '无法判断' as const : r.verdict,
    summary: missing ? `引用尚未核验，暂不能确认原结论。模型原始比较：${r.summary}` : r.summary,
    beforeEvidenceVerified, afterEvidenceVerified,
    uncertainty: missing ? `${r.uncertainty} 部分引用未能与对应转写匹配，请结合原音核对。`.trim() : r.uncertainty,
  };
}
export type Analysis = ReturnType<typeof parseAnalysis>;
export type Issue = Analysis['issues'][number];
export type ComparisonResult = ReturnType<typeof parseComparison>;
