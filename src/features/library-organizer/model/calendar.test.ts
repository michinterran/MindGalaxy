import { describe, expect, it } from "vitest";
import {
  addMonths,
  buildCalendarGrid,
  countCapturesByDay,
  monthRange,
  toLocalDateKey,
} from "@/features/library-organizer/model/calendar";

describe("library organizer calendar", () => {
  it("builds a stable Monday-first six-week grid", () => {
    const weeks = buildCalendarGrid(new Date(2026, 5, 15), new Date(2026, 5, 9));
    expect(weeks).toHaveLength(6);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks[0]?.[0]?.dateKey).toBe("2026-06-01");
    expect(weeks[1]?.[1]).toMatchObject({ dateKey: "2026-06-09", isToday: true });
  });

  it("keeps month navigation anchored on the first day", () => {
    expect(toLocalDateKey(addMonths(new Date(2026, 0, 31), 1))).toBe("2026-02-01");
    expect(toLocalDateKey(addMonths(new Date(2026, 0, 31), -1))).toBe("2025-12-01");
  });

  it("creates an exclusive server range for the visible month", () => {
    const range = monthRange(new Date(2026, 5, 10));
    expect(new Date(range.from).getMonth()).toBe(5);
    expect(new Date(range.toExclusive).getMonth()).toBe(6);
  });

  it("counts captures by the user's local calendar date", () => {
    expect(
      countCapturesByDay([
        { createdAt: new Date(2026, 5, 9, 9).toISOString() },
        { createdAt: new Date(2026, 5, 9, 18).toISOString() },
        { createdAt: new Date(2026, 5, 10, 9).toISOString() },
      ]),
    ).toEqual({ "2026-06-09": 2, "2026-06-10": 1 });
  });
});
