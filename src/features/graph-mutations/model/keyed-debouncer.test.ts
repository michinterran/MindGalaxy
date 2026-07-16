import { afterEach, describe, expect, it, vi } from "vitest";
import { GRAPH_INTERACTION_REGISTRY } from "@/config/registry";
import { createKeyedDebouncer } from "@/features/graph-mutations/model/keyed-debouncer";

const delayMs = GRAPH_INTERACTION_REGISTRY.nodePositionSaveDebounceMs;

describe("createKeyedDebouncer", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("commits only the latest value for the same key", () => {
    vi.useFakeTimers();
    const commit = vi.fn();
    const saver = createKeyedDebouncer(commit, delayMs);

    saver.schedule("node-1", { x: 1, y: 2 });
    vi.advanceTimersByTime(200);
    saver.schedule("node-1", { x: 3, y: 4 });
    vi.advanceTimersByTime(delayMs - 1);
    expect(commit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(commit).toHaveBeenCalledOnce();
    expect(commit).toHaveBeenCalledWith("node-1", { x: 3, y: 4 });
  });

  it("cancels pending commits during cleanup", () => {
    vi.useFakeTimers();
    const commit = vi.fn();
    const saver = createKeyedDebouncer(commit, delayMs);

    saver.schedule("node-1", { x: 1, y: 2 });
    saver.cancelAll();
    vi.advanceTimersByTime(delayMs);
    expect(commit).not.toHaveBeenCalled();
  });

  it("flushes the latest pending values before cleanup", () => {
    vi.useFakeTimers();
    const commit = vi.fn();
    const saver = createKeyedDebouncer(commit, delayMs);

    saver.schedule("node-1", { x: 1, y: 2 });
    saver.schedule("node-1", { x: 3, y: 4 });
    saver.schedule("node-2", { x: 5, y: 6 });
    saver.flushAll();

    expect(commit).toHaveBeenCalledTimes(2);
    expect(commit).toHaveBeenCalledWith("node-1", { x: 3, y: 4 });
    expect(commit).toHaveBeenCalledWith("node-2", { x: 5, y: 6 });

    vi.advanceTimersByTime(delayMs);
    expect(commit).toHaveBeenCalledTimes(2);
  });
});
