'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { activityLevel, calendarYear, isDateKey, type ActivityDay, type ActivityRecord } from '@/lib/activity';
import { api, dateLabel } from '@/lib/client';
export type ActivityData = { today: string; days: ActivityDay[] };
export function ActivityHeatmap({ activity, loading, error }: { activity: ActivityData | null; loading: boolean; error: boolean }) {
  return <section className="activity-section" aria-labelledby="activity-heading"><h2 id="activity-heading">每日表达记录</h2>{activity ? <ActivityCalendar activity={activity} /> : <div className="activity-placeholder">{loading ? <p className="skeleton">正在读取每日表达次数…</p> : <p className="muted">{error ? '暂时无法读取每日记录，请重新加载。' : '暂无数据'}</p>}</div>}</section>;
}
function ActivityCalendar({ activity: { today, days } }: { activity: ActivityData }) {
  const currentYear = Number(today.slice(0, 4)), oldestYear = Math.min(currentYear, ...days.map(day => Number(day.date.slice(0, 4))));
  const years = Array.from({ length: currentYear - oldestYear + 1 }, (_, index) => currentYear - index);
  const [year, setYear] = useState(currentYear), [selected, setSelected] = useState(''), [focusDate, setFocusDate] = useState(today);
  const [records, setRecords] = useState<ActivityRecord[] | null>(null), [detailLoading, setDetailLoading] = useState(false), [detailError, setDetailError] = useState(''), [reload, setReload] = useState(0);
  const selectedRevision = days.find(day => day.date === selected)?.revision || '';
  const detailDate = useRef('');
  const scroll = useRef<HTMLDivElement>(null), chart = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function sync() {
      const params = new URLSearchParams(location.search), requestedYear = Number(params.get('activityYear'));
      const nextYear = Number.isInteger(requestedYear) && requestedYear >= oldestYear && requestedYear <= currentYear ? requestedYear : currentYear;
      const date = params.get('activityDate') || '';
      setYear(nextYear); setSelected(isDateKey(date) && date <= today && Number(date.slice(0, 4)) === nextYear ? date : '');
    }
    sync(); window.addEventListener('popstate', sync); return () => window.removeEventListener('popstate', sync);
  }, [oldestYear, currentYear, today]);
  useEffect(() => {
    const targetDate = selected && selected.startsWith(String(year)) ? selected : year === currentYear ? today : `${year}-01-01`;
    setFocusDate(targetDate);
    function revealDate() {
      if (!scroll.current || !chart.current) return;
      const cell = chart.current.querySelector<HTMLButtonElement>(`[data-date="${targetDate}"]`);
      if (cell) { const viewport = scroll.current, x = cell.getBoundingClientRect().left - viewport.getBoundingClientRect().left + viewport.scrollLeft; if (x < viewport.scrollLeft || x + cell.getBoundingClientRect().width > viewport.scrollLeft + viewport.clientWidth) viewport.scrollLeft = Math.max(0, x - viewport.clientWidth + 40); }
    }
    revealDate(); window.addEventListener('resize', revealDate); return () => window.removeEventListener('resize', revealDate);
  }, [year, currentYear, today, selected]);
  useEffect(() => {
    if (!selected) return; let active = true; const controller = new AbortController(); setDetailLoading(true); setDetailError(''); if (detailDate.current !== selected) { setRecords(null); detailDate.current = selected; }
    api<{ attempts: ActivityRecord[] }>(`/activity?date=${selected}`, { signal: controller.signal }).then(result => { if (active) setRecords(result.attempts); }).catch(e => { if (active) setDetailError((e as Error).message); }).finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [selected, selectedRevision, reload]);
  function choose(nextYear: number, date = '') {
    setYear(nextYear); setSelected(date); if (date !== selected) setRecords(null); else if (date) setReload(value => value + 1); setDetailError('');
    const params = new URLSearchParams(location.search); params.set('activityYear', String(nextYear)); if (date) params.set('activityDate', date); else params.delete('activityDate'); history.pushState(null, '', `${location.pathname}?${params.toString()}${location.hash}`);
  }
  const calendar = calendarYear(year, today), counts = new Map(days.map(day => [day.date, day.count]));
  const yearDays = days.filter(day => day.date.startsWith(String(year)) && day.date <= today), total = yearDays.reduce((sum, day) => sum + day.count, 0);
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const offsets: Record<string, number> = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 };
    if (!(event.key in offsets)) return; event.preventDefault(); const next = calendar.cells[index + offsets[event.key]];
    if (next?.date && !next.future) chart.current?.querySelector<HTMLButtonElement>(`[data-date="${next.date}"]`)?.focus();
  }
  return <><div className="activity-toolbar"><p>{year} 年共 <strong>{total}</strong> 次表达，分布在 {yearDays.length} 天</p><label>年份<select aria-label="表达记录年份" value={year} onChange={event => choose(Number(event.target.value))}>{years.map(value => <option key={value} value={value}>{value}年</option>)}</select></label></div>
    <div className="activity-scroll" ref={scroll}><div className="activity-canvas" style={{ '--activity-columns': calendar.columns } as CSSProperties}><div className="activity-months" aria-hidden="true">{calendar.months.map(month => <span key={month.label} style={{ gridColumn: month.column + 1 }}>{month.label}</span>)}</div><div className="activity-body"><div className="activity-weekdays" aria-hidden="true"><span style={{ gridRow: 2 }}>周一</span><span style={{ gridRow: 4 }}>周三</span><span style={{ gridRow: 6 }}>周五</span></div><div className="activity-grid" ref={chart} role="group" aria-label={`${year}年每日表达次数`} aria-describedby="activity-keyboard-help">{calendar.cells.map((cell, index) => cell.date ? <button key={cell.date} type="button" className="activity-day" data-date={cell.date} data-level={activityLevel(counts.get(cell.date) || 0)} disabled={cell.future} aria-pressed={selected === cell.date} title={cell.future ? `${cell.date}，尚未到来` : `${cell.date}：${counts.get(cell.date) || 0}次表达`} aria-label={cell.future ? `${cell.date}，尚未到来` : `${cell.date}：${counts.get(cell.date) || 0}次表达`} tabIndex={!cell.future && focusDate === cell.date ? 0 : -1} onFocus={() => setFocusDate(cell.date!)} onKeyDown={event => navigate(event, index)} onClick={() => choose(year, cell.date!)} /> : <span className="activity-blank" key={`blank-${index}`} aria-hidden="true" />)}</div></div></div></div>
    <div className="activity-bottom"><p className="small muted">按北京时间统计已保存录音，重练计入；删除后同步移除。</p><div className="activity-legend" aria-label="颜色越深表示次数越多"><span>少</span>{['0次', '1次', '2–3次', '4–6次', '7次及以上'].map((label, level) => <span key={level} className="activity-swatch" data-level={level} title={label} aria-label={label} />)}<span>多</span></div></div>
    <p className="activity-scroll-hint small muted">手机上可左右滑动查看全年，点击日期查看记录。</p>
    <p className="sr-only" id="activity-keyboard-help">方向键按日或按周移动，回车查看记录；也可使用下方日期输入框。</p>
    <div className="activity-date-control"><label>查看某一天<input type="date" aria-label="查看某一天的表达" value={selected} min={`${oldestYear}-01-01`} max={today} onChange={event => { const date = event.target.value; if (!date) choose(year); else if (isDateKey(date) && date <= today && Number(date.slice(0, 4)) >= oldestYear) choose(Number(date.slice(0, 4)), date); }} /></label>{selected && <button className="text-button" onClick={() => choose(year)}>收起当日记录</button>}</div>
    {selected && <section className="activity-records" aria-labelledby="activity-selected-heading"><h3 id="activity-selected-heading">{selected} 的表达记录</h3>{detailError && <><p className="error-message" role="alert">{detailError}{records ? '，暂保留上次读取的记录。' : ''}</p><button className="text-button" onClick={() => setReload(value => value + 1)}>重新读取当天记录</button></>}{detailLoading && records === null ? <p className="muted" role="status">正在读取当天记录…</p> : records?.length ? <ul>{records.map(record => <li key={record.attemptId}><Link href={`/practices/${record.practiceId}?attempt=${record.attemptId}`}>{record.title || '未命名练习'}，第 {record.sequence} 次表达</Link><span className="small muted">{dateLabel(record.createdAt)}</span></li>)}</ul> : records && <p className="muted">当天暂无已保存的表达。</p>}</section>}
  </>;
}
