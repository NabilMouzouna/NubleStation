"use client";

import { useActionState } from "react";
import { Input } from "@nublestation/ui/components/input";
import { Button } from "@nublestation/ui/components/button";
import { login } from "./actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium text-foreground">
          Email
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="admin@example.com"
          autoComplete="email"
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="password"
          className="text-sm font-medium text-foreground"
        >
          Password
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          placeholder="••••••••"
          autoComplete="current-password"
          required
        />
      </div>

      <Button type="submit" size="lg" className="mt-2 w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>

      {state?.error && (
        <p aria-live="polite" className="text-center text-sm text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
