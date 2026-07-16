"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Filter, FolderKanban, Loader2, RotateCcw } from "lucide-react";
import {
  countCapturesByDay,
  fromLocalDateKey,
  startOfMonth,
  toLocalDateKey,
} from "@/features/library-organizer/model/calendar";
import { collectFolderDescendantIds } from "@/features/library-organizer/model/folder-tree";
import type {
  LibraryOrganizerActions,
  OrganizerFilter,
  OrganizerSnapshot,
} from "@/features/library-organizer/model/types";
import { t, type Locale } from "@/lib/i18n";
import { FolderTree } from "./folder-tree";
import { LibraryCalendar } from "./library-calendar";
import { OrganizerCaptureList } from "./organizer-capture-list";
import { TopicFilter } from "./topic-filter";
import styles from "./library-organizer.module.css";

const EMPTY_FILTER: OrganizerFilter = { date: null, folderId: null, topicId: null };

export function LibraryOrganizer({
  actions,
  error = null,
  initialSnapshot,
  initialMonth,
  loading = false,
  locale,
  onFilterChange,
  onOpenCapture,
  onVisibleMonthChange,
}: {
  actions: LibraryOrganizerActions;
  error?: string | null;
  initialSnapshot: OrganizerSnapshot;
  initialMonth?: Date;
  loading?: boolean;
  locale: Locale;
  onFilterChange?: (filter: OrganizerFilter) => void;
  onOpenCapture?: (captureId: string) => void;
  onVisibleMonthChange?: (month: Date) => void;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [filter, setFilter] = useState<OrganizerFilter>(EMPTY_FILTER);
  const [month, setMonth] = useState(() => startOfMonth(initialMonth ?? new Date()));
  const [pendingCaptureId, setPendingCaptureId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  function reportMutationError() {
    setMutationError(t(locale, "workspace.organizer.error.mutation"));
  }

  function updateFilter(next: OrganizerFilter) {
    setFilter(next);
    onFilterChange?.(next);
  }

  const folderIds = useMemo(() => {
    if (!filter.folderId) return null;
    return collectFolderDescendantIds(
      snapshot.folders.map((folder) => ({ ...folder })),
      filter.folderId,
    );
  }, [filter.folderId, snapshot.folders]);
  const folderAndTopicCaptures = useMemo(
    () => snapshot.captures.filter((capture) =>
      (!folderIds || (capture.folderId ? folderIds.has(capture.folderId) : false)) &&
      (!filter.topicId || capture.topicIds.includes(filter.topicId)),
    ),
    [filter.topicId, folderIds, snapshot.captures],
  );
  const visibleCaptures = useMemo(
    () => folderAndTopicCaptures.filter((capture) =>
      !filter.date || toLocalDateKey(new Date(capture.createdAt)) === filter.date,
    ),
    [filter.date, folderAndTopicCaptures],
  );
  const dayCounts = useMemo(() => countCapturesByDay(folderAndTopicCaptures), [folderAndTopicCaptures]);
  const hasFilters = Boolean(filter.date || filter.folderId || filter.topicId);
  const selectedDate = filter.date ? fromLocalDateKey(filter.date) : null;

  async function createFolder(name: string, parentId: string | null) {
    setMutationError(null);
    try {
      const folder = await actions.createFolder({ name, parentId });
      setSnapshot((current) => ({ ...current, folders: [...current.folders, folder] }));
    } catch (mutationFailure) {
      reportMutationError();
      throw mutationFailure;
    }
  }

  return (
    <section aria-busy={loading} aria-labelledby="library-organizer-title" className={styles.organizerShell}>
      <header className={styles.organizerHeader}>
        <div>
          <p className={styles.eyebrow}>{t(locale, "workspace.organizer.kicker")}</p>
          <h2 id="library-organizer-title">{t(locale, "workspace.organizer.title")}</h2>
          <p>{t(locale, "workspace.organizer.description")}</p>
        </div>
        <div className={styles.resultCount}>
          <FolderKanban aria-hidden="true" />
          <span>{t(locale, "workspace.organizer.results.count", { count: visibleCaptures.length })}</span>
        </div>
      </header>

      {error ? (
        <div className={styles.errorState} role="alert">
          <AlertTriangle aria-hidden="true" />
          <div><strong>{t(locale, "workspace.organizer.error.title")}</strong><p>{error}</p></div>
        </div>
      ) : null}
      {mutationError ? (
        <div className={styles.errorState} role="alert">
          <AlertTriangle aria-hidden="true" />
          <div><strong>{t(locale, "workspace.organizer.error.mutationTitle")}</strong><p>{mutationError}</p></div>
        </div>
      ) : null}

      <div className={styles.organizerLayout}>
        <aside className={styles.organizerRail}>
          <FolderTree
            folders={snapshot.folders}
            locale={locale}
            onCreate={createFolder}
            onDelete={async (folderId) => {
              const deletedFolderIds = collectFolderDescendantIds(
                snapshot.folders.map((folder) => ({ ...folder })),
                folderId,
              );
              setMutationError(null);
              try {
                await actions.deleteFolder(folderId);
              } catch (mutationFailure) {
                reportMutationError();
                throw mutationFailure;
              }
              setSnapshot((current) => ({
                ...current,
                folders: current.folders.filter((folder) => !deletedFolderIds.has(folder.id)),
                captures: current.captures.map((capture) =>
                  capture.folderId && deletedFolderIds.has(capture.folderId)
                    ? { ...capture, folderId: null }
                    : capture,
                ),
              }));
              if (filter.folderId && deletedFolderIds.has(filter.folderId)) {
                updateFilter({ ...filter, folderId: null });
              }
            }}
            onRename={async (folderId, name) => {
              setMutationError(null);
              let folder;
              try {
                folder = await actions.renameFolder(folderId, name);
              } catch (mutationFailure) {
                reportMutationError();
                throw mutationFailure;
              }
              setSnapshot((current) => ({
                ...current,
                folders: current.folders.map((item) =>
                  item.id === folderId
                    ? { ...folder, captureCount: item.captureCount }
                    : item,
                ),
              }));
            }}
            onSelect={(folderId) => updateFilter({ ...filter, folderId })}
            selectedFolderId={filter.folderId}
            totalCaptureCount={snapshot.totalCaptureCount}
          />
          <TopicFilter
            locale={locale}
            onCreate={async (label) => {
              setMutationError(null);
              try {
                const topic = await actions.createTopic(label);
                setSnapshot((current) => ({ ...current, topics: [...current.topics, topic] }));
              } catch (mutationFailure) {
                reportMutationError();
                throw mutationFailure;
              }
            }}
            onSelect={(topicId) => updateFilter({ ...filter, topicId })}
            selectedTopicId={filter.topicId}
            topics={snapshot.topics}
          />
          <LibraryCalendar
            counts={dayCounts}
            locale={locale}
            month={month}
            onMonthChange={(nextMonth) => {
              setMonth(nextMonth);
              onVisibleMonthChange?.(nextMonth);
            }}
            onSelectDate={(date) => updateFilter({ ...filter, date })}
            selectedDate={filter.date}
          />
        </aside>

        <div className={styles.organizerResults}>
          <div className={styles.filterSummary}>
            <div><Filter aria-hidden="true" /><span>{t(locale, "workspace.organizer.filter.active")}</span></div>
            <p>
              {selectedDate ? new Intl.DateTimeFormat(t(locale, "app.locale"), { dateStyle: "long" }).format(selectedDate) : t(locale, "workspace.organizer.filter.allDates")}
            </p>
            {hasFilters ? (
              <button onClick={() => updateFilter(EMPTY_FILTER)} type="button"><RotateCcw />{t(locale, "workspace.organizer.filter.reset")}</button>
            ) : null}
          </div>
          {snapshot.hasMore ? (
            <p className={styles.resultLimitNotice} role="status">
              {t(locale, "workspace.organizer.results.hasMore", {
                shown: snapshot.captures.length,
                total: snapshot.totalCaptureCount,
              })}
            </p>
          ) : null}
          {loading ? (
            <div className={styles.loadingState} role="status"><Loader2 aria-hidden="true" /><p>{t(locale, "workspace.organizer.loading")}</p></div>
          ) : (
            <OrganizerCaptureList
              captures={visibleCaptures}
              folders={snapshot.folders}
              locale={locale}
              onMoveCapture={async (captureId, folderId) => {
                setPendingCaptureId(captureId);
                try {
                  setMutationError(null);
                  await actions.moveCapture(captureId, folderId);
                  setSnapshot((current) => ({ ...current, captures: current.captures.map((capture) => capture.id === captureId ? { ...capture, folderId } : capture) }));
                } catch { reportMutationError(); } finally { setPendingCaptureId(null); }
              }}
              onOpenCapture={onOpenCapture}
              onSetTopics={async (captureId, topicIds) => {
                setPendingCaptureId(captureId);
                try {
                  setMutationError(null);
                  await actions.setCaptureTopics(captureId, topicIds);
                  setSnapshot((current) => ({ ...current, captures: current.captures.map((capture) => capture.id === captureId ? { ...capture, topicIds } : capture) }));
                } catch { reportMutationError(); } finally { setPendingCaptureId(null); }
              }}
              pendingCaptureId={pendingCaptureId}
              topics={snapshot.topics}
            />
          )}
        </div>
      </div>
    </section>
  );
}
