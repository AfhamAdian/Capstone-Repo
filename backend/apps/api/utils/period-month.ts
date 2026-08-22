/** First-of-month marker ('YYYY-MM-01') used to key auto-pulse surveys/schedules. Shared between the API (schedule lookups) and the worker (distribution processor) so the format can't drift. */
export function periodMonthString(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}
