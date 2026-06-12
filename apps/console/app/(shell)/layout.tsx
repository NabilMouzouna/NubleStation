import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { validateSession } from "@/lib/auth/session";
import {
  LayoutDashboard,
  Activity,
  AppWindow,
  Network,
  HardDrive,
  ClipboardList,
  Users,
  Settings,
  LogOut,
  BookOpen,
} from "lucide-react";
import { NubleSidebarHeader } from "@/components/brand";
import { NavItem } from "@/components/nav-item";
import { BottomNav } from "@/components/bottom-nav";
import { ThemeToggle } from "@/components/theme-toggle";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: <LayoutDashboard size={16} /> },
  { label: "Watch",     href: "/watch",     icon: <Activity size={16} />        },
  { label: "Apps",      href: "/apps",      icon: <AppWindow size={16} />       },
  { label: "Network",   href: "/network",   icon: <Network size={16} />         },
  { label: "Storage",   href: "/storage",   icon: <HardDrive size={16} />       },
  { label: "Audit",     href: "/audit",     icon: <ClipboardList size={16} />   },
];

const adminItems = [
  { label: "Admins",   href: "/admins",   icon: <Users size={16} />    },
  { label: "Settings", href: "/settings", icon: <Settings size={16} /> },
];

export default async function ShellLayout({ children }: { children: ReactNode }) {
  const session = await validateSession();
  if (!session) redirect("/auth");
  const orgLabel = `${process.env.ORG_NAME ?? "Organization"} · ${process.env.ORG_DOMAIN ?? "nuble"}.local`;
  return (
    <div className="flex h-screen overflow-hidden bg-background">

      {/* Sidebar — desktop only */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-background md:flex">
        <div className="px-5 py-5">
          <NubleSidebarHeader />
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3">
          {navItems.map((item) => (
            <NavItem key={item.href} href={item.href} icon={item.icon} label={item.label} />
          ))}
          <div className="my-3 border-t border-border" />
          {adminItems.map((item) => (
            <NavItem key={item.href} href={item.href} icon={item.icon} label={item.label} />
          ))}
        </nav>

        <div className="border-t border-border px-5 py-4">
          <p className="text-xs font-medium text-foreground">{orgLabel}</p>
          <a
            href="https://nabilmouzouna.github.io/NubleStation"
            target="_blank"
            rel="noreferrer"
            className="mt-3 flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <BookOpen size={13} />
            Documentation
          </a>
          <div className="mt-3 flex items-center justify-between">
            <form action="/auth/logout" method="POST">
              <button
                type="submit"
                className="flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-destructive"
              >
                <LogOut size={13} />
                Sign out
              </button>
            </form>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      {/* Main — bottom padding on mobile to clear the bottom nav */}
      <main className="flex flex-1 flex-col overflow-auto pb-16 md:pb-0">
        {children}
      </main>

      {/* Bottom nav — mobile only */}
      <BottomNav />

    </div>
  );
}
