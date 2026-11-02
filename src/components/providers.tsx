'use client';
import type { ReactNode } from 'react';
import { DirectionProvider } from '@/components/foundations/direction/direction';

export function Providers({ children }: { children: ReactNode }) {
  return <DirectionProvider locale="zh-CN">{children}</DirectionProvider>;
}
