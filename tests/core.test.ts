import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/lib/store';
import { parseAnalysis, parseComparison } from '../src/lib/analysis-schema';

const stores: Store[] = [];
const dirs: string[] = [];
function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'expression-test-')); dirs.push(dir);
  const db = new Store(dir); stores.push(db);
  const a = db.register('13800000001', 'test-password');
  const b = db.register('13800000002', 'test-password');
  return { db, dir, a, b };
}
afterEach(() => { stores.splice(0).forEach(s => s.close()); dirs.splice(0).forEach(d => rmSync(d, { recursive: true, force: true })); });

describe('account and ownership', () => {
  it('hashes passwords, rejects duplicates and incorrect passwords', () => {
    const { db } = setup();
    expect(db.login('13800000001', 'wrong-password')).toBeNull();
    expect(db.login('13800000001', 'test-password')?.phone).toBe('13800000001');
    expect(() => db.register('13800000001', 'another-password')).toThrow();
    expect(JSON.stringify(db.getUser('13800000001'))).not.toContain('test-password');
  });
  it('expires and revokes sessions', () => {
    const { db, a } = setup();
    const token = db.createSession(a.id);
    expect(db.sessionUser(token)?.id).toBe(a.id);
    db.revokeSession(token); expect(db.sessionUser(token)).toBeNull();
    const expired = db.createSession(a.id, -1); expect(db.sessionUser(expired)).toBeNull();
  });
  it('prevents reading, changing or deleting another account practice', () => {
    const { db, a, b } = setup(); const p = db.createPractice(a.id);
    expect(() => db.practice(b.id, p.id)).toThrow();
    expect(() => db.updatePractice(b.id, p.id, 'new', 'goal')).toThrow();
    expect(() => db.deletePractice(b.id, p.id)).toThrow();
    expect(db.listPractices(b.id)).toHaveLength(0);
  });
});

describe('persistent analysis jobs', () => {
  it('reuses queued work and prevents deleted work from writing back', () => {
    const { db, a, dir } = setup(); const p = db.createPractice(a.id);
    db.updatePractice(a.id, p.id, '上线计划', '讲清楚建议');
    writeFileSync(join(dir, 'audio', 'fixture.wav'), 'fixture');
    const attempt = db.addAttempt(a.id, p.id, { filename: 'fixture.wav', mime: 'audio/wav', duration: 10 });
    const job = db.requestAnalysis(a.id, attempt.id);
    expect(db.requestAnalysis(a.id, attempt.id).id).toBe(job.id);
    expect(db.claimJob()?.id).toBe(job.id);
    db.deletePractice(a.id, p.id);
    expect(existsSync(join(dir, 'audio', 'fixture.wav'))).toBe(false);
    expect(db.completeJob(job.id, { transcript: '已删除' })).toBe(false);
    expect(() => db.practice(a.id, p.id)).toThrow();
  });
  it('keeps failed audio and allows explicit retry', () => {
    const { db, a } = setup(); const p = db.createPractice(a.id);
    db.updatePractice(a.id, p.id, '主题', '目标');
    const attempt = db.addAttempt(a.id, p.id, { filename: 'kept.wav', mime: 'audio/wav', duration: 2 });
    const job = db.requestAnalysis(a.id, attempt.id); db.claimJob(); db.failJob(job.id, '模型暂时不可用');
    expect(db.attempt(a.id, attempt.id).filename).toBe('kept.wav');
    expect(db.attempt(a.id, attempt.id).status).toBe('failed');
    expect(db.requestAnalysis(a.id, attempt.id).id).not.toBe(job.id);
  });
  it('rejects cross-user audio and invalid retry links', () => {
    const { db, a, b } = setup(); const p = db.createPractice(a.id);
    const at = db.addAttempt(a.id, p.id, { filename: 'a.wav', mime: 'audio/wav', duration: 2 });
    expect(() => db.attempt(b.id, at.id)).toThrow();
    expect(() => db.requestAnalysis(b.id, at.id)).toThrow();
    expect(() => db.addAttempt(a.id, p.id, { filename: 'b.wav', mime: 'audio/wav', duration: 2 }, at.id, 'fake-issue')).toThrow();
  });
  it('recovers expired running jobs as explicit retry without losing their recording', () => {
    const { db, a } = setup(); const p = db.createPractice(a.id); db.updatePractice(a.id, p.id, '主题', '目标');
    const at = db.addAttempt(a.id, p.id, { filename: 'retained.wav', mime: 'audio/wav', duration: 2 });
    const job = db.requestAnalysis(a.id, at.id); db.claimJob();
    db.db.prepare('UPDATE jobs SET leaseUntil=? WHERE id=?').run(Date.now() - 1, job.id);
    expect(db.claimJob()).toBeNull();
    expect(db.attempt(a.id, at.id).status).toBe('failed');
    expect(db.attempt(a.id, at.id).filename).toBe('retained.wav');
    expect(db.requestAnalysis(a.id, at.id).id).not.toBe(job.id);
  });
  it('persists sessions, audio links and results after closing and reopening the database', () => {
    const { db, a, dir } = setup(); const token = db.createSession(a.id);
    const p = db.createPractice(a.id); db.updatePractice(a.id, p.id, '重启验证', '验证持久化');
    const at = db.addAttempt(a.id, p.id, { filename: 'retained.wav', mime: 'audio/wav', duration: 2 });
    const job = db.requestAnalysis(a.id, at.id); db.claimJob(); db.completeJob(job.id, { transcript: '嗯，我建议先确认需求。', issues: [], dimensions: [], uncertainty: '' });
    db.close(); stores.splice(stores.indexOf(db), 1);
    const reopened = new Store(dir); stores.push(reopened);
    expect(reopened.sessionUser(token)?.id).toBe(a.id);
    expect(reopened.practice(a.id, p.id).attempts[0].transcript).toBe('嗯，我建议先确认需求。');
    expect(reopened.requestAnalysis(a.id, at.id).id).toBe(job.id);
    expect(reopened.claimJob()).toBeNull();
  });
  it('links a retry to the actual source issue and deduplicates comparisons', () => {
    const { db, a, b } = setup(); const p = db.createPractice(a.id); db.updatePractice(a.id, p.id, '重练', '减少重复');
    const first = db.addAttempt(a.id, p.id, { filename: 'first.wav', mime: 'audio/wav', duration: 2 });
    const issue = { id: 'real-issue', dimension: '衔接与恢复', evidence: '然后，然后', impact: '重复', suggestion: '保留一次', evidenceVerified: true };
    let job = db.requestAnalysis(a.id, first.id); db.claimJob(); db.completeJob(job.id, { transcript: '然后，然后，检查数据。', issues: [issue], dimensions: [], uncertainty: '' });
    const second = db.addAttempt(a.id, p.id, { filename: 'second.wav', mime: 'audio/wav', duration: 2 }, first.id, issue.id);
    expect(second.target?.suggestion).toBe('保留一次'); expect(second.sourceId).toBe(first.id);
    expect(() => db.requestComparison(a.id, second.id)).toThrow();
    job = db.requestAnalysis(a.id, second.id); db.claimJob(); db.completeJob(job.id, { transcript: '检查数据。', issues: [], dimensions: [], uncertainty: '' });
    const c = db.requestComparison(a.id, second.id);
    expect(db.requestComparison(a.id, second.id).id).toBe(c.id);
    expect(() => db.requestComparison(b.id, second.id)).toThrow();
    expect(db.claimJob()?.targetId).toBe(c.id);
  });
});

