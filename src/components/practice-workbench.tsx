'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, useRef } from 'react';
import { api, dateLabel, durationLabel } from '@/lib/client';
import type { Analysis, ComparisonResult } from '@/lib/analysis-schema';
import type { Reflection } from '@/lib/store';
import { AppShell } from './app-shell';
import { AudioRecorder } from './audio-recorder';
import { TopicVoiceInput } from './topic-voice-input';
import { ScenarioGuide } from './scenario-guide';
import { ProcessingIndicator } from './processing-indicator';
import { ExitReflection } from './exit-reflection';
import { AnalysisPanel, ComparisonPanel } from './analysis-panels';
import { readDraft, discardDraft } from '@/lib/recording-drafts';

type Attempt = { id: string; sequence: number; sourceId: string | null; duration: number; status: string; transcript: string; analysis: Analysis | null; audioUrl: string; error: string; createdAt: number };
type Comparison = { id: string; sourceId: string; attemptId: string; status: string; result: ComparisonResult | null; error: string };
type Practice = { id: string; title: string; scenario: string; attempts: Attempt[]; comparisons: Comparison[]; reflections: Reflection[] };
export function PracticeWorkbench({ id }: { id: string }) {
  const router = useRouter();
  const [practice, setPractice] = useState<Practice | null>(null), [title, setTitle] = useState(''), [selected, setSelected] = useState(''), [view, setView] = useState('expression');
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [busy, setBusy] = useState(false), [recordMode, setRecordMode] = useState(false), [retrySource, setRetrySource] = useState<string | null>(null), [retryChoice, setRetryChoice] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false), [topicBusy, setTopicBusy] = useState(false), [exiting, setExiting] = useState(false), [reflectionDirty, setReflectionDirty] = useState(false), [reflectionBusy, setReflectionBusy] = useState(false);
  const changeDirty = useCallback((v: boolean) => setDirty(v), []), changeTopicBusy = useCallback((v: boolean) => setTopicBusy(v), []);
  const changeReflectionDirty = useCallback((v: boolean) => setReflectionDirty(v), []), changeReflectionBusy = useCallback((v: boolean) => setReflectionBusy(v), []);
  const initialized = useRef(false), unsaved = dirty || topicBusy || reflectionDirty || reflectionBusy;
  const load = useCallback(async () => {
    try {
      const { practice: p } = await api<{ practice: Practice }>(`/practices/${id}`); setPractice(p);
      if (!initialized.current) {
        const params = new URLSearchParams(location.search), latest = p.attempts.at(-1);
        setTitle(p.title); setSelected(params.get('attempt') || latest?.id || ''); setView(params.get('view') === 'compare' ? 'compare' : 'expression'); setRecordMode(!p.attempts.length); initialized.current = true;
        const requested = params.get('retry') && latest?.status === 'done' ? latest.id : null, draft = readDraft(id);
        if (draft) {
          setTitle(draft.title); setRecordMode(true); setView('expression'); setRetrySource(draft.sourceId || null); if (draft.sourceId) setSelected(draft.sourceId);
          if (requested && draft.sourceId !== requested) setRetryChoice(requested);
        } else if (requested) { setSelected(requested); setRetrySource(requested); setRecordMode(true); setView('expression'); }
      }
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, [id]);
  useEffect(() => { void load(); const timer = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 1500); return () => clearInterval(timer); }, [load]);
  useEffect(() => {
    const prevent = (e: BeforeUnloadEvent) => { if (unsaved) { e.preventDefault(); e.returnValue = ''; } };
    const currentHref = location.href, currentState = history.state;
    const preventHistory = (e: PopStateEvent) => { if (!unsaved || confirm('还有未保存的内容，确定离开吗？')) return; e.stopImmediatePropagation(); history.pushState(currentState, '', currentHref); };
    window.addEventListener('beforeunload', prevent); window.addEventListener('popstate', preventHistory, true);
    return () => { window.removeEventListener('beforeunload', prevent); window.removeEventListener('popstate', preventHistory, true); };
  }, [unsaved]);
  useEffect(() => {
    if (!initialized.current) return; const params = new URLSearchParams(); if (selected) params.set('attempt', selected); if (view === 'compare') params.set('view', 'compare'); if (recordMode && (retrySource || retryChoice)) params.set('retry', 'all'); history.replaceState(null, '', `${location.pathname}${params.size ? '?' + params.toString() : ''}`);
  }, [selected, view, recordMode, retrySource, retryChoice]);
  const latest = practice?.attempts.at(-1), current = practice?.attempts.find(a => a.id === selected) || latest;
  const comparison = [...(practice?.comparisons || [])].reverse().find(c => c.attemptId === current?.id), source = practice?.attempts.find(a => a.id === current?.sourceId);
  const pending = current && ['queued', 'running'].includes(current.status), canRetry = latest?.status === 'done' && !dirty && !busy && !topicBusy && !exiting;
  async function action(fn: () => Promise<unknown>) { setBusy(true); setError(''); try { await fn(); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  function startRetry() { if (!latest || !canRetry) return; setSelected(latest.id); setRetrySource(latest.id); setRecordMode(true); setView('expression'); }
  async function save(blob: Blob) {
    if (!practice) return; if (!title.trim()) throw new Error('请先填写表达主题，或使用语音输入主题');
    if (!practice.attempts.length) await api(`/practices/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) });
    const form = new FormData(); form.append('audio', blob, blob.type.includes('mp4') ? 'recording.m4a' : 'recording.webm'); if (retrySource) form.append('sourceId', retrySource);
    const { attempt } = await api<{ attempt: Attempt }>(`/practices/${id}/attempts`, { method: 'POST', body: form });
    setSelected(attempt.id); setRecordMode(false); setRetrySource(null); setView('expression');
    try { await api(`/attempts/${attempt.id}/analyze`, { method: 'POST' }); } catch (e) { setError((e as Error).message); }
    await load();
  }
  function comparisonContent() { return comparison?.status === 'done' && comparison.result ? <ComparisonPanel result={comparison.result} beforeSequence={source?.sequence} afterSequence={current?.sequence} /> : <div className="comparison-prompt"><p role="status">{comparison && ['queued', 'running'].includes(comparison.status) ? <ProcessingIndicator>正在自动生成两轮对比…</ProcessingIndicator> : comparison?.error || '本轮分析完成后，会自动与上一轮比较全部问题。'}</p>{current?.status === 'done' && !['queued', 'running'].includes(comparison?.status || '') && <button className="button quiet" disabled={busy} onClick={() => action(() => api('/comparisons', { method: 'POST', body: JSON.stringify({ attemptId: current.id }) }))}>重新生成对比</button>}</div>; }
  return <AppShell hasUnsaved={unsaved}>{loading ? <div className="skeleton">正在打开练习…</div> : !practice ? <div className="empty-state"><h1>{error || '练习不存在或无权访问'}</h1><Link className="button quiet" href="/practices">返回练习记录</Link></div> : <>
    <div className="work-heading"><Link className="back-link" href="/practices" onClick={e => { if (unsaved && !confirm('还有未保存的内容，确定离开吗？')) e.preventDefault(); }}>返回练习记录</Link><div className="practice-heading-row"><h1>{practice.title || '开始一段新表达'}</h1><div className="practice-heading-actions">{practice.attempts.length > 0 && <button className="button primary" disabled={!canRetry || recordMode} onClick={startRetry}>再练一次</button>}<button className="button quiet" disabled={dirty || topicBusy || busy || exiting} onClick={() => setExiting(true)}>退出练习</button></div></div><p className="muted">围绕同一主题反复练习，每一轮参考全部反馈。</p>{(dirty || topicBusy) && <p className="small muted">请先停止并保存或放弃当前录音，再退出练习。</p>}</div>
    {error && <p role="alert" className="notice error-message">{error}</p>}
    <ExitReflection key={id} practiceId={id} visible={exiting} onClose={() => setExiting(false)} onExit={() => router.push('/practices')} onDirty={changeReflectionDirty} onBusy={changeReflectionBusy} />
    <div hidden={exiting}>
      {retryChoice && <section className="notice retry-choice"><h2>还有一段未保存的录音</h2><p>已保留旧录音。继续当前草稿，或确认放弃后从最新一轮综合重练。</p><div className="button-row"><button className="button quiet" onClick={() => setRetryChoice(null)}>继续上次录音</button><button className="button quiet" onClick={() => { if (!confirm('放弃未保存的录音，改从最新一轮重练吗？')) return; discardDraft(id); setRetrySource(retryChoice); setSelected(retryChoice); setRecordMode(true); setRetryChoice(null); }}>放弃草稿，从最新一轮练习</button></div></section>}
      {!practice.attempts.length && <section className="topic-form"><label htmlFor="topic">表达主题</label><div className="topic-field"><input id="topic" value={title} maxLength={120} onChange={e => setTitle(e.target.value)} placeholder="例如：为什么建议推迟上线" required disabled={topicBusy} /><TopicVoiceInput practiceId={id} disabled={busy || dirty || exiting} onBusyChange={changeTopicBusy} onResult={async value => { setTitle(value); await api(`/practices/${id}`, { method: 'PATCH', body: JSON.stringify({ title: value }) }); await load(); }} /></div><button className="text-button" disabled={busy || topicBusy} onClick={() => action(() => api(`/practices/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) }))}>保存主题</button></section>}
      {practice.attempts.length > 0 && <div className="work-toolbar"><div className="tab-buttons" aria-label="查看方式"><button aria-pressed={view === 'expression'} onClick={() => setView('expression')}>本次表达</button><button aria-pressed={view === 'compare'} disabled={!current?.sourceId || dirty} onClick={() => setView('compare')}>前后对比</button></div><label className="version-picker">表达版本<select aria-label="表达版本" value={current?.id || ''} disabled={dirty} onChange={e => { setSelected(e.target.value); setRecordMode(false); setRetrySource(null); }}>{practice.attempts.map(a => <option key={a.id} value={a.id}>第 {a.sequence} 次表达</option>)}</select></label></div>}
      {view === 'compare' && current && source ? <section className="comparison-view"><div className="section-heading"><h2>对照两轮表达</h2><p className="muted">第 {source.sequence} 次与第 {current.sequence} 次，{comparison?.result?.changes?.length ? '综合比较五个维度。' : '对比范围以下方保存的结果为准。'}</p></div><div className="compare-columns">{[source, current].map((a, index) => <section key={a.id} className="compare-version"><h3>{index === 0 ? '来源版本' : '本次版本'} <span className="muted small">第 {a.sequence} 次表达</span></h3><audio controls src={a.audioUrl} preload="metadata" aria-label={`第${a.sequence}次表达录音`} /><p className="transcript">{a.transcript || '转写尚未完成'}</p></section>)}</div>{comparisonContent()}</section> : <div className="work-grid"><section className="expression-column"><div className="section-heading"><h2>{recordMode ? retrySource ? '参考全部反馈，再说一次' : '说出你的想法' : `第 ${current?.sequence || 1} 次表达`}</h2>{current && !recordMode && <span className="small muted">{dateLabel(current.createdAt)}，{durationLabel(current.duration)}</span>}</div><ScenarioGuide scenarioId={practice.scenario} />
        {recordMode ? <>{retrySource && <div className="retry-target"><h3>本轮综合练习</h3><p>参考上一轮的全部问题和建议。完成后，会自动比较两轮的变化。</p><button className="text-button" onClick={() => { if (dirty && !confirm('放弃未保存的录音并取消重练吗？')) return; discardDraft(id); setRetrySource(null); setRecordMode(false); }}>取消重练</button></div>}<AudioRecorder key={retrySource || 'new'} draftId={id} draftContext={{ title, sourceId: retrySource || undefined }} onSave={save} onDirty={changeDirty} disabled={busy || topicBusy || exiting || reflectionBusy} /></> : current && <><audio controls src={current.audioUrl} preload="metadata" aria-label={`第${current.sequence}次表达录音`} /><div className="transcript-heading"><h3>转写原文</h3><span className="small muted">保留垫词与重复</span></div>{current.analysis ? <p className="transcript" data-testid="transcript">{current.transcript || '未识别到可辨识语音。'}</p> : <div className="analysis-wait"><p>{pending ? <ProcessingIndicator>正在转写与分析…</ProcessingIndicator> : current.error || '录音已保存，可以提交分析。'}</p>{pending ? <p className="small muted">离开页面也会继续处理。</p> : <button className="button quiet" disabled={busy} onClick={() => action(() => api(`/attempts/${current.id}/analyze`, { method: 'POST' }))}>{current.status === 'failed' ? '重新分析' : '提交分析'}</button>}</div>}
          {current.sourceId && current.status === 'done' && comparisonContent()}
          <div className="repeat-actions"><p className="small muted">从最新一轮继续，综合全部反馈。完成分析后可以反复练习。</p></div></>}
      </section><aside className="feedback-column"><div className="section-heading"><h2>本次问题</h2><p className="small muted">综合参考全部问题，围绕同一主题再练。</p></div>{current?.analysis ? <><AnalysisPanel analysis={current.analysis} /><p className="small model-note">由千问 Omni 分析。转写和判断可能有误，请结合原音核对。</p></> : <div className="feedback-empty"><p>先完成一次表达。</p><p className="small muted">AI会从重点、顺序、展开、衔接和口头禅五个方面给出反馈。</p></div>}</aside></div>}
      {practice.reflections.length > 0 && <details className="reflection-history"><summary>查看练习感悟（{practice.reflections.length}）</summary>{practice.reflections.map(note => <article key={note.id}><p className="small muted">{dateLabel(note.createdAt)}</p><p>{note.text}</p></article>)}</details>}
    </div>
  </>}</AppShell>;
}
