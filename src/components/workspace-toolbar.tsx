"use client";

import { type RefObject, useEffect, useRef } from "react";
import {
  ArrowRight,
  Library,
  Loader2,
  LogOut,
  Map,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import { signOut } from "@/app/auth/actions";
import type { WorkspaceArea } from "@/features/workspace/model/navigation";
import { formatInteger, t, type Locale } from "@/lib/i18n";

export function WorkspaceToolbar({
  activeArea,
  captureCount,
  locale,
  onAreaChange,
  onNewMaterialClick,
  onSearchSubmit,
  searchQuery,
  searchInputRef,
  searchStatus,
  setSearchQuery,
  userEmail,
  workspaceName,
}: {
  activeArea: WorkspaceArea;
  captureCount: number;
  locale: Locale;
  onAreaChange: (area: WorkspaceArea) => void;
  onNewMaterialClick: () => void;
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
  const isSearchLoading = searchStatus === "loading";
  const isSearchDisabled = !searchQuery.trim() || isSearchLoading;
  const navigation = [
    {
      id: "library",
      label: t(locale, "workspace.nav.library"),
      icon: Library,
      onClick: () => onAreaChange("library"),
      count: captureCount,
    },
    {
      id: "knowledge",
      label: t(locale, "workspace.nav.knowledge"),
      icon: Map,
      onClick: () => onAreaChange("knowledge"),
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
              aria-current={activeArea === item.id ? "page" : undefined}
              className={activeArea === item.id ? "is-active" : ""}
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
        aria-busy={isSearchLoading}
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
        <button
          aria-label={t(
            locale,
            isSearchLoading
              ? "workspace.toolbar.searchSubmitting"
              : "workspace.toolbar.searchSubmit",
          )}
          className="toolbar-search__submit"
          disabled={isSearchDisabled}
          type="submit"
        >
          {isSearchLoading ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <ArrowRight aria-hidden="true" className="size-4" />
          )}
          <span>
            {t(
              locale,
              isSearchLoading
                ? "workspace.toolbar.searchSubmitting"
                : "workspace.toolbar.searchSubmit",
            )}
          </span>
        </button>
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
