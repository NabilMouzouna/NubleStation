import { getPool } from "@/lib/db";

export type ServiceStatus = "running" | "degraded" | "down";

async function ping(url: string): Promise<ServiceStatus> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(2000),
      cache: "no-store",
    });
    return res.ok ? "running" : "degraded";
  } catch {
    return "down";
  }
}

export interface ServiceHealth {
  name: string;
  status: ServiceStatus;
}

export async function checkServices(): Promise<ServiceHealth[]> {
  const [gateway, blaze, orbit, postgres] = await Promise.all([
    ping("http://api:3000/healthz"),
    ping("http://blaze:3001/healthz"),
    ping("http://orbit:3002/healthz"),
    getPool()
      .query("SELECT 1")
      .then(() => "running" as ServiceStatus)
      .catch(() => "down" as ServiceStatus),
  ]);

  return [
    { name: "gateway", status: gateway },
    { name: "blaze",   status: blaze   },
    { name: "orbit",   status: orbit   },
    { name: "postgres", status: postgres },
  ];
}
