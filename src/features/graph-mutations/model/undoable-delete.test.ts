import { afterEach, describe, expect, it, vi } from "vitest";
import { GRAPH_INTERACTION_REGISTRY } from "@/config/registry";
import { scheduleUndoableDelete } from "@/features/graph-mutations/model/undoable-delete";

const delayMs = GRAPH_INTERACTION_REGISTRY.deleteUndoDelayMs;

describe("scheduleUndoableDelete", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("commits after the grace period", () => {
    vi.useFakeTimers();
    const commit = vi.fn();

    scheduleUndoableDelete(commit, delayMs);
    vi.advanceTimersByTime(delayMs - 1);
    expect(commit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(commit).toHaveBeenCalledOnce();
  });

  it("can be cancelled before the grace period ends", () => {
    vi.useFakeTimers();
    const commit = vi.fn();
    const pending = scheduleUndoableDelete(commit, delayMs);

    expect(pending.cancel()).toBe(true);
    vi.advanceTimersByTime(delayMs);
    expect(commit).not.toHaveBeenCalled();
  });

  it("does not report cancellation after the delete has started", () => {
    vi.useFakeTimers();
    const commit = vi.fn();
    const pending = scheduleUndoableDelete(commit, delayMs);

    vi.advanceTimersByTime(delayMs);

    expect(commit).toHaveBeenCalledOnce();
    expect(pending.cancel()).toBe(false);
  });
});
