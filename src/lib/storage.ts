import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { DATA_DIR, MAX_BYTES, MAX_SECONDS } from './config';
import { AppError } from './store';
const exec = promisify(execFile);
export async function saveAudio(file: File, options: { temporary?: boolean; maxSeconds?: number; maxBytes?: number } = {}) {
  const maxSeconds = options.maxSeconds ?? MAX_SECONDS, maxBytes = options.maxBytes ?? MAX_BYTES;
  if (!file.size || file.size > maxBytes) throw new AppError(`录音不能为空，且不能超过${Math.floor(maxBytes / 1024 / 1024)}MB`);
  const bytes = Buffer.from(await file.arrayBuffer());
  const filename = `${randomUUID()}.audio`, path = join(DATA_DIR, options.temporary ? 'tmp' : 'audio', filename);
  await mkdir(join(DATA_DIR, 'audio'), { recursive: true });
  await mkdir(join(DATA_DIR, 'tmp'), { recursive: true });
  const decoded = join(DATA_DIR, 'tmp', `${randomUUID()}.pcm`);
  await writeFile(path, bytes, { mode: 0o600 });
  try {
    const { stdout } = await exec('ffprobe', ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_entries', 'format=duration:stream=codec_type,codec_name', '-of', 'json', path], { timeout: 15_000 });
    const meta = JSON.parse(stdout);
    if (!meta.streams?.some((s: { codec_type: string }) => s.codec_type === 'audio') || meta.streams.some((s: { codec_type: string }) => s.codec_type === 'video')) throw new Error('invalid streams');
    // Decode all inputs: duration headers can survive even when every audio packet is missing.
    await exec('ffmpeg', ['-v', 'error', '-nostdin', '-xerror', '-protocol_whitelist', 'file,pipe', '-i', path, '-t', String(maxSeconds + 1), '-ac', '1', '-ar', '16000', '-f', 's16le', decoded], { timeout: 60_000, maxBuffer: 1024 * 1024 });
    const duration = (await stat(decoded)).size / 32000;
    if (!Number.isFinite(duration) || duration < 0.3) throw new AppError('录音过短或无法读取，请重新录制');
    if (duration > maxSeconds) throw new AppError(maxSeconds === 30 ? '主题语音最长30秒，请简短描述' : maxSeconds === 120 ? '感悟语音最长2分钟' : '单次录音不能超过10分钟');
    const code = meta.streams.find((s: { codec_type: string }) => s.codec_type === 'audio')?.codec_name;
    const mime = code === 'opus' || code === 'vorbis' ? 'audio/webm' : code === 'aac' ? 'audio/mp4' : code?.startsWith('pcm') ? 'audio/wav' : code === 'mp3' ? 'audio/mpeg' : file.type.split(';')[0] || 'application/octet-stream';
    return { filename, mime, duration };
  } catch (e) { await rm(path, { force: true }); if (e instanceof AppError) throw e; throw new AppError('无法读取这段录音，请使用浏览器重新录制有效音频'); }
  finally { await rm(decoded, { force: true }); }
}
export async function modelAudio(filename: string, source: 'audio' | 'tmp' = 'audio') {
  const tmpDir = join(DATA_DIR, 'tmp'); await mkdir(tmpDir, { recursive: true });
  const output = join(tmpDir, `${randomUUID()}.mp3`);
  const input = source === 'tmp' ? join(DATA_DIR, 'tmp', basename(filename)) : join(DATA_DIR, 'audio', basename(filename));
  try {
    await exec('ffmpeg', ['-v', 'error', '-nostdin', '-y', '-protocol_whitelist', 'file,pipe', '-i', input, '-t', String(MAX_SECONDS), '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-b:a', '96k', output], { timeout: 60_000 });
    const bytes = await readFile(output);
    if (bytes.toString('base64').length >= 10_000_000) throw new AppError('音频编码超出模型输入限制，请缩短后重试');
    return { bytes, format: 'mp3' as const };
  } finally { await rm(output, { force: true }); }
}
