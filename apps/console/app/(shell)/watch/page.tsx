"use client";

import { useState, useEffect } from "react";
import { Card } from "@nublestation/ui/components/card";
import { Button } from "@nublestation/ui/components/button";
import { RefreshCw } from "lucide-react";

const CONTAINERS = [
  "gateway", "db", "auth", "storage", "deploy",
  "console", "caddy", "coredns", "postgres",
];

const mockLogs = [
  { time: "10:42:01", container: "gateway", level: "info",  msg: "POST /v1/db/tasks → 200 12ms" },
  { time: "10:42:01", container: "db",      level: "info",  msg: "withTenant(app-1) query completed in 4ms" },
  { time: "10:42:03", container: "gateway", level: "info",  msg: "GET /v1/storage/files → 200 8ms" },
  { time: "10:42:05", container: "caddy",   level: "info",  msg: "tasks.clinic.local → 200" },
  { time: "10:42:07", container: "gateway", level: "warn",  msg: "Rate limit approaching for app-2" },
  { time: "10:42:09", container: "postgres",level: "info",  msg: "checkpoint complete: wrote 42 buffers" },
  { time: "10:42:11", container: "db",      level: "info",  msg: "migration applied: 0001_init_platform" },
  { time: "10:42:14", container: "gateway", level: "error", msg: "HMAC verification failed — rejected request" },
];

type LogEntry = typeof mockLogs[number];

const levelColor: Record<string, string> = {
  info:  "text-muted-foreground",
  warn:  "text-warning",
  error: "text-destructive",
};

export default function WatchPage() {
  const [selected, setSelected]   = useState("gateway");
  const [logs, setLogs]           = useState<LogEntry[]>([]);
  const [loading, setLoading]     = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    // TODO: replace with real fetch from /api/logs?container={selected}
    const timeout = setTimeout(() => {
      setLogs(mockLogs.filter((l) => l.container === selected));
      setLoading(false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [selected, refreshKey]);

  return (
    <div className="flex h-full flex-col p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Watch</h1>
          <p className="mt-1 text-sm text-muted-foreground">Live log stream per container</p>
        </div>

        <Button
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() => setRefreshKey((k) => k + 1)}
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </Button>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {CONTAINERS.map((c) => (
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
          </button>
        ))}
      </div>

      <Card className="mt-4 flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto p-5 font-mono text-xs">
          {loading ? (
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
