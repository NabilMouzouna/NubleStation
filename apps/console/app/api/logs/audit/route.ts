import { NextResponse } from "next/server";
import { getPlatformPool } from "@/lib/platform/db";

export interface AuditLogEntry {
  time: string;
  container: "audit";
  level: "info";
  msg: string;
}

export async function GET() {
  try {
    const pool = getPlatformPool();
    const { rows } = await pool.query<{
      action: string;
      created_at: string;
      app_name: string | null;
      actor_email: string | null;
    }>(
      `SELECT al.action, al.created_at,
              a.name AS app_name,
              u.email AS actor_email
       FROM platform.audit_log al
       LEFT JOIN platform.apps a ON a.id = al.app_id
       LEFT JOIN platform.users u ON u.id = al.actor_user_id
       ORDER BY al.created_at DESC
       LIMIT 100`,
    );

    const entries: AuditLogEntry[] = rows.map((r) => {
      const parts: string[] = [r.action];
      if (r.app_name) parts.push(`app=${r.app_name}`);
      if (r.actor_email) parts.push(`by=${r.actor_email}`);
      return {
        time: new Date(r.created_at).toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
        container: "audit",
        level: "info",
        msg: parts.join("  "),
      };
    });

    return NextResponse.json(entries);
  } catch (err) {
    console.error("audit log fetch failed", err);
    return NextResponse.json([], { status: 500 });
  }
}
