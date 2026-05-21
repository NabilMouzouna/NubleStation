import Image from "next/image";
import Link from "next/link";
import { Button } from "@nublestation/ui/components/button";

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="flex flex-col items-center gap-10 text-center">
        <Image
          src="/logo-light.png"
          alt="NubleStation"
          width={320}
          height={64}
          priority
        />

        <p className="max-w-xs text-sm text-muted-foreground">
          Private cloud infrastructure for your organization.
        </p>

        <Button asChild size="lg">
          <Link href="/auth">Sign in to console</Link>
        </Button>
      </div>
    </main>
  );
}
