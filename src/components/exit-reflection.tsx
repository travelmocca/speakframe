'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { TopicVoiceInput } from './topic-voice-input';
import { Textarea } from '@/components/base/textarea/textarea';
import { Button } from '@/components/base/buttons/button';

export function ExitReflection({ practiceId, visible, onClose, onExit, onDirty, onBusy }: { practiceId: string; visible: boolean; onClose: () => void; onExit: () => void; onDirty: (dirty: boolean) => void; onBusy: (busy: boolean) => void }) {
  const [text, setText] = useState(''), [voiceBusy, setVoiceBusy] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState('');
  useEffect(() => { onDirty(Boolean(text.trim())); return () => onDirty(false); }, [text, onDirty]);
  useEffect(() => { onBusy(voiceBusy || saving); return () => onBusy(false); }, [voiceBusy, saving, onBusy]);
  async function save() {
    if (!text.trim() || voiceBusy || saving) return; setSaving(true); setError('');
    try { await api(`/practices/${practiceId}/reflections`, { method: 'POST', body: JSON.stringify({ text }) }); setText(''); onDirty(false); onExit(); }
    catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  }
  return <section className="exit-reflection" hidden={!visible} aria-labelledby="reflection-heading">
    <h2 id="reflection-heading">退出前，记下这次感悟</h2>
    <p className="muted">这一步可跳过。录音和分析会保留，后台任务也会继续。</p>
    <Textarea
      label="本次练习感悟"
      id="reflection-text"
      value={text}
      maxLength={4000}
      showCount
      rows={6}
      autoResize
      maxRows={12}
      isDisabled={voiceBusy || saving}
      onChange={setText}
      placeholder="这次发现了什么？下一次想怎么表达？"
    />
    {visible && <TopicVoiceInput practiceId={practiceId} kind="reflection" disabled={saving} onBusyChange={setVoiceBusy} onResult={async value => { const next = [text.trim(), value].filter(Boolean).join('\n'); if (next.length > 4000) throw new Error('感悟最多4000字，请精简后再录'); setText(next); }} />}
    <p className="small muted">感悟可输入或语音转文字，最多4000字；感悟语音转写后清理，只保存文字。</p>
    {error && <p role="alert" className="error-message">{error}</p>}
    <div className="button-row">
      <Button variant="secondary" size="medium" disabled={saving} onClick={() => { if (voiceBusy && !confirm('停止感悟语音输入，继续练习吗？')) return; onClose(); }}>继续练习</Button>
      <Button variant="ghost" size="medium" disabled={voiceBusy || saving} onClick={() => { if (text.trim() && !confirm('不保存本次感悟，直接退出吗？')) return; setText(''); onDirty(false); onExit(); }}>不记录，直接退出</Button>
      <Button variant="primary" size="medium" disabled={!text.trim() || voiceBusy || saving} onClick={save}>{saving ? '正在保存…' : '保存感悟并退出'}</Button>
    </div>
  </section>;
}
