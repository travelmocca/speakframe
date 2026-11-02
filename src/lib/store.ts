import Database from 'better-sqlite3';
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { chmodSync, mkdirSync, rmSync } from 'node:fs';
import { join, basename } from 'node:path';
import type { Analysis, Issue, ComparisonResult } from './analysis-schema';
import { isDateKey, DAY_MS, type ActivityDay, type ActivityRecord } from './activity';
import { getScenario } from './scenarios';

export class AppError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export type WorkspaceIssue = { practiceId: string; title: string; attemptId: string; sequence: number; createdAt: number; issue: Issue };
export type User = { id: string; phone: string };
export type Attempt = {
  id: string; practiceId: string; sequence: number; filename: string; mime: string; duration: number;
  sourceId: string | null; target: Issue | null; status: string; transcript: string;
  analysis: Analysis | null; error: string; createdAt: number;
};
export type Comparison = { id: string; practiceId: string; attemptId: string; sourceId: string; target: Issue | Issue[]; status: string; result: ComparisonResult | null; error: string; createdAt: number };
export type Reflection = { id: string; practiceId: string; text: string; createdAt: number };
export type Job = { id: string; kind: 'analysis' | 'comparison'; targetId: string; practiceId: string; state: string; leaseUntil: number };
type PracticeRow = { id: string; userId: string; title: string; goal: string; scenario: string; status: string; createdAt: number; updatedAt: number };
type AttemptRow = Omit<Attempt, 'analysis' | 'target'> & { analysis: string | null; target: string | null };
type ComparisonRow = Omit<Comparison, 'result' | 'target'> & { result: string | null; target: string };
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
function passwordHash(password: string) { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`; }
function checkPassword(password: string, value: string) {
  const [salt, key] = value.split(':'); return timingSafeEqual(Buffer.from(key, 'hex'), scryptSync(password, salt, 64));
}
const asAttempt = (r: AttemptRow): Attempt => ({ ...r, analysis: r.analysis ? JSON.parse(r.analysis) : null, target: r.target ? JSON.parse(r.target) : null });
const asComparison = (r: ComparisonRow): Comparison => ({ ...r, result: r.result ? JSON.parse(r.result) : null, target: JSON.parse(r.target) });

export class Store {
  db: Database.Database;
  constructor(public dir: string) {
    mkdirSync(join(dir, 'audio'), { recursive: true, mode: 0o700 }); chmodSync(dir, 0o700);
    this.db = new Database(join(dir, 'app.sqlite'));
    chmodSync(join(dir, 'app.sqlite'), 0o600);
    this.db.pragma('journal_mode = WAL'); this.db.pragma('foreign_keys = ON'); this.db.pragma('busy_timeout = 5000');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, phone TEXT NOT NULL UNIQUE, passwordHash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS practices (id TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL DEFAULT '', goal TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active', createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY, practiceId TEXT NOT NULL REFERENCES practices(id) ON DELETE CASCADE, sequence INTEGER NOT NULL, filename TEXT NOT NULL, mime TEXT NOT NULL, duration REAL NOT NULL, sourceId TEXT, target TEXT, status TEXT NOT NULL DEFAULT 'saved', transcript TEXT NOT NULL DEFAULT '', analysis TEXT, rawResponse TEXT, error TEXT NOT NULL DEFAULT '', createdAt INTEGER NOT NULL, UNIQUE(practiceId,sequence));
      CREATE TABLE IF NOT EXISTS comparisons (id TEXT PRIMARY KEY, practiceId TEXT NOT NULL REFERENCES practices(id) ON DELETE CASCADE, attemptId TEXT NOT NULL, sourceId TEXT NOT NULL, target TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', result TEXT, rawResponse TEXT, error TEXT NOT NULL DEFAULT '', createdAt INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS reflections (id TEXT PRIMARY KEY, practiceId TEXT NOT NULL REFERENCES practices(id) ON DELETE CASCADE, text TEXT NOT NULL, createdAt INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, kind TEXT NOT NULL, targetId TEXT NOT NULL, practiceId TEXT NOT NULL REFERENCES practices(id) ON DELETE CASCADE, state TEXT NOT NULL DEFAULT 'queued', leaseUntil INTEGER NOT NULL DEFAULT 0, error TEXT NOT NULL DEFAULT '', createdAt INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS practice_owner ON practices(userId,updatedAt);
      CREATE INDEX IF NOT EXISTS job_queue ON jobs(state,createdAt);
      CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
    `);
    const columns = this.db.prepare('PRAGMA table_info(practices)').all() as { name: string }[];
    if (!columns.some(c => c.name === 'scenario')) this.db.exec("ALTER TABLE practices ADD COLUMN scenario TEXT NOT NULL DEFAULT ''");
  }
  close() { this.db.close(); }
  register(phone: string, password: string): User {
    if (!/^1[3-9]\d{9}$/.test(phone)) throw new AppError('请输入有效的11位手机号');
    if (password.length < 8 || password.length > 128) throw new AppError('密码需为8—128位');
    const user = { id: randomUUID(), phone };
    try { this.db.prepare('INSERT INTO users VALUES (?,?,?)').run(user.id, phone, passwordHash(password)); }
    catch (e) { if ((e as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') throw new AppError('这个手机号已注册，请直接登录', 409); throw e; }
    return user;
  }
  getUser(phone: string) { return this.db.prepare('SELECT id,phone FROM users WHERE phone=?').get(phone) as User | undefined; }
  login(phone: string, password: string): User | null {
    const row = this.db.prepare('SELECT * FROM users WHERE phone=?').get(phone) as (User & { passwordHash: string }) | undefined;
    // Equal work for unknown accounts avoids a fast account-existence probe.
    if (!row) { scryptSync(password, 'missing-account', 64); return null; }
    return checkPassword(password, row.passwordHash) ? { id: row.id, phone: row.phone } : null;
  }
  createSession(userId: string, ageMs = 30 * 86400_000) {
    this.db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
    const token = randomBytes(32).toString('hex');
    this.db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hash(token), userId, Date.now() + ageMs); return token;
  }
  sessionUser(token: string): User | null {
    return (this.db.prepare('SELECT u.id,u.phone FROM users u JOIN sessions s ON s.userId=u.id WHERE s.token=? AND s.expires>?').get(hash(token), Date.now()) as User) || null;
  }
  revokeSession(token: string) { this.db.prepare('DELETE FROM sessions WHERE token=?').run(hash(token)); }
  limit(key: string, max = 10) {
    this.db.transaction(() => {
      const now = Date.now(); this.db.prepare('DELETE FROM rate_limits WHERE expires<?').run(now);
      const r = this.db.prepare('SELECT count FROM rate_limits WHERE key=?').get(key) as { count: number } | undefined;
      if (r && r.count >= max) throw new AppError('尝试次数较多，请15分钟后重试', 429);
      this.db.prepare('INSERT INTO rate_limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(key, now + 900_000);
    })();
  }
  createPractice(userId: string, scenario = '') {
    if (scenario && !getScenario(scenario)) throw new AppError('请选择有效的表达场景');
    const id = randomUUID(), now = Date.now();
    this.db.prepare('INSERT INTO practices (id,userId,scenario,createdAt,updatedAt) VALUES (?,?,?,?,?)').run(id, userId, scenario, now, now); return this.practice(userId, id);
  }
  owned(userId: string, id: string): PracticeRow {
    const p = this.db.prepare("SELECT * FROM practices WHERE id=? AND userId=? AND status='active'").get(id, userId) as PracticeRow | undefined;
    if (!p) throw new AppError('练习不存在或无权访问', 404); return p;
  }
  practice(userId: string, id: string) {
    const p = this.owned(userId, id);
    return { ...p,
      reflections: this.db.prepare('SELECT * FROM reflections WHERE practiceId=? ORDER BY createdAt DESC,rowid DESC').all(id) as Reflection[],
      attempts: (this.db.prepare('SELECT * FROM attempts WHERE practiceId=? ORDER BY sequence').all(id) as AttemptRow[]).map(asAttempt),
      comparisons: (this.db.prepare('SELECT * FROM comparisons WHERE practiceId=? ORDER BY createdAt').all(id) as ComparisonRow[]).map(asComparison),
    };
  }
  listPractices(userId: string) {
    return this.db.prepare(`SELECT p.*, (SELECT count(*) FROM attempts WHERE practiceId=p.id) attemptCount,
      (SELECT status FROM attempts WHERE practiceId=p.id ORDER BY sequence DESC LIMIT 1) latestStatus,
      (SELECT count(*) FROM reflections WHERE practiceId=p.id) reflectionCount
      FROM practices p WHERE userId=? AND status='active' ORDER BY updatedAt DESC`).all(userId);
  }
  activityDays(userId: string, now = Date.now()): ActivityDay[] {
    const rows = this.db.prepare(`SELECT strftime('%Y-%m-%d',a.createdAt/1000,'unixepoch','+8 hours') date,count(*) count,group_concat(a.id, ',') ids
      FROM attempts a JOIN practices p ON p.id=a.practiceId
      WHERE p.userId=? AND p.status='active' AND a.createdAt<=? GROUP BY date ORDER BY date`).all(userId, now) as { date: string; count: number; ids: string }[];
    return rows.map(({ ids, ...day }) => ({ ...day, revision: hash(ids.split(',').sort().join(',')) }));
  }
  activityForDate(userId: string, date: string, now = Date.now()): ActivityRecord[] {
    if (!isDateKey(date)) throw new AppError('请选择有效日期');
    const start = Date.parse(date + 'T00:00:00+08:00');
    return this.db.prepare(`SELECT p.id practiceId,p.title,a.id attemptId,a.sequence,a.createdAt
      FROM attempts a JOIN practices p ON p.id=a.practiceId
      WHERE p.userId=? AND p.status='active' AND a.createdAt>=? AND a.createdAt<? ORDER BY a.createdAt DESC,a.id`).all(userId, start, Math.min(start + DAY_MS, now + 1)) as ActivityRecord[];
  }
  workspaceIssues(userId: string): WorkspaceIssue[] {
    const rows = this.db.prepare(`SELECT p.id practiceId,p.title,a.id attemptId,a.sequence,a.createdAt,a.analysis
      FROM practices p JOIN attempts a ON a.id=(SELECT id FROM attempts WHERE practiceId=p.id ORDER BY sequence DESC LIMIT 1)
      WHERE p.userId=? AND p.status='active' AND a.status='done' AND a.analysis IS NOT NULL
      ORDER BY a.createdAt DESC,a.id`).all(userId) as { practiceId: string; title: string; attemptId: string; sequence: number; createdAt: number; analysis: string }[];
    return rows.flatMap(({ analysis, ...row }) => (JSON.parse(analysis) as Analysis).issues.map(issue => ({ ...row, issue })));
  }
  updatePractice(userId: string, id: string, title: string, goal?: string) {
    const previous = this.owned(userId, id);
    const retainedGoal = goal ?? previous.goal;
    if (title.length > 120 || retainedGoal.length > 2000) throw new AppError('主题最多120字');
    if (this.db.prepare('SELECT id FROM attempts WHERE practiceId=? LIMIT 1').get(id)) throw new AppError('已有表达记录，请保留原练习目标；新内容请新建练习');
    this.db.prepare('UPDATE practices SET title=?,goal=?,updatedAt=? WHERE id=?').run(title.trim(), retainedGoal.trim(), Date.now(), id);
  }
  addReflection(userId: string, practiceId: string, text: string): Reflection {
    this.owned(userId, practiceId); const trimmed = text.trim();
    if (!trimmed || trimmed.length > 4000) throw new AppError('感悟需为1—4000字');
    const reflection = { id: randomUUID(), practiceId, text: trimmed, createdAt: Date.now() };
    this.db.prepare('INSERT INTO reflections (id,practiceId,text,createdAt) VALUES (?,?,?,?)').run(reflection.id, practiceId, trimmed, reflection.createdAt);
    this.db.prepare('UPDATE practices SET updatedAt=? WHERE id=?').run(reflection.createdAt, practiceId);
    return reflection;
  }
  attempt(userId: string, id: string): Attempt {
    const row = this.db.prepare('SELECT * FROM attempts WHERE id=?').get(id) as AttemptRow | undefined;
    if (!row) throw new AppError('录音不存在或无权访问', 404); this.owned(userId, row.practiceId); return asAttempt(row);
  }
  addAttempt(userId: string, practiceId: string, file: { filename: string; mime: string; duration: number }, sourceId?: string, issueId?: string) {
    return this.db.transaction(() => {
      this.owned(userId, practiceId);
      if (issueId) throw new AppError('重练已改为综合练习，无需选择单个问题');
      const previous = this.db.prepare('SELECT id,status FROM attempts WHERE practiceId=? ORDER BY sequence DESC LIMIT 1').get(practiceId) as { id: string; status: string } | undefined;
      if (previous && previous.status !== 'done') throw new AppError('请先完成上一轮分析，再开始下一轮练习');
      if (sourceId && sourceId !== previous?.id) throw new AppError('请从同一练习的最近一轮继续练习');
      const actualSourceId = previous?.id || null;
      const id = randomUUID();
      const seq = (this.db.prepare('SELECT coalesce(max(sequence),0)+1 n FROM attempts WHERE practiceId=?').get(practiceId) as { n: number }).n;
      this.db.prepare('INSERT INTO attempts (id,practiceId,sequence,filename,mime,duration,sourceId,target,createdAt) VALUES (?,?,?,?,?,?,?,?,?)').run(id, practiceId, seq, basename(file.filename), file.mime, file.duration, actualSourceId, null, Date.now());
      this.db.prepare('UPDATE practices SET updatedAt=? WHERE id=?').run(Date.now(), practiceId);
      return this.attempt(userId, id);
    })();
  }
  requestAnalysis(userId: string, id: string): Job {
    return this.db.transaction(() => {
      const a = this.attempt(userId, id); const p = this.owned(userId, a.practiceId);
      if (!p.title.trim()) throw new AppError('请先填写表达主题');
      const old = this.db.prepare("SELECT * FROM jobs WHERE targetId=? AND kind='analysis' AND state IN ('queued','running','done') ORDER BY createdAt DESC LIMIT 1").get(id) as Job | undefined;
      if (old) return old;
      const job = this.newJob('analysis', id, a.practiceId);
      this.db.prepare("UPDATE attempts SET status='queued',error='' WHERE id=?").run(id); return job;
    })();
  }
  newJob(kind: Job['kind'], targetId: string, practiceId: string): Job {
    const id = randomUUID(); this.db.prepare('INSERT INTO jobs (id,kind,targetId,practiceId,createdAt) VALUES (?,?,?,?,?)').run(id, kind, targetId, practiceId, Date.now());
    return this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id) as Job;
  }
  requestComparison(userId: string, attemptId: string) {
    return this.db.transaction(() => {
      const a = this.attempt(userId, attemptId);
      if (!a.sourceId || a.status !== 'done') throw new AppError('请先完成本轮重练分析');
      const source = this.attempt(userId, a.sourceId);
      if (source.status !== 'done') throw new AppError('来源表达尚未完成分析');
      const old = this.db.prepare("SELECT * FROM comparisons WHERE attemptId=? AND status IN ('queued','running','done') ORDER BY createdAt DESC LIMIT 1").get(attemptId) as ComparisonRow | undefined;
      if (old) return asComparison(old);
      const id = randomUUID();
      this.db.prepare('INSERT INTO comparisons (id,practiceId,attemptId,sourceId,target,createdAt) VALUES (?,?,?,?,?,?)').run(id, a.practiceId, a.id, a.sourceId, JSON.stringify(source.analysis?.issues || []), Date.now());
      this.newJob('comparison', id, a.practiceId);
      return asComparison(this.db.prepare('SELECT * FROM comparisons WHERE id=?').get(id) as ComparisonRow);
    })();
  }
  claimJob(): Job | null {
    return this.db.transaction(() => {
      const expired = this.db.prepare("SELECT id FROM jobs WHERE state='running' AND leaseUntil<?").all(Date.now()) as { id: string }[];
      for (const e of expired) this.failJob(e.id, '处理已中断，请手动重试；原始录音已保留');
      const job = this.db.prepare("SELECT j.* FROM jobs j JOIN practices p ON p.id=j.practiceId WHERE j.state='queued' AND p.status='active' ORDER BY j.createdAt LIMIT 1").get() as Job | undefined;
      if (!job) return null;
      this.db.prepare("UPDATE jobs SET state='running',leaseUntil=? WHERE id=?").run(Date.now() + 420_000, job.id);
      this.db.prepare(`UPDATE ${job.kind === 'analysis' ? 'attempts' : 'comparisons'} SET status='running' WHERE id=?`).run(job.targetId);
      return job;
    })();
  }
  jobContext(job: Job) {
    const p = this.db.prepare("SELECT * FROM practices WHERE id=? AND status='active'").get(job.practiceId) as PracticeRow | undefined;
    if (!p) throw new AppError('练习已删除', 404);
    if (job.kind === 'analysis') return { practice: p, attempt: this.attempt(p.userId, job.targetId), comparison: null };
    const c = this.db.prepare('SELECT * FROM comparisons WHERE id=?').get(job.targetId) as ComparisonRow;
    return { practice: p, comparison: asComparison(c), attempt: this.attempt(p.userId, c.attemptId), source: this.attempt(p.userId, c.sourceId) };
  }
  completeJob(id: string, result: unknown, raw = '') {
    return this.db.transaction(() => {
      const job = this.db.prepare("SELECT j.* FROM jobs j JOIN practices p ON p.id=j.practiceId WHERE j.id=? AND j.state='running' AND p.status='active'").get(id) as Job | undefined;
      if (!job) return false;
      if (job.kind === 'analysis') this.db.prepare("UPDATE attempts SET analysis=?,transcript=?,rawResponse=?,status='done',error='' WHERE id=?").run(JSON.stringify(result), (result as Analysis).transcript, raw, job.targetId);
      else this.db.prepare("UPDATE comparisons SET result=?,rawResponse=?,status='done',error='' WHERE id=?").run(JSON.stringify(result), raw, job.targetId);
      this.db.prepare("UPDATE jobs SET state='done' WHERE id=?").run(id);
      if (job.kind === 'analysis') {
        const p = this.db.prepare('SELECT userId FROM practices WHERE id=?').get(job.practiceId) as { userId: string };
        const a = this.attempt(p.userId, job.targetId);
        if (a.sourceId) this.requestComparison(p.userId, a.id);
      }
      this.db.prepare('UPDATE practices SET updatedAt=? WHERE id=?').run(Date.now(), job.practiceId); return true;
    })();
  }
  failJob(id: string, message: string) {
    const job = this.db.prepare("SELECT * FROM jobs WHERE id=? AND state IN ('queued','running')").get(id) as Job | undefined;
    if (!job) return;
    this.db.prepare("UPDATE jobs SET state='failed',error=? WHERE id=?").run(message, id);
    this.db.prepare(`UPDATE ${job.kind === 'analysis' ? 'attempts' : 'comparisons'} SET status='failed',error=? WHERE id=?`).run(message, job.targetId);
  }
  deletePractice(userId: string, id: string) {
    const p = this.db.prepare('SELECT * FROM practices WHERE id=? AND userId=?').get(id, userId) as PracticeRow | undefined;
    if (!p) throw new AppError('练习不存在或无权访问', 404);
    this.db.transaction(() => {
      this.db.prepare("UPDATE practices SET status='deleting' WHERE id=?").run(id);
      this.db.prepare("UPDATE jobs SET state='cancelled' WHERE practiceId=?").run(id);
    })();
    const files = this.db.prepare('SELECT filename FROM attempts WHERE practiceId=?').all(id) as { filename: string }[];
    for (const f of files) rmSync(join(this.dir, 'audio', basename(f.filename)), { force: true });
    this.db.prepare('DELETE FROM practices WHERE id=?').run(id);
  }
  recoverDeletes() {
    for (const p of this.db.prepare("SELECT id,userId FROM practices WHERE status='deleting'").all() as { id: string; userId: string }[]) this.deletePractice(p.userId, p.id);
  }
}
