import Link from "next/link";

/** Shown for unknown addresses (and unknown categories). */
export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-3xl py-10 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Siden findes ikke</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">Adressen er forkert, eller siden er flyttet.</p>
      <Link
        href="/"
        className="mt-6 inline-flex min-h-11 items-center rounded-md bg-zinc-700 px-5 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
      >
        Søg efter varer
      </Link>
    </main>
  );
}
