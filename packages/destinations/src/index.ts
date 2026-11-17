import { z } from "zod";
import { destinationData } from "./data";
import { destinationSchema, type Destination } from "./types";

export { destinationSchema, type Destination } from "./types";

/** Parsed once at load: bad data fails the build and tests, never a page. */
const destinations: readonly Destination[] = Object.freeze(
  z.array(destinationSchema).parse(destinationData),
);

export function listDestinations(): readonly Destination[] {
  return destinations;
}

export function getDestination(slug: string): Destination | null {
  return destinations.find((d) => d.slug === slug) ?? null;
}

export function entryRequirementsUrl(destination: Destination): string {
  return `${destination.travelAdviceUrl}/entry-requirements`;
}

/** True when a person has checked the facts against official sources. */
export function isReviewed(destination: Destination): boolean {
  return destination.review !== null;
}
