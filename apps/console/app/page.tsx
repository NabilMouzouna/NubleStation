import Link from "next/link";
import { Button } from "@nublestation/ui/components/button";

function NubleIcon() {
  return (
    <svg
      width="72"
      height="44"
      viewBox="0 0 155 95"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="landing-g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1F4FE0" />
          <stop offset="100%" stopColor="#9B5BFF" />
        </linearGradient>
      </defs>
      <g transform="translate(0, -8)">
        <path
          d="M 30 75 C 8 75, 5 50, 25 45 C 18 18, 55 10, 72 32 C 85 12, 120 18, 120 48 C 142 48, 148 75, 128 75 Z"
          fill="url(#landing-g)"
        />
        <line
          x1="5" y1="98" x2="148" y2="98"
          stroke="url(#landing-g)" strokeWidth="6" strokeLinecap="round"
        />
        <line
          x1="40" y1="78" x2="40" y2="98"
          stroke="url(#landing-g)" strokeWidth="3" strokeLinecap="round"
        />
        <line
          x1="110" y1="78" x2="110" y2="98"
          stroke="url(#landing-g)" strokeWidth="3" strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="flex flex-col items-center gap-8 text-center">
        <NubleIcon />

        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            NubleStation
          </h1>
          <p className="text-base text-muted-foreground">
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
