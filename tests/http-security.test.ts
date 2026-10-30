import { expect, it } from 'vitest';
import { verifyOrigin } from '../src/lib/http-security';
it('accepts same browser host even when Next rewrites its internal URL', () => {
  expect(() => verifyOrigin(new Request('http://localhost:3118/api/auth/login', { method: 'POST', headers: { host: '127.0.0.1:3118', origin: 'http://127.0.0.1:3118' } }))).not.toThrow();
});
it('rejects missing and foreign origins', () => {
  expect(() => verifyOrigin(new Request('http://localhost:3118/api/auth/login', { method: 'POST', headers: { host: '127.0.0.1:3118', origin: 'https://foreign.example' } }))).toThrow();
  expect(() => verifyOrigin(new Request('http://localhost:3118/api/auth/login', { method: 'POST' }))).toThrow();
});
