'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client';

export function Mic({ size = 24 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="8" y="2" width="8" height="13" rx="4" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" /></svg>;
}
export function AppShell({ children, hasUnsaved = false }: { children: React.ReactNode; hasUnsaved?: boolean }) {
  const [phone, setPhone] = useState(''); const [error, setError] = useState(''); const router = useRouter();
  useEffect(() => { api<{ user: { phone: string } }>('/me').then(r => setPhone(r.user.phone)).catch(e => setError(e.message)); }, []);
  const mayLeave = () => !hasUnsaved || confirm('还有未保存的录音，确定离开吗？');
  return <><a className="skip" href="#main">跳到主要内容</a><header className="topbar"><div className="container nav-inner"><Link className="wordmark" href="/practices" onClick={e => { if (!mayLeave()) e.preventDefault(); }}><Mic size={21} />表达练习</Link><nav aria-label="主导航"><Link className="nav-link" href="/practices" onClick={e => { if (!mayLeave()) e.preventDefault(); }}>练习记录</Link><span className="account-number">{phone ? `${phone.slice(0, 3)} ${phone.slice(3, 7).replace(/./g, '*')} ${phone.slice(7)}` : ''}</span><button className="text-button" onClick={async () => { if (!mayLeave()) return; try { await api('/auth/logout', { method: 'POST' }); router.replace('/auth'); } catch (e) { setError((e as Error).message); } }}>退出登录</button></nav></div></header><main id="main" className="container main-content">{error && <p role="alert" className="error-message">{error}</p>}{children}</main><footer className="container app-footer">一次表达，一个改进。</footer></>;
}
