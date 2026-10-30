'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell, Mic } from './app-shell';
import { api, dateLabel, statusLabel } from '@/lib/client';
import { discardDraft } from '@/lib/recording-drafts';
type Row = { id: string; title: string; goal: string; updatedAt: number; attemptCount: number; latestStatus: string | null };
export function PracticeList() {
  const [rows, setRows] = useState<Row[]>([]), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [deleting, setDeleting] = useState<Row | null>(null);
  const dialog = useRef<HTMLDialogElement>(null); const router = useRouter();
  const load = useCallback(async () => { try { const r = await api<{ practices: Row[] }>('/practices'); setRows(r.practices); setError(''); } catch (e) { setError((e as Error).message); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); const id = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 5000); return () => clearInterval(id); }, [load]);
  useEffect(() => { if (deleting) dialog.current?.showModal(); }, [deleting]);
  async function create() { setBusy(true); try { const r = await api<{ practice: Row }>('/practices', { method: 'POST' }); router.push(`/practices/${r.practice.id}`); } catch (e) { setError((e as Error).message); setBusy(false); } }
  return <AppShell><div className="page-heading"><div><h1>每一次表达，都留得下来。</h1><p className="muted">选一个你想讲清楚的话题，开始练习。</p></div><button className="button primary" onClick={create} disabled={busy}>{busy ? '正在创建…' : '新建练习'}</button></div>
    {error && <div className="notice"><p role="alert" className="error-message">{error}</p><button className="text-button" onClick={load}>重新加载</button></div>}
    {loading ? <div className="skeleton" aria-label="正在加载练习记录">正在读取练习记录…</div> : !rows.length ? <section className="empty-state"><div className="empty-mic"><Mic size={38} /></div><h2>还没有练习记录</h2><p>从一段真实想说的话开始。录音后，AI会帮你找到具体的改进方向。</p><button className="button quiet" onClick={create} disabled={busy}>开始第一次练习</button></section> : <div className="practice-table"><div className="list-head"><span>表达主题</span><span>最近练习</span><span>状态</span><span className="sr-only">操作</span></div>{rows.map(r => <article className="practice-row" key={r.id}><Link className="practice-title" href={`/practices/${r.id}`}><h2>{r.title || '未命名练习'}</h2><p>{r.goal || '填写表达目标，开始录音。'}</p></Link><div className="row-meta"><span>{dateLabel(r.updatedAt)}</span><span>{r.attemptCount ? `${r.attemptCount} 次表达` : '尚未录音'}</span></div><span className={`status ${r.latestStatus === 'failed' ? 'status-failed' : ''}`}>{statusLabel[r.latestStatus || 'active'] || '草稿'}</span><button className="text-button" aria-label="删除练习" onClick={() => setDeleting(r)}>删除</button></article>)}</div>}
    <dialog ref={dialog} onCancel={() => setDeleting(null)} onClick={e => { if (e.target === dialog.current) { dialog.current.close(); setDeleting(null); } }}><h2>删除这组练习？</h2><p>“{deleting?.title || '未命名练习'}”的所有录音、转写、分析和重练记录都会删除，无法恢复。</p><div className="button-row"><button className="button quiet" onClick={() => { dialog.current?.close(); setDeleting(null); }} disabled={busy}>保留练习</button><button className="button primary" disabled={busy} onClick={async () => { if (!deleting) return; setBusy(true); try { await api(`/practices/${deleting.id}`, { method: 'DELETE' }); discardDraft(deleting.id); dialog.current?.close(); setDeleting(null); await load(); } catch (e) { setError((e as Error).message); dialog.current?.close(); setDeleting(null); } finally { setBusy(false); } }}>确认删除</button></div></dialog>
  </AppShell>;
}
