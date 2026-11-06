import type { Unit } from "@/catalog/types";

/** 69,95 */
export const kr = (n: number) => n.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 7,92 */
export const amount = (n: number) => n.toLocaleString("da-DK", { maximumFractionDigits: 3 });

export const UNIT_LABEL: Record<Unit, string> = { l: "l", kg: "kg", piece: "stk." };
export const PER_UNIT_LABEL: Record<Unit, string> = { l: "pr. liter", kg: "pr. kg", piece: "pr. stk." };

/**
 * A pack as shoppers know it: "24 x 0,33 l" for a case, "0,7 l" for one bottle.
 * Falls back to the total content when the pack shape is unknown.
 */
export function packLabel(
  count: number | null,
  unitSize: number | null,
  unit: Unit | null,
  total: number | null,
): string | null {
  if (unit && unitSize && count && count > 1) return `${count} x ${amount(unitSize)} ${UNIT_LABEL[unit]}`;
  if (unit && unitSize) return `${amount(unitSize)} ${UNIT_LABEL[unit]}`;
  if (unit && total) return `${amount(total)} ${UNIT_LABEL[unit]}`;
  return null;
}

/** 3. november */
export const day = (iso: string) => new Date(iso).toLocaleDateString("da-DK", { day: "numeric", month: "long" });

/** 1.240 (whole kroner, for rough estimates) */
export const krRound = (n: number) => Math.round(n).toLocaleString("da-DK");

/** 2 t 30 min */
export const duration = (minutes: number) => {
  const rounded = Math.max(5, Math.round(minutes / 5) * 5);
  const [h, m] = [Math.floor(rounded / 60), rounded % 60];
  return h ? `${h} t${m ? ` ${m} min` : ""}` : `${m} min`;
};
