"use client";

import { FileText, FolderInput, Tags } from "lucide-react";
import type {
  OrganizerCapture,
  OrganizerFolder,
  OrganizerTopic,
} from "@/features/library-organizer/model/types";
import { formatDateTime, t, type Locale } from "@/lib/i18n";
import styles from "./library-organizer.module.css";

export function OrganizerCaptureList({
  captures,
  folders,
  locale,
  onMoveCapture,
  onOpenCapture,
  onSetTopics,
  pendingCaptureId,
  topics,
}: {
  captures: OrganizerCapture[];
  folders: OrganizerFolder[];
  locale: Locale;
  onMoveCapture: (captureId: string, folderId: string | null) => Promise<void>;
  onOpenCapture?: (captureId: string) => void;
  onSetTopics: (captureId: string, topicIds: string[]) => Promise<void>;
  pendingCaptureId: string | null;
  topics: OrganizerTopic[];
}) {
  if (!captures.length) {
    return (
      <div className={styles.captureEmpty}>
        <FileText aria-hidden="true" />
        <h3>{t(locale, "workspace.organizer.results.emptyTitle")}</h3>
        <p>{t(locale, "workspace.organizer.results.emptyDescription")}</p>
      </div>
    );
  }

  return (
    <ul aria-label={t(locale, "workspace.organizer.results.aria")} className={styles.captureList}>
      {captures.map((capture) => (
        <li aria-busy={pendingCaptureId === capture.id} key={capture.id}>
          <button
            className={styles.captureSummary}
            disabled={!onOpenCapture}
            onClick={() => onOpenCapture?.(capture.id)}
            type="button"
          >
            <span className={styles.captureIcon}><FileText aria-hidden="true" /></span>
            <span>
              <strong>{capture.title || t(locale, "workspace.recent.untitled")}</strong>
              <small>{capture.rawTextPreview || t(locale, "workspace.organizer.results.noPreview")}</small>
            </span>
            <time dateTime={capture.createdAt}>{formatDateTime(locale, capture.createdAt)}</time>
          </button>
          <div className={styles.captureOrganization}>
            <label>
              <FolderInput aria-hidden="true" />
              <span className={styles.srOnly}>{t(locale, "workspace.organizer.capture.folderLabel")}</span>
              <select
                aria-label={t(locale, "workspace.organizer.capture.folderLabel")}
                disabled={pendingCaptureId === capture.id}
                onChange={(event) => void onMoveCapture(capture.id, event.target.value || null)}
                value={capture.folderId ?? ""}
              >
                <option value="">{t(locale, "workspace.organizer.folder.unfiled")}</option>
                {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
              </select>
            </label>
            <details className={styles.captureTopics}>
              <summary>
                <Tags aria-hidden="true" />
                {t(locale, "workspace.organizer.capture.topics", { count: capture.topicIds.length })}
              </summary>
              <fieldset>
                <legend>{t(locale, "workspace.organizer.capture.topicLegend")}</legend>
                {topics.length ? topics.map((topic) => {
                  const checked = capture.topicIds.includes(topic.id);
                  return (
                    <label key={topic.id}>
                      <input
                        checked={checked}
                        disabled={pendingCaptureId === capture.id}
                        onChange={() => {
                          const next = checked
                            ? capture.topicIds.filter((id) => id !== topic.id)
                            : [...capture.topicIds, topic.id];
                          void onSetTopics(capture.id, next);
                        }}
                        type="checkbox"
                      />
                      <span>{topic.label}</span>
                    </label>
                  );
                }) : <p>{t(locale, "workspace.organizer.topic.empty")}</p>}
              </fieldset>
            </details>
          </div>
        </li>
      ))}
    </ul>
  );
}
