"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  createLibraryOrganizerActions,
  loadLibraryOrganizer,
  withLibraryOrganizerInvalidation,
} from "@/features/library-organizer/api/library-organizer-client";
import { monthRange, startOfMonth } from "@/features/library-organizer/model/calendar";
import type { OrganizerSnapshot } from "@/features/library-organizer/model/types";
import { t, type Locale } from "@/lib/i18n";
import { LibraryOrganizer } from "./library-organizer";
import styles from "./library-organizer.module.css";

export function LibraryOrganizerContainer({
  locale,
  onOpenCapture,
  workspaceId,
}: {
  locale: Locale;
  onOpenCapture?: (captureId: string) => void;
  workspaceId: string;
}) {
  const router = useRouter();
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));
  const [snapshot, setSnapshot] = useState<OrganizerSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const range = useMemo(() => monthRange(visibleMonth), [visibleMonth]);
  const actions = useMemo(
    () => withLibraryOrganizerInvalidation(
      createLibraryOrganizerActions(workspaceId),
      () => router.refresh(),
    ),
    [router, workspaceId],
  );

  useEffect(() => {
    const controller = new AbortController();

    void loadLibraryOrganizer({ workspaceId, ...range }, { signal: controller.signal })
      .then((nextSnapshot) => {
        setSnapshot(nextSnapshot);
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "ORGANIZATION_REQUEST_FAILED");
      });

    return () => controller.abort();
  }, [range, workspaceId]);

  if (!snapshot) {
    return (
      <section aria-busy="true" aria-live="polite" className={styles.organizerShell}>
        <div className={styles.loadingState} role="status">
          <Loader2 aria-hidden="true" />
          <p>{error ? t(locale, "workspace.organizer.error.title") : t(locale, "workspace.organizer.loading")}</p>
        </div>
      </section>
    );
  }

  return (
    <LibraryOrganizer
      actions={actions}
      error={error}
      initialMonth={visibleMonth}
      initialSnapshot={snapshot}
      key={range.from}
      locale={locale}
      onOpenCapture={onOpenCapture}
      onVisibleMonthChange={(nextMonth) => {
        setSnapshot(null);
        setError(null);
        setVisibleMonth(startOfMonth(nextMonth));
      }}
    />
  );
}
