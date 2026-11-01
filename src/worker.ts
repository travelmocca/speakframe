import { store } from './lib/config';
import { modelAudio } from './lib/storage';
import { analysisPrompt, comparisonPrompt, qwen } from './lib/qwen';
import { parseAnalysis, parseComparison } from './lib/analysis-schema';
import { AppError } from './lib/store';

const db = store(); let stopping = false;
process.on('SIGTERM', () => { stopping = true; }); process.on('SIGINT', () => { stopping = true; });
console.log('Expression worker ready');
while (!stopping) {
  try {
    db.recoverDeletes();
    const job = db.claimJob();
    if (!job) { await new Promise(r => setTimeout(r, 750)); continue; }
    try {
      const context = db.jobContext(job);
      const reply = job.kind === 'analysis'
        ? await qwen(analysisPrompt(context.practice.title, context.practice.scenario), await modelAudio(context.attempt.filename))
        : await qwen(comparisonPrompt({ title: context.practice.title, scenario: context.practice.scenario, before: context.source?.analysis, after: context.attempt.analysis }));
      db.db.prepare(`UPDATE ${job.kind === 'analysis' ? 'attempts' : 'comparisons'} SET rawResponse=? WHERE id=?`).run(JSON.stringify(reply), job.targetId);
      const result = job.kind === 'analysis' ? parseAnalysis(reply.content) : parseComparison(reply.content, context.source?.transcript, context.attempt.transcript, true);
      db.completeJob(job.id, result, JSON.stringify(reply));
      console.log(`Job ${job.id} completed (${job.kind})`);
    } catch (e) {
      db.failJob(job.id, e instanceof AppError ? e.message : e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError') ? '模型请求超时，请重试；录音已保留' : '分析结果暂时无法读取，请重试；录音已保留');
      console.error(`Job ${job.id} failed (${e instanceof Error ? e.name : 'unknown'})`);
    }
  } catch (e) { console.error('Worker cycle failed:', e instanceof Error ? e.name : 'unknown'); await new Promise(r => setTimeout(r, 2000)); }
}
db.close();
