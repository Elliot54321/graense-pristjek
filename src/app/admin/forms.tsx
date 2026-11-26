"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { login } from "./actions";

export function LoginForm() {
  const [error, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Adgangskode
        <input
          type="password"
          name="password"
          required
          autoComplete="current-password"
          className="rounded-lg border border-zinc-300 px-3 py-3 text-base dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        disabled={pending}
        className="rounded-lg bg-zinc-900 px-4 py-3 font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {pending ? "Logger ind…" : "Log ind"}
      </button>
    </form>
  );
}

/** Fired when a decision also covered other listings (identical newsletter offers). */
const ALSO_DECIDED = "admin-also-decided";

export interface Decision {
  /** May return the ids of other listings the decision also covered (identical newsletter offers). */
  action: (formData: FormData) => Promise<{ also: number[] } | void>;
  label: string;
  variant: "yes" | "no";
  /** Shown on the card once saved, e.g. "Linket". */
  done: string;
}

/**
 * A review card whose buttons save without reloading the page: the card stays where it is,
 * dimmed, and its button row becomes a same-height "saved" row, so nothing on the page moves
 * and the next card is right where it was. The queue refills with "Hent flere" (ReloadButton).
 */
export function DecisionCard({
  idName = "shopProductId",
  id,
  decisions,
  children,
}: {
  idName?: string;
  id: number;
  decisions: Decision[];
  children: React.ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Another card's decision covered this one too (same newsletter offer): show it as saved.
  useEffect(() => {
    if (idName !== "shopProductId") return;
    const onAlso = (e: Event) => {
      const { ids, done } = (e as CustomEvent<{ ids: number[]; done: string }>).detail;
      if (ids.includes(id)) setDone((d) => d ?? `${done} (samme tilbud)`);
    };
    window.addEventListener(ALSO_DECIDED, onAlso);
    return () => window.removeEventListener(ALSO_DECIDED, onAlso);
  }, [id, idName]);

  const decide = (d: Decision) => {
    setBusy(d.label);
    setError(null);
    startTransition(async () => {
      const form = new FormData();
      form.set(idName, String(id));
      try {
        const result = await d.action(form);
        const also = result?.also ?? [];
        setDone(also.length ? `${d.done} – også ${also.length} ens tilbud` : d.done);
        if (also.length) window.dispatchEvent(new CustomEvent(ALSO_DECIDED, { detail: { ids: also, done: d.done } }));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Kunne ikke gemme.");
      } finally {
        setBusy(null);
      }
    });
  };

  return (
    <li className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className={done ? "opacity-40" : undefined}>{children}</div>
      {error && <p className="mt-3 text-sm text-red-600">Kunne ikke gemme: {error}</p>}
      {done ? (
        <p className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 font-medium text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
          ✓ {done}
        </p>
      ) : (
        <div className="mt-4 flex gap-3">
          {decisions.map((d) => (
            <button
              key={d.label}
              type="button"
              onClick={() => decide(d)}
              disabled={pending}
              className={`flex-1 rounded-lg px-4 py-3 font-medium disabled:opacity-50 ${
                d.variant === "yes"
                  ? "bg-emerald-600 text-white"
                  : "border border-zinc-300 text-zinc-800 dark:border-zinc-600 dark:text-zinc-100"
              }`}
            >
              {busy === d.label ? "Gemmer…" : d.label}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}

/** Reloads the queue: decided cards leave, the next ones move up. */
export function ReloadButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      onClick={() => startTransition(() => router.refresh())}
      disabled={pending}
      className="mt-4 w-full rounded-lg border border-zinc-300 px-4 py-3 font-medium text-zinc-800 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-100"
    >
      {pending ? "Henter…" : "Hent flere"}
    </button>
  );
}
