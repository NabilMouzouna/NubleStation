import { notFound } from "next/navigation";
import { getAppBySlug, getDeployments, getApiKeys, getAppTables } from "@/lib/platform/app-detail";
import { AppDetailClient } from "./_app-detail-client";

export default async function AppDetailPage({ params }: { params: Promise<{ app: string }> }) {
  const { app: slug } = await params;

  const app = await getAppBySlug(slug);
  if (!app) notFound();

  const [deployments, apiKeys, tables] = await Promise.all([
    getDeployments(app.id),
    getApiKeys(app.id),
    getAppTables(app.id),
  ]);

  return (
    <AppDetailClient
      app={app}
      deployments={deployments}
      apiKeys={apiKeys}
      tables={tables}
    />
  );
}
