const services = [
  { name: "Gateway", status: "running" },
  { name: "Database", status: "running" },
  { name: "Auth", status: "running" },
  { name: "Storage", status: "running" },
  { name: "Deploy", status: "running" },
  { name: "Postgres", status: "running" },
  { name: "Caddy", status: "running" },
  { name: "CoreDNS", status: "running" },
] as const;

type Status = "running" | "degraded" | "down";

const statusDot: Record<Status, string> = {
  running: "bg-success",
  degraded: "bg-warning",
  down: "bg-destructive",
};

const statusLabel: Record<Status, string> = {
  running: "Running",
  degraded: "Degraded",
  down: "Down",
};

export default function DashboardPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Dashboard
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Infrastructure health overview
      </p>

      <section className="mt-8">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Services
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {services.map((svc) => (
            <div
              key={svc.name}
              className="rounded-3xl border border-border bg-card p-5"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`size-2 rounded-full ${statusDot[svc.status]}`}
                />
                <span className="text-xs font-medium text-muted-foreground">
                  {statusLabel[svc.status]}
                </span>
              </div>
              <p className="mt-3 text-sm font-semibold text-foreground">
                {svc.name}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Recent infra events — wired to infra_events table once Docker polling is added */}
      <section className="mt-10">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Recent events
        </h2>
        <div className="rounded-3xl border border-border bg-card px-6 py-5">
          <p className="text-sm text-muted-foreground">No events yet.</p>
        </div>
      </section>
    </div>
  );
}
