'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, dateLabel, durationLabel, statusLabel } from '@/lib/client';
import type { Analysis, ComparisonResult, Issue } from '@/lib/analysis-schema';
import { AppShell } from './app-shell';
import { AudioRecorder } from './audio-recorder';
import { TopicVoiceInput } from './topic-voice-input';
import { ProcessingIndicator } from './processing-indicator';
import { readDraft, discardDraft } from '@/lib/recording-drafts';

type Attempt = { id: string; sequence: number; sourceId: string | null; target: Issue | null; duration: number; status: string; transcript: string; analysis: Analysis | null; audioUrl: string; error: string; createdAt: number };
type Comparison = { id: string; sourceId: string; attemptId: string; target: Issue; status: string; result: ComparisonResult | null; error: string };
type Practice = { id: string; title: string; goal: string; attempts: Attempt[]; comparisons: Comparison[] };

export function PracticeWorkbench({ id }: { id: string }) {
  const [practice, setPractice] = useState<Practice | null>(null), [title, setTitle] = useState(''), [selected, setSelected] = useState(''), [view, setView] = useState('expression');
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [busy, setBusy] = useState(false), [recordMode, setRecordMode] = useState(false), [target, setTarget] = useState<{ sourceId: string; issue: Issue } | null>(null), [dirty, setDirty] = useState(false);
  const [topicBusy, setTopicBusy] = useState(false);
  const unsaved = dirty || topicBusy;
  const changeTopicBusy = useCallback((value: boolean) => setTopicBusy(value), []);
  const initialized = useRef(false);
  const changeDirty = useCallback((value: boolean) => setDirty(value), []);
  const load = useCallback(async () => {
    try {
      const { practice: p } = await api<{ practice: Practice }>(`/practices/${id}`); setPractice(p);
      if (!initialized.current) {
        const params = new URLSearchParams(location.search);
        setTitle(p.title); setSelected(params.get('attempt') || p.attempts.at(-1)?.id || ''); setView(params.get('view') === 'compare' ? 'compare' : 'expression'); setRecordMode(!p.attempts.length); initialized.current = true;
        const draft = readDraft(id);
        if (draft) {
          setTitle(draft.title); setRecordMode(true); setView('expression');
          const source = p.attempts.find(a => a.id === draft.sourceId), issue = source?.analysis?.issues.find(i => i.id === draft.issueId);
          if (source && issue) { setSelected(source.id); setTarget({ sourceId: source.id, issue }); }
        }
      }
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, [id]);
  useEffect(() => { void load(); const timer = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 1500); return () => clearInterval(timer); }, [load]);
  useEffect(() => {
    const prevent = (e: BeforeUnloadEvent) => { if (unsaved) { e.preventDefault(); e.returnValue = ''; } };
    const currentHref = location.href, currentState = history.state;
    const preventHistory = (e: PopStateEvent) => {
      if (!unsaved || confirm('还有未保存的录音，确定离开吗？')) return;
      // Capture before Next's popstate listener, restoring the current entry without unmounting the recorder.
      e.stopImmediatePropagation(); history.pushState(currentState, '', currentHref);
    };
    window.addEventListener('beforeunload', prevent);
    window.addEventListener('popstate', preventHistory, true);
    return () => { window.removeEventListener('beforeunload', prevent); window.removeEventListener('popstate', preventHistory, true); };
  }, [unsaved]);
  useEffect(() => {
    if (!initialized.current) return; const params = new URLSearchParams(); if (selected) params.set('attempt', selected); if (view === 'compare') params.set('view', 'compare'); history.replaceState(null, '', `${location.pathname}${params.size ? '?' + params.toString() : ''}`);
  }, [selected, view]);
  const current = practice?.attempts.find(a => a.id === selected) || practice?.attempts.at(-1);
  const comparison = [...(practice?.comparisons || [])].reverse().find(c => c.attemptId === current?.id);
  const source = practice?.attempts.find(a => a.id === current?.sourceId);
  const pending = current && ['queued', 'running'].includes(current.status);
  async function action(fn: () => Promise<unknown>) { setBusy(true); setError(''); try { await fn(); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  async function save(blob: Blob) {
    if (!practice) return;
    if (!title.trim()) throw new Error('请先填写表达主题，或使用语音输入主题');
    if (!practice.attempts.length) await api(`/practices/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) });
    const form = new FormData(); form.append('audio', blob, blob.type.includes('mp4') ? 'recording.m4a' : 'recording.webm');
    if (target) { form.append('sourceId', target.sourceId); form.append('issueId', target.issue.id); }
    const { attempt } = await api<{ attempt: Attempt }>(`/practices/${id}/attempts`, { method: 'POST', body: form });
    setSelected(attempt.id); setRecordMode(false); setTarget(null); setView('expression');
    try { await api(`/attempts/${attempt.id}/analyze`, { method: 'POST' }); } catch (e) { setError((e as Error).message); }
    await load();
  }
  return <AppShell hasUnsaved={unsaved}>{loading ? <div className="skeleton">正在打开练习…</div> : !practice ? <div className="empty-state"><h1>{error || '练习不存在或无权访问'}</h1><Link className="button quiet" href="/practices">返回练习记录</Link></div> : <>
    <div className="work-heading"><Link className="back-link" href="/practices" onClick={e => { if (unsaved && !confirm('还有未保存的录音，确定离开吗？')) e.preventDefault(); }}>返回练习记录</Link><h1>{practice.title || '开始一段新表达'}</h1><p className="muted">选一个你想说的话题，准备好了就开始录音。</p></div>
    {error && <p role="alert" className="notice error-message">{error}</p>}
    {!practice.attempts.length && <section className="topic-form"><label htmlFor="topic">表达主题</label><div className="topic-field"><input id="topic" value={title} maxLength={120} onChange={e => setTitle(e.target.value)} placeholder="例如：为什么建议推迟上线" required disabled={topicBusy} /><TopicVoiceInput practiceId={id} disabled={busy || dirty} onBusyChange={changeTopicBusy} onResult={async value => { setTitle(value); await api(`/practices/${id}`, { method: 'PATCH', body: JSON.stringify({ title: value }) }); await load(); }} /></div><button className="text-button" disabled={busy || topicBusy} onClick={() => action(() => api(`/practices/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) }))}>保存主题</button></section>}
    {practice.attempts.length > 0 && <div className="work-toolbar"><div className="tab-buttons" aria-label="查看方式"><button aria-pressed={view === 'expression'} onClick={() => setView('expression')}>本次表达</button><button aria-pressed={view === 'compare'} disabled={!current?.sourceId || dirty} title={dirty ? "请先保存或取消当前录音" : undefined} onClick={() => setView('compare')}>前后对比</button></div><label className="version-picker">表达版本<select aria-label="表达版本" value={current?.id || ''} onChange={e => { if (dirty && !confirm('还有未保存的录音，确定切换版本吗？')) return; setSelected(e.target.value); setRecordMode(false); setTarget(null); }} disabled={dirty}>{practice.attempts.map(a => <option key={a.id} value={a.id}>第 {a.sequence} 次表达</option>)}</select></label></div>}
    {view === 'compare' && current && source ? <section className="comparison-view"><div className="section-heading"><h2>围绕同一个问题，看两次表达</h2><p className="muted">{current.target?.dimension}：{current.target?.suggestion}</p></div><div className="compare-columns">{[source, current].map((a, index) => <section key={a.id} className="compare-version"><h3>{index === 0 ? '重练前' : '重练后'} <span className="muted small">第 {a.sequence} 次表达</span></h3><audio controls src={a.audioUrl} preload="metadata" aria-label={index === 0 ? '重练前录音' : '重练后录音'} /><p className="transcript">{a.transcript || '转写尚未完成'}</p></section>)}</div>
      {comparison?.status === 'done' && comparison.result ? <ComparisonPanel result={comparison.result} /> : <div className="comparison-prompt"><p>{comparison && ['queued', 'running'].includes(comparison.status) ? '正在比较两次表现，离开页面也会继续处理。' : comparison?.error || '比较将依据两次转写与分析，聚焦本次重练目标。'}</p><button className="button primary" disabled={busy || current.status !== 'done' || comparison?.status === 'queued' || comparison?.status === 'running'} onClick={() => action(() => api('/comparisons', { method: 'POST', body: JSON.stringify({ attemptId: current.id }) }))}>{comparison?.status === 'failed' ? '重新比较' : '比较两次表现'}</button></div>}
      <p className="small muted">这是本次两段表达的比较，不代表整体能力或长期效果。</p></section> : <div className="work-grid"><section className="expression-column"><div className="section-heading"><h2>{recordMode ? target ? '针对一个问题，再说一次' : '说出你的想法' : `第 ${current?.sequence || 1} 次表达`}</h2>{current && !recordMode && <span className="muted small">{dateLabel(current.createdAt)}，{durationLabel(current.duration)}</span>}</div>
      {recordMode ? <>{target && <div className="retry-target"><h3>本次重练目标</h3><p>{target.issue.suggestion}</p><blockquote>{target.issue.evidence}</blockquote><button className="text-button" onClick={() => { if (dirty && !confirm('放弃未保存的录音并取消重练吗？')) return; discardDraft(id); setTarget(null); setRecordMode(false); }}>取消重练</button></div>}<AudioRecorder key={target?.issue.id || 'new'} draftId={id} draftContext={{ title, sourceId: target?.sourceId, issueId: target?.issue.id }} onSave={save} onDirty={changeDirty} disabled={busy || topicBusy} /></> : current && <><audio controls src={current.audioUrl} preload="metadata" aria-label={`第${current.sequence}次表达录音`} /><div className="transcript-heading"><h3>转写原文</h3><span className="small muted">保留垫词与重复</span></div>{current.analysis ? <p className="transcript" data-testid="transcript">{current.transcript || '未识别到可辨识语音。'}</p> : <div className="analysis-wait"><p>{pending ? <ProcessingIndicator>{current.status === 'queued' ? '等待转写与分析…' : '正在转写与分析…'}</ProcessingIndicator> : current.error || '录音已保存，可以提交分析。'}</p>{pending ? <p className="small muted">可以离开页面，完成后会保留结果。</p> : <button className="button quiet" disabled={busy} onClick={() => action(() => api(`/attempts/${current.id}/analyze`, { method: 'POST' }))}>{current.status === 'failed' ? '重新分析' : '提交分析'}</button>}</div>}
      {current.sourceId && current.status === 'done' && <button className="button primary" disabled={busy} onClick={async () => { setView('compare'); await action(() => api('/comparisons', { method: 'POST', body: JSON.stringify({ attemptId: current.id }) })); }}>比较两次表现</button>}
      {current.analysis && !current.analysis.issues.length && <button className="button quiet" onClick={() => { setTarget(null); setRecordMode(true); }}>重新表达</button>}</>}
    </section><aside className="feedback-column"><div className="section-heading"><h2>发现具体问题</h2><p className="muted small">一次重练，只聚焦一个问题。</p></div>{current?.analysis ? <><AnalysisPanel analysis={current.analysis} onRetry={issue => { setTarget({ sourceId: current.id, issue }); setRecordMode(true); setView('expression'); window.scrollTo({ top: 0, behavior: 'instant' }); }} disabled={busy || dirty} /><p className="small model-note">由千问 Omni 分析。转写和判断可能有误，请结合原音核对。</p></> : <div className="feedback-empty"><p>先完成一次表达。</p><p className="muted small">AI会从重点、顺序、展开、衔接和口头禅五个方面给出反馈。</p></div>}</aside></div>}
  </>}</AppShell>;
}

