export type CalendarDay = {
  date: Date;
  dateKey: string;
  dayOfMonth: number;
  isCurrentMonth: boolean;
  isToday: boolean;
};

export type CalendarWeek = readonly CalendarDay[];

const DAYS_IN_WEEK = 7;
const WEEKS_IN_GRID = 6;

export function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

export function addMonths(value: Date, amount: number) {
  return new Date(value.getFullYear(), value.getMonth() + amount, 1);
}

export function toLocalDateKey(value: Date) {
  const year = String(value.getFullYear()).padStart(4, "0");
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function fromLocalDateKey(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function monthRange(value: Date) {
  const from = startOfMonth(value);
  const toExclusive = addMonths(from, 1);
  return { from: from.toISOString(), toExclusive: toExclusive.toISOString() };
}

export function buildCalendarGrid(value: Date, today: Date = new Date()): CalendarWeek[] {
  const month = startOfMonth(value);
  const mondayFirstOffset = (month.getDay() + 6) % DAYS_IN_WEEK;
  const firstGridDate = new Date(month);
  firstGridDate.setDate(month.getDate() - mondayFirstOffset);
  const todayKey = toLocalDateKey(today);

  return Array.from({ length: WEEKS_IN_GRID }, (_, weekIndex) =>
    Array.from({ length: DAYS_IN_WEEK }, (_, dayIndex) => {
      const date = new Date(firstGridDate);
      date.setDate(firstGridDate.getDate() + weekIndex * DAYS_IN_WEEK + dayIndex);
      const dateKey = toLocalDateKey(date);
      return {
        date,
        dateKey,
        dayOfMonth: date.getDate(),
        isCurrentMonth: date.getMonth() === month.getMonth(),
        isToday: dateKey === todayKey,
      };
    }),
  );
}

export function countCapturesByDay(captures: readonly { createdAt: string }[]) {
  return captures.reduce<Record<string, number>>((counts, capture) => {
    const createdAt = new Date(capture.createdAt);
    if (Number.isNaN(createdAt.getTime())) return counts;
    const key = toLocalDateKey(createdAt);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}
