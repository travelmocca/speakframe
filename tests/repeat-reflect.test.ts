import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../src/lib/store';
import { parseComparison } from '../src/lib/analysis-schema';
import { DIMENSIONS } from '../src/lib/dimensions';
const dirs: string[] = [], stores: Store[] = [];
afterEach(() => { stores.splice(0).forEach(s => s.close()); dirs.splice(0).forEach(d => rmSync(d, { recursive: true, force: true })); });
function setup() { const dir = mkdtempSync(join(tmpdir(), 'repeat-')); dirs.push(dir); const db = new Store(dir); stores.push(db); const a = db.register('13800000001', 'test-password'), b = db.register('13800000002', 'test-password'); const p = db.createPractice(a.id, 'opinion'); db.updatePractice(a.id, p.id, '检查数据'); return { db, a, b, p }; }
const analysis = { transcript: '然后，然后，检查数据。', issues: [], dimensions: [], uncertainty: '' };
it('links three rounds to the immediate predecessor and automatically schedules each comparison once', () => {
  const { db, a, p } = setup();
  const first = db.addAttempt(a.id, p.id, { filename: '1.wav', mime: 'audio/wav', duration: 2 });
  expect(() => db.addAttempt(a.id, p.id, { filename: 'too-soon.wav', mime: 'audio/wav', duration: 2 })).toThrow();
  let job = db.requestAnalysis(a.id, first.id); db.claimJob(); db.completeJob(job.id, analysis);
  expect(db.practice(a.id, p.id).comparisons).toHaveLength(0);
  const second = db.addAttempt(a.id, p.id, { filename: '2.wav', mime: 'audio/wav', duration: 2 });
  expect(second.sourceId).toBe(first.id); expect(second.target).toBeNull();
  job = db.requestAnalysis(a.id, second.id); db.claimJob(); db.completeJob(job.id, analysis);
  let comparisons = db.practice(a.id, p.id).comparisons;
  expect(comparisons).toHaveLength(1); expect(db.requestComparison(a.id, second.id).id).toBe(comparisons[0].id);
  const comparisonJob = db.claimJob()!; db.completeJob(comparisonJob.id, { verdict: '无法判断' });
  expect(() => db.addAttempt(a.id, p.id, { filename: 'old.wav', mime: 'audio/wav', duration: 2 }, first.id)).toThrow();
  const third = db.addAttempt(a.id, p.id, { filename: '3.wav', mime: 'audio/wav', duration: 2 }); expect(third.sourceId).toBe(second.id);
  job = db.requestAnalysis(a.id, third.id); db.claimJob(); db.completeJob(job.id, analysis);
  comparisons = db.practice(a.id, p.id).comparisons; expect(comparisons).toHaveLength(2); expect(comparisons[1].sourceId).toBe(second.id);
});
it('appends private reflections, rejects blank/oversized content, and deletes them with the practice', () => {
  const { db, a, b, p } = setup();
  expect(() => db.addReflection(b.id, p.id, '越权')).toThrow();
  expect(() => db.addReflection(a.id, p.id, '  ')).toThrow(); expect(() => db.addReflection(a.id, p.id, '字'.repeat(4001))).toThrow();
  db.addReflection(a.id, p.id, '先说结论。'); db.addReflection(a.id, p.id, '  少重复，多给例子。 ');
  const notes = db.practice(a.id, p.id).reflections; expect(notes).toHaveLength(2); expect(notes.map(n => n.text)).toContain('少重复，多给例子。');
  db.deletePractice(a.id, p.id); expect(db.db.prepare('SELECT count(*) n FROM reflections WHERE practiceId=?').get(p.id)).toEqual({ n: 0 });
});
it('verifies each dimension before claiming improvement and keeps legacy comparisons readable', () => {
  const value = { verdict: '有改善', summary: '减少重复', beforeEvidence: '然后，然后', afterEvidence: '检查数据', remaining: '', uncertainty: '', changes: DIMENSIONS.map(dimension => ({ dimension, status: '有改善', beforeEvidence: '捏造的话', afterEvidence: '检查数据', explanation: '更清楚' })) };
  const result = parseComparison(JSON.stringify(value), '然后，然后，检查数据。', '检查数据。', true);
  expect(result.changes.every(c => c.status === '无法判断')).toBe(true); expect(result.verdict).not.toBe('有改善');
  expect(() => parseComparison(JSON.stringify({ ...value, changes: [] }), '原话', '原话', true)).toThrow();
  const { changes, ...legacy } = value; expect(parseComparison(JSON.stringify(legacy)).changes).toEqual([]);
});
