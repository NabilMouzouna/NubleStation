import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@nublestation/ui/components/card";
import { Input } from "@nublestation/ui/components/input";
import { Button } from "@nublestation/ui/components/button";

export default function SettingsPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">Organization and platform configuration</p>

      <div className="mt-8 flex flex-col gap-6 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Organization</CardTitle>
            <CardDescription>Name and description shown across the console</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">Name</label>
                <Input defaultValue="My Clinic" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">Description</label>
                <Input defaultValue="Local healthcare organization" />
              </div>
              <div className="flex justify-end">
                <Button>Save changes</Button>
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
                <Input defaultValue="clinic.local" disabled />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">Host IP</label>
                <Input defaultValue="192.168.1.100" disabled />
              </div>
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-success" />
                <span className="text-sm text-muted-foreground">TLS active — Caddy auto-HTTPS</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Internal secret</CardTitle>
            <CardDescription>
              HMAC secret used to sign requests between services. Rotating causes a ~2s interruption as containers restart.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">Last rotated</label>
                <Input defaultValue="2026-05-01 — at install" disabled />
              </div>
              <div className="flex justify-end">
                <Button variant="secondary">Rotate secret</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="rounded-3xl border border-destructive/30 bg-destructive/5 p-6">
          <p className="text-sm font-semibold text-destructive">Danger zone</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Reinstalling NubleStation will wipe admin.db and require re-seeding credentials. PostgreSQL data is preserved.
          </p>
          <Button variant="destructive" className="mt-4">Reinstall NubleStation</Button>
        </div>
      </div>
    </div>
  );
}
