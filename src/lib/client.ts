export async function api<T = Record<string, unknown>>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, { ...options, headers: { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...options.headers }, cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) { if (response.status === 401 && !path.startsWith('/auth/')) window.location.assign('/auth'); throw new Error(data.error || '操作失败，请重试'); }
  return data;
}
export const dateLabel = (n: number) => new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Shanghai' }).format(n);
export const durationLabel = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
export const statusLabel: Record<string, string> = { saved: '录音已保存', queued: '等待分析', running: '正在分析', done: '已完成分析', failed: '分析待重试', active: '草稿' };
