export type KeyedDebouncer<Key, Value> = {
  cancelAll: () => void;
  flushAll: () => void;
  schedule: (key: Key, value: Value) => void;
};

export function createKeyedDebouncer<Key, Value>(
  commit: (key: Key, value: Value) => void | Promise<void>,
  delayMs: number,
): KeyedDebouncer<Key, Value> {
  const pending = new Map<
    Key,
    { timerId: ReturnType<typeof globalThis.setTimeout>; value: Value }
  >();

  return {
    cancelAll: () => {
      pending.forEach(({ timerId }) => globalThis.clearTimeout(timerId));
      pending.clear();
    },
    flushAll: () => {
      const entries = [...pending.entries()];
      pending.clear();
      entries.forEach(([key, { timerId, value }]) => {
        globalThis.clearTimeout(timerId);
        void commit(key, value);
      });
    },
    schedule: (key, value) => {
      const pendingValue = pending.get(key);
      if (pendingValue) globalThis.clearTimeout(pendingValue.timerId);

      const timerId = globalThis.setTimeout(() => {
        pending.delete(key);
        void commit(key, value);
      }, delayMs);
      pending.set(key, { timerId, value });
    },
  };
}
