import type { ReactNode } from "react";
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
} from "lucide-react";
import { NubleSidebarHeader } from "@/components/brand";
import { NavItem } from "@/components/nav-item";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: <LayoutDashboard size={16} /> },
  { label: "Watch", href: "/watch", icon: <Activity size={16} /> },
  { label: "Apps", href: "/apps", icon: <AppWindow size={16} /> },
  { label: "Network", href: "/network", icon: <Network size={16} /> },
  { label: "Storage", href: "/storage", icon: <HardDrive size={16} /> },
  { label: "Audit", href: "/audit", icon: <ClipboardList size={16} /> },
];

const adminItems = [
  { label: "Admins", href: "/admins", icon: <Users size={16} /> },
  { label: "Settings", href: "/settings", icon: <Settings size={16} /> },
];

export default function ShellLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="flex w-56 flex-shrink-0 flex-col border-r border-border bg-background">
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
          <p className="text-xs font-medium text-foreground">Organization</p>
          <p className="text-xs text-muted-foreground">clinic.local</p>
          <form action="/auth/logout" method="POST" className="mt-3">
            <button
              type="submit"
              className="flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-destructive"
            >
              <LogOut size={13} />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="flex flex-1 flex-col overflow-auto">{children}</main>
    </div>
  );
}
