import { notFound } from "next/navigation";
import { getAppBySlug, getDeployments, getApiKeys, getAppTables, getStorageFiles, getVaultSettings, getAppUsers, getOrgAdmins } from "@/lib/platform/app-detail";
import { AppDetailClient } from "./_app-detail-client";

export default async function AppDetailPage({ params }: { params: Promise<{ app: string }> }) {
  const { app: slug } = await params;

  const app = await getAppBySlug(slug);
  if (!app) notFound();

  const [deployments, apiKeys, tables, storageFiles, vaultSettings, appUsers, orgAdmins] = await Promise.all([
    getDeployments(app.id),
    getApiKeys(app.id),
    getAppTables(app.id),
    getStorageFiles(app.id),
    getVaultSettings(app.id),
    getAppUsers(app.id),
    getOrgAdmins(),
  ]);

  const orgDomain = process.env.ORG_DOMAIN ?? "nuble";

  return (
    <AppDetailClient
      app={app}
      deployments={deployments}
      apiKeys={apiKeys}
      tables={tables}
      storageFiles={storageFiles}
      vaultSettings={vaultSettings}
      appUsers={appUsers}
      orgAdmins={orgAdmins}
      orgDomain={orgDomain}
    />
  );
}
