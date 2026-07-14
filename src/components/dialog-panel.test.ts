import { describe, expect, it } from "vitest";
import {
  isDialogCloseKey,
  nextFocusableIndex,
} from "@/components/dialog-panel";

describe("dialog panel keyboard helpers", () => {
  it("treats Escape as the close key", () => {
    expect(isDialogCloseKey({ key: "Escape" } as KeyboardEvent)).toBe(true);
    expect(isDialogCloseKey({ key: "Enter" } as KeyboardEvent)).toBe(false);
  });

  it("cycles focus forward and backward", () => {
    expect(nextFocusableIndex({ currentIndex: 0, length: 3, shiftKey: false })).toBe(1);
    expect(nextFocusableIndex({ currentIndex: 2, length: 3, shiftKey: false })).toBe(0);
    expect(nextFocusableIndex({ currentIndex: 0, length: 3, shiftKey: true })).toBe(2);
  });
});
