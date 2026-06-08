"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Upload, Activity, Play, Square, ArrowUpRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@nublestation/ui/components/card";
import { Button } from "@nublestation/ui/components/button";

// ---------------------------------------------------------------------------
// Measurement — drives OpenSpeedTest's /downloading + /upload data endpoints
// directly from the browser and computes throughput. We own the numbers, so
// they can be shown in-app and kept in localStorage. No server round-trip.
// ---------------------------------------------------------------------------

const STREAMS = 4; // parallel connections — one TCP stream can't saturate a fast link
const PHASE_MS = 8000; // measurement window per phase
const WARMUP_MS = 1500; // discarded so TCP slow-start doesn't drag the average down
const UPLOAD_BYTES = 8 * 1024 * 1024;
const HISTORY_KEY = "nuble.speedtest.history";
const MAX_HISTORY = 8;
const GAUGE_SCALE = 1000; // Mbps mapped onto the gauge (sqrt curve keeps low-end legible)

interface Result {
  download: number;
  upload: number;
  ping: number;
  jitter: number;
  ts: number;
}

type Phase = "idle" | "ping" | "download" | "upload" | "done" | "error";

const rand = () => `${performance.now()}-${STREAMS}-${Math.floor(performance.timeOrigin)}`;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function loadHistory(): Result[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as Result[]) : [];
  } catch {
    return [];
  }
}

function saveHistory(h: Result[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, MAX_HISTORY)));
  } catch {
    /* private mode / quota — history is optional, ignore */
  }
}

function randomBuffer(size: number): ArrayBuffer {
  const buf = new ArrayBuffer(size);
  const a = new Uint8Array(buf);
  for (let o = 0; o < size; o += 65536) {
    crypto.getRandomValues(a.subarray(o, Math.min(o + 65536, size)));
  }
  return buf;
}

async function measurePing(base: string, signal: AbortSignal): Promise<{ ping: number; jitter: number }> {
  const samples: number[] = [];
  for (let i = 0; i < 12 && !signal.aborted; i++) {
    const t0 = performance.now();
    try {
      const res = await fetch(`${base}/downloading?ping&r=${rand()}-${i}`, { cache: "no-store", signal });
      const reader = res.body!.getReader();
      await reader.read(); // first byte ≈ round trip
      await reader.cancel(); // don't pull the whole 30 MB
    } catch {
      break;
    }
    samples.push(performance.now() - t0);
  }
  const s = samples.slice(2); // drop connection-warmup samples
  if (s.length === 0) return { ping: 0, jitter: 0 };
  const ping = Math.min(...s);
  let jitter = 0;
  for (let i = 1; i < s.length; i++) jitter += Math.abs(s[i]! - s[i - 1]!);
  return { ping, jitter: jitter / Math.max(1, s.length - 1) };
}

async function measureThroughput(
  kind: "download" | "upload",
  base: string,
  signal: AbortSignal,
  onLive: (mbps: number) => void,
): Promise<number> {
  const counter = { bytes: 0 };
  const start = performance.now();
  const payload = kind === "upload" ? new Blob([randomBuffer(UPLOAD_BYTES)]) : null;

  const stream = async () => {
    try {
      while (performance.now() - start < PHASE_MS && !signal.aborted) {
        if (kind === "download") {
          const res = await fetch(`${base}/downloading?r=${rand()}`, { cache: "no-store", signal });
          const reader = res.body!.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            counter.bytes += value!.length;
            if (performance.now() - start >= PHASE_MS) {
              await reader.cancel();
              break;
            }
          }
        } else {
          await fetch(`${base}/upload?r=${rand()}`, { method: "POST", body: payload!, cache: "no-store", signal });
          counter.bytes += UPLOAD_BYTES;
        }
      }
    } catch {
      /* aborted or transient — other streams carry the measurement */
    }
  };

  let warmBytes = 0;
  let warmTime = 0;
  let captured = false;

  const sampler = (async () => {
    let lastTime = start;
    let lastBytes = 0;
    while (performance.now() - start < PHASE_MS && !signal.aborted) {
      await sleep(250);
      const now = performance.now();
      onLive(((counter.bytes - lastBytes) * 8) / ((now - lastTime) / 1000) / 1e6);
      lastTime = now;
      lastBytes = counter.bytes;
      if (!captured && now - start >= WARMUP_MS) {
        warmBytes = counter.bytes;
        warmTime = now;
        captured = true;
      }
    }
  })();

  await Promise.all([...Array(STREAMS)].map(stream).concat(sampler));

  const end = performance.now();
  const measuredSec = (end - (warmTime || start)) / 1000;
  if (measuredSec <= 0) return 0;
  return ((counter.bytes - warmBytes) * 8) / measuredSec / 1e6;
}

// ---------------------------------------------------------------------------
// Gauge
// ---------------------------------------------------------------------------

