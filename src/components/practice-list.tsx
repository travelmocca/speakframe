'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ActivityHeatmap, type ActivityData } from './activity-heatmap';
import { AppShell, Mic } from './app-shell';
import { api, dateLabel, statusLabel } from '@/lib/client';
import { DIMENSIONS } from '@/lib/dimensions';
import type { WorkspaceIssue } from '@/lib/store';
import { getScenario } from '@/lib/scenarios';
import { discardDraft } from '@/lib/recording-drafts';
type Row = { id: string; title: string; goal: string; scenario: string; updatedAt: number; attemptCount: number; reflectionCount: number; latestStatus: string | null };
export function PracticeList() {
  const [rows, setRows] = useState<Row[]>([]), [issues, setIssues] = useState<WorkspaceIssue[]>([]), [dimension, setDimension] = useState('');
  const [activity, setActivity] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [deleting, setDeleting] = useState<Row | null>(null);
  const dialog = useRef<HTMLDialogElement>(null); const router = useRouter();
  const load = useCallback(async () => { try { const r = await api<{ practices: Row[]; issues: WorkspaceIssue[]; activity: ActivityData }>('/workspace'); setRows(r.practices); setIssues(r.issues); setActivity(r.activity); setError(''); } catch (e) { setError((e as Error).message); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); const id = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 5000); return () => clearInterval(id); }, [load]);
  useEffect(() => {
    const sync = () => { const value = new URLSearchParams(location.search).get('dimension') || ''; setDimension(DIMENSIONS.some(d => d === value) ? value : ''); };
    sync(); window.addEventListener('popstate', sync); return () => window.removeEventListener('popstate', sync);
  }, []);
  useEffect(() => { if (deleting) dialog.current?.showModal(); }, [deleting]);
  function chooseDimension(value: string) {
    setDimension(value); const params = new URLSearchParams(location.search);
    if (value) params.set('dimension', value); else params.delete('dimension');
    history.pushState(null, '', `${location.pathname}${params.size ? '?' + params.toString() : ''}`);
  }
  function create() { router.push('/practices/new'); }
  const filteredIssues = issues.filter(item => !dimension || item.issue.dimension === dimension);
  const pendingCount = rows.filter(row => row.attemptCount > 0 && row.latestStatus !== 'done').length;
  return <AppShell><div className="workspace-heading"><h1>我的表达工作台</h1><p className="muted">留下每次表达，从具体问题开始下一次练习。</p></div>
    <section className="workspace-start" aria-labelledby="start-heading"><div><h2 id="start-heading">开始一段新表达</h2><p>先选表达场景，带着框架开始练习。</p></div><button className="button primary" onClick={create} disabled={busy}><Mic size={20} />{busy ? '正在创建…' : '新建练习'}</button></section>
    {error && <div className="notice"><p role="alert" className="error-message">{error}</p>{rows.length > 0 && <p className="small muted">刷新失败，暂时保留上次读取的记录与反馈。</p>}<button className="text-button" onClick={load}>重新加载</button></div>}
    <nav className="workspace-jumps" aria-label="工作台模块"><a href="#activity-heading">每日表达记录</a><a href="#history-heading">历史表达</a><a href="#problems-heading">当前问题分析</a></nav>
    <ActivityHeatmap activity={activity} loading={loading} error={Boolean(error)} />
    <div className="workspace-grid"><section className="workspace-history" aria-labelledby="history-heading"><div className="workspace-section-head"><h2 id="history-heading">历史表达</h2>{!loading && (!error || rows.length > 0) && <span className="small muted">{rows.length} 组练习</span>}</div>
      {loading ? <div className="workspace-loading" aria-label="正在加载练习记录"><div className="skeleton">正在读取表达记录…</div><div className="skeleton">正在读取练习状态…</div></div> : !rows.length ? <div className="workspace-empty"><h3>{error ? '暂时无法读取历史表达' : '还没有练习记录'}</h3><p>{error ? '请重新加载后查看。' : '录音、转写和每次重练都会保存在这里。'}</p>{!error && <button className="button quiet" onClick={create} disabled={busy}>开始第一次练习</button>}</div> : <div className="practice-table"><div className="list-head"><span>表达主题</span><span>最近练习</span><span>状态</span><span className="sr-only">操作</span></div>{rows.map(r => <article className="practice-row" key={r.id}><Link className="practice-title" href={`/practices/${r.id}`}><h3>{r.title || '未命名练习'}</h3><p>{getScenario(r.scenario)?.title || '未选择场景'}</p><p>{r.attemptCount ? `已保存 ${r.attemptCount} 次表达${r.reflectionCount ? `，${r.reflectionCount} 条感悟` : ''}` : '继续确定主题，开始录音'}</p></Link><div className="row-meta"><span>{dateLabel(r.updatedAt)}</span></div><span className={`status ${r.latestStatus === 'failed' ? 'status-failed' : ''}`}>{statusLabel[r.latestStatus || 'active'] || '草稿'}</span><button className="text-button" aria-label="删除练习" onClick={() => setDeleting(r)}>删除</button></article>)}</div>}
    </section><aside className="workspace-problems" aria-labelledby="problems-heading"><div className="workspace-section-head"><h2 id="problems-heading">当前问题分析</h2></div><p className="workspace-scope small muted">每组只看最近一次表达，尚未完成分析的暂不计入。</p>
      {loading ? <div className="workspace-loading" aria-label="正在加载问题分析"><div className="skeleton">正在整理具体反馈…</div></div> : error && !rows.length ? <div className="workspace-empty"><h3>暂时无法读取问题分析</h3><p>请重新加载后查看。</p></div> : <>
        <div className="dimension-summary" role="group" aria-label="按问题维度筛选"><button className="dimension-filter" aria-pressed={!dimension} onClick={() => chooseDimension('')}><span>全部问题</span><span>{issues.length}<span className="sr-only">条</span></span></button>{DIMENSIONS.map(d => <button key={d} className="dimension-filter" aria-pressed={dimension === d} onClick={() => chooseDimension(d)}><span>{d}</span><span>{issues.filter(item => item.issue.dimension === d).length}<span className="sr-only">条</span></span></button>)}</div>
        {pendingCount > 0 && <p className="small muted workspace-pending">{pendingCount} 组表达尚未完成分析，完成后更新这里的反馈。</p>}
        <div className="workspace-issues" aria-live="polite">{filteredIssues.length > 0 ? <>{filteredIssues.slice(0, 6).map(item => <details className="workspace-issue" key={`${item.attemptId}:${item.issue.id}`}><summary className="workspace-issue-summary"><strong>{item.issue.dimension}</strong><span>{item.issue.impact.length > 60 ? item.issue.impact.slice(0, 60) + '…' : item.issue.impact}</span></summary><p className="small muted">第 {item.sequence} 次表达</p><Link className="workspace-source small" href={`/practices/${item.practiceId}?attempt=${item.attemptId}`}>{item.title || '未命名练习'}</Link><p className="small workspace-part-label">原文</p><blockquote>{item.issue.evidence}</blockquote>{!item.issue.evidenceVerified && <p className="small error-message">引用未核验，请先回听确认。</p>}<p className="small workspace-part-label">问题</p><p>{item.issue.impact}</p><p className="small workspace-part-label">建议</p><p className="workspace-suggestion">{item.issue.suggestion}</p><Link className="text-button" href={`/practices/${item.practiceId}?attempt=${item.attemptId}&retry=all`}>参考全部问题重练</Link></details>)}{filteredIssues.length > 6 && <p className="small muted">显示最近6条反馈，其余可在对应表达中查看。</p>}</> : <div className="workspace-empty"><h3>{error ? '暂时无法读取问题分析' : dimension ? '这个维度暂无问题反馈' : rows.length ? '暂无可汇总的问题' : '先留下一段表达'}</h3><p>{error ? '请重新加载后查看。' : !rows.length ? '完成录音和分析后，具体反馈会出现在这里。' : '只汇总已完成分析的最新版本，不代表整体能力评价。'}</p></div>}</div>
        <p className="workspace-disclaimer small muted">问题条数不是能力评分。AI判断可能有误，请结合原音核对。</p>
      </>}
    </aside></div>
    <dialog ref={dialog} onCancel={() => setDeleting(null)} onClick={e => { if (e.target === dialog.current) { dialog.current.close(); setDeleting(null); } }}><h2>删除这组练习？</h2><p>“{deleting?.title || '未命名练习'}”的所有录音、转写、分析和重练记录都会删除，无法恢复。</p><div className="button-row"><button className="button quiet" onClick={() => { dialog.current?.close(); setDeleting(null); }} disabled={busy}>保留练习</button><button className="button primary" disabled={busy} onClick={async () => { if (!deleting) return; setBusy(true); try { await api(`/practices/${deleting.id}`, { method: 'DELETE' }); discardDraft(deleting.id); dialog.current?.close(); setDeleting(null); await load(); } catch (e) { setError((e as Error).message); dialog.current?.close(); setDeleting(null); } finally { setBusy(false); } }}>确认删除</button></div></dialog>
  </AppShell>;
}
