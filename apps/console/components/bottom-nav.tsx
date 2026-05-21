"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Activity, AppWindow, HardDrive, Settings } from "lucide-react";
import { cn } from "@nublestation/ui/lib/utils";

const items = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Apps",      href: "/apps",      icon: AppWindow       },
  { label: "Watch",     href: "/watch",     icon: Activity        },
  { label: "Storage",   href: "/storage",   icon: HardDrive       },
  { label: "Settings",  href: "/settings",  icon: Settings        },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-around border-t border-border bg-background/95 backdrop-blur-sm md:hidden">
      {items.map(({ label, href, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-col items-center gap-1 px-3 py-1 transition-colors",
              active ? "text-primary" : "text-muted-foreground"
            )}
          >
            <Icon size={22} strokeWidth={active ? 2.5 : 1.75} />
            <span className={cn("text-[10px] font-medium", active ? "text-primary" : "text-muted-foreground")}>
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