function Gauge({ mbps, phase }: { mbps: number; phase: Phase }) {
  const r = 78;
  const arc = 0.75; // 270° sweep
  const circ = 2 * Math.PI * r;
  const frac = Math.min(1, Math.sqrt(Math.max(0, mbps) / GAUGE_SCALE));
  const dash = circ * arc;
  const offset = dash * (1 - frac);
  const busy = phase === "download" || phase === "upload";

  return (
    <div className="relative flex size-48 items-center justify-center">
      <svg viewBox="0 0 200 200" className="size-full -rotate-[225deg]">
        <circle
          cx="100" cy="100" r={r} fill="none" strokeWidth="12" strokeLinecap="round"
          className="stroke-muted"
          strokeDasharray={`${dash} ${circ}`}
        />
        <circle
          cx="100" cy="100" r={r} fill="none" strokeWidth="12" strokeLinecap="round"
          className={busy ? "stroke-primary transition-[stroke-dashoffset] duration-300" : "stroke-success transition-[stroke-dashoffset] duration-500"}
          strokeDasharray={`${dash} ${circ}`}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-4xl font-semibold tabular-nums tracking-tight text-foreground">
          {mbps >= 100 ? Math.round(mbps) : mbps.toFixed(1)}
        </span>
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Mbps</span>
        <span className="mt-1 h-4 text-xs capitalize text-muted-foreground">
          {phase === "ping" ? "latency" : busy ? phase : phase === "done" ? "download" : ""}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat + history helpers
// ---------------------------------------------------------------------------

function Stat({ icon, label, value, unit }: { icon: React.ReactNode; label: string; value: string; unit: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-border bg-muted/30 p-3">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</span>
      <span className="text-lg font-semibold tabular-nums text-foreground">
        {value}<span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span>
      </span>
    </div>
  );
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

export function BandwidthCard({ domain }: { domain: string }) {
  const base = `http://speedtest.${domain}.local`;
  const [phase, setPhase] = useState<Phase>("idle");
  const [live, setLive] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [history, setHistory] = useState<Result[]>([]);
  const acRef = useRef<AbortController | null>(null);

  // localStorage is client-only — read after mount so server and first client
  // render agree (empty), then hydrate from storage.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const h = loadHistory();
    if (h.length) {
      setHistory(h);
      setResult(h[0]!);
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function run() {
    const ac = new AbortController();
    acRef.current = ac;
    setLive(0);
    setResult(null);
    try {
      setPhase("ping");
      const { ping, jitter } = await measurePing(base, ac.signal);
      setPhase("download");
      const download = await measureThroughput("download", base, ac.signal, setLive);
      setLive(0);
      setPhase("upload");
      const upload = await measureThroughput("upload", base, ac.signal, setLive);
      const res: Result = { download, upload, ping, jitter, ts: Date.now() };
      setResult(res);
      setPhase("done");
      const next = [res, ...history].slice(0, MAX_HISTORY);
      setHistory(next);
      saveHistory(next);
    } catch {
      setPhase(ac.signal.aborted ? "idle" : "error");
    }
  }

  function stop() {
    acRef.current?.abort();
    setPhase("idle");
  }

  const running = phase === "ping" || phase === "download" || phase === "upload";
  const gaugeMbps = running ? (phase === "ping" ? 0 : live) : (result?.download ?? 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Activity className="size-4 text-primary" /> Bandwidth
        </CardTitle>
        <a
          href={base}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary"
        >
          Full test <ArrowUpRight className="size-3" />
        </a>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8">
          <Gauge mbps={gaugeMbps} phase={phase} />

          <div className="flex w-full flex-col gap-4">
            <div className="grid grid-cols-3 gap-3">
              <Stat icon={<Download className="size-3.5" />} label="Down" value={result ? (result.download >= 100 ? Math.round(result.download).toString() : result.download.toFixed(1)) : "—"} unit="Mbps" />
              <Stat icon={<Upload className="size-3.5" />} label="Up" value={result ? (result.upload >= 100 ? Math.round(result.upload).toString() : result.upload.toFixed(1)) : "—"} unit="Mbps" />
              <Stat icon={<Activity className="size-3.5" />} label="Ping" value={result ? Math.round(result.ping).toString() : "—"} unit={result && result.jitter ? `ms ±${Math.round(result.jitter)}` : "ms"} />
            </div>

            {running ? (
              <Button size="sm" variant="ghost" onClick={stop} className="w-full">
                <Square className="size-3.5" /> Stop ({phase})
              </Button>
            ) : (
              <Button size="sm" onClick={run} className="w-full">
                <Play className="size-3.5" /> {result ? "Test again" : "Measure bandwidth"}
              </Button>
            )}

            {phase === "error" && (
              <p className="text-center text-xs text-destructive">
                Couldn&apos;t reach {base}. Is the speedtest service up?
              </p>
            )}

            {history.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {history.slice(0, 3).map((h) => (
                  <div key={h.ts} className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{timeAgo(h.ts)}</span>
                    <span className="flex gap-3 font-mono tabular-nums">
                      <span className="text-foreground">↓ {h.download >= 100 ? Math.round(h.download) : h.download.toFixed(1)}</span>
                      <span>↑ {h.upload >= 100 ? Math.round(h.upload) : h.upload.toFixed(1)}</span>
                      <span>{Math.round(h.ping)}ms</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <p className="mt-5 border-t border-border pt-3 text-center text-xs text-muted-foreground">
          Powered by{" "}
          <a href="https://openspeedtest.com" target="_blank" rel="noopener noreferrer" className="font-medium text-foreground transition-colors hover:text-primary">
            OpenSpeedTest
          </a>
        </p>
      </CardContent>
    </Card>
  );
}
