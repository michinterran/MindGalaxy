"use client";

import { useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { buildFolderTree, type FolderTreeNode } from "@/features/library-organizer/model/folder-tree";
import type { OrganizerFolder } from "@/features/library-organizer/model/types";
import { formatInteger, t, type Locale } from "@/lib/i18n";
import styles from "./library-organizer.module.css";

type FolderTreeProps = {
  folders: OrganizerFolder[];
  locale: Locale;
  onCreate: (name: string, parentId: string | null) => Promise<void>;
  onDelete: (folderId: string) => Promise<void>;
  onRename: (folderId: string, name: string) => Promise<void>;
  onSelect: (folderId: string | null) => void;
  selectedFolderId: string | null;
  totalCaptureCount?: number;
};

function EditableFolderRow({
  depth,
  expanded,
  folder,
  locale,
  onCreate,
  onDelete,
  onRename,
  onSelect,
  selectedFolderId,
  setExpanded,
}: {
  depth: number;
  expanded: Set<string>;
  folder: FolderTreeNode;
  locale: Locale;
  onCreate: FolderTreeProps["onCreate"];
  onDelete: FolderTreeProps["onDelete"];
  onRename: FolderTreeProps["onRename"];
  onSelect: FolderTreeProps["onSelect"];
  selectedFolderId: string | null;
  setExpanded: React.Dispatch<React.SetStateAction<Set<string>>>;
}) {
  const [mode, setMode] = useState<"idle" | "menu" | "rename" | "child" | "delete">("idle");
  const [value, setValue] = useState(folder.name);
  const [pending, setPending] = useState(false);
  const hasChildren = folder.children.length > 0;
  const isExpanded = expanded.has(folder.id);

  async function submit(kind: "rename" | "child") {
    const name = value.trim();
    if (!name) return;
    setPending(true);
    try {
      if (kind === "rename") await onRename(folder.id, name);
      else await onCreate(name, folder.id);
      setExpanded((current) => new Set(current).add(folder.id));
      setMode("idle");
    } catch {
      // The organizer announces the mutation failure and keeps this form open.
    } finally {
      setPending(false);
    }
  }

  return (
    <li className={styles.folderTreeItem}>
      <div className={styles.folderRow} style={{ "--folder-depth": depth } as React.CSSProperties}>
        <button
          aria-expanded={hasChildren ? isExpanded : undefined}
          aria-label={t(locale, isExpanded ? "workspace.organizer.folder.collapse" : "workspace.organizer.folder.expand", { name: folder.name })}
          className={styles.folderToggle}
          disabled={!hasChildren}
          onClick={() => setExpanded((current) => {
            const next = new Set(current);
            if (next.has(folder.id)) next.delete(folder.id);
            else next.add(folder.id);
            return next;
          })}
          type="button"
        >
          {hasChildren ? (isExpanded ? <ChevronDown /> : <ChevronRight />) : <span />}
        </button>
        <button
          aria-current={selectedFolderId === folder.id ? "page" : undefined}
          className={styles.folderSelect}
          onClick={() => onSelect(folder.id)}
          type="button"
        >
          {isExpanded ? <FolderOpen aria-hidden="true" /> : <Folder aria-hidden="true" />}
          <span>{folder.name}</span>
          <em>{formatInteger(locale, folder.descendantCaptureCount)}</em>
        </button>
        <button
          aria-label={t(locale, "workspace.organizer.folder.menu", { name: folder.name })}
          aria-expanded={mode === "menu"}
          className={styles.folderMenuButton}
          onClick={() => setMode(mode === "menu" ? "idle" : "menu")}
          type="button"
        >
          <MoreHorizontal aria-hidden="true" />
        </button>
        {mode === "menu" ? (
          <div className={styles.folderMenu} onKeyDown={(event) => { if (event.key === "Escape") setMode("idle"); }} role="menu">
            <button autoFocus onClick={() => { setValue(""); setMode("child"); }} role="menuitem" type="button"><Plus />{t(locale, "workspace.organizer.folder.addChild")}</button>
            <button onClick={() => { setValue(folder.name); setMode("rename"); }} role="menuitem" type="button"><Pencil />{t(locale, "workspace.organizer.folder.rename")}</button>
            <button className={styles.dangerAction} onClick={() => setMode("delete")} role="menuitem" type="button"><Trash2 />{t(locale, "workspace.organizer.folder.delete")}</button>
          </div>
        ) : null}
      </div>

      {mode === "rename" || mode === "child" ? (
        <form className={styles.inlineFolderForm} onSubmit={(event) => { event.preventDefault(); void submit(mode); }}>
          <input
            aria-label={t(locale, mode === "rename" ? "workspace.organizer.folder.renameLabel" : "workspace.organizer.folder.childLabel")}
            autoFocus
            maxLength={120}
            onChange={(event) => setValue(event.target.value)}
            placeholder={t(locale, "workspace.organizer.folder.namePlaceholder")}
            value={value}
          />
          <button aria-label={t(locale, "workspace.organizer.save")} disabled={pending || !value.trim()} type="submit"><Check /></button>
          <button aria-label={t(locale, "workspace.organizer.cancel")} onClick={() => setMode("idle")} type="button"><X /></button>
        </form>
      ) : null}

      {mode === "delete" ? (
        <div aria-labelledby={`delete-${folder.id}`} className={styles.deleteConfirmation} onKeyDown={(event) => { if (event.key === "Escape") setMode("idle"); }} role="alertdialog">
          <strong id={`delete-${folder.id}`}>{t(locale, "workspace.organizer.folder.deleteConfirm", { name: folder.name })}</strong>
          <p>{t(locale, "workspace.organizer.folder.deleteDescription")}</p>
          <div>
            <button autoFocus onClick={() => setMode("idle")} type="button">{t(locale, "workspace.organizer.cancel")}</button>
            <button className={styles.dangerAction} disabled={pending} onClick={async () => { setPending(true); try { await onDelete(folder.id); } catch { /* keep the confirmation open */ } finally { setPending(false); } }} type="button">{t(locale, "workspace.organizer.folder.delete")}</button>
          </div>
        </div>
      ) : null}

      {hasChildren && isExpanded ? (
        <ul>
          {folder.children.map((child) => (
            <EditableFolderRow
              depth={depth + 1}
              expanded={expanded}
              folder={child}
              key={child.id}
              locale={locale}
              onCreate={onCreate}
              onDelete={onDelete}
              onRename={onRename}
              onSelect={onSelect}
              selectedFolderId={selectedFolderId}
              setExpanded={setExpanded}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function FolderTree(props: FolderTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [showRootForm, setShowRootForm] = useState(false);
  const [rootName, setRootName] = useState("");
  const [pending, setPending] = useState(false);
  const tree = useMemo(
    () => buildFolderTree(props.folders.map((folder) => ({ ...folder }))),
    [props.folders],
  );
  const totalCount = props.totalCaptureCount ?? props.folders.reduce((sum, folder) => sum + folder.captureCount, 0);

  return (
    <section aria-labelledby="library-folder-title" className={styles.folderPanel}>
      <div className={styles.sectionHeading}>
        <span className={styles.sectionIcon}><FolderOpen aria-hidden="true" /></span>
        <div>
          <p>{t(props.locale, "workspace.organizer.folder.kicker")}</p>
          <h3 id="library-folder-title">{t(props.locale, "workspace.organizer.folder.title")}</h3>
        </div>
        <button aria-label={t(props.locale, "workspace.organizer.folder.create")} className={styles.headingAction} onClick={() => setShowRootForm(true)} type="button"><FolderPlus /></button>
      </div>
      <nav aria-label={t(props.locale, "workspace.organizer.folder.aria")}>
        <button
          aria-current={props.selectedFolderId === null ? "page" : undefined}
          className={styles.allMaterialsButton}
          onClick={() => props.onSelect(null)}
          type="button"
        >
          <span>{t(props.locale, "workspace.organizer.folder.all")}</span>
          <em>{formatInteger(props.locale, totalCount)}</em>
        </button>

        {showRootForm ? (
          <form className={styles.inlineFolderForm} onSubmit={async (event) => {
            event.preventDefault();
            if (!rootName.trim()) return;
            setPending(true);
            try {
              await props.onCreate(rootName.trim(), null);
              setRootName("");
              setShowRootForm(false);
            } catch {
              // The organizer announces the mutation failure and keeps this form open.
            } finally {
              setPending(false);
            }
          }}>
            <input aria-label={t(props.locale, "workspace.organizer.folder.create")} autoFocus maxLength={120} onChange={(event) => setRootName(event.target.value)} placeholder={t(props.locale, "workspace.organizer.folder.namePlaceholder")} value={rootName} />
            <button aria-label={t(props.locale, "workspace.organizer.save")} disabled={pending || !rootName.trim()} type="submit"><Check /></button>
            <button aria-label={t(props.locale, "workspace.organizer.cancel")} onClick={() => setShowRootForm(false)} type="button"><X /></button>
          </form>
        ) : null}

        {tree.length ? (
          <ul className={styles.folderTree}>
            {tree.map((folder) => (
              <EditableFolderRow
                depth={0}
                expanded={expanded}
                folder={folder}
                key={folder.id}
                locale={props.locale}
                onCreate={props.onCreate}
                onDelete={props.onDelete}
                onRename={props.onRename}
                onSelect={props.onSelect}
                selectedFolderId={props.selectedFolderId}
                setExpanded={setExpanded}
              />
            ))}
          </ul>
        ) : (
          <div className={styles.organizerEmpty}><Folder aria-hidden="true" /><p>{t(props.locale, "workspace.organizer.folder.empty")}</p></div>
        )}
      </nav>
    </section>
  );
}
