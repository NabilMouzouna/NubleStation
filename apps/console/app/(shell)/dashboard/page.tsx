import Link from "next/link";
import {
  LayoutDashboard, HardDrive, Clock, Users,
  ShieldCheck, Wifi, Database, Box, Plus,
  ArrowUpRight, Activity, Cpu, MemoryStick, Rocket,
} from "lucide-react";
import { Card, CardContent } from "@nublestation/ui/components/card";
import { Badge }    from "@nublestation/ui/components/badge";
import { Button }   from "@nublestation/ui/components/button";
import { Progress } from "@nublestation/ui/components/progress";
import { Separator } from "@nublestation/ui/components/separator";
import { Avatar, AvatarFallback } from "@nublestation/ui/components/avatar";
import { validateSession } from "@/lib/auth/session";
import { getRecentDeployments } from "@/lib/platform/events";

// ─── Static data ────────────────────────────────────────────────────────────

type Status = "running" | "degraded" | "down";

const statusDot: Record<Status, string> = {
  running:  "animate-pulse bg-success",
  degraded: "bg-warning",
  down:     "bg-destructive",
};
const statusBadge: Record<Status, "success" | "warning" | "destructive"> = {
  running:  "success",
  degraded: "warning",
  down:     "destructive",
};

const nubleServices: { brand: string; slug: string; role: string; container: string; status: Status }[] = [
  { brand: "Vault",     slug: "vault",     role: "Storage",  container: "nuble-storage", status: "running" },
  { brand: "BlazingDB", slug: "blazingdb", role: "Database", container: "nuble-db",      status: "running" },
  { brand: "Identity",  slug: "identity",  role: "Auth",     container: "nuble-auth",    status: "running" },
  { brand: "Orbit",     slug: "orbit",     role: "Deploy",   container: "nuble-deploy",  status: "running" },
];

const infraServices: { name: string; icon: React.ElementType; container: string; status: Status }[] = [
  { name: "Caddy",    icon: ShieldCheck, container: "nuble-caddy",    status: "running" },
  { name: "CoreDNS",  icon: Wifi,        container: "nuble-coredns",  status: "running" },
  { name: "Postgres", icon: Database,    container: "nuble-postgres", status: "running" },
  { name: "Docker",   icon: Box,         container: "host daemon",    status: "running" },
];

