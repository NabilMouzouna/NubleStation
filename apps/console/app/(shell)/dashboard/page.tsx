import {
  LayoutDashboard,
  HardDrive,
  Clock,
  Users,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { Card, CardContent } from "@nublestation/ui/components/card";
import { Badge } from "@nublestation/ui/components/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@nublestation/ui/components/table";

// ─── Static placeholder data ───────────────────────────────────────────────

const stats = [
  {
    label: "Apps",
    value: "0",
    sub: "registered apps",
    trend: "neutral" as const,
    icon: LayoutDashboard,
  },
  {
    label: "Storage",
    value: "0 GB",
    sub: "of total disk",
    trend: "neutral" as const,
    icon: HardDrive,
  },
  {
    label: "Uptime",
    value: "—",
    sub: "last 24 hours",
    trend: "up" as const,
    icon: Clock,
  },
  {
    label: "Sessions",
    value: "1",
    sub: "active admin sessions",
    trend: "neutral" as const,
    icon: Users,
  },
];

type ServiceStatus = "running" | "degraded" | "down";

const services: { name: string; container: string; status: ServiceStatus; uptime: string }[] = [
  { name: "Gateway",  container: "nuble-gateway",  status: "running",  uptime: "—" },
  { name: "Database", container: "nuble-db",        status: "running",  uptime: "—" },
  { name: "Auth",     container: "nuble-auth",      status: "running",  uptime: "—" },
  { name: "Storage",  container: "nuble-storage",   status: "running",  uptime: "—" },
  { name: "Deploy",   container: "nuble-deploy",    status: "running",  uptime: "—" },
  { name: "Postgres", container: "nuble-postgres",  status: "running",  uptime: "—" },
  { name: "Caddy",    container: "nuble-caddy",     status: "running",  uptime: "—" },
  { name: "CoreDNS",  container: "nuble-coredns",   status: "running",  uptime: "—" },
];

const statusConfig: Record<ServiceStatus, { badge: "success" | "warning" | "destructive"; label: string }> = {
  running:  { badge: "success",     label: "Running" },
  degraded: { badge: "warning",     label: "Degraded" },
  down:     { badge: "destructive", label: "Down" },
};

const TrendIcon = ({ trend }: { trend: "up" | "down" | "neutral" }) => {
  if (trend === "up")      return <TrendingUp  className="size-4 text-success" />;
  if (trend === "down")    return <TrendingDown className="size-4 text-destructive" />;
  return <Minus className="size-4 text-muted-foreground" />;
};

// ─── Page ───────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Infrastructure health overview
          </p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card
              key={s.label}
              className="transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm"
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="rounded-xl bg-muted p-2">
                    <Icon className="size-4 text-primary" />
                  </div>
                  <TrendIcon trend={s.trend} />
                </div>
                <p className="mt-4 text-3xl font-semibold tracking-tight text-foreground">
                  {s.value}
                </p>
                <p className="mt-1 text-xs font-medium text-foreground">{s.label}</p>
                <p className="text-xs text-muted-foreground">{s.sub}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Service grid */}
      <section className="mt-10">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Services
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {services.map((svc) => {
            const cfg = statusConfig[svc.status];
            return (
              <Card
                key={svc.name}
                className="transition-all duration-150 hover:scale-[1.02] hover:shadow-sm"
              >
                <CardContent className="p-5">
                  <div className="flex items-center gap-2">
                    <span
                      className={`size-2 rounded-full ${
                        cfg.badge === "success"
                          ? "animate-pulse bg-success"
                          : cfg.badge === "warning"
                          ? "bg-warning"
                          : "bg-destructive"
                      }`}
                    />
                    <Badge variant={cfg.badge}>{cfg.label}</Badge>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-foreground">
                    {svc.name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {svc.container}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {svc.uptime !== "—" ? `Up ${svc.uptime}` : "—"}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Recent events */}
      <section className="mt-10">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Recent events
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
                      <p className="mt-3 text-sm font-medium text-foreground">
                        No events recorded yet.
                      </p>
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
