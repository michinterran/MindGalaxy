"use client";

import { type RefObject, useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function isDialogCloseKey(event: Pick<KeyboardEvent, "key">) {
  return event.key === "Escape";
}

export function nextFocusableIndex({
  currentIndex,
  length,
  shiftKey,
}: {
  currentIndex: number;
  length: number;
  shiftKey: boolean;
}) {
  if (length <= 0) return -1;
  if (currentIndex < 0) return shiftKey ? length - 1 : 0;
  return shiftKey
    ? (currentIndex - 1 + length) % length
    : (currentIndex + 1) % length;
}

function getFocusableElements(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      !element.hasAttribute("disabled") &&
      element.getAttribute("aria-hidden") !== "true" &&
      element.offsetParent !== null,
  );
}

export function useDialogPanel({
  initialFocusRef,
  onClose,
  returnFocusRef,
}: {
  initialFocusRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const panelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const previousFocus =
      returnFocusRef?.current ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
    const panel = panelRef.current;

    if (!panel) return undefined;

    const focusTarget =
      initialFocusRef?.current ?? getFocusableElements(panel)[0] ?? panel;
    focusTarget.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (isDialogCloseKey(event)) {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !panel) return;

      const focusable = getFocusableElements(panel);
      if (!focusable.length) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const activeIndex = focusable.findIndex((element) => element === document.activeElement);
      const nextIndex = nextFocusableIndex({
        currentIndex: activeIndex,
        length: focusable.length,
        shiftKey: event.shiftKey,
      });

      event.preventDefault();
      focusable[nextIndex]?.focus();
    }

    panel.addEventListener("keydown", onKeyDown);

    return () => {
      panel.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [initialFocusRef, onClose, returnFocusRef]);

  return panelRef;
}
