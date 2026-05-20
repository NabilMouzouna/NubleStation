import {
  Card,
  CardContent,
  CardHeader,
} from "@nublestation/ui/components/card";
import { Input } from "@nublestation/ui/components/input";
import { Button } from "@nublestation/ui/components/button";

export default function AuthPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
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
