import { request } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const origin = 'http://127.0.0.1:3118';
const statePath = 'var/qa-session.json', infoPath = 'var/qa-practice.json';
mkdirSync('outputs/uat', { recursive: true });
const verify = process.argv.includes('--verify');
const api = await request.newContext({ baseURL: origin, extraHTTPHeaders: { Origin: origin }, ...(verify ? { storageState: statePath } : {}) });
async function json(response) { if (!response.ok()) throw new Error(`HTTP ${response.status()}: ${await response.text()}`); return response.json(); }
async function settle(id, check) {
  const end = Date.now() + 180000;
  while (Date.now() < end) { const { practice } = await json(await api.get(`/api/practices/${id}`)); if (check(practice)) return practice; if (practice.attempts.some(a => a.status === 'failed') || practice.comparisons.some(c => c.status === 'failed')) throw new Error('Model job failed during persistence verification'); await new Promise(r => setTimeout(r, 1000)); }
  throw new Error('Model job timeout');
}
if (!verify) {
  const phone = '132' + Date.now().toString().slice(-8);
  await json(await api.post('/api/auth/register', { data: { phone, password: 'Persistence-test-2026' } }));
  const { practice } = await json(await api.post('/api/practices'));
  await json(await api.patch(`/api/practices/${practice.id}`, { data: { title: '服务重启验收：减少重复连接词', goal: '围绕一个问题表达，减少反复使用然后。' } }));
  async function upload(file, source) {
    const { attempt } = await json(await api.post(`/api/practices/${practice.id}/attempts`, { multipart: { audio: { name: 'sample.wav', mimeType: 'audio/wav', buffer: readFileSync(file) }, ...(source || {}) } }));
    await json(await api.post(`/api/attempts/${attempt.id}/analyze`));
    return attempt;
  }
  await upload('outputs/omni-audio-samples/audio/05.wav');
  let ready = await settle(practice.id, p => p.attempts[0]?.status === 'done');
  const issue = ready.attempts[0].analysis.issues[0]; if (!issue) throw new Error('Expected an actual repetition issue in fixture05');
  const second = await upload('outputs/omni-audio-samples/audio/01.wav', { sourceId: ready.attempts[0].id, issueId: issue.id });
  await settle(practice.id, p => p.attempts[1]?.status === 'done');
  await json(await api.post('/api/comparisons', { data: { attemptId: second.id } }));
  ready = await settle(practice.id, p => p.comparisons[0]?.status === 'done');
  await api.storageState({ path: statePath });
  const info = { id: practice.id, secondId: second.id, title: ready.title, transcripts: ready.attempts.map(a => a.transcript), comparison: ready.comparisons[0].result };
  writeFileSync(infoPath, JSON.stringify(info, null, 2), { mode: 0o600 });
  writeFileSync('outputs/uat/restart-before.json', JSON.stringify({ testedAt: new Date().toISOString(), practiceId: practice.id, attempts: 2, comparison: true, model: 'qwen3.8-omni-flash' }, null, 2));
  console.log('Seed ready: two real audio analyses and a comparison persisted; private session stored under ignored var/.');
} else {
  if (!existsSync(infoPath)) throw new Error('Run seed first');
  const expected = JSON.parse(readFileSync(infoPath));
  const { practice } = await json(await api.get(`/api/practices/${expected.id}`));
  if (JSON.stringify(practice.attempts.map(a => a.transcript)) !== JSON.stringify(expected.transcripts)) throw new Error('Transcripts changed after restart');
  if (JSON.stringify(practice.comparisons[0].result) !== JSON.stringify(expected.comparison)) throw new Error('Comparison changed after restart');
  for (const at of practice.attempts) { const r = await api.get(at.audioUrl); if (!r.ok() || (await r.body()).length < 1000) throw new Error('Audio missing after restart'); }
  writeFileSync('outputs/uat/restart-after.json', JSON.stringify({ testedAt: new Date().toISOString(), practiceId: expected.id, sessionSurvived: true, transcriptsIdentical: true, comparisonIdentical: true, originalAudioReadable: true }, null, 2));
  console.log('PASS: session, two original recordings, transcripts and comparison survived server + worker restart.');
}
await api.dispose();
