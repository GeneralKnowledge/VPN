const formatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function format(iso: string): string {
  return formatter.format(new Date(`${iso}T00:00:00Z`));
}

/** "1 Apr 2027 – 21 Apr 2027 (20 nights)", or what there is of it. */
export function formatTripDates(start: string | null, end: string | null): string {
  if (start && end) {
    const nights = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
    return `${format(start)} – ${format(end)} (${nights} ${nights === 1 ? "night" : "nights"})`;
  }
  if (start) return `From ${format(start)}`;
  if (end) return `Until ${format(end)}`;
  return "No dates yet";
}
