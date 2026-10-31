"use client";

import { useActionState } from "react";
import type { FormState } from "./actions";

const input = "rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900";

/** Shared by sign-in and first-run setup. */
export function CredentialsForm({
  action,
  submitLabel,
  askName = false,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  askName?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-3">
      {askName && (
        <label className="flex flex-col gap-1 text-sm">
          Your name
          <input name="name" required className={input} />
        </label>
      )}
      <label className="flex flex-col gap-1 text-sm">
        Email
        <input name="email" type="email" autoComplete="email" required className={input} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Password
        <input
          name="password"
          type="password"
          autoComplete={askName ? "new-password" : "current-password"}
          minLength={askName ? 10 : undefined}
          required
          className={input}
        />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      <button
        disabled={pending}
        className="rounded-md bg-zinc-900 px-4 py-2 text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {pending ? "Please wait…" : submitLabel}
      </button>
    </form>
  );
}
