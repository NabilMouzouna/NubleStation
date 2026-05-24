"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@nublestation/ui/components/button";
import { CreateAppDialog } from "./_create-app-dialog";

export function AppsPageClient({ children }: { children: React.ReactNode }) {
  const params = useSearchParams();
  const [open, setOpen] = useState(false);

  // Auto-open when navigated from dashboard "Get started" button.
  useEffect(() => {
    if (params.get("new") === "1") setOpen(true);
  }, [params]);

  return (
    <>
      <div className="p-8 pb-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Apps</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              All registered apps in your organization
            </p>
          </div>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus size={16} />
            Create app
          </Button>
        </div>
      </div>

      {children}

      <CreateAppDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
