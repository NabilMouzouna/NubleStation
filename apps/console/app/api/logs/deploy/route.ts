import { NextResponse } from "next/server";
import { getPlatformPool } from "@/lib/platform/db";

export interface DeployLogEntry {
  time: string;
  container: "deploy";
  level: "info";
  msg: string;
}

export async function GET() {
  try {
    const pool = getPlatformPool();
    const { rows } = await pool.query<{
      version: string;
      deployed_at: string;
      app_slug: string;
      display_name: string;
    }>(
      `SELECT d.version, d.deployed_at, a.name AS app_slug, a.display_name
       FROM platform.deployments d
       JOIN platform.apps a ON a.id = d.app_id
       ORDER BY d.deployed_at DESC
       LIMIT 50`,
    );

    const entries: DeployLogEntry[] = rows.map((r) => ({
      time: new Date(r.deployed_at).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      container: "deploy",
      level: "info",
      msg: `deployed ${r.app_slug}  version ${r.version}`,
    }));

    return NextResponse.json(entries);
  } catch (err) {
    console.error("deploy log fetch failed", err);
    return NextResponse.json([], { status: 500 });
  }
}
