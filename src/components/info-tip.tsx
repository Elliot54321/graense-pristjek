"use client";

import { Info } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

const WIDTH = 256;
const MARGIN = 16;

/**
 * An (i) icon with a short explanation. Opens on hover with a mouse and on tap on a
 * phone (phones have no hover); tapping elsewhere, Escape, scrolling or moving the
 * mouse away closes it. The bubble is placed from the icon's position on screen and
 * kept inside the window, so it never runs off a narrow phone screen.
 */
export function InfoTip({ label, children }: { label: string; children: React.ReactNode }) {
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();

  const show = () => {
    const icon = ref.current?.getBoundingClientRect();
    if (!icon) return;
    const width = Math.min(WIDTH, window.innerWidth - 2 * MARGIN);
    const left = Math.min(Math.max(icon.left + icon.width / 2 - width / 2, MARGIN), window.innerWidth - MARGIN - width);
    setPos({ top: icon.bottom + 8, left, width });
  };

  useEffect(() => {
    if (!pos) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e.type === "pointerdown" && ref.current?.contains(e.target as Node)) return;
      setPos(null);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    window.addEventListener("scroll", close, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
      window.removeEventListener("scroll", close);
    };
  }, [pos]);

  return (
    <span
      ref={ref}
      className="inline-block align-middle"
      // Hover only for a real mouse: a tap also fires "enter", which would fight the click below.
      onPointerEnter={(e) => e.pointerType === "mouse" && show()}
      onPointerLeave={(e) => e.pointerType === "mouse" && setPos(null)}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={!!pos}
        aria-describedby={pos ? id : undefined}
        onClick={show}
        // The padding gives a finger-sized tap area; the negative margin keeps the line height.
        className="-m-2 inline-flex p-2 text-current opacity-80 hover:opacity-100"
      >
        <Info aria-hidden className="h-4 w-4" />
      </button>
      {pos && (
        <span
          id={id}
          role="tooltip"
          style={{ top: pos.top, left: pos.left, width: pos.width }}
          className="fixed z-30 rounded-lg border border-zinc-200 bg-white p-3 text-left text-xs leading-relaxed font-normal text-zinc-700 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
        >
          {children}
        </span>
      )}
    </span>
  );
}
