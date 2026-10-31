/**
 * POST /api/compare  { items: BasketItem[] }  ->  { results: ShopResult[], alcohol }
 *
 * The basket lives in the browser; this prices it in every shop. `alcohol` is the
 * basket's liters of spirits / fortified wine / wine / beer, for the import-limit
 * warning (the browser compares it with the number of adults).
 */
import { z } from "zod";
import { compareBasket } from "@/catalog/compare";
import { familiesById, getShops, packsForBasket } from "@/catalog/data";
import { alcoholLiters } from "@/catalog/import-limits";

const MAX_ITEMS = 100;

const Item = z.discriminatedUnion("kind", [
  z.object({
    key: z.string().max(100),
    kind: z.literal("family"),
    familyId: z.number().int().positive(),
    label: z.string().max(200),
    amount: z.number().positive().max(10_000),
    step: z.number().positive().max(10_000),
    unit: z.enum(["l", "kg", "piece"]),
  }),
  z.object({
    key: z.string().max(100),
    kind: z.literal("product"),
    productId: z.number().int().positive(),
    label: z.string().max(200),
    quantity: z.number().int().positive().max(1000),
  }),
]);
const Body = z.object({ items: z.array(Item).max(MAX_ITEMS) });

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ugyldig kurv" }, { status: 400 });

  const { items } = parsed.data;
  if (!items.length) return Response.json({ results: [], alcohol: {} });

  const productIds = items.flatMap((i) => (i.kind === "product" ? [i.productId] : []));
  const familyIds = items.flatMap((i) => (i.kind === "family" ? [i.familyId] : []));
  const [packs, shops] = await Promise.all([packsForBasket(productIds, familyIds), getShops()]);
  // Product items need their pack's family too, for the alcohol type.
  const packFamilies = packs.flatMap((p) => (p.familyId ? [p.familyId] : []));
  const families = await familiesById([...familyIds, ...packFamilies]);
  return Response.json({ results: compareBasket(items, packs, shops), alcohol: alcoholLiters(items, packs, families) });
}
