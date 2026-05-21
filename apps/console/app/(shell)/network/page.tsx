import { Card, CardContent, CardHeader, CardTitle } from "@nublestation/ui/components/card";

const subdomains = [
  { subdomain: "console.clinic.local", target: "console container", type: "system" },
  { subdomain: "api.clinic.local",     target: "gateway container", type: "system" },
  { subdomain: "tasks.clinic.local",   target: "/var/nuble/apps/tasks/current", type: "app" },
  { subdomain: "patients.clinic.local",target: "/var/nuble/apps/patients/current", type: "app" },
  { subdomain: "scheduling.clinic.local", target: "/var/nuble/apps/scheduling/current", type: "app" },
];

const upstreams = [
  { name: "console",  container: "console:80",  status: "reachable" },
  { name: "gateway",  container: "gateway:3000", status: "reachable" },
  { name: "db",       container: "db:3001",      status: "reachable" },
  { name: "auth",     container: "auth:3002",    status: "reachable" },
  { name: "storage",  container: "storage:3003", status: "reachable" },
  { name: "deploy",   container: "deploy:3004",  status: "reachable" },
];

export default function NetworkPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Network</h1>
      <p className="mt-1 text-sm text-muted-foreground">DNS zones, Caddy upstreams, and registered subdomains</p>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>DNS</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Zone</span>
                <span className="font-mono text-foreground">*.clinic.local</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Resolver</span>
                <span className="font-mono text-foreground">CoreDNS :53</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Host IP</span>
                <span className="font-mono text-foreground">192.168.1.100</span>
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
          <CardHeader>
            <CardTitle>Caddy upstreams</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              {upstreams.map((u) => (
                <div key={u.name} className="flex items-center justify-between text-sm">
                  <span className="font-mono text-xs text-foreground">{u.container}</span>
                  <span className="flex items-center gap-1.5 text-success text-xs">
                    <span className="size-2 rounded-full bg-success" />
                    {u.status}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
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
            {subdomains.map((s) => (
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
