// Minimal long-press hook (replaces Mantine's useLongPress).
//
// Fires `onLongPress` once the pointer has been held for `threshold` ms.
// Releasing, leaving, or moving more than `moveTolerance` px cancels it, so
// scrolling the list on a phone never opens a plug by accident.

import { useEffect, useRef } from "react";
import type { PointerEvent } from "react";

type Options = { threshold?: number; moveTolerance?: number };

export function useLongPress(
  onLongPress: () => void,
  { threshold = 600, moveTolerance = 10 }: Options = {},
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  };

  // Don't fire after unmount.
  useEffect(() => cancel, []);

  return {
    onPointerDown: (e: PointerEvent) => {
      if (e.button !== 0) return;
      cancel();
      start.current = { x: e.clientX, y: e.clientY };
      timer.current = setTimeout(() => {
        cancel();
        onLongPress();
      }, threshold);
    },
    onPointerMove: (e: PointerEvent) => {
      if (!start.current) return;
      const dx = e.clientX - start.current.x;
      const dy = e.clientY - start.current.y;
      if (dx * dx + dy * dy > moveTolerance * moveTolerance) cancel();
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
  };
}
