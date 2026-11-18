"use client";

import { ImageOff, X, ZoomIn } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * A product photo tile that opens the photo large on a dark backdrop (a lightbox) with the
 * product name and pack under it. The photo is the shop's own address (og:image), shown
 * with a plain <img> like everywhere else - nothing is copied or proxied.
 *
 * Uses a native modal <dialog>: Escape, keeping focus inside and putting it back on the
 * tile afterwards come with it; page scrolling is locked while it's open. A tile without a
 * photo (newsletter-only products) or whose photo fails to load is an empty, unclickable
 * tile. `className` sizes the tile.
 */
export function ZoomablePhoto({
  url,
  name,
  pack,
  className,
  zoomIcon = true,
}: {
  url: string | null | undefined;
  name: string;
  pack?: string | null;
  className: string;
  /** The small magnifier in the corner - leave out on tiny tiles. */
  zoomIcon?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [broken, setBroken] = useState(false);
  // If the tile disappears while open (navigation, a list re-rendering), don't leave the page unscrollable.
  const isOpen = useRef(false);
  useEffect(() => () => {
    if (isOpen.current) document.documentElement.style.overflow = "";
  }, []);
  const tile = `flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-zinc-200 ${className}`;

  if (!url || broken) return <div aria-hidden className={`${tile} bg-zinc-200`} />;

  const open = (e: React.MouseEvent) => {
    // Don't let the tap reach the card around it (links, toggles).
    e.preventDefault();
    e.stopPropagation();
    document.documentElement.style.overflow = "hidden";
    isOpen.current = true;
    dialog.current?.showModal();
  };
  const close = () => dialog.current?.close();

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label={`Vis større billede af ${name}`}
        className={`${tile} group relative cursor-zoom-in bg-white`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
          className="h-full w-full object-contain p-1 transition-transform group-hover:scale-105"
        />
        {zoomIcon && (
          <span className="absolute bottom-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-zinc-700 shadow-sm ring-1 ring-zinc-200">
            <ZoomIn aria-hidden className="h-3.5 w-3.5" />
          </span>
        )}
      </button>
      <dialog
        ref={dialog}
        aria-label={name}
        // A click on the backdrop (the dialog itself, outside the content) closes it.
        onClick={(e) => e.target === e.currentTarget && close()}
        onClose={() => {
          isOpen.current = false;
          document.documentElement.style.overflow = "";
        }}
        className="m-auto max-h-none max-w-none bg-transparent p-4 backdrop:bg-black/80"
      >
        <div className="relative flex max-w-[min(92vw,40rem)] flex-col items-center">
          <button
            type="button"
            onClick={close}
            aria-label="Luk"
            className="absolute -top-1 right-0 z-10 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-white text-zinc-800 shadow hover:bg-zinc-100"
          >
            <X aria-hidden className="h-5 w-5" />
          </button>
          <LargePhoto url={url} />
          <p className="mt-3 text-center font-semibold text-white">{name}</p>
          {pack && <p className="text-center text-sm text-zinc-300">{pack}</p>}
        </div>
      </dialog>
    </>
  );
}

/** The big photo; if the shop's image fails (moved, cut off), a quiet message instead. */
function LargePhoto({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="mt-12 flex h-64 w-64 flex-col items-center justify-center gap-2 rounded-xl bg-white text-sm text-zinc-500">
        <ImageOff aria-hidden className="h-8 w-8" />
        Billedet kunne ikke hentes
      </div>
    );
  }
  return (
    // Loaded only when opened (the dialog's content isn't rendered visibly before).
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      onError={() => setFailed(true)}
      // A fixed square that fills the screen: many shop photos are only 225-300 px, so they're scaled up.
      className="mt-12 h-[min(65dvh,85vw,34rem)] w-[min(65dvh,85vw,34rem)] rounded-xl bg-white object-contain p-4"
    />
  );
}
