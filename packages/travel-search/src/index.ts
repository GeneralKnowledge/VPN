/**
 * Travel search with simulated estimates (docs/TRAVEL-HUB.md, phase 1b). Nothing here comes from
 * a partner: every figure is our own model and must be shown labelled as an estimate.
 */
import { z } from "zod";

export * from "./airports";
export * from "./estimate";

/** Shown with every set of results. */
export const ESTIMATE_NOTE = "Estimates, not live prices. Nothing here can be booked yet.";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dates are YYYY-MM-DD");
const code = z
  .string()
  .regex(/^[A-Za-z]{3}$/, "airports are three-letter codes")
  .transform((v) => v.toUpperCase());
const count = z.coerce.number().int().min(1).max(9);

/** Query strings for each search; unknown keys are ignored, as in any URL. */
export const flightQuerySchema = z.object({
  from: code,
  to: code,
  depart: isoDate,
  return: isoDate.optional(),
  adults: count.default(1),
  cabin: z.enum(["economy", "premium", "business", "first"]).default("economy"),
  sort: z.enum(["best", "cheapest", "fastest"]).default("best"),
});

export const stayQuerySchema = z.object({
  city: code,
  checkIn: isoDate,
  checkOut: isoDate,
  guests: count.default(2),
  sort: z.enum(["cheapest", "comfort"]).default("cheapest"),
});

export const carQuerySchema = z.object({
  city: code,
  pickUp: isoDate,
  dropOff: isoDate,
});

export const packageQuerySchema = z.object({
  from: code,
  to: code,
  depart: isoDate,
  return: isoDate,
  adults: count.default(2),
});

export const priceMapQuerySchema = z.object({
  from: code,
  month: z.string().regex(/^\d{4}-\d{2}$/, "the month is YYYY-MM"),
});

/** Today's date in the UK, `YYYY-MM-DD`: searches can't start before it. */
export function todayInUk(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(now);
}