describe('model trust boundaries', () => {
  const dimensions = ['抓重点', '排顺序', '展开内容', '衔接与恢复', '口头禅与语气垫词'].map(name => ({ name, finding: '观察结果' }));
  it('accepts no issues without inventing a problem', () => {
    expect(parseAnalysis(JSON.stringify({ transcript: '观点清楚。', dimensions, issues: [], uncertainty: '' })).issues).toEqual([]);
  });
  it('rejects malformed JSON and unsupported dimensions', () => {
    expect(() => parseAnalysis('{oops')).toThrow();
    expect(() => parseAnalysis(JSON.stringify({ transcript: '嗯', dimensions, issues: [{ dimension: '人格', evidence: '嗯', impact: '影响', suggestion: '动作' }], uncertainty: '' }))).toThrow();
  });
  it('marks unverified quotes and ignores model-generated timestamps', () => {
    const r = parseAnalysis(JSON.stringify({ transcript: '嗯，我认为需要测试。', dimensions, issues: [{ dimension: '口头禅与语气垫词', evidence: '原音没有的句子', impact: '影响', suggestion: '减少重复', start_s: 99 }], uncertainty: '' }));
    expect(r.issues[0].evidenceVerified).toBe(false);
    expect(r.issues[0]).not.toHaveProperty('start_s');
  });
  it('accepts the observed model finding alias but still verifies its quote', () => {
    const r = parseAnalysis(JSON.stringify({ transcript: '然后，然后，先检查数据。', dimensions, issues: [{ dimension: '口头禅与语气垫词', finding: '然后，然后', impact: '重复', suggestion: '保留一次' }], uncertainty: '' }));
    expect(r.issues[0].evidence).toBe('然后，然后'); expect(r.issues[0].evidenceVerified).toBe(true);
  });
  it('validates a comparison and rejects a forced numeric score', () => {
    expect(parseComparison(JSON.stringify({ verdict: '无法判断', summary: '两次内容不同', beforeEvidence: '', afterEvidence: '', remaining: '', uncertainty: '证据不足' })).verdict).toBe('无法判断');
    expect(() => parseComparison('{"score":99}')).toThrow();
  });
  it('marks invented comparison quotes instead of presenting them as verified original words', () => {
    const value = { verdict: '有改善', summary: '减少重复', beforeEvidence: '并没有说过', afterEvidence: '也没有说过', remaining: '', uncertainty: '' };
    const result = parseComparison(JSON.stringify(value), '嗯，我建议先检查数据。', '我建议先检查数据。');
    expect(result.beforeEvidenceVerified).toBe(false);
    expect(result.afterEvidenceVerified).toBe(false);
    expect(result.verdict).toBe('无法判断');
  });
});
