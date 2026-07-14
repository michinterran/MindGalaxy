"use client";

import { type RefObject, useEffect, useRef } from "react";
import {
  Download,
  LayoutList,
  LogOut,
  Map,
  Orbit,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import { signOut } from "@/app/auth/actions";
import type { ViewMode } from "@/features/knowledge-map/components/knowledge-map-client";
import { formatInteger, t, type Locale } from "@/lib/i18n";

type ActiveSection = ViewMode | "search" | "export";

export function WorkspaceToolbar({
  activeSection,
  captureCount,
  locale,
  onChange,
  onExportClick,
  onNewMaterialClick,
  onSearchClick,
  onSearchSubmit,
  searchQuery,
  searchInputRef,
  searchStatus,
  setSearchQuery,
  userEmail,
  workspaceName,
}: {
  activeSection: ActiveSection;
  captureCount: number;
  locale: Locale;
  onChange: (mode: ViewMode) => void;
  onExportClick: () => void;
  onNewMaterialClick: () => void;
  onSearchClick: () => void;
  onSearchSubmit: () => void;
  searchQuery: string;
  searchInputRef?: RefObject<HTMLInputElement | null>;
  searchStatus: "idle" | "loading" | "success" | "error";
  setSearchQuery: (value: string) => void;
  userEmail?: string | null;
  workspaceName: string;
}) {
  const fallbackInputRef = useRef<HTMLInputElement>(null);
  const inputRef = searchInputRef ?? fallbackInputRef;
  const navigation = [
    {
      id: "mindmap",
      label: t(locale, "workspace.view.mindmap"),
      icon: Map,
      onClick: () => onChange("mindmap"),
    },
    {
      id: "galaxy",
      label: t(locale, "workspace.view.galaxy"),
      icon: Orbit,
      onClick: () => onChange("galaxy"),
    },
    {
      id: "list",
      label: t(locale, "workspace.view.list"),
      icon: LayoutList,
      onClick: () => onChange("list"),
      count: captureCount,
    },
    {
      id: "search",
      label: t(locale, "workspace.nav.search"),
      icon: Search,
      onClick: onSearchClick,
    },
    {
      id: "export",
      label: t(locale, "workspace.nav.export"),
      icon: Download,
      onClick: onExportClick,
    },
  ] as const;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [inputRef]);

  return (
    <header className="workspace-toolbar">
      <div className="brand-lockup toolbar-brand">
        <div className="brand-mark">
          <Sparkles className="size-5" />
        </div>
        <div className="workspace-title">
          <p>{workspaceName}</p>
          <h1>{t(locale, "workspace.toolbar.title")}</h1>
        </div>
      </div>

      <button
        className="toolbar-capture-action"
        onClick={onNewMaterialClick}
        type="button"
      >
        <Plus className="size-4" />
        {t(locale, "workspace.sidebar.newMaterial")}
      </button>

      <nav className="toolbar-nav" aria-label={t(locale, "workspace.nav.aria")}>
        {navigation.map((item) => {
          const Icon = item.icon;

          return (
            <button
              aria-current={activeSection === item.id ? "page" : undefined}
              className={activeSection === item.id ? "is-active" : ""}
              key={item.id}
              onClick={item.onClick}
              type="button"
            >
              <Icon className="size-4" />
              <span>{item.label}</span>
              {"count" in item ? <em>{formatInteger(locale, item.count)}</em> : null}
            </button>
          );
        })}
      </nav>

      <form
        className={`toolbar-search toolbar-search--${searchStatus}`}
        onSubmit={(event) => {
          event.preventDefault();
          onSearchSubmit();
        }}
        role="search"
      >
        <Search className="size-4" />
        <input
          aria-label={t(locale, "workspace.toolbar.searchAria")}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder={t(locale, "workspace.toolbar.searchPlaceholder")}
          ref={inputRef}
          type="search"
          value={searchQuery}
        />
        <kbd>{t(locale, "workspace.toolbar.searchShortcut")}</kbd>
      </form>

      <div className="toolbar-account">
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
    </header>
  );
}
