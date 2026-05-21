"use client";

import { useState } from "react";
import Link from "next/link";
import { use } from "react";
import { ChevronRight } from "lucide-react";
import { Card, CardContent } from "@nublestation/ui/components/card";
import { Button } from "@nublestation/ui/components/button";

const TABS = ["Deployments", "Envs & Secrets", "API Keys", "Database", "Migrations", "Storage", "Users"] as const;
type Tab = typeof TABS[number];

function DeploymentsTab() {
  return (
    <div className="overflow-hidden rounded-3xl border border-border">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-muted/50">
          <tr>
            <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Version</th>
            <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
            <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Deployed at</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-card">
          {[
            { version: "v3", status: "Live",   date: "2026-05-21 10:42" },
            { version: "v2", status: "Replaced", date: "2026-05-20 14:17" },
            { version: "v1", status: "Replaced", date: "2026-05-19 09:03" },
          ].map((d) => (
            <tr key={d.version}>
              <td className="px-5 py-3 font-medium text-foreground">{d.version}</td>
              <td className="px-5 py-3">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${d.status === "Live" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                  {d.status}
                </span>
              </td>
              <td className="px-5 py-3 text-muted-foreground">{d.date}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EnvsTab() {
  return (
    <div className="overflow-hidden rounded-3xl border border-border">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-muted/50">
          <tr>
            <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Key</th>
            <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Value</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-card">
          {[
            { key: "NUBLE_URL",     value: "http://api.clinic.local" },
            { key: "NUBLE_API_KEY", value: "nbl_••••••••••••" },
          ].map((env) => (
            <tr key={env.key}>
              <td className="px-5 py-3 font-mono text-xs text-foreground">{env.key}</td>
              <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{env.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ApiKeysTab() {
  return (
    <div className="overflow-hidden rounded-3xl border border-border">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-muted/50">
          <tr>
            <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Key ID</th>
            <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Created</th>
            <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
            <th className="px-5 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-card">
          <tr>
            <td className="px-5 py-3 font-mono text-xs text-foreground">nbl_a3f9c2••••</td>
            <td className="px-5 py-3 text-muted-foreground">2026-05-19</td>
            <td className="px-5 py-3">
              <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">Active</span>
            </td>
            <td className="px-5 py-3 text-right">
              <button className="text-xs text-destructive hover:underline">Revoke</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function DatabaseTab() {
  return (
    <div className="overflow-hidden rounded-3xl border border-border">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-muted/50">
          <tr>
            <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Table</th>
            <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Rows</th>
            <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Created at</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-card">
          {[
            { name: "tasks",    rows: 142, created: "2026-05-19" },
            { name: "comments", rows: 87,  created: "2026-05-19" },
            { name: "labels",   rows: 12,  created: "2026-05-20" },
          ].map((t) => (
            <tr key={t.name}>
              <td className="px-5 py-3 font-mono text-xs text-foreground">{t.name}</td>
              <td className="px-5 py-3 text-muted-foreground">{t.rows}</td>
              <td className="px-5 py-3 text-muted-foreground">{t.created}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MigrationsTab() {
  return (
    <div className="overflow-hidden rounded-3xl border border-border">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-muted/50">
          <tr>
            <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Version</th>
            <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
            <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ran at</th>
            <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Duration</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-card">
          {[
            { version: "0002_add_labels",   status: "applied", date: "2026-05-20 09:12", ms: "38ms" },
            { version: "0001_init_schema",   status: "applied", date: "2026-05-19 09:03", ms: "112ms" },
          ].map((m) => (
            <tr key={m.version}>
              <td className="px-5 py-3 font-mono text-xs text-foreground">{m.version}</td>
              <td className="px-5 py-3">
                <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">{m.status}</span>
              </td>
              <td className="px-5 py-3 text-muted-foreground">{m.date}</td>
              <td className="px-5 py-3 text-muted-foreground">{m.ms}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StorageTab() {
  return (
    <div className="overflow-hidden rounded-3xl border border-border">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-muted/50">
          <tr>
            <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">File</th>
            <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Size</th>
            <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Type</th>
            <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Uploaded</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-card">
          {[
            { name: "avatar.png",    size: "84 KB",  type: "image/png",       date: "2026-05-21" },
            { name: "report.pdf",    size: "1.2 MB", type: "application/pdf", date: "2026-05-20" },
            { name: "export.csv",    size: "42 KB",  type: "text/csv",        date: "2026-05-19" },
          ].map((f) => (
            <tr key={f.name}>
              <td className="px-5 py-3 font-mono text-xs text-foreground">{f.name}</td>
              <td className="px-5 py-3 text-muted-foreground">{f.size}</td>
              <td className="px-5 py-3 text-muted-foreground">{f.type}</td>
              <td className="px-5 py-3 text-muted-foreground">{f.date}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UsersTab() {
  return (
    <div className="overflow-hidden rounded-3xl border border-border">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-muted/50">
          <tr>
            <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">User ID</th>
            <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Granted at</th>
            <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Last seen</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-card">
          {[
            { id: "usr_a1b2c3", granted: "2026-05-19", seen: "2026-05-21" },
            { id: "usr_d4e5f6", granted: "2026-05-20", seen: "2026-05-21" },
          ].map((u) => (
            <tr key={u.id}>
              <td className="px-5 py-3 font-mono text-xs text-foreground">{u.id}</td>
              <td className="px-5 py-3 text-muted-foreground">{u.granted}</td>
              <td className="px-5 py-3 text-muted-foreground">{u.seen}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const tabContent: Record<Tab, React.ReactNode> = {
  "Deployments":   <DeploymentsTab />,
  "Envs & Secrets": <EnvsTab />,
  "API Keys":      <ApiKeysTab />,
  "Database":      <DatabaseTab />,
  "Migrations":    <MigrationsTab />,
  "Storage":       <StorageTab />,
  "Users":         <UsersTab />,
};

export default function AppDetailPage({ params }: { params: Promise<{ app: string }> }) {
  const { app } = use(params);
  const [activeTab, setActiveTab] = useState<Tab>("Deployments");

  return (
    <div className="p-8">
      <nav className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/apps" className="hover:text-foreground">Apps</Link>
        <ChevronRight size={14} />
        <span className="font-medium text-foreground capitalize">{app}</span>
      </nav>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold capitalize tracking-tight text-foreground">{app}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{app}.clinic.local</p>
        </div>
        <Button size="sm">New deployment</Button>
      </div>

      <div className="mt-8 flex gap-1 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="mt-6">{tabContent[activeTab]}</div>
    </div>
  );
}
