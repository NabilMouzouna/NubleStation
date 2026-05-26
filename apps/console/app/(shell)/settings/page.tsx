import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@nublestation/ui/components/card";
import { Input } from "@nublestation/ui/components/input";
import { Button } from "@nublestation/ui/components/button";
import { getOrg } from "@/lib/platform/org";
import { updateOrgAction } from "./actions";

export default async function SettingsPage() {
  const org = await getOrg();
  const domain = process.env.ORG_DOMAIN ?? "nuble";
  const hostIp = process.env.HOST_IP ?? "—";

  return (
    <div className="p-5 lg:p-8">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">Organization and platform configuration</p>

      <div className="mt-6 flex flex-col gap-5 w-full max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Organization</CardTitle>
            <CardDescription>Name shown across the console</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={updateOrgAction} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">Name</label>
                <Input name="name" defaultValue={org?.name ?? ""} />
              </div>
              <div className="flex justify-end">
                <Button type="submit">Save changes</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Network</CardTitle>
            <CardDescription>Read-only — set at install time. Changing the domain requires reinstall.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">Org domain</label>
                <Input defaultValue={`${domain}.local`} disabled />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">Host IP</label>
                <Input defaultValue={hostIp} disabled />
              </div>
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-warning" />
                <span className="text-sm text-muted-foreground">HTTP only — TLS pending (see ADR 004)</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Internal HMAC secret</CardTitle>
            <CardDescription>
              Signs requests between services and session tokens. Rotating requires restarting all containers.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">Status</label>
              <Input defaultValue="Managed via .env — set at install" disabled />
            </div>
          </CardContent>
        </Card>

        <div className="rounded-3xl border border-destructive/30 bg-destructive/5 p-6">
          <p className="text-sm font-semibold text-destructive">Danger zone</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Reinstalling NubleStation will wipe all organization data. PostgreSQL tenant data is preserved.
          </p>
          <div className="mt-5">
            <Button variant="destructive">Reinstall NubleStation</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
