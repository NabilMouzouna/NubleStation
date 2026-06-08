import { Card, CardContent } from "@nublestation/ui/components/card";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { getStorageStats } from "@/lib/platform/app-detail";

const DOCS = "https://nabilmouzouna.github.io/NubleStation/docs";

function formatBytes(n: number): string {
  if (n === 0) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default async function StoragePage() {
  const stats = await getStorageStats();

  const totalBytes = stats.reduce((s, a) => s + a.total_bytes, 0);
  const totalFiles = stats.reduce((s, a) => s + a.file_count, 0);

  return (
    <div className="p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Storage</h1>
          <p className="mt-1 text-sm text-muted-foreground">Organization-wide disk usage across all apps</p>
        </div>
        <Link
          href={`${DOCS}/services/storage/`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-primary shrink-0 mt-1"
        >
          Vault docs <ArrowUpRight className="size-3" />
        </Link>
      </div>

      {/* Summary card */}
      <Card className="mt-8">
        <CardContent className="p-6">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-foreground">{formatBytes(totalBytes)} used</span>
            <span className="text-muted-foreground">{totalFiles} file{totalFiles !== 1 ? "s" : ""} across {stats.length} app{stats.length !== 1 ? "s" : ""}</span>
          </div>
          {totalBytes > 0 && (
            <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-muted gap-0.5">
              {stats.filter(a => a.total_bytes > 0).map((app) => {
                const pct = (app.total_bytes / totalBytes) * 100;
                return (
                  <div
                    key={app.id}
                    className="h-full bg-primary first:rounded-l-full last:rounded-r-full transition-all"
                    style={{ width: `${pct}%` }}
                    title={`${app.display_name}: ${formatBytes(app.total_bytes)}`}
                  />
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <h2 className="mt-8 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Per-app breakdown
      </h2>

      {stats.length === 0 ? (
        <div className="mt-4 flex flex-col items-center justify-center rounded-3xl border border-dashed border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">No apps yet. Create an app and upload files to see storage usage.</p>
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-3xl border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">App</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Files</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Used</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Share</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {stats.map((app) => {
                const pct = totalBytes > 0 ? Math.round((app.total_bytes / totalBytes) * 100) : 0;
                return (
                  <tr key={app.id}>
                    <td className="px-5 py-3 font-medium text-foreground">{app.display_name}</td>
                    <td className="px-5 py-3 text-muted-foreground">{app.file_count}</td>
                    <td className="px-5 py-3 text-muted-foreground">{formatBytes(app.total_bytes)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground">{pct}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link href={`/apps/${app.name}`} className="text-xs text-primary hover:underline">
                        Browse files
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
