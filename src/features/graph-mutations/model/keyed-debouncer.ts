export type KeyedDebouncer<Key, Value> = {
  cancelAll: () => void;
  schedule: (key: Key, value: Value) => void;
};

export function createKeyedDebouncer<Key, Value>(
  commit: (key: Key, value: Value) => void | Promise<void>,
  delayMs: number,
): KeyedDebouncer<Key, Value> {
  const timers = new Map<Key, ReturnType<typeof globalThis.setTimeout>>();

  return {
    cancelAll: () => {
      timers.forEach((timerId) => globalThis.clearTimeout(timerId));
      timers.clear();
    },
    schedule: (key, value) => {
      const pendingTimer = timers.get(key);
      if (pendingTimer) globalThis.clearTimeout(pendingTimer);

      const timerId = globalThis.setTimeout(() => {
        timers.delete(key);
        void commit(key, value);
      }, delayMs);
      timers.set(key, timerId);
    },
  };
}
