"use server";
/**
 * "Fejl i prisen?" reports. Anyone can call a server action with a plain POST, so
 * everything is validated here; a hidden "website" field catches simple spam bots
 * (people never see or fill it).
 */
import { z } from "zod";
import { adminClient } from "@/db/admin";

const Report = z.object({
  message: z.string().trim().min(3).max(2000),
  shop: z.string().max(40).optional(),
  product: z.string().max(300).optional(),
  price: z.coerce.number().nonnegative().max(100_000).optional(),
  page: z.string().max(300).optional(),
  website: z.string().max(0).optional(), // the bot trap
});

export type FeedbackState = { status: "idle" | "sent" | "error"; message?: string };

export async function sendFeedback(_prev: FeedbackState, formData: FormData): Promise<FeedbackState> {
  const value = (key: string) => {
    const v = formData.get(key);
    return typeof v === "string" && v !== "" ? v : undefined;
  };
  const parsed = Report.safeParse({
    message: value("message"),
    shop: value("shop"),
    product: value("product"),
    price: value("price"),
    page: value("page"),
    website: value("website"),
  });
  if (!parsed.success) {
    // A filled bot trap looks like success, so bots don't learn anything.
    if (value("website")) return { status: "sent" };
    return { status: "error", message: "Skriv gerne lidt mere om fejlen (mindst 3 tegn)." };
  }
  const r = parsed.data;
  const { error } = await adminClient()
    .from("feedback")
    .insert({ message: r.message, shop_id: r.shop ?? null, product: r.product ?? null, price: r.price ?? null, page: r.page ?? null });
  if (error) {
    console.error("feedback insert failed:", error.message);
    return { status: "error", message: "Beskeden kunne ikke sendes. Prøv igen om lidt." };
  }
  return { status: "sent" };
}
