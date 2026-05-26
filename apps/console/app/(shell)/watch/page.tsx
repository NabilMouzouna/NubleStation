"use client";

import { useState, useEffect } from "react";
import { Card } from "@nublestation/ui/components/card";
import { Button } from "@nublestation/ui/components/button";
import { RefreshCw } from "lucide-react";

// "deploy" and "audit" have real API-backed log sources.
// Other container tabs require Docker API access (not wired up).
const REAL_CONTAINERS = ["deploy", "audit"] as const;
const OTHER_CONTAINERS = ["gateway", "blaze", "orbit", "console", "caddy", "coredns", "postgres"];
const CONTAINERS = [...REAL_CONTAINERS, ...OTHER_CONTAINERS];

type LogEntry = {
  time: string;
  container: string;
  level: "info" | "warn" | "error";
  msg: string;
};

const levelColor: Record<string, string> = {
  info:  "text-muted-foreground",
  warn:  "text-warning",
  error: "text-destructive",
};

async function fetchLogs(container: string): Promise<LogEntry[]> {
  if (container === "deploy" || container === "audit") {
    const res = await fetch(`/api/logs/${container}`, { cache: "no-store" });
    if (!res.ok) return [];
    return res.json();
  }
  return [];
}

export default function WatchPage() {
  const [selected, setSelected]     = useState("deploy");
  const [logs, setLogs]             = useState<LogEntry[]>([]);
  const [loadedFor, setLoadedFor]   = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const loading = loadedFor !== `${selected}:${refreshKey}`;
  const isRealSource = (REAL_CONTAINERS as readonly string[]).includes(selected);

  useEffect(() => {
    const key = `${selected}:${refreshKey}`;
    fetchLogs(selected).then((data) => {
      setLogs(data);
      setLoadedFor(key);
    });
  }, [selected, refreshKey]);

  return (
    <div className="flex h-full flex-col p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Watch</h1>
          <p className="mt-1 text-sm text-muted-foreground">Live log stream per container</p>
        </div>

        <Button
          variant="ghost"
          size="sm"
          disabled={loading || !isRealSource}
          onClick={() => setRefreshKey((k) => k + 1)}
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </Button>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {CONTAINERS.map((c) => {
          const isReal = (REAL_CONTAINERS as readonly string[]).includes(c);
          return (
            <button
              key={c}
              onClick={() => setSelected(c)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                selected === c
                  ? "bg-primary text-white"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {c}
              {isReal && (
                <span className="ml-1.5 inline-block size-1.5 rounded-full bg-success align-middle" />
              )}
            </button>
          );
        })}
      </div>

      <Card className="mt-4 flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto p-5 font-mono text-xs">
          {!isRealSource ? (
            <p className="text-muted-foreground">
              Container log streaming requires Docker API access — not configured in this release.
            </p>
          ) : loading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : logs.length === 0 ? (
            <p className="text-muted-foreground">No logs yet for {selected}.</p>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="flex gap-4 py-0.5">
                <span className="shrink-0 text-muted-foreground">{log.time}</span>
                <span className="shrink-0 w-20 text-primary">{log.container}</span>
                <span className={`shrink-0 w-10 ${levelColor[log.level]}`}>{log.level}</span>
                <span className="text-foreground">{log.msg}</span>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
