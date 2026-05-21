import { Input } from "@nublestation/ui/components/input";
import { Search } from "lucide-react";

const mockAudit = [
  { action: "app.created",   target: "tasks",          admin: "nabil@clinic.local", date: "2026-05-19 09:01" },
  { action: "key.issued",    target: "nbl_a3f9c2••••", admin: "nabil@clinic.local", date: "2026-05-19 09:02" },
  { action: "app.deployed",  target: "tasks v1",       admin: "nabil@clinic.local", date: "2026-05-19 09:03" },
  { action: "admin.invited", target: "sara@clinic.local", admin: "nabil@clinic.local", date: "2026-05-10 11:30" },
  { action: "app.deployed",  target: "tasks v2",       admin: "sara@clinic.local",  date: "2026-05-20 14:17" },
  { action: "app.deployed",  target: "tasks v3",       admin: "nabil@clinic.local", date: "2026-05-21 10:42" },
];

export default function AuditPage() {
  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Audit log</h1>
          <p className="mt-1 text-sm text-muted-foreground">Every mutating action performed by platform admins</p>
        </div>
        <button className="text-sm text-muted-foreground hover:text-foreground">
          Export CSV
        </button>
      </div>

      <div className="relative mt-6 max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Filter by action or admin..." className="pl-9" />
      </div>

      <div className="mt-4 overflow-hidden rounded-3xl border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/50">
            <tr>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Action</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Target</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Admin</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Timestamp</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {mockAudit.map((entry, i) => (
              <tr key={i}>
                <td className="px-5 py-3 font-mono text-xs text-foreground">{entry.action}</td>
                <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{entry.target}</td>
                <td className="px-5 py-3 text-muted-foreground">{entry.admin}</td>
                <td className="px-5 py-3 text-muted-foreground">{entry.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
