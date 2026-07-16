"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, FolderOpen, Tags } from "lucide-react";
import { loadLibraryOrganizer } from "@/features/library-organizer/api/library-organizer-client";
import {
  countCapturesByDay,
  monthRange,
  startOfMonth,
  toLocalDateKey,
} from "@/features/library-organizer/model/calendar";
import type { OrganizerSnapshot } from "@/features/library-organizer/model/types";
import type { CaptureOrganizationValue } from "@/features/library-organizer/model/capture-organization";
import { t, type Locale } from "@/lib/i18n";
import { LibraryCalendar } from "./library-calendar";
import styles from "./capture-organization-picker.module.css";

export function CaptureOrganizationPicker({ defaultOpen = false, locale, onChange, value, workspaceId }: {
  defaultOpen?: boolean;
  locale: Locale;
  onChange: (value: CaptureOrganizationValue) => void;
  value: CaptureOrganizationValue;
  workspaceId: string;
}) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<OrganizerSnapshot | null>(null);
  const range = useMemo(() => monthRange(month), [month]);

  useEffect(() => {
    const controller = new AbortController();
    void loadLibraryOrganizer({ workspaceId, ...range }, { signal: controller.signal })
      .then(setSnapshot)
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setSnapshot(null);
      });
    return () => controller.abort();
  }, [range, workspaceId]);

  const counts = useMemo(() => countCapturesByDay(snapshot?.captures ?? []), [snapshot]);
  const selectedCaptures = useMemo(
    () => snapshot?.captures.filter((capture) => selectedDate && toLocalDateKey(new Date(capture.createdAt)) === selectedDate) ?? [],
    [selectedDate, snapshot],
  );

  return (
    <details
      className={styles.picker}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
      open={isOpen}
    >
      <summary>
        <span><FolderOpen aria-hidden="true" />{t(locale, "workspace.organizer.destination.title")}</span>
        <small>{t(locale, "workspace.organizer.destination.summary")}</small>
      </summary>
      <div className={styles.pickerGrid}>
        <div className={styles.destinationControls}>
          <label>
            <span><FolderOpen aria-hidden="true" />{t(locale, "workspace.organizer.capture.folderLabel")}</span>
            <select onChange={(event) => onChange({ ...value, folderId: event.target.value || null })} value={value.folderId ?? ""}>
              <option value="">{t(locale, "workspace.organizer.folder.unfiled")}</option>
              {(snapshot?.folders ?? []).map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
            </select>
          </label>
          <fieldset>
            <legend><Tags aria-hidden="true" />{t(locale, "workspace.organizer.capture.topicLegend")}</legend>
            <div className={styles.topicOptions}>
              {(snapshot?.topics ?? []).length ? snapshot?.topics.map((topic) => (
                <label key={topic.id}>
                  <input
                    checked={value.topicIds.includes(topic.id)}
                    onChange={(event) => onChange({
                      ...value,
                      topicIds: event.target.checked
                        ? [...value.topicIds, topic.id]
                        : value.topicIds.filter((topicId) => topicId !== topic.id),
                    })}
                    type="checkbox"
                  />
                  <span>{topic.label}</span>
                </label>
              )) : <p>{t(locale, "workspace.organizer.topic.empty")}</p>}
            </div>
          </fieldset>
        </div>
        <div className={styles.calendarColumn}>
          <div className={styles.calendarLabel}><CalendarDays aria-hidden="true" />{t(locale, "workspace.organizer.destination.calendarHint")}</div>
          <LibraryCalendar
            counts={counts}
            locale={locale}
            month={month}
            onMonthChange={(nextMonth) => {
              setSnapshot(null);
              setSelectedDate(null);
              setMonth(startOfMonth(nextMonth));
            }}
            onSelectDate={setSelectedDate}
            selectedDate={selectedDate}
          />
          {selectedDate ? (
            <div aria-live="polite" className={styles.dateMaterials}>
              <strong>{t(locale, "workspace.organizer.destination.dateCount", { count: selectedCaptures.length })}</strong>
              {selectedCaptures.length ? <ul>{selectedCaptures.slice(0, 4).map((capture) => <li key={capture.id}>{capture.title || t(locale, "workspace.recent.untitled")}</li>)}</ul> : null}
            </div>
          ) : null}
        </div>
      </div>
    </details>
  );
}
