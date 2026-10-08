export default function DashboardLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <div className="h-8 w-48 animate-pulse rounded-md bg-surface-2" />
      <div className="h-32 animate-pulse rounded-xl bg-surface-2" />
    </div>
  );
}
