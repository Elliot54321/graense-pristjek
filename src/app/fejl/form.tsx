"use client";

import Link from "next/link";
import { useActionState } from "react";
import { type FeedbackState, sendFeedback } from "./actions";

export interface Context {
  shop?: string;
  shopName?: string;
  product?: string;
  price?: string;
  page?: string;
}

export function FeedbackForm({ context }: { context: Context }) {
  const [state, action, pending] = useActionState<FeedbackState, FormData>(sendFeedback, { status: "idle" });

  if (state.status === "sent") {
    return (
      <div className="mt-4">
        <p>Tak for din besked – vi kigger på det.</p>
        <p className="mt-3">
          <Link href={context.page ?? "/"} className="underline underline-offset-2">
            Tilbage
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="mt-4 flex flex-col gap-3">
      {(context.product || context.shopName) && (
        <p className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
          Det drejer sig om: <strong>{context.product ?? "en vare"}</strong>
          {context.shopName && <> hos {context.shopName}</>}
          {context.price && <> til {context.price} kr.</>}
        </p>
      )}
      <input type="hidden" name="shop" value={context.shop ?? ""} />
      <input type="hidden" name="product" value={context.product ?? ""} />
      <input type="hidden" name="price" value={context.price ?? ""} />
      <input type="hidden" name="page" value={context.page ?? ""} />
      {/* Bot trap: hidden from people, so only bots fill it in. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
      <label className="flex flex-col gap-1 text-sm">
        Hvad er forkert? (fx forkert pris, forkert vare, eller varen findes ikke længere)
        <textarea
          name="message"
          required
          minLength={3}
          maxLength={2000}
          rows={5}
          className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-base dark:border-zinc-700"
        />
      </label>
      <p className="text-xs text-zinc-500">Skriv ikke personlige oplysninger – vi kan ikke svare dig her.</p>
      {state.status === "error" && <p className="text-sm text-red-700 dark:text-red-400">{state.message}</p>}
      <button
        disabled={pending}
        className="rounded-lg bg-zinc-900 px-4 py-3 font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {pending ? "Sender…" : "Send"}
      </button>
    </form>
  );
}
