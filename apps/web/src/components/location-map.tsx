"use client";

import { projectEquirectangular } from "@northstar/config";
import { flagEmoji } from "@/lib/format";
import { cn } from "@/lib/utils";

export type MapLocation = {
  id: string;
  city: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  status?: string;
};

const VIEW_W = 1000;
const VIEW_H = 500;

/**
 * Lightweight equirectangular map with selectable city dots.
 * Coordinates are approximate city centres (not exact server racks).
 */
export function LocationMap({
  locations,
  selectedId,
  onSelect,
  className,
}: {
  locations: MapLocation[];
  selectedId?: string;
  onSelect: (id: string) => void;
  className?: string;
}) {
  const selected = locations.find((l) => l.id === selectedId);

  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-surface", className)}>
      <div className="relative aspect-[2/1] w-full bg-[radial-gradient(ellipse_at_30%_20%,rgba(26,107,122,0.22),transparent_55%),radial-gradient(ellipse_at_80%_70%,rgba(196,163,90,0.12),transparent_45%),linear-gradient(180deg,#dce9ee_0%,#e8f1f4_45%,#c5d8e0_100%)] dark:bg-[radial-gradient(ellipse_at_30%_20%,rgba(26,107,122,0.35),transparent_55%),radial-gradient(ellipse_at_80%_70%,rgba(196,163,90,0.1),transparent_45%),linear-gradient(180deg,#0d1f28_0%,#102632_50%,#0b1f2a_100%)]">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="absolute inset-0 h-full w-full"
          role="img"
          aria-label="Server locations map"
        >
          {/* Simplified land silhouettes — decorative, not cartographic */}
          <g fill="currentColor" className="text-sea/15 dark:text-sea/25" aria-hidden>
            <ellipse cx="180" cy="160" rx="120" ry="70" />
            <ellipse cx="280" cy="200" rx="80" ry="55" />
            <ellipse cx="520" cy="170" rx="140" ry="80" />
            <ellipse cx="620" cy="210" rx="90" ry="50" />
            <ellipse cx="820" cy="220" rx="70" ry="45" />
            <ellipse cx="860" cy="300" rx="55" ry="70" />
            <ellipse cx="220" cy="320" rx="50" ry="90" />
            <ellipse cx="780" cy="380" rx="90" ry="45" />
          </g>
          <g stroke="currentColor" strokeWidth="1" className="text-border/60" aria-hidden>
            <line x1="0" y1={VIEW_H / 2} x2={VIEW_W} y2={VIEW_H / 2} strokeDasharray="4 6" />
            <line x1={VIEW_W / 2} y1="0" x2={VIEW_W / 2} y2={VIEW_H} strokeDasharray="4 6" />
          </g>
          {locations.map((loc) => {
            const { x, y } = projectEquirectangular(loc.latitude, loc.longitude, VIEW_W, VIEW_H);
            const active = loc.id === selectedId;
            const offline = loc.status === "offline" || loc.status === "maintenance";
            return (
              <g key={loc.id} transform={`translate(${x} ${y})`}>
                <circle
                  r={active ? 14 : 10}
                  className={cn(
                    active ? "fill-accent/30" : "fill-transparent",
                    "transition-all",
                  )}
                />
                <circle
                  r={active ? 7 : 5}
                  role="button"
                  tabIndex={0}
                  aria-label={`${loc.city}, ${loc.country}`}
                  aria-pressed={active}
                  className={cn(
                    "cursor-pointer stroke-2 transition-all focus:outline-none",
                    offline
                      ? "fill-muted stroke-border"
                      : active
                        ? "fill-accent stroke-sea-dark"
                        : "fill-sea stroke-surface hover:fill-sea-dark",
                  )}
                  onClick={() => onSelect(loc.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(loc.id);
                    }
                  }}
                />
              </g>
            );
          })}
        </svg>
        {selected ? (
          <div className="pointer-events-none absolute bottom-3 left-3 rounded-md border border-border bg-surface/95 px-3 py-2 text-sm shadow-sm backdrop-blur">
            <span aria-hidden>{flagEmoji(selected.countryCode)} </span>
            <span className="font-medium text-foreground">
              {selected.city}, {selected.country}
            </span>
            <p className="text-xs text-muted">Approximate city centre</p>
          </div>
        ) : (
          <p className="pointer-events-none absolute bottom-3 left-3 rounded-md border border-border bg-surface/95 px-3 py-2 text-xs text-muted shadow-sm backdrop-blur">
            Tap a dot to choose a location
          </p>
        )}
      </div>
    </div>
  );
}