function AnalysisPanel({ analysis, onRetry, disabled }: { analysis: Analysis; onRetry: (i: Issue) => void; disabled: boolean }) {
  return <>{analysis.issues.length ? <div className="issue-list">{analysis.issues.map((issue, index) => <section className="issue" key={issue.id}><div className="issue-heading"><span className="issue-index">{index + 1}</span><h3>{issue.dimension}</h3></div><blockquote>{issue.evidence}</blockquote>{!issue.evidenceVerified && <p className="small error-message">这段引用未能与转写匹配，请先回听核对。</p>}<p>{issue.impact}</p><p className="issue-action"><strong>下一次试试</strong>{issue.suggestion}</p><button className="button quiet" onClick={() => onRetry(issue)} disabled={disabled}>针对这个问题重练</button></section>)}</div> : <p className="no-issues">本次未发现有充分依据的问题。你可以回听，或再表达一次。</p>}
    <details className="dimension-details"><summary>查看五个维度的观察</summary><dl>{analysis.dimensions.map(d => <div key={d.name}><dt>{d.name}</dt><dd>{d.finding}</dd></div>)}</dl></details>{analysis.uncertainty && <p className="small uncertainty">需要留意：{analysis.uncertainty}</p>}</>;
}
function ComparisonPanel({ result }: { result: ComparisonResult }) {
  return <section className="comparison-result" data-testid="comparison-result"><h2>{result.verdict}</h2><p>{result.summary}</p><dl><div><dt>重练前的依据</dt><dd>{result.beforeEvidence || '没有足够依据'}{result.beforeEvidenceVerified === false && <span className="small error-message">（引用未核验）</span>}</dd></div><div><dt>重练后的依据</dt><dd>{result.afterEvidence || '没有足够依据'}{result.afterEvidenceVerified === false && <span className="small error-message">（引用未核验）</span>}</dd></div><div><dt>接下来可以关注</dt><dd>{result.remaining || '没有补充建议'}</dd></div></dl>{result.uncertainty && <p className="small muted">{result.uncertainty}</p>}</section>;
}
