import type { Unit } from "@/catalog/types";

/** 69,95 */
export const kr = (n: number) => n.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 7,92 */
export const amount = (n: number) => n.toLocaleString("da-DK", { maximumFractionDigits: 3 });

export const UNIT_LABEL: Record<Unit, string> = { l: "l", kg: "kg", piece: "stk." };
export const PER_UNIT_LABEL: Record<Unit, string> = { l: "pr. liter", kg: "pr. kg", piece: "pr. stk." };

/** Plurals of the piece words families are counted in (product_families.piece_label, singular). */
const PIECE_PLURAL: Record<string, string> = {
  kapsel: "kapsler",
  pose: "poser",
  vask: "vaske",
  rulle: "ruller",
  pude: "puder",
  tab: "tabs",
};

/** "1 kapsel", "40 kapsler", "6 stk." - pieceLabel is the family's singular word ("stk." when unset). */
export function pieces(n: number, pieceLabel?: string | null): string {
  const word = pieceLabel || "stk.";
  return `${amount(n)} ${n === 1 ? word : (PIECE_PLURAL[word] ?? word)}`;
}

/** "pr. liter", "pr. kg", or for a piece family its own word: "pr. vask", "pr. kapsel". */
export function perUnitLabel(unit: Unit, pieceLabel?: string | null): string {
  return unit === "piece" ? `pr. ${pieceLabel || "stk."}` : PER_UNIT_LABEL[unit];
}

/** An amount in its unit: "2 kg", "1,5 l", "40 kapsler". */
export function unitAmount(n: number, unit: Unit, pieceLabel?: string | null): string {
  return unit === "piece" ? pieces(n, pieceLabel) : `${amount(n)} ${UNIT_LABEL[unit]}`;
}

/**
 * A pack label in its family's piece word: the catalog labels counted packs "40 stk.", which
 * becomes "40 kapsler" in a capsule family. Other labels ("24 x 0,33 l") are left as they are.
 */
export function pieceWords(label: string, pieceLabel?: string | null): string;
export function pieceWords(label: string | null | undefined, pieceLabel?: string | null): string | null;
export function pieceWords(label: string | null | undefined, pieceLabel?: string | null): string | null {
  if (!label) return null;
  const m = /^([\d.,]+) stk\.$/.exec(label);
  return m && pieceLabel ? pieces(Number(m[1].replace(/\./g, "").replace(",", ".")), pieceLabel) : label;
}

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
