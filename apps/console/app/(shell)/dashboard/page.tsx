import {
  Card,
  CardContent,
} from "@nublestation/ui/components/card";

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

const statusStyles: Record<Status, { dot: string; label: string; text: string }> = {
  running:  { dot: "bg-success",     label: "Running",  text: "text-success" },
  degraded: { dot: "bg-warning",     label: "Degraded", text: "text-warning" },
  down:     { dot: "bg-destructive", label: "Down",     text: "text-destructive" },
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
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Services
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {services.map((svc) => {
            const s = statusStyles[svc.status];
            return (
              <Card key={svc.name}>
                <CardContent className="p-5">
                  <div className="flex items-center gap-2">
                    <span className={`size-2 rounded-full ${s.dot}`} />
                    <span className={`text-xs font-medium ${s.text}`}>
                      {s.label}
                    </span>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-foreground">
                    {svc.name}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Recent events
        </h2>
        <Card>
          <CardContent className="px-6 py-5">
            <p className="text-sm text-muted-foreground">No events yet.</p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
