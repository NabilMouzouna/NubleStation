import Link from "next/link";
import { Card, CardContent } from "@nublestation/ui/components/card";
import { Button } from "@nublestation/ui/components/button";
import { Plus, Database, HardDrive, Users } from "lucide-react";

const mockApps = [
  { slug: "tasks",      label: "Tasks",      tables: 3, storageMb: 12,  users: 8  },
  { slug: "patients",   label: "Patients",   tables: 7, storageMb: 340, users: 24 },
  { slug: "scheduling", label: "Scheduling", tables: 2, storageMb: 5,   users: 12 },
];

export default function AppsPage() {
  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Apps</h1>
          <p className="mt-1 text-sm text-muted-foreground">All registered apps in your organization</p>
        </div>
        <Button>
          <Plus size={16} />
          Create app
        </Button>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {mockApps.map((app) => (
          <Link key={app.slug} href={`/apps/${app.slug}`}>
            <Card className="transition-shadow hover:shadow-md">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-foreground">{app.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{app.slug}.clinic.local</p>
                  </div>
                  <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                    Live
                  </span>
                </div>

                <div className="mt-5 flex gap-5 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Database size={13} />
                    {app.tables} tables
                  </span>
                  <span className="flex items-center gap-1.5">
                    <HardDrive size={13} />
                    {app.storageMb} MB
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Users size={13} />
                    {app.users} users
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
