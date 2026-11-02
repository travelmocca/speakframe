'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client';
import { BrandMark } from './brand-mark';
import { Input } from '@/components/base/input/input';
import { Button } from '@/components/base/buttons/button';

export function AuthForm() {
  const [register, setRegister] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [phone, setPhone] = useState(''), [password, setPassword] = useState(''), [confirm, setConfirm] = useState('');
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (register && password !== confirm) { setError('两次密码不一致，请重新确认'); return; }
    setBusy(true);
    try {
      await api(`/auth/${register ? 'register' : 'login'}`, { method: 'POST', body: JSON.stringify({ phone: phone.trim(), password }) });
      router.replace('/practices');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page container">
      <section className="auth-intro">
        <div className="wordmark"><BrandMark size={26} />表达练习</div>
        <h1>把想法，<br />说清楚。</h1>
        <p className="auth-lead">不用先写一篇完美的稿子。<br />从说一遍、听一遍开始。</p>
        <ol className="auth-steps"><li>录下你的表达</li><li>发现一个值得改进的问题</li><li>带着目标，再说一次</li></ol>
        <p className="muted small">录音与分析只对你可见，随时可以删除。</p>
      </section>
      <section className="auth-form-region">
        <h2>{register ? '从第一次练习开始' : '继续你的练习'}</h2>
        <p className="muted">{register ? '用手机号和密码创建账号，无需验证码。' : '登录后，回看记录或开始一段新表达。'}</p>
        <form className="auth-boardui-form flex flex-col gap-4" onSubmit={submit}>
          <Input
            label="手机号"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="username"
            maxLength={11}
            isRequired
            value={phone}
            onChange={setPhone}
            placeholder="11位手机号"
            pattern="1[3-9][0-9]{9}"
            hint={!error ? '请保存好密码，首版暂不支持自助找回。' : undefined}
            isInvalid={Boolean(error)}
            errorMessage={error || undefined}
          />
          <Input
            label="密码"
            name="password"
            type="password"
            minLength={8}
            maxLength={128}
            autoComplete={register ? 'new-password' : 'current-password'}
            isRequired
            value={password}
            onChange={setPassword}
            placeholder="至少8位"
          />
          {register && (
            <Input
              label="确认密码"
              name="confirm"
              type="password"
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              isRequired
              value={confirm}
              onChange={setConfirm}
              placeholder="再次输入密码"
            />
          )}
          <Button type="submit" variant="primary" size="medium" className="w-full" disabled={busy} aria-busy={busy || undefined}>
            {busy ? '正在提交…' : register ? '创建账号' : '登录'}
          </Button>
        </form>
        <div className="auth-switch">
          <span className="muted">{register ? '已有账号？' : '第一次来？'}</span>
          <button className="text-button" type="button" onClick={() => { setRegister(!register); setError(''); }}>
            {register ? '返回登录' : '注册新账号'}
          </button>
        </div>
      </section>
    </main>
  );
}
