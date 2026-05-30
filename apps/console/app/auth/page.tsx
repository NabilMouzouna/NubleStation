import { redirect } from "next/navigation";
import { Card } from "@nublestation/ui/components/card";
import { validateSession } from "@/lib/auth/session";
import { LoginForm } from "./_login-form";

export default async function AuthPage() {
  const session = await validateSession();
  if (session) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="w-full max-w-sm">
        <Card>
          <div className="p-8">
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-light.svg" alt="NubleStation Logo" width={200} height={40} className="dark:hidden" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt="NubleStation Logo" width={200} height={40} className="hidden dark:block" />
            </div>

            <div className="mb-5 mt-8 text-center">
              <h1 className="text-xl font-semibold text-foreground">Sign in</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Enter your admin credentials to continue.
              </p>
            </div>

            <LoginForm />
          </div>
        </Card>
      </div>
    </main>
  );
}
