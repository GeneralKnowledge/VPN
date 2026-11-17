import { getDestination } from "@northstar/destinations";
import { trips, type Db } from "@northstar/db";
import { and, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { HttpError } from "./http";
import { newId } from "./utils";

/** Enough for anyone's real plans; stops a script filling the table. */
export const MAX_TRIPS_PER_USER = 100;
export const MAX_NOTES_LENGTH = 2000;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v), {
    message: "Invalid date",
  });

const tripFields = {
  startDate: isoDate.nullable().optional(),
  endDate: isoDate.nullable().optional(),
  notes: z.string().max(MAX_NOTES_LENGTH).nullable().optional(),
};

export const createTripSchema = z.object({ destinationSlug: z.string().min(1).max(64), ...tripFields }).strict();
export const updateTripSchema = z.object(tripFields).strict();

export type TripView = {
  id: string;
  destination: { slug: string; name: string; countryCode: string };
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type TripRow = typeof trips.$inferSelect;

function toView(row: TripRow): TripView {
  const destination = getDestination(row.destinationSlug);
  return {
    id: row.id,
    destination: {
      slug: row.destinationSlug,
      // A destination removed from the data still shows the trip, by its slug.
      name: destination?.name ?? row.destinationSlug,
      countryCode: destination?.countryCode ?? "",
    },
    startDate: row.startDate,
    endDate: row.endDate,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function cleanNotes(notes: string | null | undefined): string | null | undefined {
  if (notes === undefined) return undefined;
  const trimmed = notes?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

function checkDates(startDate: string | null | undefined, endDate: string | null | undefined) {
  if (startDate && endDate && endDate < startDate) {
    throw new HttpError(400, "The trip can't end before it starts");
  }
}

export async function listTrips(db: Db, userId: string): Promise<TripView[]> {
  const rows = await db.select().from(trips).where(eq(trips.userId, userId)).orderBy(desc(trips.createdAt));
  return rows.map(toView);
}

/** One of this person's trips; another person's trip is "not found", never "forbidden". */
async function ownTrip(db: Db, userId: string, id: string): Promise<TripRow> {
  const [row] = await db
    .select()
    .from(trips)
    .where(and(eq(trips.id, id), eq(trips.userId, userId)))
    .limit(1);
  if (!row) throw new HttpError(404, "Trip not found");
  return row;
}

export async function getTrip(db: Db, userId: string, id: string): Promise<TripView> {
  return toView(await ownTrip(db, userId, id));
}

export async function createTrip(
  db: Db,
  userId: string,
  input: z.infer<typeof createTripSchema>,
): Promise<TripView> {
  if (!getDestination(input.destinationSlug)) throw new HttpError(400, "Unknown destination");
  checkDates(input.startDate, input.endDate);
  const [{ value: existing }] = await db.select({ value: count() }).from(trips).where(eq(trips.userId, userId));
  if (existing >= MAX_TRIPS_PER_USER) {
    throw new HttpError(400, `You can save up to ${MAX_TRIPS_PER_USER} trips`);
  }
  const id = newId("trip");
  await db.insert(trips).values({
    id,
    userId,
    destinationSlug: input.destinationSlug,
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    notes: cleanNotes(input.notes) ?? null,
  });
  return getTrip(db, userId, id);
}

export async function updateTrip(
  db: Db,
  userId: string,
  id: string,
  input: z.infer<typeof updateTripSchema>,
): Promise<TripView> {
  const row = await ownTrip(db, userId, id);
  const startDate = input.startDate === undefined ? row.startDate : input.startDate;
  const endDate = input.endDate === undefined ? row.endDate : input.endDate;
  checkDates(startDate, endDate);
  const notes = cleanNotes(input.notes);
  await db
    .update(trips)
    .set({
      startDate,
      endDate,
      ...(notes === undefined ? {} : { notes }),
      updatedAt: new Date(),
    })
    .where(and(eq(trips.id, id), eq(trips.userId, userId)));
  return getTrip(db, userId, id);
}

export async function deleteTrip(db: Db, userId: string, id: string): Promise<void> {
  await ownTrip(db, userId, id);
  await db.delete(trips).where(and(eq(trips.id, id), eq(trips.userId, userId)));
}
