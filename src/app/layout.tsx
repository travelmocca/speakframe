import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '@/styles/globals.css';
import './globals.css';
import { Providers } from '@/components/providers';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  axes: ['opsz'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: '表达练习',
  description: '录下想法，发现问题，综合反馈反复练习，比较每轮变化，留下练习感悟。',
  icons: { icon: '/icon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={`${inter.variable} h-full antialiased`}>
      <body>
        <Providers>{children}</Providers>
        <noscript><p>本工具的录音与分析需要启用JavaScript。</p></noscript>
      </body>
    </html>
  );
}
