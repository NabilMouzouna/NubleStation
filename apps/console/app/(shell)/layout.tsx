import Link from "next/link";
import type { ReactNode } from "react";

const navItems = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Watch", href: "/watch" },
  { label: "Apps", href: "/apps" },
  { label: "Network", href: "/network" },
  { label: "Storage", href: "/storage" },
  { label: "Audit", href: "/audit" },
];

// Visible only to super_admin — role gating wired when auth is added
const adminItems = [
  { label: "Admins", href: "/admins" },
  { label: "Settings", href: "/settings" },
];

export default function ShellLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="flex w-56 flex-shrink-0 flex-col border-r border-border bg-background">
        <div className="px-5 py-6">
          <span className="text-sm font-bold tracking-tight text-foreground">
            NubleStation
          </span>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}

          <div className="my-2 border-t border-border" />

          {adminItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-border px-5 py-4">
          {/* Org name populated from session once auth is wired */}
          <p className="text-xs text-muted-foreground">Organization</p>
          <button
            type="button"
            className="mt-2 text-sm font-medium text-destructive transition-colors hover:text-destructive/80"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex flex-1 flex-col overflow-auto">{children}</main>
    </div>
  );
}
