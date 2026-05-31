"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, CheckCheck, ArrowRight, ChevronLeft, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogBody,
} from "@nublestation/ui/components/dialog";
import { Button } from "@nublestation/ui/components/button";
import { Input } from "@nublestation/ui/components/input";
import { createAppAction, type CreateAppState } from "./actions";
import { copyToClipboard } from "@/lib/clipboard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Step = "name" | "services" | "creating" | "done";

const PROGRESS_STEPS = [
  "Registering application",
  "Generating API key",
  "Preparing storage directory",
  "Finalizing",
] as const;

// ---------------------------------------------------------------------------
// Slug derivation
// ---------------------------------------------------------------------------

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

// ---------------------------------------------------------------------------
// Service cards shown in step 2
// ---------------------------------------------------------------------------

const SERVICES = [
  { slug: "blazingdb", brand: "BlazingDB", role: "Database" },
  { slug: "orbit",     brand: "Orbit",     role: "Deployments" },
  { slug: "vault",     brand: "Vault",     role: "Storage" },
  { slug: "identity",  brand: "Identity",  role: "Auth" },
] as const;

// ---------------------------------------------------------------------------
// Step components
// ---------------------------------------------------------------------------

function StepName({
  displayName,
  slug,
  orgDomain,
  onDisplayNameChange,
  onSlugChange,
  onSlugEdit,
  error,
}: {
  displayName: string;
  slug: string;
  orgDomain: string;
  onDisplayNameChange: (v: string) => void;
  onSlugChange: (v: string) => void;
  onSlugEdit: () => void;
  error?: string;
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">App name</label>
        <Input
          autoFocus
          placeholder="e.g. Patient Portal"
          value={displayName}
          onChange={(e) => onDisplayNameChange(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">
          URL slug
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {slug ? `→ ${slug}.${orgDomain}.local` : ""}
          </span>
        </label>
        <Input
          placeholder="e.g. patient-portal"
          value={slug}
          onChange={(e) => {
            onSlugEdit();
            onSlugChange(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/^-+/, ""));
          }}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <p className="text-xs text-muted-foreground">
          Lowercase letters, numbers, and hyphens. Cannot start or end with a hyphen.
        </p>
      </div>
    </div>
  );
}

function StepServices() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        All NubleStation services are included with every app. No configuration needed.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {SERVICES.map((svc) => (
          <div
            key={svc.slug}
            className="flex items-center gap-3 rounded-2xl border border-border bg-muted/30 p-3"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/services/${svc.slug}.svg`}
              alt={svc.brand}
              width={36}
              height={36}
              className="rounded-xl shrink-0"
            />
            <div>
              <p className="text-sm font-semibold text-foreground">{svc.brand}</p>
              <p className="text-xs text-muted-foreground">{svc.role}</p>
            </div>
            <Check className="ml-auto size-4 shrink-0 text-success" />
          </div>
        ))}
      </div>
    </div>
  );
}

function StepCreating({ completedCount }: { completedCount: number }) {
  return (
    <div className="space-y-4 py-2">
      <p className="text-sm text-muted-foreground">
        Hang tight — we are setting things up for you.
      </p>
      <ul className="space-y-3">
        {PROGRESS_STEPS.map((label, i) => {
          const done = i < completedCount;
          const active = i === completedCount;
          return (
            <li key={label} className="flex items-center gap-3">
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-all duration-500 ${
                  done
                    ? "bg-success text-white"
                    : active
                      ? "bg-primary/10 text-primary ring-2 ring-primary/30"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {done ? (
                  <Check className="size-3.5" />
                ) : active ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <span>{i + 1}</span>
                )}
              </span>
              <span
                className={`text-sm transition-colors duration-300 ${
                  done
                    ? "text-foreground"
                    : active
                      ? "font-medium text-foreground"
                      : "text-muted-foreground"
                }`}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StepDone({
  displayName,
  slug,
  apiKey,
  orgDomain,
}: {
  displayName: string;
  slug: string;
  apiKey: string;
  orgDomain: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await copyToClipboard(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-3 py-2 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-success/10">
          <Check className="size-7 text-success" />
        </div>
        <div>
          <p className="font-semibold text-foreground">{displayName} is ready</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {slug}.{orgDomain}.local
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-muted/40 p-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            API Key
          </p>
          <button
            onClick={copy}
            className="flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            {copied ? (
              <><CheckCheck className="size-3.5 text-success" /> Copied</>
            ) : (
              <><Copy className="size-3.5" /> Copy</>
            )}
          </button>
        </div>
        <p className="break-all font-mono text-xs text-foreground">{apiKey}</p>
        <p className="text-xs text-muted-foreground">
          Shown once — store it in a secure place. You cannot retrieve it again.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main dialog
// ---------------------------------------------------------------------------

export function CreateAppDialog({
  open,
  onOpenChange,
  orgDomain,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgDomain: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [step, setStep] = useState<Step>("name");
  const [displayName, setDisplayName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [nameError, setNameError] = useState("");
  const [completedCount, setCompletedCount] = useState(0);
  const [result, setResult] = useState<CreateAppState | null>(null);

  function handleDisplayNameChange(v: string) {
    setDisplayName(v);
    if (!slugEdited) setSlug(toSlug(v));
  }

  // Reset when dialog closes.
  function reset() {
    setStep("name");
    setDisplayName("");
    setSlug("");
    setSlugEdited(false);
    setNameError("");
    setCompletedCount(0);
    setResult(null);
  }

  function handleOpenChange(v: boolean) {
    if (!v && step !== "creating") {
      reset();
      onOpenChange(false);
    } else if (v) {
      onOpenChange(true);
    }
  }

  // ------ Step navigation ------

  function validateName(): boolean {
    if (!displayName.trim()) { setNameError("App name is required."); return false; }
    if (!slug) { setNameError("URL slug is required."); return false; }
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug)) {
      setNameError("Slug must start and end with a letter or number.");
      return false;
    }
    setNameError("");
    return true;
  }

  function goToServices() {
    if (!validateName()) return;
    setStep("services");
  }

  function startCreating() {
    setStep("creating");
    setCompletedCount(0);

    // Fire server action immediately.
    let actionResult: CreateAppState;
    const actionPromise = createAppAction(displayName, slug).then((r) => {
      actionResult = r;
    });

    // Animate progress steps — each step takes 600 ms.
    const delays = [600, 1200, 1800, 2400];
    const timers: ReturnType<typeof setTimeout>[] = [];

    delays.forEach((ms, i) => {
      timers.push(setTimeout(() => setCompletedCount(i + 1), ms));
    });

    // Show "done" only after animation finishes AND action completes.
    Promise.all([
      actionPromise,
      new Promise<void>((res) => setTimeout(res, 2700)),
    ]).then(() => {
      timers.forEach(clearTimeout);
      if (actionResult!.ok) {
        setResult(actionResult!);
        setStep("done");
        // Refresh server-rendered apps list.
        startTransition(() => router.refresh());
      } else {
        // Surface error back to name step.
        setNameError(actionResult!.error ?? "Something went wrong.");
        setStep("name");
      }
    });
  }

  // ------ Step metadata ------

  const stepLabel: Record<Step, string> = {
    name:     "1 of 2 — Name",
    services: "2 of 2 — Services",
    creating: "",
    done:     "",
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent hideClose={step === "creating"}>
        <DialogHeader>
          {stepLabel[step] && (
            <p className="text-xs font-medium text-muted-foreground">{stepLabel[step]}</p>
          )}
          <DialogTitle>
            {step === "name"     && "Create a new app"}
            {step === "services" && "Included services"}
            {step === "creating" && "Setting up your app…"}
            {step === "done"     && "Your app is ready"}
          </DialogTitle>
          {step === "name" && (
            <DialogDescription>
              Give your app a name. You can always change the display name later.
            </DialogDescription>
          )}
        </DialogHeader>

        <DialogBody>
          {step === "name" && (
            <StepName
              displayName={displayName}
              slug={slug}
              orgDomain={orgDomain}
              onDisplayNameChange={handleDisplayNameChange}
              onSlugChange={setSlug}
              onSlugEdit={() => setSlugEdited(true)}
              error={nameError}
            />
          )}
          {step === "services" && <StepServices />}
          {step === "creating" && <StepCreating completedCount={completedCount} />}
          {step === "done" && result?.apiKey && (
            <StepDone displayName={displayName} slug={slug} apiKey={result.apiKey} orgDomain={orgDomain} />
          )}
        </DialogBody>

        <DialogFooter>
          {step === "name" && (
            <>
              <Button variant="ghost" size="sm" onClick={() => { reset(); onOpenChange(false); }}>
                Cancel
              </Button>
              <Button size="sm" onClick={goToServices} disabled={!displayName.trim() || !slug}>
                Next <ArrowRight />
              </Button>
            </>
          )}
          {step === "services" && (
            <>
              <Button variant="ghost" size="sm" onClick={() => setStep("name")}>
                <ChevronLeft /> Back
              </Button>
              <Button size="sm" onClick={startCreating}>
                Create app <ArrowRight />
              </Button>
            </>
          )}
          {step === "creating" && (
            <Button size="sm" disabled>
              <Loader2 className="animate-spin" /> Creating…
            </Button>
          )}
          {step === "done" && (
            <Button
              size="sm"
              onClick={() => {
                onOpenChange(false);
                reset();
                router.push(`/apps/${slug}`);
              }}
            >
              Open {displayName} <ArrowRight />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
