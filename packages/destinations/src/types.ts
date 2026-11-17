import { z } from "zod";

export const destinationSchema = z.object({
  /** URL segment, e.g. "japan". */
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  name: z.string().min(1),
  /** ISO 3166-1 alpha-2. */
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  /** One neutral sentence; no prices, no claims we can't check. */
  summary: z.string().min(1),
  currency: z.object({ code: z.string().regex(/^[A-Z]{3}$/), name: z.string().min(1) }),
  languages: z.array(z.string().min(1)).min(1),
  drivesOn: z.enum(["left", "right"]),
  plugTypes: z.array(z.string().regex(/^[A-O]$/)).min(1),
  voltage: z.number().int().positive(),
  emergencyNumbers: z.array(z.object({ label: z.string().min(1), number: z.string().regex(/^\d{3,4}$/) })).min(1),
  /**
   * Codes our eSIM catalogue may list packages under for this destination: the country itself,
   * then any region that covers it (the eSIM provider's region code, e.g. "EU").
   */
  esimCodes: z.array(z.string().regex(/^[A-Z]{2}$/)).min(1),
  /** UK government (FCDO) travel advice page. Entry requirements live at `${travelAdviceUrl}/entry-requirements`. */
  travelAdviceUrl: z.string().url().startsWith("https://www.gov.uk/foreign-travel-advice/"),
  /**
   * Who last checked these facts against official sources, and when. `null` until a person has:
   * the pages then say the facts are a draft.
   */
  review: z.object({ checkedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), checkedBy: z.string().min(1) }).nullable(),
});

export type Destination = z.infer<typeof destinationSchema>;
