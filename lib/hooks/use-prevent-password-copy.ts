import { useEffect, RefObject } from "react";

export function usePreventPasswordCopy(refs: RefObject<HTMLInputElement | null>[]) {
  useEffect(() => {
    const isPasswordRefActive = () => {
      const active = document.activeElement;
      return refs.some((r) => r.current && r.current === active);
    };

    const forceClearClipboard = () => {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText("").catch(() => {});
        setTimeout(() => navigator.clipboard.writeText("").catch(() => {}), 0);
        setTimeout(() => navigator.clipboard.writeText("").catch(() => {}), 50);
      }
    };

    const overrideClipboard = (e: Event) => {
      if (!isPasswordRefActive()) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const ce = e as ClipboardEvent;
      if (ce.clipboardData) {
        ce.clipboardData.setData("text/plain", "");
        ce.clipboardData.setData("text/html", "");
      }
      forceClearClipboard();
    };

    // Document-level capture catches the event before extensions or React can act.
    document.addEventListener("copy", overrideClipboard, true);
    document.addEventListener("cut", overrideClipboard, true);

    return () => {
      document.removeEventListener("copy", overrideClipboard, true);
      document.removeEventListener("cut", overrideClipboard, true);
    };
  }, [refs]);
}
