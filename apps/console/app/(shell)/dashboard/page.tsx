import Link from "next/link";
import {
  LayoutDashboard,
  HardDrive,
  Clock,
  Users,
  TrendingUp,
  Minus,
  ShieldCheck,
  Wifi,
  Database,
  Box,
  Plus,
} from "lucide-react";
import { Card, CardContent } from "@nublestation/ui/components/card";
import { Badge } from "@nublestation/ui/components/badge";
import { Button } from "@nublestation/ui/components/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@nublestation/ui/components/table";

// ─── Types ──────────────────────────────────────────────────────────────────

type ServiceStatus = "running" | "degraded" | "down";

const statusConfig: Record<ServiceStatus, { badge: "success" | "warning" | "destructive"; dot: string; label: string }> = {
  running:  { badge: "success",     dot: "animate-pulse bg-success",  label: "Running"  },
  degraded: { badge: "warning",     dot: "bg-warning",                label: "Degraded" },
  down:     { badge: "destructive", dot: "bg-destructive",            label: "Down"     },
};

// ─── Data ───────────────────────────────────────────────────────────────────

const stats = [
  { label: "Apps",     value: "0",  sub: "registered",       icon: LayoutDashboard, trend: "neutral" as const },
  { label: "Storage",  value: "—",  sub: "disk used",         icon: HardDrive,       trend: "neutral" as const },
  { label: "Uptime",   value: "—",  sub: "last 24 h",         icon: Clock,           trend: "up"      as const },
  { label: "Sessions", value: "1",  sub: "active admin",      icon: Users,           trend: "neutral" as const },
];

const nubleServices: { brand: string; slug: string; role: string; container: string; status: ServiceStatus }[] = [
  { brand: "Vault",     slug: "vault",     role: "Storage",  container: "nuble-storage", status: "running" },
  { brand: "BlazingDB", slug: "blazingdb", role: "Database", container: "nuble-db",      status: "running" },
  { brand: "Identity",  slug: "identity",  role: "Auth",     container: "nuble-auth",    status: "running" },
  { brand: "Orbit",     slug: "orbit",     role: "Deploy",   container: "nuble-deploy",  status: "running" },
];

const infraServices: { name: string; icon: React.ElementType; container: string; status: ServiceStatus }[] = [
  { name: "Caddy",    icon: ShieldCheck, container: "nuble-caddy",    status: "running" },
  { name: "CoreDNS",  icon: Wifi,        container: "nuble-coredns",  status: "running" },
  { name: "Postgres", icon: Database,    container: "nuble-postgres", status: "running" },
  { name: "Docker",   icon: Box,         container: "host daemon",    status: "running" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

import type React from "react";

function TrendIcon({ trend }: { trend: "up" | "down" | "neutral" }) {
  if (trend === "up")   return <TrendingUp className="size-4 text-success" />;
  if (trend === "down") return <TrendingUp className="size-4 rotate-180 text-destructive" />;
  return <Minus className="size-4 text-muted-foreground" />;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  return (
    <div className="p-8">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Infrastructure health overview</p>
        </div>
        <Button asChild size="sm">
          <Link href="/apps">
            <Plus />
            Create App
          </Link>
        </Button>
      </div>

      {/* Stat cards */}
      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="rounded-xl bg-muted p-2">
                    <Icon className="size-4 text-primary" />
                  </div>
                  <TrendIcon trend={s.trend} />
                </div>
                <p className="mt-4 text-3xl font-semibold tracking-tight text-foreground">{s.value}</p>
                <p className="mt-1 text-xs font-medium text-foreground">{s.label}</p>
                <p className="text-xs text-muted-foreground">{s.sub}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* NubleStation services */}
      <section className="mt-10">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          NubleStation Services
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {nubleServices.map((svc) => {
            const cfg = statusConfig[svc.status];
            return (
              <Card key={svc.brand} className="transition-all duration-150 hover:scale-[1.02] hover:shadow-sm">
                <CardContent className="p-5">
                  <img
                    src={`/services/${svc.slug}.svg`}
                    alt={svc.brand}
                    width={44}
                    height={44}
                    className="rounded-xl"
                  />
                  <p className="mt-3 text-sm font-semibold text-foreground">{svc.brand}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{svc.role}</p>
                  <div className="mt-3 flex items-center gap-1.5">
                    <span className={`size-1.5 rounded-full ${cfg.dot}`} />
                    <Badge variant={cfg.badge} className="text-[10px]">{cfg.label}</Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Infrastructure */}
      <section className="mt-8">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Infrastructure
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {infraServices.map((svc) => {
            const Icon = svc.icon;
            const cfg = statusConfig[svc.status];
            return (
              <Card key={svc.name} className="transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div className="rounded-lg bg-muted p-2">
                      <Icon className="size-4 text-muted-foreground" />
                    </div>
                    <span className={`size-1.5 rounded-full ${cfg.dot}`} />
                  </div>
                  <p className="mt-3 text-sm font-medium text-foreground">{svc.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{svc.container}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Recent events */}
      <section className="mt-8">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Recent Events
        </h2>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell colSpan={3}>
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <div className="rounded-full bg-muted p-3">
                        <Clock className="size-5 text-muted-foreground" />
                      </div>
                      <p className="mt-3 text-sm font-medium text-foreground">No events recorded yet.</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Infrastructure events will appear here as they occur.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

    </div>
  );
}
