import { brand } from "@northstar/config";
import { cn } from "@/lib/utils";

export function Logo({ className, markOnly = false }: { className?: string; markOnly?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg
        width="28"
        height="28"
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden
        className="shrink-0"
      >
        <circle cx="16" cy="16" r="15" stroke="currentColor" strokeWidth="1.5" opacity="0.35" />
        <path
          d="M16 6.5L22.5 22H18.9l-1.15-2.9h-5.5L11.1 22H7.5L16 6.5Z"
          fill="currentColor"
        />
        <path d="M14.55 16.4h2.9L16 12.7l-1.45 3.7Z" fill="var(--accent)" />
      </svg>
      {!markOnly && (
        <span className="font-display text-lg font-semibold tracking-tight text-foreground">
          {brand.name}
        </span>
      )}
    </span>
  );
}
