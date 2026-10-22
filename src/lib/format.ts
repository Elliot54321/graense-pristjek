import type { Unit } from "@/catalog/types";

/** 69,95 */
export const kr = (n: number) => n.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 7,92 */
export const amount = (n: number) => n.toLocaleString("da-DK", { maximumFractionDigits: 3 });

export const UNIT_LABEL: Record<Unit, string> = { l: "l", kg: "kg", piece: "stk." };
export const PER_UNIT_LABEL: Record<Unit, string> = { l: "pr. liter", kg: "pr. kg", piece: "pr. stk." };

/** 3. november */
export const day = (iso: string) => new Date(iso).toLocaleDateString("da-DK", { day: "numeric", month: "long" });
