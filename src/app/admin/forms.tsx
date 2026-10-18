"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
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

/** Submit button that disables itself while its form's server action runs. */
export function ActionButton({
  action,
  children,
  variant,
}: {
  action: (formData: FormData) => Promise<void>;
  children: React.ReactNode;
  variant: "yes" | "no";
}) {
  const { pending } = useFormStatus();
  const colors =
    variant === "yes"
      ? "bg-emerald-600 text-white"
      : "border border-zinc-300 text-zinc-800 dark:border-zinc-600 dark:text-zinc-100";
  return (
    <button formAction={action} disabled={pending} className={`flex-1 rounded-lg px-4 py-3 font-medium disabled:opacity-50 ${colors}`}>
      {pending ? "Gemmer…" : children}
    </button>
  );
}
