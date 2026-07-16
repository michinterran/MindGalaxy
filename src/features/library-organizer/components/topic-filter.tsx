"use client";

import { Check, Plus, Tag, X } from "lucide-react";
import { useState } from "react";
import type { OrganizerTopic } from "@/features/library-organizer/model/types";
import { formatInteger, t, type Locale } from "@/lib/i18n";
import styles from "./library-organizer.module.css";

export function TopicFilter({
  locale,
  onCreate,
  onSelect,
  selectedTopicId,
  topics,
}: {
  locale: Locale;
  onCreate: (label: string) => Promise<void>;
  onSelect: (topicId: string | null) => void;
  selectedTopicId: string | null;
  topics: OrganizerTopic[];
}) {
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState("");
  const [pending, setPending] = useState(false);

  return (
    <section aria-labelledby="library-topic-title" className={styles.topicPanel}>
      <div className={styles.sectionHeading}>
        <span className={styles.sectionIcon}><Tag aria-hidden="true" /></span>
        <div>
          <p>{t(locale, "workspace.organizer.topic.kicker")}</p>
          <h3 id="library-topic-title">{t(locale, "workspace.organizer.topic.title")}</h3>
        </div>
        <button aria-label={t(locale, "workspace.organizer.topic.create")} className={styles.headingAction} onClick={() => setCreating(true)} type="button"><Plus /></button>
      </div>
      {creating ? (
        <form className={styles.inlineFolderForm} onSubmit={async (event) => {
          event.preventDefault();
          if (!label.trim()) return;
          setPending(true);
          try {
            await onCreate(label.trim());
            setLabel("");
            setCreating(false);
          } catch {
            // The organizer announces the mutation failure and keeps this form open.
          } finally {
            setPending(false);
          }
        }}>
          <input aria-label={t(locale, "workspace.organizer.topic.label")} autoFocus maxLength={120} onChange={(event) => setLabel(event.target.value)} placeholder={t(locale, "workspace.organizer.topic.placeholder")} value={label} />
          <button aria-label={t(locale, "workspace.organizer.save")} disabled={pending || !label.trim()} type="submit"><Check /></button>
          <button aria-label={t(locale, "workspace.organizer.cancel")} onClick={() => setCreating(false)} type="button"><X /></button>
        </form>
      ) : null}
      <div aria-label={t(locale, "workspace.organizer.topic.aria")} className={styles.topicChips} role="group">
        <button
          aria-pressed={selectedTopicId === null}
          className={selectedTopicId === null ? styles.selectedChip : undefined}
          onClick={() => onSelect(null)}
          type="button"
        >
          {t(locale, "workspace.organizer.topic.all")}
        </button>
        {topics.map((topic) => (
          <button
            aria-pressed={selectedTopicId === topic.id}
            className={selectedTopicId === topic.id ? styles.selectedChip : undefined}
            key={topic.id}
            onClick={() => onSelect(topic.id)}
            type="button"
          >
            <span>{topic.label}</span>
            <em>{formatInteger(locale, topic.captureCount)}</em>
          </button>
        ))}
      </div>
      {!topics.length && !creating ? <p className={styles.hintText}>{t(locale, "workspace.organizer.topic.empty")}</p> : null}
    </section>
  );
}
