export type FolderTreeSource = {
  id: string;
  parentId: string | null;
  name: string;
  sortOrder: number;
  captureCount: number;
};

export type FolderTreeNode = FolderTreeSource & {
  children: FolderTreeNode[];
  descendantCaptureCount: number;
};

function compareFolders(left: FolderTreeSource, right: FolderTreeSource) {
  return left.sortOrder - right.sortOrder || left.name.localeCompare(right.name);
}

export function buildFolderTree(folders: readonly FolderTreeSource[]): FolderTreeNode[] {
  const byId = new Map<string, FolderTreeNode>();
  const roots: FolderTreeNode[] = [];

  for (const folder of folders) {
    byId.set(folder.id, { ...folder, children: [], descendantCaptureCount: folder.captureCount });
  }

  for (const folder of folders) {
    const node = byId.get(folder.id);
    if (!node) continue;
    const parent = folder.parentId ? byId.get(folder.parentId) : undefined;
    if (parent && parent.id !== node.id) parent.children.push(node);
    else roots.push(node);
  }

  function aggregate(node: FolderTreeNode, trail: ReadonlySet<string>): number {
    if (trail.has(node.id)) return node.captureCount;
    const nextTrail = new Set(trail).add(node.id);
    node.children.sort(compareFolders);
    node.descendantCaptureCount = node.captureCount + node.children.reduce(
      (sum, child) => sum + aggregate(child, nextTrail),
      0,
    );
    return node.descendantCaptureCount;
  }

  roots.sort(compareFolders);
  roots.forEach((root) => aggregate(root, new Set()));
  return roots;
}

export function collectFolderDescendantIds(
  folders: readonly FolderTreeSource[],
  folderId: string,
) {
  const children = new Map<string, string[]>();
  folders.forEach((folder) => {
    if (!folder.parentId) return;
    children.set(folder.parentId, [...(children.get(folder.parentId) ?? []), folder.id]);
  });

  const result = new Set([folderId]);
  const queue = [folderId];
  while (queue.length) {
    const current = queue.shift();
    if (!current) continue;
    for (const child of children.get(current) ?? []) {
      if (result.has(child)) continue;
      result.add(child);
      queue.push(child);
    }
  }
  return result;
}
