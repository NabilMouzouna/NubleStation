import Link from "next/link";
import { Card, CardContent } from "@nublestation/ui/components/card";
import { Database, HardDrive, Clock } from "lucide-react";
import { listApps } from "@/lib/platform/apps";
import { AppsPageClient } from "./_apps-page-client";

export default async function AppsPage() {
  const orgDomain = process.env.ORG_DOMAIN ?? "nuble";
  let apps: Awaited<ReturnType<typeof listApps>> = [];
  try {
    apps = await listApps();
  } catch {
    // DB not yet reachable (dev without full stack) — show empty state.
  }

  return (
    <AppsPageClient orgDomain={orgDomain}>
      <div className="p-8">
        <div className="mt-8">
          {apps.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border py-20 text-center">
              <div className="rounded-full bg-muted p-4">
                <Database className="size-6 text-muted-foreground" />
              </div>
              <p className="mt-4 font-semibold text-foreground">No apps yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Create your first app to get started.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {apps.map((app) => (
                <Link key={app.id} href={`/apps/${app.name}`}>
                  <Card className="transition-shadow hover:shadow-md">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-foreground">{app.display_name}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {app.name}.{process.env.ORG_DOMAIN ?? "nuble"}.local
                          </p>
                        </div>
                        {app.has_deployment ? (
                          <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                            Live
                          </span>
                        ) : (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                            Not deployed
                          </span>
                        )}
                      </div>
                      <div className="mt-5 flex gap-5 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <Database size={13} />
                          0 tables
                        </span>
                        <span className="flex items-center gap-1.5">
                          <HardDrive size={13} />
                          0 MB
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Clock size={13} />
                          {new Date(app.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppsPageClient>
  );
}
