"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@nublestation/ui/components/dialog";
import { Button } from "@nublestation/ui/components/button";
import { Input } from "@nublestation/ui/components/input";
import { createAdminAction } from "./actions";

export function InviteAdminDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await createAdminAction(formData);
      if (result?.error) {
        setError(result.error);
      } else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus size={16} />
          Add admin
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add platform admin</DialogTitle>
          <DialogDescription>
            Platform admins can manage apps, users, and settings across the
            whole organization.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} aria-busy={isPending} className="flex flex-col gap-4 pt-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="invite-email" className="text-sm font-medium">
              Email
            </label>
            <Input id="invite-email" name="email" type="email" required autoComplete="off" autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="invite-display-name" className="text-sm font-medium">
              Display name
            </label>
            <Input id="invite-display-name" name="display_name" autoComplete="off" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="invite-password" className="text-sm font-medium">
              Password
            </label>
            <Input
              id="invite-password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              aria-describedby="invite-password-hint"
            />
            <p id="invite-password-hint" className="text-xs text-muted-foreground">
              At least 8 characters.
            </p>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating…" : "Create admin"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
