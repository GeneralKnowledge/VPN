"use client";

import { useId, useState } from "react";
import { Input, Label, Select } from "@/components/ui";
import { formatMoney } from "@/lib/format";

type PackageOption = { code: string; name: string; price: number };

/** Whole pounds typed by the person, as pence; anything else counts as nothing. */
function poundsToPence(raw: string): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : 0;
}

function wholeNumber(raw: string): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : 0;
}

/**
 * The person's own estimate: their nights and nightly figure, plus an eSIM price we know.
 * Nothing here is a quote and nothing leaves the page.
 */
export function BudgetEstimate({
  destinationName,
  packages,
}: {
  destinationName: string;
  packages: PackageOption[];
}) {
  const id = useId();
  const [nights, setNights] = useState("7");
  const [nightly, setNightly] = useState("");
  const [extras, setExtras] = useState("");
  const [esimCode, setEsimCode] = useState(packages[0]?.code ?? "");

  const stay = wholeNumber(nights) * poundsToPence(nightly);
  const esim = packages.find((p) => p.code === esimCode)?.price ?? 0;
  const other = poundsToPence(extras);
  const total = stay + esim + other;

  return (
    <div>
      <p className="text-sm text-muted">
        Your own figures for {destinationName}. This is your estimate, not a quote.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor={`${id}-nights`}>Nights</Label>
          <Input
            id={`${id}-nights`}
            inputMode="numeric"
            value={nights}
            onChange={(e) => setNights(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor={`${id}-nightly`}>Per night for your stay (£)</Label>
          <Input
            id={`${id}-nightly`}
            inputMode="decimal"
            placeholder="e.g. 90"
            value={nightly}
            onChange={(e) => setNightly(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor={`${id}-extras`}>Flights and other costs (£)</Label>
          <Input
            id={`${id}-extras`}
            inputMode="decimal"
            placeholder="e.g. 650"
            value={extras}
            onChange={(e) => setExtras(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor={`${id}-esim`}>eSIM</Label>
          <Select id={`${id}-esim`} value={esimCode} onChange={(e) => setEsimCode(e.target.value)}>
            <option value="">None</option>
            {packages.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name} ({formatMoney(p.price)})
              </option>
            ))}
          </Select>
        </div>
      </div>
      <p className="mt-6 text-sm text-muted" id={`${id}-total-label`}>
        Your estimate
      </p>
      <p className="font-display text-3xl" aria-labelledby={`${id}-total-label`} aria-live="polite">
        {formatMoney(total)}
      </p>
    </div>
  );
}
