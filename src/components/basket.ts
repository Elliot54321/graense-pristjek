"use client";
/**
 * The basket lives in the browser (localStorage), so there's no login. Components
 * subscribe with useBasket(); changes in one tab show up in others too.
 */
import { useSyncExternalStore } from "react";
import type { BasketItem } from "@/catalog/types";

const STORAGE_KEY = "graense-pris-kurv";
const CHANGE_EVENT = "graense-pris-kurv-change";
const EMPTY: BasketItem[] = [];

let cachedRaw: string | null = null;
let cachedItems: BasketItem[] = EMPTY;

function read(): BasketItem[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return EMPTY; // private mode or blocked storage
  }
  // useSyncExternalStore needs the same array back while nothing changed.
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cachedItems = raw ? (JSON.parse(raw) as BasketItem[]) : EMPTY;
    } catch {
      cachedItems = EMPTY;
    }
  }
  return cachedItems;
}

function write(items: BasketItem[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Storage full or blocked: the basket just won't survive a reload.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange); // other tabs
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useBasket(): BasketItem[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

/** Adds an item, or increases it if the same thing is already in the basket. */
export function addToBasket(item: BasketItem) {
  const items = read();
  const existing = items.find((i) => i.key === item.key);
  if (!existing) return write([...items, item]);
  write(
    items.map((i) => {
      if (i.key !== item.key) return i;
      if (i.kind === "product" && item.kind === "product") return { ...i, quantity: i.quantity + item.quantity };
      if (i.kind === "family" && item.kind === "family") return { ...i, amount: i.amount + item.amount };
      return i;
    }),
  );
}

export function updateBasketItem(key: string, change: { quantity?: number; amount?: number }) {
  write(
    read().map((i) => {
      if (i.key !== key) return i;
      if (i.kind === "product" && change.quantity !== undefined) return { ...i, quantity: change.quantity };
      if (i.kind === "family" && change.amount !== undefined) return { ...i, amount: change.amount };
      return i;
    }),
  );
}

export function removeFromBasket(key: string) {
  write(read().filter((i) => i.key !== key));
}

export function clearBasket() {
  write(EMPTY);
}
