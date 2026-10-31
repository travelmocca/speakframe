import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { readFile, rm, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { z } from 'zod';
import { DATA_DIR, MAX_BYTES, MODEL, store } from '@/lib/config';
import { AppError, type Attempt } from '@/lib/store';
import { saveAudio, modelAudio } from '@/lib/storage';
import { qwen } from '@/lib/qwen';
import { TOPIC_PROMPT, parseTopic } from '@/lib/topic';
import { verifyOrigin } from '@/lib/http-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const credentials = z.object({ phone: z.string().regex(/^1[3-9]\d{9}$/), password: z.string().min(8).max(128) });
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
async function limitedBody(req: Request, max: number) {
  if (Number(req.headers.get('content-length')) > max) throw new AppError('提交内容过大', 413);
  const reader = req.body?.getReader(); if (!reader) return new Uint8Array();
  const parts: Uint8Array[] = []; let size = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > max) { await reader.cancel(); throw new AppError('提交内容过大', 413); } parts.push(value); }
  return new Uint8Array(Buffer.concat(parts));
}
async function body(req: Request) { try { return JSON.parse(new TextDecoder().decode(await limitedBody(req, 16000))); } catch (e) { if (e instanceof AppError) throw e; throw new AppError('请求内容无法读取'); } }
function visibleAttempt(a: Attempt) {
  return { id: a.id, practiceId: a.practiceId, sequence: a.sequence, duration: a.duration, sourceId: a.sourceId, target: a.target, status: a.status, transcript: a.transcript, analysis: a.analysis, error: a.error, createdAt: a.createdAt, audioUrl: `/api/attempts/${a.id}/audio` };
}

