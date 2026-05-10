import Image from "next/image";
import { Button } from "@repo/ui/components/button";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="flex max-w-xl flex-col items-center gap-8 text-center">

        <div className="space-y-3">
          <h1 className="text-5xl font-medium tracking-tight">
            NubleStation Console
          </h1>
          <p className="text-base text-muted-foreground">
            Self-hosted backend for your organization. Private. Local. Yours.
          </p>
        </div>

        <div className="flex gap-3">
          <Button size="lg">Get started</Button>
          <Button size="lg" variant="secondary">
            View docs
          </Button>
        </div>
      </div>
    </main>
  );
}
