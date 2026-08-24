import { useEffect, useRef } from "react";

type Combo = {
  /** Tecla (case-insensitive), ex.: "g", "s", "Enter". */
  key: string;
  alt?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  /** Permite disparar mesmo com foco em input/textarea (padrão: false). */
  allowInField?: boolean;
};

function isEditable(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null;
  if (!node || !node.tagName) return false;
  const tag = node.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || node.isContentEditable;
}

/** Atalho global de teclado. O handler é sempre a versão mais recente. */
export function useHotkey(combo: Combo, handler: () => void, enabled = true) {
  const ref = useRef(handler);
  ref.current = handler;

  const { key, alt = false, ctrl = false, meta = false, shift = false, allowInField = false } = combo;

  useEffect(() => {
    if (!enabled) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== key.toLowerCase()) return;
      if (e.altKey !== alt) return;
      if (shift && !e.shiftKey) return;
      const ctrlLike = e.ctrlKey || e.metaKey;
      if ((ctrl || meta) && !ctrlLike) return;
      if (!ctrl && !meta && ctrlLike) return;
      if (!allowInField && isEditable(e.target)) return;
      e.preventDefault();
      ref.current();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [key, alt, ctrl, meta, shift, allowInField, enabled]);
}