async function route(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const { path } = await params; const method = req.method; const db = store();
    verifyOrigin(req);
    if (path[0] === 'health' && method === 'GET') return json({ ok: true });
    const jar = await cookies(); const token = jar.get('expression_session')?.value || '';
    if (path[0] === 'auth' && ['register', 'login'].includes(path[1]) && method === 'POST') {
      const { phone, password } = credentials.parse(await body(req));
      db.limit(`auth:${path[1]}:${phone}`); db.limit(`auth-source:${req.headers.get('x-forwarded-for')?.split(',')[0] || 'local'}`, 80);
      const user = path[1] === 'register' ? db.register(phone, password) : db.login(phone, password);
      if (!user) throw new AppError('手机号或密码不正确', 401);
      const session = db.createSession(user.id);
      jar.set('expression_session', session, { httpOnly: true, sameSite: 'lax', secure: new URL(req.url).protocol === 'https:', path: '/', maxAge: 30 * 86400 });
      return json({ user });
    }
    if (path[0] === 'auth' && path[1] === 'logout' && method === 'POST') { db.revokeSession(token); jar.delete('expression_session'); return json({ ok: true }); }
    const user = db.sessionUser(token); if (!user) throw new AppError('请先登录', 401);
    if (path[0] === 'workspace' && path.length === 1 && method === 'GET') return json({ practices: db.listPractices(user.id), issues: db.workspaceIssues(user.id) });
    if (path[0] === 'me' && method === 'GET') return json({ user, model: MODEL, configured: Boolean(process.env.DASHSCOPE_API_KEY && process.env.DASHSCOPE_BASE_URL) });
    if (path[0] === 'practices' && path.length === 1) {
      if (method === 'GET') return json({ practices: db.listPractices(user.id) });
      if (method === 'POST') { db.limit(`create:${user.id}`, 60); return json({ practice: db.createPractice(user.id) }, 201); }
    }
    if (path[0] === 'practices' && path.length === 2) {
      const id = path[1];
      if (method === 'GET') {
        const p = db.practice(user.id, id);
        return json({ practice: { ...p, attempts: p.attempts.map(visibleAttempt), comparisons: p.comparisons.map(c => ({ id: c.id, sourceId: c.sourceId, attemptId: c.attemptId, target: c.target, status: c.status, result: c.result, error: c.error })) } });
      }
      if (method === 'PATCH') { const v = z.object({ title: z.string().max(120), goal: z.string().max(2000).optional() }).parse(await body(req)); db.updatePractice(user.id, id, v.title, v.goal); return json({ ok: true }); }
      if (method === 'DELETE') { db.deletePractice(user.id, id); return json({ ok: true }); }
    }
    if (path[0] === 'practices' && path[2] === 'attempts' && path.length === 3 && method === 'POST') {
      const p = db.owned(user.id, path[1]); if (!p.title) throw new AppError('请先填写并保存表达主题');
      const bytes = await limitedBody(req, MAX_BYTES + 1024 * 1024);
      const form = await new Response(bytes, { headers: { 'Content-Type': req.headers.get('content-type') || '' } }).formData();
      const file = form.get('audio'); if (!(file instanceof File)) throw new AppError('请选择有效录音');
      const saved = await saveAudio(file);
      try {
        const sourceId = String(form.get('sourceId') || ''), issueId = String(form.get('issueId') || '');
        const attempt = db.addAttempt(user.id, p.id, saved, sourceId || undefined, issueId || undefined);
        return json({ attempt: visibleAttempt(attempt) }, 201);
      } catch (e) { await rm(join(DATA_DIR, 'audio', saved.filename), { force: true }); throw e; }
    }
    if (path[0] === 'practices' && path[2] === 'topic-voice' && path.length === 3 && method === 'POST') {
      const p = db.practice(user.id, path[1]);
      if (p.attempts.length) throw new AppError('已有表达记录，主题不能再修改');
      db.limit(`topic-voice:${user.id}`, 60);
      const bytes = await limitedBody(req, 11 * 1024 * 1024);
      const form = await new Response(bytes, { headers: { 'Content-Type': req.headers.get('content-type') || '' } }).formData();
      const file = form.get('audio'); if (!(file instanceof File)) throw new AppError('请选择有效的主题语音');
      const saved = await saveAudio(file, { temporary: true, maxSeconds: 30, maxBytes: 10 * 1024 * 1024 });
      try {
        const reply = await qwen(TOPIC_PROMPT, await modelAudio(saved.filename, 'tmp'));
        db.owned(user.id, path[1]);
        return json({ title: parseTopic(reply.content) });
      } finally { await rm(join(DATA_DIR, 'tmp', saved.filename), { force: true }); }
    }
    if (path[0] === 'attempts' && path.length === 3) {
      const a = db.attempt(user.id, path[1]);
      if (path[2] === 'analyze' && method === 'POST') { db.limit(`analysis:${user.id}`, 120); return json({ job: db.requestAnalysis(user.id, a.id) }, 202); }
      if (path[2] === 'audio' && method === 'GET') {
        const file = join(DATA_DIR, 'audio', basename(a.filename));
        const size = (await stat(file)).size; const range = req.headers.get('range');
        const headers = { 'Content-Type': a.mime, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' };
        if (range) {
          const match = /^bytes=(\d*)-(\d*)$/.exec(range);
          if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
          const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
          const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
          if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
          const bytes = await readFile(file);
          return new Response(new Uint8Array(bytes.subarray(start, end + 1)), { status: 206, headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) } });
        }
        return new Response(new Uint8Array(await readFile(file)), { headers: { ...headers, 'Content-Length': String(size) } });
      }
    }
    if (path[0] === 'comparisons' && path.length === 1 && method === 'POST') {
      const v = z.object({ attemptId: z.string().uuid() }).parse(await body(req)); db.limit(`comparison:${user.id}`, 120);
      return json({ comparison: db.requestComparison(user.id, v.attemptId) }, 202);
    }
    if (path[0] === 'jobs' && path.length === 2 && method === 'GET') {
      const j = db.db.prepare('SELECT id,practiceId,state,error FROM jobs WHERE id=?').get(path[1]) as { practiceId: string } | undefined;
      if (!j) throw new AppError('任务不存在', 404); db.owned(user.id, j.practiceId); return json({ job: j });
    }
    throw new AppError('接口不存在', 404);
  } catch (e) {
    if (e instanceof AppError) return json({ error: e.message }, e.status);
    if (e instanceof z.ZodError) return json({ error: '输入格式不正确，请检查手机号、密码或提交内容' }, 400);
    console.error('API operation failed:', e instanceof Error ? e.name : 'unknown');
    return json({ error: '操作未完成，请重试；已保存的录音不会丢失' }, 500);
  }
}
export { route as GET, route as POST, route as PATCH, route as DELETE };
