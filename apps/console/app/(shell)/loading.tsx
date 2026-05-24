import { Spinner } from "@/components/spinner";

export default function ShellLoading() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-4 p-8">
      <Spinner size={32} />
      <p className="text-sm font-medium text-muted-foreground">Loading…</p>
    </div>
  );
}
