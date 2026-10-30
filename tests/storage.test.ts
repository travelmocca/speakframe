import { expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveAudio, modelAudio } from '../src/lib/storage';
import { DATA_DIR } from '../src/lib/config';

it('rejects a truncated M4A with a valid duration header but no audio packets', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'broken-m4a-'));
  try {
    const path = join(dir, 'full.m4a');
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:a', 'aac', '-movflags', '+faststart', path]);
    const b = readFileSync(path); const mdat = b.indexOf(Buffer.from('mdat'));
    expect(mdat).toBeGreaterThan(0);
    const fake = new File([b.subarray(0, mdat + 4)], 'broken.m4a', { type: 'audio/mp4' });
    await expect(saveAudio(fake)).rejects.toThrow();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
it('validates real audio and encodes model input below the API base64 size limit', async () => {
  const b = readFileSync('outputs/omni-audio-samples/audio/01.wav');
  const saved = await saveAudio(new File([b], 'good.wav', { type: 'audio/wav' }));
  try {
    const audio = await modelAudio(saved.filename);
    expect(audio.format).toBe('mp3');
    expect(audio.bytes.length).toBeGreaterThan(1000);
    expect(audio.bytes.toString('base64').length).toBeLessThan(10_000_000);
    expect(saved.duration).toBeGreaterThan(9);
  } finally { rmSync(join(DATA_DIR, 'audio', saved.filename), { force: true }); }
});
it('supports the full ten minute limit without exceeding the provider base64 limit', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ten-minute-audio-'));
  let saved: Awaited<ReturnType<typeof saveAudio>> | undefined;
  try {
    const path = join(dir, 'ten.wav');
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=16000:cl=mono', '-t', '600', '-c:a', 'pcm_s16le', path]);
    saved = await saveAudio(new File([readFileSync(path)], 'ten.wav', { type: 'audio/wav' }));
    expect(saved.duration).toBe(600);
    const audio = await modelAudio(saved.filename);
    expect(audio.bytes.toString('base64').length).toBeLessThan(10_000_000);
    expect(audio.bytes.length).toBeGreaterThan(7_000_000);
  } finally { if (saved) rmSync(join(DATA_DIR, 'audio', saved.filename), { force: true }); rmSync(dir, { recursive: true, force: true }); }
}, 30000);
