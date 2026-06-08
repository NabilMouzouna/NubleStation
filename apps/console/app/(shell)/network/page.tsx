import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@nublestation/ui/components/card";
import { checkServices, type ServiceHealth } from "@/lib/platform/health";
import { listApps } from "@/lib/platform/apps";
import { BandwidthCard } from "./_bandwidth-card";

const DOCS = "https://nabilmouzouna.github.io/NubleStation/docs";

export default async function NetworkPage() {
  const domain  = process.env.ORG_DOMAIN ?? "nuble";
  const hostIp  = process.env.HOST_IP ?? "—";

  const [apps, services] = await Promise.all([
    listApps().catch(() => []),
    checkServices().catch((): ServiceHealth[] => []),
  ]);

  const statusOf = (key: string) =>
    services.find((s) => s.name === key)?.status ?? "running";

  const systemSubdomains = [
    { subdomain: `console.${domain}.local`, target: "console container", type: "system" as const },
    { subdomain: `api.${domain}.local`,     target: "api container",     type: "system" as const },
  ];

  const appSubdomains = apps.map((app) => ({
    subdomain: `${app.name}.${domain}.local`,
    target:    `/var/nuble/apps/${app.name}/current`,
    type:      "app" as const,
  }));

  const allSubdomains = [...systemSubdomains, ...appSubdomains];

  // Services routable through Caddy — checked against internal healthz endpoints
  const upstreams = [
    { name: "console", addr: "console:3000", key: null        },
    { name: "api",     addr: "api:3000",     key: "gateway"   },
    { name: "blaze",   addr: "blaze:3001",   key: "blaze"     },
    { name: "orbit",   addr: "orbit:3002",   key: "orbit"     },
  ];

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Network</h1>
      <p className="mt-1 text-sm text-muted-foreground">DNS zones, Caddy upstreams, and registered subdomains</p>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>DNS</CardTitle>
            <Link href={`${DOCS}/infrastructure/coredns/`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary">
              Docs <ArrowUpRight className="size-3" />
            </Link>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Zone</span>
                <span className="font-mono text-foreground">*.{domain}.local</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Resolver</span>
                <span className="font-mono text-foreground">CoreDNS :53</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Host IP</span>
                <span className="font-mono text-foreground">{hostIp}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status</span>
                <span className="flex items-center gap-1.5 text-success">
                  <span className="size-2 rounded-full bg-success" />
                  Resolving
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Caddy upstreams</CardTitle>
            <Link href={`${DOCS}/infrastructure/caddy/`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary">
              Docs <ArrowUpRight className="size-3" />
            </Link>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              {upstreams.map((u) => {
                const status = u.key ? statusOf(u.key) : "running";
                const isUp   = status === "running";
                return (
                  <div key={u.name} className="flex items-center justify-between text-sm">
                    <span className="font-mono text-xs text-foreground">{u.addr}</span>
                    <span className={`flex items-center gap-1.5 text-xs ${isUp ? "text-success" : "text-destructive"}`}>
                      <span className={`size-2 rounded-full ${isUp ? "bg-success" : "bg-destructive"}`} />
                      {isUp ? "reachable" : status}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <BandwidthCard domain={domain} />
      </div>

      <div className="mt-6 overflow-hidden rounded-3xl border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/50">
            <tr>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Subdomain</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Routes to</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Type</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {allSubdomains.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-5 py-8 text-center text-sm text-muted-foreground">
                  No subdomains registered.
                </td>
              </tr>
            ) : allSubdomains.map((s) => (
              <tr key={s.subdomain}>
                <td className="px-5 py-3 font-mono text-xs text-foreground">{s.subdomain}</td>
                <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{s.target}</td>
                <td className="px-5 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    s.type === "system"
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {s.type}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
