'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ActivityHeatmap, type ActivityData } from './activity-heatmap';
import { AppShell } from './app-shell';
import { RiMicLine } from '@remixicon/react';
import { api, dateLabel, statusLabel } from '@/lib/client';
import { DIMENSIONS } from '@/lib/dimensions';
import { DimensionPie } from './dimension-pie';
import { countByDimension } from '@/lib/dimension-pie';
import type { WorkspaceIssue } from '@/lib/store';
import { getScenario } from '@/lib/scenarios';
import { discardDraft } from '@/lib/recording-drafts';
import { AlertDialog } from '@/components/base/modal/modal';
import { Accordion, AccordionItem } from '@/components/base/accordion/accordion';
import { Button } from '@/components/base/buttons/button';


const DISPLAY_NAME = 'mocca';

function beijingHour(now = Date.now()) {
  return new Date(now + 8 * 3600000).getUTCHours();
}

function greetingLabel(now = Date.now()) {
  const hour = beijingHour(now);
  if (hour < 5) return '晚上好';
  if (hour < 12) return '早上好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

function weekPracticeCount(activity: ActivityData | null) {
  if (!activity) return 0;
  const end = Date.parse(`${activity.today}T00:00:00+08:00`);
  if (!Number.isFinite(end)) return 0;
  const start = end - 6 * 86400000;
  return activity.days.reduce((sum, day) => {
    const stamp = Date.parse(`${day.date}T00:00:00+08:00`);
    return stamp >= start && stamp <= end ? sum + day.count : sum;
  }, 0);
}

type Row = { id: string; title: string; goal: string; scenario: string; updatedAt: number; attemptCount: number; reflectionCount: number; latestStatus: string | null };

export function PracticeList() {
  const [rows, setRows] = useState<Row[]>([]), [issues, setIssues] = useState<WorkspaceIssue[]>([]), [dimension, setDimension] = useState('');
  const [activity, setActivity] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [deleting, setDeleting] = useState<Row | null>(null);
  const router = useRouter();
  const load = useCallback(async () => { try { const r = await api<{ practices: Row[]; issues: WorkspaceIssue[]; activity: ActivityData }>('/workspace'); setRows(r.practices); setIssues(r.issues); setActivity(r.activity); setError(''); } catch (e) { setError((e as Error).message); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); const id = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 5000); return () => clearInterval(id); }, [load]);
  useEffect(() => {
    const sync = () => { const value = new URLSearchParams(location.search).get('dimension') || ''; setDimension(DIMENSIONS.some(d => d === value) ? value : ''); };
    sync(); window.addEventListener('popstate', sync); return () => window.removeEventListener('popstate', sync);
  }, []);
  function chooseDimension(value: string) {
    setDimension(value); const params = new URLSearchParams(location.search);
    if (value) params.set('dimension', value); else params.delete('dimension');
    history.pushState(null, '', `${location.pathname}${params.size ? '?' + params.toString() : ''}`);
  }
  function create() { router.push('/practices/new'); }
  const filteredIssues = issues.filter(item => !dimension || item.issue.dimension === dimension);
  const pendingCount = rows.filter(row => row.attemptCount > 0 && row.latestStatus !== 'done').length;
  const draftCount = rows.filter(row => row.attemptCount === 0).length;
  const weeklyCount = weekPracticeCount(activity);
  const greeting = greetingLabel();
  return <AppShell><div className="workspace-heading"><h1>我的表达工作台</h1><p className="muted">留下每次表达，从具体问题开始下一次练习。</p></div>
    <section className="workspace-greeting" aria-labelledby="greeting-heading">
      <div className="workspace-greeting-copy">
        <h2 id="greeting-heading">{greeting}，{DISPLAY_NAME} —</h2>
        <p>今天继续把表达练扎实。</p>
        {!loading && (!error || rows.length > 0) && (
          <p className="workspace-greeting-status small muted" aria-label="今日练习状态">{draftCount} 条草稿 · {pendingCount} 条待分析 · 本周已练 {weeklyCount} 次</p>
        )}
      </div>
      <Button variant="primary" size="medium" disabled={busy} onClick={create} leadingIcon={RiMicLine}>{busy ? '正在创建…' : '新建练习'}</Button>
    </section>
    {error && <div className="notice"><p role="alert" className="error-message">{error}</p>{rows.length > 0 && <p className="small muted">刷新失败，暂时保留上次读取的记录与反馈。</p>}<button className="text-button" onClick={load}>重新加载</button></div>}
    <section className="workspace-problems" aria-labelledby="problems-heading">
      <div className="workspace-section-head"><h2 id="problems-heading">当前问题分析</h2></div>
      <p className="workspace-scope small muted">每组只看最近一次表达，尚未完成分析的暂不计入。</p>
      {loading ? <div className="workspace-loading" aria-label="正在加载问题分析"><div className="skeleton">正在整理具体反馈…</div></div> : error && !rows.length ? <div className="workspace-empty"><h3>暂时无法读取问题分析</h3><p>请重新加载后查看。</p></div> : <>
        <div className="workspace-analysis-layout">
          <div className="workspace-analysis-pie">
            <DimensionPie counts={countByDimension(issues)} selected={dimension} onSelect={chooseDimension} total={issues.length} />
            {pendingCount > 0 && <p className="small muted workspace-pending">{pendingCount} 组表达尚未完成分析，完成后更新这里的反馈。</p>}
          </div>
          <div className="workspace-issues" aria-live="polite">{filteredIssues.length > 0 ? <><Accordion variant="divided" className="workspace-issue-accordion" allowsMultipleExpanded>{filteredIssues.slice(0, 6).map(item => {
            const preview = item.issue.impact.length > 60 ? `${item.issue.impact.slice(0, 60)}…` : item.issue.impact;
            return <AccordionItem key={`${item.attemptId}:${item.issue.id}`} id={`${item.attemptId}:${item.issue.id}`} className="workspace-issue" title={item.issue.dimension} description={<span className="workspace-issue-preview">{preview}</span>}><p className="small muted">第 {item.sequence} 次表达</p><Link className="workspace-source small" href={`/practices/${item.practiceId}?attempt=${item.attemptId}`}>{item.title || '未命名练习'}</Link><p className="small workspace-part-label">原文</p><blockquote>{item.issue.evidence}</blockquote>{!item.issue.evidenceVerified && <p className="small error-message">引用未核验，请先回听确认。</p>}<p className="small workspace-part-label">问题</p><p>{item.issue.impact}</p><p className="small workspace-part-label">建议</p><p className="workspace-suggestion">{item.issue.suggestion}</p><Link className="text-button" href={`/practices/${item.practiceId}?attempt=${item.attemptId}&retry=all`}>参考全部问题重练</Link></AccordionItem>;
          })}</Accordion>{filteredIssues.length > 6 && <p className="small muted">显示最近6条反馈，其余可在对应表达中查看。</p>}</> : <div className="workspace-empty"><h3>{error ? '暂时无法读取问题分析' : dimension ? '这个维度暂无问题反馈' : rows.length ? '暂无可汇总的问题' : '先留下一段表达'}</h3><p>{error ? '请重新加载后查看。' : !rows.length ? '完成录音和分析后，具体反馈会出现在这里。' : '只汇总已完成分析的最新版本，不代表整体能力评价。'}</p></div>}</div>
        </div>
        <p className="workspace-disclaimer small muted">问题条数不是能力评分。AI判断可能有误，请结合原音核对。</p>
      </>}
    </section>
    <nav className="workspace-jumps" aria-label="工作台模块"><a href="#problems-heading">当前问题分析</a><a href="#activity-heading">每日表达记录</a><a href="#history-heading">历史表达</a></nav>
    <ActivityHeatmap activity={activity} loading={loading} error={Boolean(error)} />
    <section className="workspace-history" aria-labelledby="history-heading"><div className="workspace-section-head"><h2 id="history-heading">历史表达</h2>{!loading && (!error || rows.length > 0) && <span className="small muted">{rows.length} 组练习</span>}</div>
      {loading ? <div className="workspace-loading" aria-label="正在加载练习记录"><div className="skeleton">正在读取表达记录…</div><div className="skeleton">正在读取练习状态…</div></div> : !rows.length ? <div className="workspace-empty"><h3>{error ? '暂时无法读取历史表达' : '还没有练习记录'}</h3><p>{error ? '请重新加载后查看。' : '录音、转写和每次重练都会保存在这里。'}</p>{!error && <Button variant="secondary" size="medium" onClick={create} disabled={busy}>开始第一次练习</Button>}</div> : <div className="practice-table"><div className="list-head"><span>表达主题</span><span>最近练习</span><span>状态</span><span className="sr-only">操作</span></div>{rows.map(r => <article className="practice-row" key={r.id}><Link className="practice-title" href={`/practices/${r.id}`}><h3>{r.title || '未命名练习'}</h3><p>{getScenario(r.scenario)?.title || '未选择场景'}</p><p>{r.attemptCount ? `已保存 ${r.attemptCount} 次表达${r.reflectionCount ? `，${r.reflectionCount} 条感悟` : ''}` : '继续确定主题，开始录音'}</p></Link><div className="row-meta"><span>{dateLabel(r.updatedAt)}</span></div><span className={`status ${r.latestStatus === 'failed' ? 'status-failed' : ''}`}>{statusLabel[r.latestStatus || 'active'] || '草稿'}</span><button className="text-button" aria-label="删除练习" onClick={() => setDeleting(r)}>删除</button></article>)}</div>}
    </section>
    <AlertDialog
      isOpen={Boolean(deleting)}
      onOpenChange={open => { if (!open) setDeleting(null); }}
      variant="danger"
      title="删除这组练习？"
      description={`“${deleting?.title || '未命名练习'}”的所有录音、转写、分析和重练记录都会删除，无法恢复。`}
      cancelLabel="保留练习"
      confirmLabel="确认删除"
      pendingLabel="正在删除…"
      onCancel={() => setDeleting(null)}
      onConfirm={async () => {
        if (!deleting) return;
        setBusy(true);
        try {
          await api(`/practices/${deleting.id}`, { method: 'DELETE' });
          discardDraft(deleting.id);
          setDeleting(null);
          await load();
        } catch (e) {
          setError((e as Error).message);
          setDeleting(null);
          throw e;
        } finally {
          setBusy(false);
        }
      }}
    />
  </AppShell>;
}
