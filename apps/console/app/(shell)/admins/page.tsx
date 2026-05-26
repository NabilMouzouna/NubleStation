import { getPool } from "@/lib/db";
import { InviteAdminDialog } from "./_invite-dialog";

interface AdminRow {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
}

async function listAdmins(): Promise<AdminRow[]> {
  try {
    const { rows } = await getPool().query<AdminRow>(
      `SELECT id, email, display_name, role, is_active, created_at
       FROM platform.users
       WHERE role IN ('super_admin', 'admin')
       ORDER BY created_at ASC`,
    );
    return rows;
  } catch {
    return [];
  }
}

export default async function AdminsPage() {
  const admins = await listAdmins();

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Admins</h1>
          <p className="mt-1 text-sm text-muted-foreground">Platform administrators for this organization</p>
        </div>
        <InviteAdminDialog />
      </div>

      <div className="mt-8 overflow-hidden rounded-3xl border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/50">
            <tr>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Role</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Joined</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {admins.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-sm text-muted-foreground">
                  No admins found.
                </td>
              </tr>
            ) : admins.map((admin) => (
              <tr key={admin.id}>
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
                <td className="px-5 py-3 text-muted-foreground">
                  {new Date(admin.created_at).toLocaleDateString()}
                </td>
                <td className="px-5 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    admin.is_active
                      ? "bg-success/10 text-success"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {admin.is_active ? "Active" : "Inactive"}
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
