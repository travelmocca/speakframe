'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from './app-shell';
import { api } from '@/lib/client';
import { getScenario, SCENARIOS } from '@/lib/scenarios';
import { Button } from '@/components/base/buttons/button';

export function NewPractice() {
  const [selected, setSelected] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const router = useRouter(), scenario = getScenario(selected);
  useEffect(() => { const id = new URLSearchParams(location.search).get('scenario') || ''; if (getScenario(id)) setSelected(id); }, []);
  function choose(id: string) { setSelected(id); history.replaceState(null, '', `/practices/new?scenario=${encodeURIComponent(id)}`); }
  async function create() {
    if (!scenario || busy) return; setBusy(true); setError('');
    try { const { practice } = await api<{ practice: { id: string } }>('/practices', { method: 'POST', body: JSON.stringify({ scenario: scenario.id }) }); router.push(`/practices/${practice.id}`); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  }
  return <AppShell><div className="work-heading"><Link className="back-link" href="/practices">返回个人工作台</Link><h1>这次，你想练哪种表达？</h1><p className="muted">先选一种场景，用对应框架组织自己的话。工作沟通可以先从前三种开始。</p></div>
    <fieldset className="scenario-picker" disabled={busy}><legend className="sr-only">选择表达场景</legend>{SCENARIOS.map(scene => <label key={scene.id} className="scenario-option"><input type="radio" name="scenario" value={scene.id} checked={selected === scene.id} onChange={() => choose(scene.id)} aria-label={scene.title} /><span><strong>{scene.title}</strong><span className="scenario-steps-preview">{scene.steps.join(' → ')}</span></span></label>)}</fieldset>
    <div className="scenario-preview" aria-live="polite">{scenario ? <><h2>{scenario.title}</h2><p>{scenario.purpose}</p><blockquote>{scenario.example}</blockquote><p className="small muted">{scenario.tip}</p></> : <><h2>一次先练一种</h2><p className="muted">选择场景后，可以看到例子；开始录音时，框架会一直保留在页面上。</p></>}</div>
    {error && <p role="alert" className="error-message">{error}</p>}
    <div className="scenario-actions"><p className="small muted">框架用来组织思路，不必把每个步骤都念出来。</p><Button type="button" variant="primary" size="medium" disabled={!scenario || busy} aria-busy={busy || undefined} onClick={create}>{busy ? '正在创建…' : '开始练习'}</Button></div>
  </AppShell>;
}
