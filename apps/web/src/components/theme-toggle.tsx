"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme, type Theme } from "./theme-provider";

const labels: Record<Theme, string> = {
  system: "System theme",
  light: "Light theme",
  dark: "Dark theme",
};

export function ThemeToggle({ className, compact }: { className?: string; compact?: boolean }) {
  const { theme, cycle } = useTheme();
  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`${labels[theme]}. Click to change.`}
      title={labels[theme]}
      className={cn(
        "inline-flex items-center justify-center rounded-md border border-border bg-surface text-foreground transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sea",
        compact ? "h-9 w-9" : "h-9 gap-2 px-3 text-sm",
        className,
      )}
    >
      <Icon className="h-4 w-4" aria-hidden />
      {compact ? <span className="sr-only">{labels[theme]}</span> : <span className="hidden sm:inline">{labels[theme]}</span>}
    </button>
  );
}
