"use client";

import { useCallback, useId, useRef } from "react";
import { X } from "lucide-react";
import { CapturePanel } from "@/components/capture-panel";
import { useDialogPanel } from "@/components/dialog-panel";
import { t, type Locale } from "@/lib/i18n";

export function CaptureDrawer({
  locale,
  onClose,
  workspaceId,
}: {
  locale: Locale;
  onClose: () => void;
  workspaceId: string;
}) {
  const titleId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const closeDrawer = useCallback(() => onClose(), [onClose]);
  const panelRef = useDialogPanel({
    initialFocusRef: headingRef,
    onClose: closeDrawer,
  });

  return (
    <aside
      aria-labelledby={titleId}
      aria-modal="true"
      className="capture-drawer"
      ref={panelRef}
      role="dialog"
      tabIndex={-1}
    >
      <header className="capture-drawer__header">
        <h2 id={titleId} ref={headingRef} tabIndex={-1}>
          {t(locale, "capture.panelTitle")}
        </h2>
        <button
          aria-label={t(locale, "capture.close")}
          className="icon-button"
          onClick={closeDrawer}
          type="button"
        >
          <X className="size-4" />
        </button>
      </header>
      <CapturePanel
        autoFocus
        locale={locale}
        workspaceId={workspaceId}
        variant="panel"
      />
    </aside>
  );
}
