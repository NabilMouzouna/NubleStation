import Link from "next/link";
import { Button } from "@nublestation/ui/components/button";
import { NubleLogo } from "@/components/brand";

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="flex flex-col items-center gap-10 text-center">
        <NubleLogo tagline />

        <div className="flex flex-col items-center gap-2">
          <p className="max-w-xs text-sm text-muted-foreground">
            Private cloud infrastructure for your organization.
          </p>
        </div>

        <Button asChild size="lg">
          <Link href="/auth">Sign in to console</Link>
        </Button>
      </div>
    </main>
  );
}
