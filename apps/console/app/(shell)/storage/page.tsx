import { Card, CardContent } from "@nublestation/ui/components/card";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

const DOCS = "https://nabilmouzouna.github.io/NubleStation/docs";

const mockApps = [
  { slug: "tasks",      usedMb: 12,  files: 8  },
  { slug: "patients",   usedMb: 340, files: 127 },
  { slug: "scheduling", usedMb: 5,   files: 3  },
];

const totalMb = mockApps.reduce((sum, a) => sum + a.usedMb, 0);
const diskMb = 10240;
const usedPct = Math.round((totalMb / diskMb) * 100);

export default function StoragePage() {
  return (
    <div className="p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Storage</h1>
          <p className="mt-1 text-sm text-muted-foreground">Organization-wide disk usage across all apps</p>
        </div>
        <Link href={`${DOCS}/services/storage/`} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-primary shrink-0 mt-1">
          Vault docs <ArrowUpRight className="size-3" />
        </Link>
      </div>

      <Card className="mt-8">
        <CardContent className="p-6">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-foreground">{totalMb} MB used</span>
            <span className="text-muted-foreground">{diskMb - totalMb} MB free of {diskMb} MB</span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${
                usedPct > 80 ? "bg-destructive" : usedPct > 60 ? "bg-warning" : "bg-success"
              }`}
              style={{ width: `${usedPct}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">{usedPct}% of available disk</p>
        </CardContent>
      </Card>

      <h2 className="mt-8 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Per-app breakdown
      </h2>

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
            {mockApps.map((app) => {
              const pct = Math.round((app.usedMb / totalMb) * 100);
              return (
                <tr key={app.slug}>
                  <td className="px-5 py-3 font-medium text-foreground capitalize">{app.slug}</td>
                  <td className="px-5 py-3 text-muted-foreground">{app.files}</td>
                  <td className="px-5 py-3 text-muted-foreground">{app.usedMb} MB</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground">{pct}%</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link href={`/apps/${app.slug}`} className="text-xs text-primary hover:underline">
                      Browse files
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
