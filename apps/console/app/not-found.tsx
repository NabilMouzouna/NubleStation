import Link from "next/link";
import { Button } from "@nublestation/ui/components/button";
import { NubleIcon } from "@/components/brand";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      <NubleIcon size={56} />

      <div className="space-y-2">
        <p className="bg-gradient-to-r from-brand-blue to-brand-violet bg-clip-text text-7xl font-bold tracking-tight text-transparent">
          404
        </p>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Page not found
        </h1>
        <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
          The page you’re looking for doesn’t exist or may have been moved.
        </p>
      </div>

      <Button asChild>
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}
