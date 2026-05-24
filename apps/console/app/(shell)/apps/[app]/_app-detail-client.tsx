"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronRight, Rocket, Database, HardDrive, Users, Settings,
  Copy, CheckCheck, ShieldOff, Trash2, ExternalLink, Clock,
} from "lucide-react";
import { Card, CardContent } from "@nublestation/ui/components/card";
import { Button } from "@nublestation/ui/components/button";
import { Badge } from "@nublestation/ui/components/badge";
import { Separator } from "@nublestation/ui/components/separator";
import type { AppDetail, DeploymentRow, ApiKeyRow, AppTableRow } from "@/lib/platform/app-detail";
import { revokeApiKeyAction, deleteAppAction, generateApiKeyAction } from "./actions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = "deployments" | "database" | "storage" | "users" | "settings";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "deployments", label: "Deployments", icon: Rocket   },
  { id: "database",   label: "Database",     icon: Database  },
  { id: "storage",    label: "Storage",      icon: HardDrive },
  { id: "users",      label: "Users",        icon: Users     },
  { id: "settings",   label: "Settings",     icon: Settings  },
];

const SERVICE_TILE_TAB: Record<string, Tab> = {
  blazingdb: "database",
  orbit:     "deployments",
  vault:     "storage",
  identity:  "users",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border py-16 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function TableHeader({ cols }: { cols: string[] }) {
  return (
    <thead className="border-b border-border bg-muted/50">
      <tr>
        {cols.map((c) => (
          <th key={c} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {c}
          </th>
        ))}
      </tr>
    </thead>
  );
}

// ---------------------------------------------------------------------------
// Tab contents
// ---------------------------------------------------------------------------

function DeploymentsTab({ deployments }: { deployments: DeploymentRow[] }) {
  if (deployments.length === 0) return <EmptyState message="No deployments yet. Run nuble deploy to push your first build." />;
  return (
    <div className="overflow-hidden rounded-3xl border border-border">
      <table className="w-full text-sm">
        <TableHeader cols={["Version", "Status", "Deployed at"]} />
        <tbody className="divide-y divide-border bg-card">
          {deployments.map((d, idx) => (
            <tr key={d.id}>
              <td className="px-5 py-3 font-mono text-xs text-foreground">{d.version}</td>
              <td className="px-5 py-3">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${idx === 0 ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                  {idx === 0 ? "Live" : "Replaced"}
                </span>
              </td>
              <td className="px-5 py-3 text-muted-foreground">
                {new Date(d.deployed_at).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DatabaseTab({ tables }: { tables: AppTableRow[] }) {
  if (tables.length === 0) return <EmptyState message="No tables yet. Use the BlazingDB API to create your first table." />;
  return (
    <div className="overflow-hidden rounded-3xl border border-border">
      <table className="w-full text-sm">
        <TableHeader cols={["Table name", "Created"]} />
        <tbody className="divide-y divide-border bg-card">
          {tables.map((t) => (
            <tr key={t.id}>
              <td className="px-5 py-3 font-mono text-xs text-foreground">{t.table_name}</td>
              <td className="px-5 py-3 text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PlaceholderTab({ service }: { service: string }) {
  return <EmptyState message={`${service} data will appear here once the service is in use.`} />;
}

function SettingsTab({
  app,
  apiKeys,
}: {
  app: AppDetail;
  apiKeys: ApiKeyRow[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copiedNew, setCopiedNew] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function copyKeyId(keyId: string) {
    navigator.clipboard.writeText(`nbl_${keyId}.***`);
    setCopiedId(keyId);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function generateKey() {
    setGenerating(true);
    setNewKey(null);
    const result = await generateApiKeyAction(app.id);
    setGenerating(false);
    if (result.ok && result.apiKey) {
      setNewKey(result.apiKey);
      startTransition(() => router.refresh());
    }
  }

  function copyNewKey() {
    if (!newKey) return;
    navigator.clipboard.writeText(newKey);
    setCopiedNew(true);
    setTimeout(() => setCopiedNew(false), 2000);
  }

  async function revoke(id: string) {
    setRevoking(id);
    await revokeApiKeyAction(id);
    setRevoking(null);
    startTransition(() => router.refresh());
  }

  async function handleDelete() {
    setDeleting(true);
    await deleteAppAction(app.id);
  }

  return (
    <div className="space-y-8 max-w-2xl">

      {/* App info */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">App information</h3>
        <div className="overflow-hidden rounded-3xl border border-border">
          {[
            { label: "Display name", value: app.display_name },
            { label: "Slug",         value: app.name },
            { label: "App URL",      value: `${app.name}.clinic.local` },
            { label: "App ID",       value: app.id },
            { label: "Created",      value: new Date(app.created_at).toLocaleString() },
          ].map(({ label, value }, i, arr) => (
            <div
              key={label}
              className={`flex items-center gap-4 px-5 py-3.5 ${i < arr.length - 1 ? "border-b border-border" : ""}`}
            >
              <span className="w-32 shrink-0 text-xs text-muted-foreground">{label}</span>
              <span className="font-mono text-xs text-foreground">{value}</span>
            </div>
          ))}
        </div>
      </section>

      {/* API Keys */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">API Keys</h3>
          <Button variant="ghost" size="sm" disabled={generating} onClick={generateKey}>
            {generating ? "Generating…" : "Generate new key"}
          </Button>
        </div>

        {newKey && (
          <div className="rounded-2xl border border-success/30 bg-success/5 p-4">
            <p className="text-xs font-medium text-success mb-2">New key generated — copy it now, it won&apos;t be shown again.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg bg-card border border-border px-3 py-2 font-mono text-xs text-foreground break-all">
                {newKey}
              </code>
              <button onClick={copyNewKey} className="shrink-0 text-muted-foreground hover:text-foreground">
                {copiedNew ? <CheckCheck className="size-4 text-success" /> : <Copy className="size-4" />}
              </button>
            </div>
          </div>
        )}

        {apiKeys.length === 0 ? (
          <EmptyState message="No API keys." />
        ) : (
          <div className="overflow-hidden rounded-3xl border border-border">
            <table className="w-full text-sm">
              <TableHeader cols={["Key ID", "Label", "Created", "Status", ""]} />
              <tbody className="divide-y divide-border bg-card">
                {apiKeys.map((k) => {
                  const isRevoked = !!k.revoked_at;
                  return (
                    <tr key={k.id}>
                      <td className="px-5 py-3 font-mono text-xs text-foreground">
                        <span className="flex items-center gap-1.5">
                          nbl_{k.key_id.slice(0, 8)}…
                          <button onClick={() => copyKeyId(k.key_id)} className="text-muted-foreground hover:text-foreground">
                            {copiedId === k.key_id ? <CheckCheck className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
                          </button>
                        </span>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{k.label ?? "—"}</td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {new Date(k.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${isRevoked ? "bg-muted text-muted-foreground" : "bg-success/10 text-success"}`}>
                          {isRevoked ? "Revoked" : "Active"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        {!isRevoked && (
                          <button
                            onClick={() => revoke(k.id)}
                            disabled={revoking === k.id}
                            className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
                          >
                            <ShieldOff className="size-3.5" />
                            {revoking === k.id ? "Revoking…" : "Revoke"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Danger zone */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-destructive">Danger zone</h3>
        <div className="rounded-3xl border border-destructive/30 bg-destructive/5 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">Delete this app</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Permanently deletes all app data including API keys and deployments. This cannot be undone.
              </p>
            </div>
            {!confirmDelete ? (
              <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="size-4" /> Delete
              </Button>
            ) : (
              <div className="flex items-center gap-2 shrink-0">
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
                <Button variant="destructive" size="sm" disabled={deleting} onClick={handleDelete}>
                  {deleting ? "Deleting…" : "Yes, delete"}
                </Button>
              </div>
            )}
          </div>
        </div>
      </section>

    </div>
  );
}

// ---------------------------------------------------------------------------
// Service tiles
// ---------------------------------------------------------------------------

const SERVICE_TILES = [
  { slug: "blazingdb", brand: "BlazingDB", role: "Database",    tab: "database"     as Tab },
  { slug: "orbit",     brand: "Orbit",     role: "Deployments", tab: "deployments"  as Tab },
  { slug: "vault",     brand: "Vault",     role: "Storage",     tab: "storage"      as Tab },
  { slug: "identity",  brand: "Identity",  role: "Auth",        tab: "users"        as Tab },
];

function ServiceTiles({
  active,
  onSelect,
  deployments,
  tables,
}: {
  active: Tab;
  onSelect: (t: Tab) => void;
  deployments: DeploymentRow[];
  tables: AppTableRow[];
}) {
  function stat(slug: string) {
    if (slug === "orbit")     return `${deployments.length} deployment${deployments.length !== 1 ? "s" : ""}`;
    if (slug === "blazingdb") return `${tables.length} table${tables.length !== 1 ? "s" : ""}`;
    return "0 items";
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {SERVICE_TILES.map((svc) => {
        const isActive = active === svc.tab;
        return (
          <button
            key={svc.slug}
            onClick={() => onSelect(svc.tab)}
            className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition-all hover:shadow-sm ${
              isActive
                ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                : "border-border bg-card hover:border-primary/40"
            }`}
          >
            <img src={`/services/${svc.slug}.svg`} alt={svc.brand} width={36} height={36} className="rounded-xl shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{svc.brand}</p>
              <p className="text-xs text-muted-foreground">{stat(svc.slug)}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root client component
// ---------------------------------------------------------------------------

export function AppDetailClient({
  app,
  deployments,
  apiKeys,
  tables,
}: {
  app: AppDetail;
  deployments: DeploymentRow[];
  apiKeys: ApiKeyRow[];
  tables: AppTableRow[];
}) {
  const [activeTab, setActiveTab] = useState<Tab>("deployments");

  return (
    <div className="p-8">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/apps" className="hover:text-foreground">Apps</Link>
        <ChevronRight size={14} />
        <span className="font-medium text-foreground">{app.display_name}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{app.display_name}</h1>
          <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
            <span className="font-mono">{app.name}.clinic.local</span>
            <a
              href={`http://${app.name}.clinic.local`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-xs hover:text-primary"
            >
              <ExternalLink size={12} /> Open
            </a>
          </div>
        </div>
        <Badge variant={deployments.length > 0 ? "success" : "warning"} className="gap-1.5 mt-1">
          {deployments.length > 0 ? (
            <><span className="size-1.5 animate-pulse rounded-full bg-success" /> Live</>
          ) : (
            <><Clock className="size-3" /> Not deployed</>
          )}
        </Badge>
      </div>

      {/* Service tiles */}
      <div className="mt-8">
        <ServiceTiles active={activeTab} onSelect={setActiveTab} deployments={deployments} tables={tables} />
      </div>

      {/* Tabs */}
      <div className="mt-8 flex gap-1 border-b border-border">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === id
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="mt-6">
        {activeTab === "deployments" && <DeploymentsTab deployments={deployments} />}
        {activeTab === "database"    && <DatabaseTab tables={tables} />}
        {activeTab === "storage"     && <PlaceholderTab service="Vault" />}
        {activeTab === "users"       && <PlaceholderTab service="Identity" />}
        {activeTab === "settings"    && <SettingsTab app={app} apiKeys={apiKeys} />}
      </div>
    </div>
  );
}
