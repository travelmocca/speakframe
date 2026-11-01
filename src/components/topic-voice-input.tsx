'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client';
import { Mic } from './app-shell';
import { RecordingWave } from './recording-wave';
import { ProcessingIndicator } from './processing-indicator';

export function TopicVoiceInput({ practiceId, disabled, onResult, onBusyChange, kind = 'topic' }: { kind?: 'topic' | 'reflection'; practiceId: string; disabled: boolean; onResult: (title: string) => Promise<void>; onBusyChange: (busy: boolean) => void }) {
  const reflection = kind === 'reflection', label = reflection ? '感悟' : '主题';
  const [phase, setPhase] = useState<'idle' | 'asking' | 'recording' | 'transcribing'>('idle');
  const [error, setError] = useState('');
  const stream = useRef<MediaStream | null>(null), recorder = useRef<MediaRecorder | null>(null), timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = useRef(true), run = useRef(0), controller = useRef<AbortController | null>(null);
  useEffect(() => { onBusyChange(phase !== 'idle'); }, [phase, onBusyChange]);
  useEffect(() => { active.current = true; return () => {
    active.current = false; run.current++; controller.current?.abort();
    if (timeout.current) clearTimeout(timeout.current);
    if (recorder.current?.state === 'recording') recorder.current.stop();
    stream.current?.getTracks().forEach(t => t.stop()); onBusyChange(false);
  }; }, [onBusyChange]);
  async function start() {
    const ticket = ++run.current; setError(''); setPhase('asking');
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('当前浏览器不支持语音输入，请使用新版Chrome并允许麦克风');
      const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (!active.current || ticket !== run.current) { s.getTracks().forEach(t => t.stop()); return; }
      stream.current = s;
      const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(x => MediaRecorder.isTypeSupported(x));
      const r = new MediaRecorder(s, mime ? { mimeType: mime } : undefined); recorder.current = r;
      const chunks: Blob[] = [];
      r.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      r.onerror = () => { run.current++; s.getTracks().forEach(t => t.stop()); if (active.current) { setPhase('idle'); setError(`${label}录音中断，请检查麦克风后重试`); } };
      r.onstop = async () => {
        if (timeout.current) clearTimeout(timeout.current); s.getTracks().forEach(t => t.stop());
        if (!active.current || ticket !== run.current) return;
        setPhase('transcribing'); controller.current = new AbortController();
        try {
          const blob = new Blob(chunks, { type: r.mimeType }); if (!blob.size) throw new Error(`没有录到${label}，请重新说一次`);
          const data = new FormData(); data.append('audio', blob, r.mimeType.includes('mp4') ? 'topic.m4a' : 'topic.webm');
          const result = await api<{ title?: string; text?: string }>(`/practices/${practiceId}/${reflection ? 'reflection-voice' : 'topic-voice'}`, { method: 'POST', body: data, signal: controller.current.signal });
          if (active.current && ticket === run.current) await onResult((reflection ? result.text : result.title) || '');
        } catch (e) { if (active.current && ticket === run.current) setError((e as Error).message); }
        finally { if (active.current && ticket === run.current) setPhase('idle'); }
      };
      r.start(250); setPhase('recording');
      timeout.current = setTimeout(() => { if (r.state === 'recording') r.stop(); }, reflection ? 119000 : 29000);
    } catch (e) {
      stream.current?.getTracks().forEach(t => t.stop());
      if (active.current && ticket === run.current) { setPhase('idle'); setError((e as Error).name === 'NotAllowedError' ? '麦克风权限未开启，请允许麦克风后重试' : (e as Error).message); }
    }
  }
  function cancel() { run.current++; if (timeout.current) clearTimeout(timeout.current); if (recorder.current?.state === 'recording') recorder.current.stop(); stream.current?.getTracks().forEach(t => t.stop()); setPhase('idle'); }
  return <div className="topic-voice" role="group" aria-label={`${label}语音输入`}><div className="topic-controls">
    {phase === 'recording' ? <><button type="button" className="button quiet" onClick={() => recorder.current?.stop()}>结束并转文字</button><button type="button" className="text-button" onClick={cancel}>取消语音输入</button></> : <button type="button" className="button quiet" disabled={disabled || phase !== 'idle'} onClick={start}>{phase === 'transcribing' ? <ProcessingIndicator>正在转文字…</ProcessingIndicator> : <><Mic size={18} />{phase === 'asking' ? '正在请求麦克风…' : `语音输入${label}`}</>}</button>}
  </div>{phase === 'recording' && <p className="small muted recording-status" role="status"><RecordingWave stream={stream.current} /><span>正在录{label}，最长{reflection ? '2分钟' : '30秒'}。</span></p>}{error && <p className="small error-message" role="alert">{error}</p>}</div>;
}
