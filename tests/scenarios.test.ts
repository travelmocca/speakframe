import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/lib/store';
import { SCENARIOS } from '../src/lib/scenarios';
import { analysisPrompt } from '../src/lib/qwen';
const dirs: string[] = [], stores: Store[] = [];
afterEach(() => { stores.forEach(s => s.close()); stores.length = 0; dirs.forEach(d => rmSync(d, { recursive: true, force: true })); dirs.length = 0; });
function setup() { const dir = mkdtempSync(join(tmpdir(), 'scene-test-')); dirs.push(dir); const db = new Store(dir); stores.push(db); const user = db.register('13800000001', 'test-password'); return { db, user, dir }; }
it('persists each of the six scenarios and rejects unknown scenarios', () => {
  const { db, user } = setup();
  for (const scene of SCENARIOS) {
    const p = db.createPractice(user.id, scene.id);
    expect(db.practice(user.id, p.id).scenario).toBe(scene.id);
  }
  expect(() => db.createPractice(user.id, 'invalid')).toThrow('场景');
});
it('adds the chosen framework to analysis while retaining evidence-based five-dimension feedback', () => {
  const prompt = analysisPrompt('我的一次失败经历', 'experience');
  expect(prompt).toContain('讲经历、复盘成果'); expect(prompt).toContain('行动'); expect(prompt).toContain('失败');
  expect(prompt).not.toContain('客户临时提前验收');
  expect(prompt).toContain('不强制'); expect(prompt).toContain('口头禅与语气垫词');
  expect(analysisPrompt('旧练习')).not.toContain('表达场景：');
});
it('migrates an existing database without changing existing recordings or assigning an invented scenario', () => {
  const { db, user, dir } = setup(); const p = db.createPractice(user.id);
  db.updatePractice(user.id, p.id, '已有主题');
  const at = db.addAttempt(user.id, p.id, { filename: 'kept.wav', mime: 'audio/wav', duration: 2 });
  db.db.exec('ALTER TABLE practices DROP COLUMN scenario');
  db.close(); stores.splice(stores.indexOf(db), 1);
  const reopened = new Store(dir); stores.push(reopened);
  const kept = reopened.practice(user.id, p.id);
  expect(kept.scenario).toBe(''); expect(kept.title).toBe('已有主题'); expect(kept.attempts[0].id).toBe(at.id);
  expect(reopened.createPractice(user.id, 'update').scenario).toBe('update');
});
