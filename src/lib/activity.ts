export type ActivityDay = { date: string; count: number; revision: string };
export type ActivityRecord = { practiceId: string; title: string; attemptId: string; sequence: number; createdAt: number };
export const DAY_MS = 86400000;
export const beijingDay = (timestamp = Date.now()) => new Date(timestamp + 8 * 3600000).toISOString().slice(0, 10);
export function isDateKey(value: string) { const timestamp = Date.parse(`${value}T00:00:00+08:00`); return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(timestamp) && beijingDay(timestamp) === value; }
export const activityLevel = (count: number) => count === 0 ? 0 : count === 1 ? 1 : count <= 3 ? 2 : count <= 6 ? 3 : 4;
export function calendarYear(year: number, today: string) {
  const start = Date.UTC(year, 0, 1), end = Date.UTC(year + 1, 0, 1), offset = new Date(start).getUTCDay();
  const length = Math.round((end - start) / DAY_MS), columns = Math.ceil((offset + length) / 7);
  const cells = Array.from({ length: columns * 7 }, (_, index) => {
    const day = index - offset, date = day >= 0 && day < length ? new Date(start + day * DAY_MS).toISOString().slice(0, 10) : null;
    return { date, future: Boolean(date && date > today) };
  });
  const months = Array.from({ length: 12 }, (_, month) => ({ label: `${month + 1}月`, column: Math.floor((offset + (Date.UTC(year, month, 1) - start) / DAY_MS) / 7) }));
  return { cells, columns, months };
}