const systemMetrics = [
  { label: "Disk",    value: 0,  detail: "0 GB used",    icon: HardDrive, color: "bg-primary"  },
  { label: "Memory",  value: 0,  detail: "— MB used",    icon: Cpu,       color: "bg-brand-violet" },
  { label: "Network", value: 0,  detail: "— KB/s",       icon: Activity,  color: "bg-success"  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

import type React from "react";

function getGreeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// ─── Page ────────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diffMs / 60_000);
  const hours = Math.floor(diffMs / 3_600_000);
  const days  = Math.floor(diffMs / 86_400_000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export default async function DashboardPage() {
  const [session, recentDeployments] = await Promise.all([
    validateSession(),
    getRecentDeployments(),
  ]);
  const handle  = (session?.email ?? "admin").split("@")[0] ?? "admin";
  const initials = handle.slice(0, 2).toUpperCase();
  const hour     = new Date().getHours();
  const greeting = getGreeting(hour);

  return (
    <div className="min-h-full p-5 lg:p-8">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {greeting}, {handle}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Infrastructure overview · clinic.local
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button asChild size="sm">
            <Link href="/apps?new=1"><Plus />Get started</Link>
          </Button>
          <Avatar className="size-9 ring-2 ring-border">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs">
              {initials}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Apps",       value: "0",   sub: "registered",    icon: LayoutDashboard, tint: "bg-primary/10      text-primary"      },
          { label: "Storage",    value: "0 GB", sub: "disk used",    icon: HardDrive,       tint: "bg-success/10      text-success"      },
          { label: "Uptime",     value: "—",    sub: "last 24 h",    icon: Clock,           tint: "bg-brand-blue/10   text-brand-blue"   },
          { label: "Sessions",   value: "1",    sub: "active",       icon: Users,           tint: "bg-brand-violet/10 text-brand-violet" },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm">
              <CardContent className="p-5">
                <div className={`inline-flex rounded-xl p-2 ${s.tint}`}>
                  <Icon className="size-4" />
                </div>
                <p className="mt-3 text-3xl font-bold tracking-tight text-foreground">{s.value}</p>
                <p className="mt-0.5 text-xs font-medium text-foreground">{s.label}</p>
                <p className="text-xs text-muted-foreground">{s.sub}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Main bento ── */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">

        {/* Left column (2/3) */}
        <div className="space-y-5 lg:col-span-2">

          {/* NubleStation services */}
          <Card>
            <CardContent className="p-0">
              <div className="flex items-center justify-between px-6 py-4">
                <h2 className="text-sm font-semibold text-foreground">NubleStation Services</h2>
                <Badge variant="success" className="gap-1.5">
                  <span className="size-1.5 animate-pulse rounded-full bg-success" />
                  All Running
                </Badge>
              </div>
              <Separator />
              <div className="divide-y divide-border">
                {nubleServices.map((svc, i) => (
                  <div
                    key={svc.brand}
                    className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-muted/40"
                  >
                    <img
                      src={`/services/${svc.slug}.svg`}
                      alt={svc.brand}
                      width={40}
                      height={40}
                      className="rounded-xl flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">{svc.brand}</p>
                      <p className="text-xs text-muted-foreground">
                        {svc.role} · <span className="font-mono">{svc.container}</span>
                      </p>
                    </div>
                    <div className="hidden sm:flex items-center gap-1.5">
                      <span className={`size-1.5 rounded-full ${statusDot[svc.status]}`} />
                      <span className="text-xs font-medium text-success">Running</span>
                    </div>
                    <span className="text-xs text-muted-foreground hidden md:block w-12 text-right">—</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Infrastructure */}
          <Card>
            <CardContent className="p-0">
              <div className="px-6 py-4">
                <h2 className="text-sm font-semibold text-foreground">Infrastructure</h2>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-0 divide-y divide-border sm:grid-cols-4 sm:divide-y-0">
                {infraServices.map((svc, i) => {
                  const Icon = svc.icon;
                  return (
                    <div
                      key={svc.name}
                      className={`flex flex-col gap-3 p-5 transition-colors hover:bg-muted/40 ${i < 3 ? "sm:border-r sm:border-border" : ""}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="rounded-lg bg-muted p-2">
                          <Icon className="size-4 text-muted-foreground" />
                        </div>
                        <span className={`size-2 rounded-full ${statusDot[svc.status]}`} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{svc.name}</p>
                        <p className="mt-0.5 text-[11px] font-mono text-muted-foreground">{svc.container}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

        </div>

        {/* Right column (1/3) */}
        <div className="space-y-5">

          {/* System health */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">System Health</h2>
                <ArrowUpRight className="size-4 text-muted-foreground" />
              </div>
              <div className="mt-5 space-y-4">
                {systemMetrics.map((m) => {
                  const Icon = m.icon;
                  return (
                    <div key={m.label}>
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="flex items-center gap-1.5 font-medium text-foreground">
                          <Icon className="size-3.5 text-muted-foreground" />
                          {m.label}
                        </span>
                        <span className="text-muted-foreground">{m.detail}</span>
                      </div>
                      <Progress value={m.value} indicatorClassName={m.color} />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Recent events */}
          <Card>
            <CardContent className="p-0">
              <div className="flex items-center justify-between px-6 py-4">
                <h2 className="text-sm font-semibold text-foreground">Recent Events</h2>
                <Link href="/audit" className="text-xs text-muted-foreground transition-colors hover:text-primary">
                  View all
                </Link>
              </div>
              <Separator />
              {recentDeployments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center px-6">
                  <div className="rounded-full bg-muted p-3">
                    <Activity className="size-5 text-muted-foreground" />
                  </div>
                  <p className="mt-3 text-sm font-medium text-foreground">No events yet</p>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    Deploy an app to see activity here.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {recentDeployments.map((ev) => (
                    <Link
                      key={ev.id}
                      href={`/apps/${ev.app_slug}`}
                      className="flex items-center gap-3 px-6 py-3.5 transition-colors hover:bg-muted/40"
                    >
                      <div className="rounded-lg bg-primary/10 p-2 shrink-0">
                        <Rocket className="size-3.5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {ev.display_name}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono">
                          v{ev.version}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {timeAgo(ev.deployed_at)}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}
