'use client';
import { useState } from 'react';
import type { Analysis, ComparisonResult } from '@/lib/analysis-schema';
export function AnalysisPanel({ analysis }: { analysis: Analysis }) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(analysis.issues.slice(0, 1).map(issue => issue.id)));
  function toggle(id: string, open: boolean) { setExpanded(previous => { if (previous.has(id) === open) return previous; const next = new Set(previous); if (open) next.add(id); else next.delete(id); return next; }); }
  return <>{analysis.issues.length ? <><div className="issue-controls"><span className="small muted">共 {analysis.issues.length} 项问题</span><div><button className="text-button" disabled={analysis.issues.every(issue => expanded.has(issue.id))} onClick={() => setExpanded(new Set(analysis.issues.map(issue => issue.id)))}>展开全部</button><button className="text-button" disabled={!analysis.issues.some(issue => expanded.has(issue.id))} onClick={() => setExpanded(new Set())}>收起全部</button></div></div>
    <div className="issue-list">{analysis.issues.map((issue, index) => <details className="issue" key={issue.id} open={expanded.has(issue.id)} onToggle={event => toggle(issue.id, event.currentTarget.open)}><summary className="issue-summary"><span className="issue-summary-content"><span className="issue-index">{index + 1}</span><span><strong>{issue.dimension}</strong><span className="issue-preview">{issue.impact.length > 60 ? issue.impact.slice(0, 60) + '…' : issue.impact}</span></span></span></summary>
      <dl className="issue-parts"><div><dt>原文</dt><dd><blockquote>{issue.evidence}</blockquote>{!issue.evidenceVerified && <p className="small error-message">这段引用未能与转写匹配，请先回听核对。</p>}</dd></div><div><dt>问题</dt><dd>{issue.impact}</dd></div><div><dt>建议</dt><dd>{issue.suggestion}</dd></div></dl>
    </details>)}</div></> : <p className="no-issues">本次未发现有充分依据的问题。你仍可以围绕同一主题再练一次。</p>}
    <details className="dimension-details"><summary>查看五个维度的观察</summary><dl>{analysis.dimensions.map(d => <div key={d.name}><dt>{d.name}</dt><dd>{d.finding}</dd></div>)}</dl></details>{analysis.uncertainty && <p className="small uncertainty">需要留意：{analysis.uncertainty}</p>}</>;
}
export function ComparisonPanel({ result, beforeSequence, afterSequence }: { result: ComparisonResult; beforeSequence?: number; afterSequence?: number }) {
  const beforeLabel = beforeSequence ? `第 ${beforeSequence} 次表达` : '来源表达', afterLabel = afterSequence ? `第 ${afterSequence} 次表达` : '本轮表达';
  const changes = result.changes || [], improved = changes.filter(c => c.status === '有改善');
  return <section className="comparison-result" data-testid="comparison-result"><h2>{afterLabel}与{beforeLabel}相比</h2><h3>{result.verdict}</h3><p>{result.summary}</p>
    {changes.length > 0 ? <><h3>有依据的改善</h3>{improved.length ? <ul>{improved.map(c => <li key={c.dimension}>{c.dimension}：{c.explanation}</li>)}</ul> : <p>本轮未发现可确认的改善。可以结合下面的对比继续练习。</p>}
      <div className="dimension-changes">{changes.map(c => <section key={c.dimension}><div className="section-heading"><h3>{c.dimension}</h3><span className="small muted">{c.status}</span></div><p>{c.explanation}</p><details><summary>查看前后原话</summary><dl><div><dt>{beforeLabel}</dt><dd>{c.beforeEvidence || '没有足够依据'}{c.beforeEvidenceVerified === false && '（引用未核验）'}</dd></div><div><dt>{afterLabel}</dt><dd>{c.afterEvidence || '没有足够依据'}{c.afterEvidenceVerified === false && '（引用未核验）'}</dd></div></dl></details></section>)}</div>
    </> : <><p className="small muted">这是历史单问题对比；新的重练将覆盖全部问题。</p><dl><div><dt>{beforeLabel}的依据</dt><dd>{result.beforeEvidence || '没有足够依据'}{result.beforeEvidenceVerified === false && '（引用未核验）'}</dd></div><div><dt>{afterLabel}的依据</dt><dd>{result.afterEvidence || '没有足够依据'}{result.afterEvidenceVerified === false && '（引用未核验）'}</dd></div></dl></>}
    <h3>接下来继续关注</h3><p>{result.remaining || '没有补充建议'}</p>{result.uncertainty && <p className="small muted">{result.uncertainty}</p>}
    <p className="small muted">{changes.length > 0 ? '这是所示两轮表达的综合比较，不代表整体能力或长期效果。' : '这是历史选定问题的比较，不代表全部问题或整体能力。'}</p>
  </section>;
}
