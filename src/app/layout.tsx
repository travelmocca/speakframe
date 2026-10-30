import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: '表达练习', description: '录下想法，发现问题，针对一个问题再说一次。' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-CN"><body>{children}<noscript><p>本工具的录音与分析需要启用JavaScript。</p></noscript></body></html>;
}
