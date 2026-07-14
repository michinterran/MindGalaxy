"use client";

import {
  Download,
  FolderOpen,
  Home,
  Inbox,
  LogOut,
  Network,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import { signOut } from "@/app/auth/actions";
import type { RecentCapture } from "@/features/knowledge-map/components/knowledge-map-client";
import { formatDateTime, formatInteger, t, type Locale } from "@/lib/i18n";
import {
  captureSourceLabel,
  processingStatusLabel,
} from "@/lib/i18n/labels";

export function WorkspaceSidebar({
  activeSection = "home",
  captureCount,
  locale,
  onExportClick,
  onHomeClick,
  onInboxClick,
  onMapClick,
  onNewMaterialClick,
  onRecentCaptureClick,
  onSearchClick,
  recentCaptures,
  selectedCaptureId,
  userEmail,
}: {
  activeSection?: "home" | "inbox" | "map" | "search" | "export";
  captureCount: number;
  locale: Locale;
  onExportClick?: () => void;
  onHomeClick?: () => void;
  onInboxClick?: () => void;
  onMapClick?: () => void;
  onNewMaterialClick?: () => void;
  onRecentCaptureClick?: (captureId: string) => void;
  onSearchClick?: () => void;
  recentCaptures: RecentCapture[];
  selectedCaptureId?: string | null;
  userEmail?: string | null;
}) {
  const navigation = [
    {
      label: t(locale, "workspace.nav.home"),
      icon: Home,
      active: activeSection === "home",
      onClick: onHomeClick,
    },
    {
      label: t(locale, "workspace.nav.inbox"),
      icon: Inbox,
      active: activeSection === "inbox",
      onClick: onInboxClick,
    },
    {
      label: t(locale, "workspace.nav.map"),
      icon: Network,
      active: activeSection === "map",
      onClick: onMapClick,
    },
    {
      label: t(locale, "workspace.nav.search"),
      icon: Search,
      active: activeSection === "search",
      onClick: onSearchClick,
    },
    {
      label: t(locale, "workspace.nav.export"),
      icon: Download,
      active: activeSection === "export",
      onClick: onExportClick,
    },
  ];

  return (
    <aside className="app-sidebar">
      <div className="brand-lockup">
        <div className="brand-mark">
          <Sparkles className="size-5" />
        </div>
        <div>
          <p>MindGalaxy</p>
          <strong>{t(locale, "workspace.brand.subtitle")}</strong>
        </div>
      </div>

      <button className="sidebar-action" onClick={onNewMaterialClick} type="button">
        <Plus className="size-4" />
        {t(locale, "workspace.sidebar.newMaterial")}
      </button>

      <nav className="sidebar-nav" aria-label={t(locale, "workspace.nav.aria")}>
        {navigation.map((item) => {
          const Icon = item.icon;

          return (
            <button
              className={item.active ? "is-active" : ""}
              key={item.label}
              onClick={item.onClick}
              aria-current={item.active ? "page" : undefined}
              type="button"
            >
              <Icon className="size-4" />
              <span>{item.label}</span>
              {item.label === t(locale, "workspace.nav.inbox") ? (
                <em>{formatInteger(locale, captureCount)}</em>
              ) : null}
            </button>
          );
        })}
      </nav>

      <section className="sidebar-section">
        <div className="sidebar-section__title">
          <FolderOpen className="size-4" />
          {t(locale, "workspace.recent.title")}
        </div>
        <div className="recent-list">
          {recentCaptures.slice(0, 4).map((capture) => (
            <button
              aria-current={selectedCaptureId === capture.id ? "true" : undefined}
              className={selectedCaptureId === capture.id ? "is-selected" : ""}
              key={capture.id}
              onClick={() => onRecentCaptureClick?.(capture.id)}
              type="button"
            >
              <span>{capture.title ?? t(locale, "workspace.recent.untitled")}</span>
              <small>
                {captureSourceLabel(locale, capture.sourceKind)} ·{" "}
                {t(locale, "capture.characterUnit", {
                  count: formatInteger(locale, capture.rawTextLength),
                })}{" "}
                · {processingStatusLabel(locale, capture.processingStatus)}
                {" · "}
                {formatDateTime(locale, capture.createdAt)}
              </small>
            </button>
          ))}
          {!recentCaptures.length ? (
            <p className="empty-note">{t(locale, "workspace.recent.empty")}</p>
          ) : null}
        </div>
      </section>

      <div className="sidebar-footer">
        <div className="user-chip" title={userEmail ?? undefined}>
          {userEmail ?? "user"}
        </div>
        <form action={signOut}>
          <button
            aria-label={t(locale, "auth.signOut")}
            className="icon-button"
            title={t(locale, "auth.signOut")}
            type="submit"
          >
            <LogOut className="size-4" />
          </button>
        </form>
      </div>
    </aside>
  );
}
