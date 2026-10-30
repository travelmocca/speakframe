import { AppError } from './store';
export function verifyOrigin(req: Request) {
  if (req.method === 'GET' || req.method === 'HEAD') return;
  const expected = new URL(req.url);
  expected.host = req.headers.get('host') || expected.host;
  const origin = req.headers.get('origin');
  const configured = process.env.APP_ORIGIN;
  if (!origin || origin !== (configured || expected.origin)) throw new AppError('请求来源不匹配，请刷新页面重试', 403);
}
