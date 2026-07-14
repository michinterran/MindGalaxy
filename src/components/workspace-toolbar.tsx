"use client";

import { type RefObject, useEffect, useRef } from "react";
import {
  LayoutList,
  Map,
  Orbit,
  Search,
} from "lucide-react";
import type { ViewMode } from "@/features/knowledge-map/components/knowledge-map-client";
import { t, type Locale } from "@/lib/i18n";

export function WorkspaceToolbar({
  current,
  locale,
  onChange,
  onSearchSubmit,
  searchQuery,
  searchInputRef,
  searchStatus,
  setSearchQuery,
  workspaceName,
}: {
  current: ViewMode;
  locale: Locale;
  onChange: (mode: ViewMode) => void;
  onSearchSubmit: () => void;
  searchQuery: string;
  searchInputRef?: RefObject<HTMLInputElement | null>;
  searchStatus: "idle" | "loading" | "success" | "error";
  setSearchQuery: (value: string) => void;
  workspaceName: string;
}) {
  const fallbackInputRef = useRef<HTMLInputElement>(null);
  const inputRef = searchInputRef ?? fallbackInputRef;
  const tabs: Array<{ id: ViewMode; label: string; icon: typeof Map }> = [
    { id: "mindmap", label: t(locale, "workspace.view.mindmap"), icon: Map },
    { id: "galaxy", label: t(locale, "workspace.view.galaxy"), icon: Orbit },
    { id: "list", label: t(locale, "workspace.view.list"), icon: LayoutList },
  ];

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
      <div className="workspace-title">
        <p>{workspaceName}</p>
        <h1>{t(locale, "workspace.toolbar.title")}</h1>
      </div>

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

      <div
        className="view-switch"
        role="tablist"
        aria-label={t(locale, "workspace.toolbar.viewModeAria")}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;

          return (
            <button
              aria-selected={current === tab.id}
              className={current === tab.id ? "is-active" : ""}
              key={tab.id}
              onClick={() => onChange(tab.id)}
              role="tab"
              type="button"
            >
              <Icon className="size-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

    </header>
  );
}
