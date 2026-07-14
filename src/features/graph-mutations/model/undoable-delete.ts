export type UndoableDelete = {
  cancel: () => boolean;
};

export function scheduleUndoableDelete(
  commit: () => void | Promise<void>,
  delayMs: number,
): UndoableDelete {
  let state: "pending" | "committing" | "cancelled" = "pending";
  const timeoutId = globalThis.setTimeout(() => {
    if (state !== "pending") return;
    state = "committing";
    void commit();
  }, delayMs);

  return {
    cancel: () => {
      if (state !== "pending") return false;
      state = "cancelled";
      globalThis.clearTimeout(timeoutId);
      return true;
    },
  };
}
