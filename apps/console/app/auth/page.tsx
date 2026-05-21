import {
  Card,
  CardContent,
  CardHeader,
} from "@nublestation/ui/components/card";
import { Input } from "@nublestation/ui/components/input";
import { Button } from "@nublestation/ui/components/button";

function NubleIcon() {
  return (
    <svg
      width="40"
      height="25"
      viewBox="0 0 155 95"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="auth-g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1F4FE0" />
          <stop offset="100%" stopColor="#9B5BFF" />
        </linearGradient>
      </defs>
      <g transform="translate(0, -8)">
        <path
          d="M 30 75 C 8 75, 5 50, 25 45 C 18 18, 55 10, 72 32 C 85 12, 120 18, 120 48 C 142 48, 148 75, 128 75 Z"
          fill="url(#auth-g)"
        />
        <line
          x1="5" y1="98" x2="148" y2="98"
          stroke="url(#auth-g)" strokeWidth="6" strokeLinecap="round"
        />
        <line
          x1="40" y1="78" x2="40" y2="98"
          stroke="url(#auth-g)" strokeWidth="3" strokeLinecap="round"
        />
        <line
          x1="110" y1="78" x2="110" y2="98"
          stroke="url(#auth-g)" strokeWidth="3" strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

export default function AuthPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <NubleIcon />
          <span className="text-2xl font-bold tracking-tight text-foreground">
            NubleStation
          </span>
        </div>

        <Card>
          <CardHeader>
            <h1 className="text-xl font-semibold text-foreground">Sign in</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter your admin credentials to continue.
            </p>
          </CardHeader>

          <CardContent>
            <form className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="email"
                  className="text-sm font-medium text-foreground"
                >
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

              <Button type="submit" className="mt-2 w-full">
                Sign in
              </Button>

              {/* Shown only on failed login — wired when auth server action is added */}
              <p
                aria-live="polite"
                className="hidden text-center text-sm text-destructive"
              >
                Invalid email or password.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
