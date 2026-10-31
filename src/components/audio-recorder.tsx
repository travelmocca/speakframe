'use client';
import { useEffect, useRef, useState } from 'react';
import { durationLabel } from '@/lib/client';
import { Mic } from './app-shell';
import { readDraft, keepDraft, discardDraft, beginDraft } from '@/lib/recording-drafts';

export function AudioRecorder({ onSave, onDirty, draftId, draftContext, disabled = false }: { onSave: (blob: Blob) => Promise<void>; onDirty: (dirty: boolean) => void; draftId: string; draftContext: { title: string; sourceId?: string; issueId?: string }; disabled?: boolean }) {
  const [recording, setRecording] = useState(false), [asking, setAsking] = useState(false), [seconds, setSeconds] = useState(0), [blob, setBlob] = useState<Blob | null>(null), [url, setUrl] = useState(''), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const recorder = useRef<MediaRecorder | null>(null), stream = useRef<MediaStream | null>(null), started = useRef(0), mounted = useRef(true);
  useEffect(() => { const draft = readDraft(draftId); if (draft) { setBlob(draft.blob); setSeconds(draft.seconds); } }, [draftId]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (recorder.current?.state === 'recording') recorder.current.stop(); stream.current?.getTracks().forEach(t => t.stop()); }; }, []);
  useEffect(() => { onDirty(asking || recording || saving || !!blob); return () => onDirty(false); }, [asking, recording, saving, blob, onDirty]);
  useEffect(() => { if (!blob) { setUrl(''); return; } const u = URL.createObjectURL(blob); setUrl(u); return () => URL.revokeObjectURL(u); }, [blob]);
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => { const s = (Date.now() - started.current) / 1000; setSeconds(s); if (s >= 600 && recorder.current?.state === 'recording') recorder.current.stop(); }, 200);
    return () => clearInterval(timer);
  }, [recording]);
  async function start() {
    setError(''); setAsking(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('当前浏览器不支持录音，请使用新版Chrome或Safari，并通过本机地址或HTTPS访问');
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      if (!mounted.current) { s.getTracks().forEach(t => t.stop()); return; }
      stream.current = s;
      const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(v => MediaRecorder.isTypeSupported(v));
      const r = new MediaRecorder(s, mime ? { mimeType: mime } : undefined); recorder.current = r;
      const ticket = beginDraft(draftId);
      const chunks: Blob[] = [];
      r.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      r.onerror = () => { if (mounted.current) { setError('录音中断，请检查麦克风后重新录制'); setRecording(false); } s.getTracks().forEach(t => t.stop()); };
      r.onstop = () => { s.getTracks().forEach(t => t.stop()); const b = new Blob(chunks, { type: r.mimeType }); if (b.size) keepDraft(draftId, { blob: b, seconds: (Date.now() - started.current) / 1000, ...draftContext }, ticket); if (!mounted.current) return; setRecording(false); if (b.size) setBlob(b); else setError('没有录到有效声音，请检查麦克风后重试'); };
      setBlob(null); setSeconds(0); started.current = Date.now(); r.start(500); setRecording(true);
    } catch (e) { stream.current?.getTracks().forEach(t => t.stop()); setError((e as Error).name === 'NotAllowedError' ? '麦克风权限未开启，请在浏览器地址栏允许麦克风后重试' : (e as Error).name === 'NotFoundError' ? '没有找到麦克风，请连接设备后重试' : (e as Error).message); }
    finally { setAsking(false); }
  }
  return <section className="recorder" aria-label="录音区域"><div className="record-stage"><span className="record-timer">{durationLabel(seconds)}</span><button className={`record-control ${recording ? 'is-recording' : ''}`} aria-label={recording ? '结束录音' : '开始录音'} disabled={asking || saving || disabled} onClick={() => recording ? recorder.current?.stop() : void start()}>{recording ? <span className="stop-symbol" /> : <Mic size={30} />}</button><p className="record-caption">{recording ? '正在录音' : asking ? '正在请求麦克风权限…' : blob ? '先听一遍，再交给AI分析' : '准备好了，就说一遍'}</p></div>
    {url && <audio aria-label="待保存的录音" controls src={url} preload="metadata" />}
    {error && <p role="alert" className="error-message">{error}</p>}
    {blob && <div className="button-row"><button className="button quiet" disabled={saving || disabled} onClick={start}>重新录制</button><button className="button primary" disabled={saving || disabled} aria-busy={saving} onClick={async () => { setSaving(true); setError(''); try { await onSave(blob); discardDraft(draftId); setBlob(null); setSeconds(0); } catch (e) { setError((e as Error).message); } finally { setSaving(false); } }}>{saving ? '正在保存…' : '保存并分析'}</button></div>}
    <p className="record-note">单次最长10分钟，文件不超过50MB。保存后将发送至阿里云千问进行转写和分析。</p>
  </section>;
}
