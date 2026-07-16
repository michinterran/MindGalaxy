"use client";

import { CalendarDays, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { addMonths, buildCalendarGrid, startOfMonth } from "@/features/library-organizer/model/calendar";
import { t, type Locale } from "@/lib/i18n";
import styles from "./library-organizer.module.css";

export function LibraryCalendar({
  counts,
  locale,
  month,
  onMonthChange,
  onSelectDate,
  selectedDate,
}: {
  counts: Readonly<Record<string, number>>;
  locale: Locale;
  month: Date;
  onMonthChange: (month: Date) => void;
  onSelectDate: (dateKey: string | null) => void;
  selectedDate: string | null;
}) {
  const today = new Date();
  const weeks = buildCalendarGrid(month, today);
  const formatterLocale = t(locale, "app.locale");
  const monthLabel = new Intl.DateTimeFormat(formatterLocale, {
    year: "numeric",
    month: "long",
  }).format(month);
  const weekdayLabels = Array.from({ length: 7 }, (_, index) => {
    const monday = new Date(2026, 5, 1 + index);
    return new Intl.DateTimeFormat(formatterLocale, { weekday: "narrow" }).format(monday);
  });

  return (
    <section aria-labelledby="library-calendar-title" className={styles.calendarPanel}>
      <div className={styles.sectionHeading}>
        <span className={styles.sectionIcon}><CalendarDays aria-hidden="true" /></span>
        <div>
          <p>{t(locale, "workspace.organizer.calendar.kicker")}</p>
          <h3 id="library-calendar-title">{t(locale, "workspace.organizer.calendar.title")}</h3>
        </div>
      </div>

      <div className={styles.calendarToolbar}>
        <strong aria-live="polite">{monthLabel}</strong>
        <div>
          <button
            aria-label={t(locale, "workspace.organizer.calendar.previous")}
            onClick={() => onMonthChange(addMonths(month, -1))}
            type="button"
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <button onClick={() => onMonthChange(startOfMonth(today))} type="button">
            {t(locale, "workspace.organizer.calendar.today")}
          </button>
          <button
            aria-label={t(locale, "workspace.organizer.calendar.next")}
            onClick={() => onMonthChange(addMonths(month, 1))}
            type="button"
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className={styles.calendarGrid} role="grid">
        <div className={styles.calendarWeekdays} role="row">
          {weekdayLabels.map((label, index) => (
            <span aria-label={label} key={`${label}-${index}`} role="columnheader">{label}</span>
          ))}
        </div>
        {weeks.map((week) => (
          <div className={styles.calendarWeek} key={week[0]?.dateKey} role="row">
            {week.map((day) => {
              const count = counts[day.dateKey] ?? 0;
              const fullDate = new Intl.DateTimeFormat(formatterLocale, {
                year: "numeric",
                month: "long",
                day: "numeric",
              }).format(day.date);
              return (
                <div key={day.dateKey} role="gridcell">
                  <button
                    aria-current={day.isToday ? "date" : undefined}
                    aria-label={t(locale, "workspace.organizer.calendar.dayLabel", {
                      date: fullDate,
                      count,
                    })}
                    aria-pressed={selectedDate === day.dateKey}
                    className={day.isCurrentMonth ? undefined : styles.outsideMonth}
                    onClick={() => {
                      if (!day.isCurrentMonth) onMonthChange(startOfMonth(day.date));
                      onSelectDate(day.dateKey);
                    }}
                    type="button"
                  >
                    <span>{day.dayOfMonth}</span>
                    {count > 0 ? <em aria-hidden="true">{count > 99 ? "99+" : count}</em> : null}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {selectedDate ? (
        <button className={styles.resetFilter} onClick={() => onSelectDate(null)} type="button">
          <RotateCcw aria-hidden="true" />
          {t(locale, "workspace.organizer.calendar.reset")}
        </button>
      ) : null}
    </section>
  );
}
