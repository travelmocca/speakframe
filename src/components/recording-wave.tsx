'use client';
import { useEffect, useRef } from 'react';

export function RecordingWave({ stream }: { stream: MediaStream | null }) {
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!stream) return;
    let context: AudioContext | undefined, frame = 0;
    try {
      context = new AudioContext();
      const source = context.createMediaStreamSource(stream), analyser = context.createAnalyser();
      analyser.fftSize = 1024; source.connect(analyser);
      const samples = new Float32Array(analyser.fftSize), bars = Array.from(root.current?.children || []) as HTMLElement[];
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
      const draw = () => {
        analyser.getFloatTimeDomainData(samples);
        bars.forEach((bar, index) => {
          const start = Math.floor(index * samples.length / bars.length), end = Math.floor((index + 1) * samples.length / bars.length);
          let energy = 0; for (let i = start; i < end; i++) energy += samples[i] * samples[i];
          const level = Math.max(0.15, Math.min(1, Math.sqrt(energy / (end - start)) * 8));
          bar.style.transform = `scaleY(${reduced.matches ? 0.4 : level})`;
        });
        frame = requestAnimationFrame(draw);
      };
      void context.resume().catch(() => {}); draw();
    } catch { /* Recording can continue when audio visualization is unavailable. */ }
    return () => { cancelAnimationFrame(frame); if (context) void context.close().catch(() => {}); };
  }, [stream]);
  return <span ref={root} className="recording-wave" role="img" aria-label="实时录音音量"><i /><i /><i /><i /><i /><i /><i /></span>;
}
