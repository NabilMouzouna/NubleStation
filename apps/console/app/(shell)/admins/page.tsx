import { Button } from "@nublestation/ui/components/button";
import { UserPlus } from "lucide-react";

const mockAdmins = [
  { email: "nabil@clinic.local",  role: "super_admin", created: "2026-05-01", status: "Active" },
  { email: "sara@clinic.local",   role: "admin",       created: "2026-05-10", status: "Active" },
  { email: "mehdi@clinic.local",  role: "admin",       created: "2026-05-15", status: "Active" },
];

export default function AdminsPage() {
  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Admins</h1>
          <p className="mt-1 text-sm text-muted-foreground">Platform administrators for this organization</p>
        </div>
        <Button size="sm">
          <UserPlus size={16} />
          Invite admin
        </Button>
      </div>

      <div className="mt-8 overflow-hidden rounded-3xl border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/50">
            <tr>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Role</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Created</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {mockAdmins.map((admin) => (
              <tr key={admin.email}>
                <td className="px-5 py-3 font-medium text-foreground">{admin.email}</td>
                <td className="px-5 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    admin.role === "super_admin"
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {admin.role}
                  </span>
                </td>
                <td className="px-5 py-3 text-muted-foreground">{admin.created}</td>
                <td className="px-5 py-3">
                  <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                    {admin.status}
                  </span>
                </td>
                <td className="px-5 py-3 text-right">
                  {admin.role !== "super_admin" && (
                    <button className="text-xs text-destructive hover:underline">Revoke</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
