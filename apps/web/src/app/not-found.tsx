import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="font-display text-3xl">Page not found</h1>
      <p className="max-w-md text-sm text-muted">The page you’re looking for doesn’t exist or has moved.</p>
      <Link href="/" className="inline-flex h-11 items-center rounded-md bg-sea px-4 text-sm font-medium text-white">
        Back to home
      </Link>
    </div>
  );
}
